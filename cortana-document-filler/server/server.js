const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { spawn, exec } = require('child_process');
const os = require('os');
const pdfConverter = require('./pdf-converter');

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Create temp directory if it doesn't exist
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Umbrel SSH Proxy - Store credentials in memory (not persistent)
let currentUmbrelCredentials = {
  host: 'umbrel.local',
  username: 'umbrel',
  password: null
};

// Helper function to execute SSH commands to access Umbrel documents
function executeSSHCommand(command) {
  return new Promise((resolve, reject) => {
    // Check if credentials are set
    if (!currentUmbrelCredentials.password) {
      reject(new Error('No Umbrel credentials provided. Please connect first.'));
      return;
    }
    
    // Use stored credentials
    const fullCommand = `sshpass -p '${currentUmbrelCredentials.password}' ssh -o StrictHostKeyChecking=no ${currentUmbrelCredentials.username}@${currentUmbrelCredentials.host} "${command}"`;
    console.log(`Executing SSH command with password authentication to ${currentUmbrelCredentials.username}@${currentUmbrelCredentials.host}`);
    
    exec(fullCommand, (error, stdout, stderr) => {
      if (error) {
        console.error(`SSH command error: ${error}`);
        reject(error);
        return;
      }
      if (stderr) {
        console.error(`SSH stderr: ${stderr}`);
      }
      resolve(stdout.trim());
    });
  });
}

// Routes
app.use('/api/pdf', pdfConverter);

// OCR endpoint - uses Python OCR script as last resort
app.post('/api/ocr', async (req, res) => {
  try {
    if (!req.body || !req.body.pdfData) {
      return res.status(400).json({ error: 'PDF data is required' });
    }

    const pdfData = Buffer.from(req.body.pdfData, 'base64');
    const tempFilePath = path.join(tempDir, `ocr_${Date.now()}.pdf`);
    const outputFilePath = path.join(tempDir, `ocr_${Date.now()}.txt`);

    // Write PDF to temp file
    fs.writeFileSync(tempFilePath, pdfData);

    // OCR is optional - if script not found, return error but don't crash
    // Try to find OCR script in common locations
    let ocrScriptPath = null;
    const possiblePaths = [
      path.join(__dirname, '../../OCR/ocr_pdf.py'),
      path.join(__dirname, '../../../OCR/ocr_pdf.py'),
      '/app/OCR/ocr_pdf.py',
      '/usr/local/bin/ocr_pdf.py'
    ];
    
    for (const testPath of possiblePaths) {
      if (fs.existsSync(testPath)) {
        ocrScriptPath = testPath;
        break;
      }
    }
    
    if (!ocrScriptPath) {
      return res.status(500).json({ 
        error: 'OCR functionality not available. OCR script not found in this environment.',
        details: 'OCR is an optional feature and may not be available in all deployments.'
      });
    }

    // Call Python OCR script (try python, python3, or py)
    return new Promise((resolve, reject) => {
      // Try python first, fallback to python3 or py if needed
      let pythonCmd = 'python';
      if (process.platform === 'win32') {
        // On Windows, try 'py' launcher first
        pythonCmd = 'py';
      }
      
      // Run OCR with PSM 4 (single column) - best for forms with text boxes
      // Without form-mode to preserve all text in boxes
      const pythonProcess = spawn(pythonCmd, [
        ocrScriptPath,
        tempFilePath,
        '-o', outputFilePath,
        '--dpi', '400',  // Higher DPI for better text box extraction
        '--psm', '4'     // PSM 4 = Single column of text - optimal for form text boxes
      ], {
        cwd: path.dirname(ocrScriptPath)
      });

      let errorOutput = '';

      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      pythonProcess.on('close', (code) => {
        try {
          if (code === 0 && fs.existsSync(outputFilePath)) {
            const ocrText = fs.readFileSync(outputFilePath, 'utf-8');
            
            // Clean up temp files
            try {
              fs.unlinkSync(tempFilePath);
              fs.unlinkSync(outputFilePath);
            } catch (cleanupError) {
              console.warn('Failed to clean up temp files:', cleanupError);
            }

            res.json({ 
              success: true, 
              text: ocrText 
            });
            resolve();
          } else {
            // Clean up temp file
            try {
              fs.unlinkSync(tempFilePath);
              if (fs.existsSync(outputFilePath)) {
                fs.unlinkSync(outputFilePath);
              }
            } catch (cleanupError) {
              console.warn('Failed to clean up temp file:', cleanupError);
            }

            res.status(500).json({ 
              error: 'OCR processing failed', 
              details: errorOutput || `Process exited with code ${code}` 
            });
            resolve();
          }
        } catch (fileError) {
          // Clean up temp file
          try {
            fs.unlinkSync(tempFilePath);
            if (fs.existsSync(outputFilePath)) {
              fs.unlinkSync(outputFilePath);
            }
          } catch (cleanupError) {
            console.warn('Failed to clean up temp files:', cleanupError);
          }

          res.status(500).json({ 
            error: 'Failed to read OCR output', 
            details: fileError.message 
          });
          resolve();
        }
      });

      pythonProcess.on('error', (error) => {
        // Clean up temp file
        try {
          fs.unlinkSync(tempFilePath);
        } catch (cleanupError) {
          console.warn('Failed to clean up temp file:', cleanupError);
        }

        res.status(500).json({ 
          error: 'Failed to start OCR process', 
          details: error.message 
        });
        resolve();
      });
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'OCR request failed', 
      details: error.message 
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'PDF Converter Server is running' });
});

// ==================== Umbrel SSH Proxy Endpoints ====================

// Set Umbrel credentials
app.post('/api/umbrel/credentials', (req, res) => {
  try {
    const { host, username, password } = req.body;
    
    if (!host || !username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: host, username, password'
      });
    }
    
    // Store credentials
    currentUmbrelCredentials = { host, username, password };
    
    console.log(`Umbrel credentials updated: ${username}@${host}`);
    
    res.json({
      success: true,
      message: 'Credentials updated successfully'
    });
    
  } catch (error) {
    console.error('Error setting credentials:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to set credentials',
      details: error.message
    });
  }
});

// Test connection to Umbrel
app.get('/api/umbrel/status', async (req, res) => {
  try {
    console.log('Testing Umbrel connection...');
    
    // Test SSH connection
    await executeSSHCommand('echo "Connection successful"');
    
    res.json({ 
      status: 'connected',
      message: 'Successfully connected to Umbrel',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Umbrel connection test failed:', error);
    res.status(500).json({ 
      status: 'disconnected',
      error: 'Failed to connect to Umbrel',
      details: error.message 
    });
  }
});

// List files in Umbrel directory - dynamically search all folders in Template Docs
app.post('/api/umbrel/files', async (req, res) => {
  try {
    console.log('Searching for files in all Template Docs folders...');
    
    // First, get all folders in Template Docs
    const foldersOutput = await executeSSHCommand(`cd ~/umbrel/home/Documents/'Template Docs' && find . -maxdepth 1 -type d -not -name '.' | sed 's|^\./||'`);
    console.log('Found folders:', foldersOutput);
    
    const folders = foldersOutput.split('\n').filter(folder => folder.trim() && !folder.startsWith('.'));
    console.log('Processing folders:', folders);
    
    const allFiles = [];
    
    // Search each folder for .docx files
    for (const folder of folders) {
      if (folder.trim()) {
        try {
          console.log(`Searching folder: ${folder}`);
          // Use a simpler approach - search all .docx files and filter by folder
          const filesOutput = await executeSSHCommand(`cd ~/umbrel/home/Documents/'Template Docs' && find . -name "*.docx" -type f | grep "^./${folder}/" | sed 's|^\./||'`);
          
          if (filesOutput.trim()) {
            const fileNames = filesOutput.split('\n').filter(name => name.trim());
            console.log(`Found ${fileNames.length} files in folder ${folder}:`, fileNames);
            
            for (const fileName of fileNames) {
              const trimmedName = fileName.trim();
              if (trimmedName) {
                // Extract just the filename (remove folder prefix)
                const actualFileName = trimmedName.replace(`${folder}/`, '');
                const file = {
                  name: actualFileName,
                  path: `~/umbrel/home/Documents/Template Docs/${folder}/${actualFileName}`,
                  type: 'file',
                  size: 50000, // Default size
                  modified: new Date().toISOString().split('T')[0],
                  folder: folder // Add folder info for organization
                };
                allFiles.push(file);
              }
            }
          } else {
            console.log(`No .docx files found in folder ${folder}`);
          }
        } catch (folderError) {
          console.log(`Error searching folder ${folder}:`, folderError.message);
          // Continue with other folders even if one fails
        }
      }
    }
    
    console.log(`Found ${allFiles.length} files across all Template Docs folders`);
    res.json({ 
      files: allFiles, 
      path: '~/umbrel/home/Documents/Template Docs',
      folders: folders,
      isLocalFallback: false 
    });
    
  } catch (error) {
    console.error('Error listing Umbrel files:', error);
    res.status(500).json({ 
      error: 'Failed to list files from Umbrel', 
      details: error.message 
    });
  }
});

// Download file from Umbrel
app.post('/api/umbrel/download', async (req, res) => {
  try {
    const { path: filePath } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }
    
    console.log(`Downloading file: ${filePath}`);
    
    // Create a temporary file name
    const fileName = path.basename(filePath);
    const tempPath = path.join(os.tmpdir(), `umbrel_${Date.now()}_${fileName}`);
    
    // Use SCP with password authentication to copy file from Umbrel
    // The filePath should already be the full path from the file listing
    // Check if credentials are set
    if (!currentUmbrelCredentials.password) {
      return res.status(401).json({ error: 'No Umbrel credentials provided. Please connect first.' });
    }
    
    const scpCommand = `sshpass -p '${currentUmbrelCredentials.password}' scp -o StrictHostKeyChecking=no "${currentUmbrelCredentials.username}@${currentUmbrelCredentials.host}:${filePath}" "${tempPath}"`;
    
    await new Promise((resolve, reject) => {
      exec(scpCommand, (error, stdout, stderr) => {
        if (error) {
          console.error(`SCP error: ${error}`);
          reject(error);
          return;
        }
        if (stderr) {
          console.error(`SCP stderr: ${stderr}`);
        }
        resolve();
      });
    });
    
    // Read the file and send it
    const fileBuffer = fs.readFileSync(tempPath);
    
    // Set appropriate headers
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', fileBuffer.length);
    
    // Send the file
    res.send(fileBuffer);
    
    // Clean up temporary file
    fs.unlinkSync(tempPath);
    
  } catch (error) {
    console.error('Error downloading file from Umbrel:', error);
    res.status(500).json({ 
      error: 'Failed to download file from Umbrel', 
      details: error.message 
    });
  }
});

// ==================== End Umbrel SSH Proxy Endpoints ====================

// Start server
app.listen(PORT, () => {
  console.log(`PDF Converter Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`Umbrel SSH Proxy endpoints: http://localhost:${PORT}/api/umbrel/`);
});

module.exports = app;









