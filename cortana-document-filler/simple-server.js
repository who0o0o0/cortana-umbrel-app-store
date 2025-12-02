const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);
const PORT = process.env.PORT || 3000;

// MIME types for different file extensions
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.woff': 'application/font-woff',
  '.ttf': 'application/font-ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'application/font-otf',
  '.wasm': 'application/wasm'
};

// Parse multipart form data (improved implementation)
async function parseMultipartFormData(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      try {
        const buffer = Buffer.concat(chunks);
        const contentType = req.headers['content-type'] || '';
        const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/);
        
        if (!boundaryMatch) {
          return resolve({ fields: {}, files: {} });
        }
        
        const boundary = boundaryMatch[1] || boundaryMatch[2];
        const result = { fields: {}, files: {} };
        
        // Split on boundary
        const parts = buffer.toString('binary').split('--' + boundary);
        
        for (let i = 1; i < parts.length - 1; i++) {
          const part = parts[i];
          
          // Find the double line break that separates headers from content
          const headerEndIndex = part.indexOf('\r\n\r\n');
          if (headerEndIndex === -1) continue;
          
          const headers = part.substring(0, headerEndIndex);
          const content = part.substring(headerEndIndex + 4, part.length - 2); // Remove trailing \r\n
          
          // Parse Content-Disposition header
          const dispositionMatch = headers.match(/Content-Disposition: form-data; name="([^"]+)"(?:; filename="([^"]+)")?/);
          if (!dispositionMatch) continue;
          
          const fieldName = dispositionMatch[1];
          const filename = dispositionMatch[2];
          
          if (filename) {
            // It's a file
            result.files[fieldName] = {
              filename,
              data: Buffer.from(content, 'binary')
            };
          } else {
            // It's a regular field
            result.fields[fieldName] = content.trim();
          }
        }
        
        resolve(result);
      } catch (error) {
        console.error('Multipart parsing error:', error);
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

// Parse JSON body
async function parseJSONBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString();
        console.log('Raw JSON body received:', body);
        resolve(JSON.parse(body));
      } catch (error) {
        console.error('JSON parse error:', error);
        console.error('Raw body that failed to parse:', Buffer.concat(chunks).toString());
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer((req, res) => {
  console.log(`${req.method} ${req.url} - Host: ${req.headers.host}`);
  
  // Wrap async operations
  (async () => {
    try {
      // Health check endpoint
      if (req.url === '/api/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'OK', message: 'Cortana server is running' }));
        return;
      }

      // Handle API endpoints for PDF conversion
      if (req.url === '/api/create-temp-dir' && req.method === 'POST') {
        const body = await parseJSONBody(req);
        const { tempDir } = body;
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
      }

      if (req.url === '/api/write-file' && req.method === 'POST') {
        const { fields, files } = await parseMultipartFormData(req);
        const filePath = fields.path;
        const file = files.file;
        
        console.log('Write file request - fields:', Object.keys(fields));
        console.log('Write file request - files:', Object.keys(files));
        console.log('File path:', filePath);
        console.log('File exists:', !!file);
        console.log('File size:', file?.data?.length || 0);
        
        if (!file || !filePath) {
          console.error('Missing file or path!');
          console.error('File:', file);
          console.error('FilePath:', filePath);
          throw new Error('Missing file or path');
        }
        
        // Ensure parent directory exists
        const dir = require('path').dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.writeFileSync(filePath, file.data);
        console.log(`Successfully wrote file to: ${filePath}`);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
      }

      if (req.url === '/api/convert-docx' && req.method === 'POST') {
        const body = await parseJSONBody(req);
        let { docxPath, pdfPath } = body;
        
        // Ensure paths use forward slashes (Linux-compatible)
        docxPath = docxPath.replace(/\\/g, '/');
        pdfPath = pdfPath.replace(/\\/g, '/');
        
        console.log(`Converting ${docxPath} to ${pdfPath}...`);
        
        // Try LibreOffice for PDF conversion (Linux-compatible)
        const outputDir = path.dirname(docxPath);
        const conversionCommand = `libreoffice --headless --convert-to pdf --outdir "${outputDir}" "${docxPath}"`;
        
        try {
          const { stdout, stderr } = await execAsync(conversionCommand);
          
          // LibreOffice creates PDF with same name but .pdf extension
          const expectedPdfPath = path.join(path.dirname(docxPath), path.basename(docxPath, '.docx') + '.pdf');
          
          // Wait for PDF to be created
          let attempts = 0;
          while (!fs.existsSync(expectedPdfPath) && attempts < 50) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
          }
          
          if (!fs.existsSync(expectedPdfPath)) {
            throw new Error('PDF file was not created by LibreOffice');
          }
          
          // If a specific pdfPath was requested and it's different, move the file
          if (expectedPdfPath !== pdfPath) {
            if (fs.existsSync(pdfPath)) {
              fs.unlinkSync(pdfPath);
            }
            fs.renameSync(expectedPdfPath, pdfPath);
          }
          
          console.log('PDF conversion successful!');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Converted using LibreOffice' }));
          return;
        } catch (error) {
          console.error('LibreOffice conversion failed:', error);
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: false, 
            error: 'PDF conversion not available in this build.',
            details: 'This is a minimal test build. PDF conversion is disabled. Please use DOCX download instead.'
          }));
          return;
        }
      }

      if (req.url.startsWith('/api/read-file') && req.method === 'GET') {
        const url = new URL(req.url, `http://${req.headers.host}`);
        let filePath = url.searchParams.get('path');
        
        // Normalize paths for Linux (convert backslashes to forward slashes)
        if (filePath) {
          filePath = filePath.replace(/\\/g, '/');
        }
        
        if (!filePath || !fs.existsSync(filePath)) {
          throw new Error('File not found');
        }
        
        const fileBuffer = fs.readFileSync(filePath);
        
        res.writeHead(200, {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment'
        });
        res.end(fileBuffer);
        return;
      }

      if (req.url === '/api/cleanup' && req.method === 'POST') {
        const body = await parseJSONBody(req);
        let { tempDir } = body;
        
        // Normalize paths for Linux (convert backslashes to forward slashes)
        tempDir = tempDir.replace(/\\/g, '/');
        
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
      }

      // Handle folder upload for bulk mode
      if (req.url === '/api/upload-folder' && req.method === 'POST') {
        const { fields, files } = await parseMultipartFormData(req);
        const folderName = fields.folderName;
        const fileList = JSON.parse(fields.fileList || '[]');
        
        console.log('Folder upload request - folderName:', folderName);
        console.log('Files to process:', fileList.length);
        
        const results = [];
        
        for (const fileInfo of fileList) {
          const file = files[fileInfo.name];
          if (file) {
            try {
              // Create folder structure in temp directory
              const tempDir = path.join(__dirname, 'temp', folderName);
              if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
              }
              
              const filePath = path.join(tempDir, fileInfo.name);
              fs.writeFileSync(filePath, file.data);
              
              results.push({
                name: fileInfo.name,
                path: filePath,
                success: true
              });
              
              console.log(`Successfully saved: ${fileInfo.name}`);
            } catch (error) {
              console.error(`Error saving ${fileInfo.name}:`, error);
              results.push({
                name: fileInfo.name,
                success: false,
                error: error.message
              });
            }
          }
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, results }));
        return;
      }

      // Handle bulk mode folder processing
      if (req.url === '/api/process-bulk-folder' && req.method === 'POST') {
        const body = await parseJSONBody(req);
        const { folderPath } = body;
        
        console.log('Processing bulk folder:', folderPath);
        
        try {
          const files = [];
          const processDirectory = (dirPath, relativePath = '') => {
            const items = fs.readdirSync(dirPath);
            
            for (const item of items) {
              const fullPath = path.join(dirPath, item);
              const itemRelativePath = relativePath ? path.join(relativePath, item) : item;
              const stat = fs.statSync(fullPath);
              
              if (stat.isDirectory()) {
                processDirectory(fullPath, itemRelativePath);
              } else if (item.toLowerCase().endsWith('.pdf')) {
                files.push({
                  name: item,
                  path: fullPath,
                  relativePath: itemRelativePath
                });
              }
            }
          };
          
          processDirectory(folderPath);
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, files }));
        } catch (error) {
          console.error('Error processing bulk folder:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
        return;
      }

      // Handle bulk mode file processing
      if (req.url === '/api/process-bulk-file' && req.method === 'POST') {
        const body = await parseJSONBody(req);
        const { filePath } = body;
        
        console.log('Processing bulk file:', filePath);
        
        try {
          if (!fs.existsSync(filePath)) {
            throw new Error('File not found');
          }
          
          const fileBuffer = fs.readFileSync(filePath);
          
          // Return file info for processing
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: true, 
            filePath,
            fileName: path.basename(filePath),
            size: fileBuffer.length
          }));
        } catch (error) {
          console.error('Error processing bulk file:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
        return;
      }
      
      // If we get here, it's a static file request
      let filePath = '.' + req.url;
      if (filePath === './') {
        filePath = './dist/index.html';
      } else if (req.url === '/') {
        filePath = './dist/index.html';
      } else if (req.url.startsWith('/assets/') || req.url === '/vite.svg' || req.url === '/favicon.ico' || req.url === '/prevent-autoload.js' || req.url === '/clear-storage.js' || req.url === '/bulk-mode-fix.js' || req.url === '/duplicate-field-fix.js' || req.url === '/umbrel-integration.js' || req.url === '/umbrel-integration-v2.js') {
        // Static assets are in the dist folder
        filePath = './dist' + req.url;
      } else if (req.url.match(/\.(png|jpg|jpeg|gif|svg|ico|webp)$/i)) {
        // Serve image files from dist folder
        filePath = './dist' + req.url;
      } else {
        // For SPA routing, serve index.html for all other routes
        filePath = './dist/index.html';
      }
      
      // Read and serve the file
      fs.readFile(filePath, (error, content) => {
        if (error) {
          if (error.code === 'ENOENT') {
            // File not found
            if (filePath.startsWith('./dist/')) {
              // If it's a dist file that doesn't exist, return 404
              res.writeHead(404);
              res.end('File not found');
            } else {
              // For SPA routing, serve index.html for non-dist routes
              fs.readFile('./dist/index.html', (error, content) => {
                if (error) {
                  res.writeHead(500);
                  res.end('Server Error: ' + error.code);
                } else {
                  res.writeHead(200, { 'Content-Type': 'text/html' });
                  res.end(content, 'utf-8');
                }
              });
            }
          } else {
            res.writeHead(500);
            res.end('Server Error: ' + error.code);
          }
        } else {
          const extname = String(path.extname(filePath)).toLowerCase();
          const mimeType = mimeTypes[extname] || 'application/octet-stream';
          res.writeHead(200, { 'Content-Type': mimeType });
          res.end(content, 'utf-8');
        }
      });
      
    } catch (error) {
      // Error handler for async operations
      console.error('Server error:', error);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message || 'Internal server error' }));
      }
    }
  })();
});

// Verify dist folder exists before starting
const distPath = path.join(__dirname, 'dist');
if (!fs.existsSync(distPath)) {
  console.error(`❌ ERROR: dist folder not found at ${distPath}`);
  console.error('Please ensure the frontend has been built with: npm run build');
  process.exit(1);
}

if (!fs.existsSync(path.join(distPath, 'index.html'))) {
  console.error(`❌ ERROR: index.html not found in dist folder`);
  console.error('Please ensure the frontend has been built with: npm run build');
  process.exit(1);
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Cortana app is running at http://localhost:${PORT}`);
  console.log(`📁 Serving files from: ${distPath}`);
  console.log(`⚠️  PDF conversion disabled (LibreOffice not installed - minimal build for testing)`);
});
