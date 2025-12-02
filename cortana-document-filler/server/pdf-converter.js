const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);
const router = express.Router();

// Configure multer for file uploads
const upload = multer({ 
  dest: 'temp/',
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// PDF conversion endpoint (Linux-compatible using LibreOffice or pandoc)
router.post('/convert-docx-to-pdf', upload.single('docx'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const docxPath = req.file.path;
    const pdfPath = docxPath.replace('.docx', '.pdf');
    const fileName = req.body.fileName || 'document';

    console.log(`Converting ${docxPath} to ${pdfPath}`);

    // Try LibreOffice first (common in Linux environments)
    let conversionCommand = `libreoffice --headless --convert-to pdf --outdir ${path.dirname(docxPath)} "${docxPath}"`;
    
    try {
      const { stdout, stderr } = await execAsync(conversionCommand);
      
      // LibreOffice creates PDF with same name but .pdf extension
      const expectedPdfPath = path.join(path.dirname(docxPath), path.basename(docxPath, '.docx') + '.pdf');
      
      // Wait for PDF file to be created
      let attempts = 0;
      while (!fs.existsSync(expectedPdfPath) && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }

      if (fs.existsSync(expectedPdfPath)) {
        // Read the PDF file
        const pdfBuffer = fs.readFileSync(expectedPdfPath);
        
        // Clean up temporary files
        fs.unlinkSync(docxPath);
        fs.unlinkSync(expectedPdfPath);

        // Send PDF as response
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}.pdf"`);
        res.send(pdfBuffer);
        return;
      }
    } catch (libreOfficeError) {
      console.log('LibreOffice not available, trying alternative methods...');
    }

    // Fallback: Return error - PDF conversion not available
    // Clean up files on error
    if (fs.existsSync(docxPath)) {
      fs.unlinkSync(docxPath);
    }
    
    res.status(500).json({ 
      error: 'PDF conversion not available. LibreOffice is required for DOCX to PDF conversion in this environment.',
      details: 'Please install LibreOffice or use the DOCX download option instead.'
    });

  } catch (error) {
    console.error('PDF conversion error:', error);
    
    // Clean up files on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ 
      error: 'Failed to convert DOCX to PDF', 
      details: error.message 
    });
  }
});

module.exports = router;











