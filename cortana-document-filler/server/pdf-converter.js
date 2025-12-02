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

// WordCOM PDF conversion endpoint
router.post('/convert-docx-to-pdf', upload.single('docx'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const docxPath = req.file.path;
    const pdfPath = docxPath.replace('.docx', '.pdf');
    const fileName = req.body.fileName || 'document';

    console.log(`Converting ${docxPath} to ${pdfPath}`);

    // PowerShell script to convert DOCX to PDF using Word COM
    const psScript = `
      $word = New-Object -ComObject Word.Application
      $word.Visible = $false
      try {
        $doc = $word.Documents.Open("${docxPath.replace(/\\/g, '\\\\')}")
        $doc.SaveAs([ref] "${pdfPath.replace(/\\/g, '\\\\')}", [ref] 17)  # 17 = wdFormatPDF
        $doc.Close()
        Write-Output "SUCCESS"
      } catch {
        Write-Error $_.Exception.Message
        exit 1
      } finally {
        $word.Quit()
        [System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
        [System.GC]::Collect()
        [System.GC]::WaitForPendingFinalizers()
      }
    `;

    // Execute PowerShell script
    const { stdout, stderr } = await execAsync(`powershell -NoProfile -Command "${psScript}"`);
    
    if (stderr) {
      console.error('PowerShell error:', stderr);
      throw new Error(`PowerShell conversion failed: ${stderr}`);
    }

    // Wait for PDF file to be created
    let attempts = 0;
    while (!fs.existsSync(pdfPath) && attempts < 50) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }

    if (!fs.existsSync(pdfPath)) {
      throw new Error('PDF file was not created');
    }

    // Read the PDF file
    const pdfBuffer = fs.readFileSync(pdfPath);
    
    // Clean up temporary files
    fs.unlinkSync(docxPath);
    fs.unlinkSync(pdfPath);

    // Send PDF as response
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}.pdf"`);
    res.send(pdfBuffer);

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











