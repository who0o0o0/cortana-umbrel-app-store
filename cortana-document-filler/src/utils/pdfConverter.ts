import jsPDF from 'jspdf';
import mammoth from 'mammoth';

/**
 * Converts a DOCX file to PDF using browser-based conversion
 * @param docxBytes - The DOCX file content as Uint8Array
 * @param outputFileName - The desired output filename (without extension)
 * @returns Promise<Uint8Array> - The PDF file content
 */
export async function convertDocxToPdf(docxBytes: Uint8Array, outputFileName: string): Promise<Uint8Array> {
  try {
    // Use browser-based conversion (Linux/Docker compatible)
    return await convertDocxToPdfBrowser(docxBytes, outputFileName);
  } catch (error) {
    console.error('PDF conversion error:', error);
    throw new Error(`Failed to convert to PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Converts DOCX to PDF using WordCOM via PowerShell
 * @param docxBytes - The DOCX file content as Uint8Array
 * @param outputFileName - The desired output filename (without extension)
 * @returns Promise<Uint8Array> - The PDF file content
 */
async function convertDocxToPdfBrowser(docxBytes: Uint8Array, outputFileName: string): Promise<Uint8Array> {
  try {
    // Use Linux-compatible temp directory path
    const tempDir = `/tmp/cortana_pdf_${Date.now()}`;
    const docxPath = `${tempDir}/${outputFileName}.docx`;
    const pdfPath = `${tempDir}/${outputFileName}.pdf`;
    
    // Create temp directory - using relative URL to hit simple-server.js on port 3000
    const tempDirResponse = await fetch('/api/create-temp-dir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tempDir: tempDir })
    });
    
    if (!tempDirResponse.ok) {
      const errorData = await tempDirResponse.json().catch(() => ({ error: 'Failed to create temp directory' }));
      throw new Error(`Failed to create temp directory: ${errorData.error || tempDirResponse.statusText}`);
    }
    
    const tempDirResult = await tempDirResponse.json();
    if (!tempDirResult.success) {
      throw new Error(`Failed to create temp directory: ${tempDirResult.error || 'Unknown error'}`);
    }
    
    // Write DOCX file
    const docxBlob = new Blob([docxBytes as any], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const formData = new FormData();
    formData.append('file', docxBlob, `${outputFileName}.docx`);
    formData.append('path', docxPath);
    
    await fetch('/api/write-file', {
      method: 'POST',
      body: formData
    });
    
    // Convert using server API (Linux-compatible)
    const convertResponse = await fetch('/api/convert-docx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docxPath: docxPath, pdfPath: pdfPath })
    });
    
    if (!convertResponse.ok) {
      throw new Error('PDF conversion failed');
    }
    
    // Read PDF file
    const pdfResponse = await fetch(`/api/read-file?path=${encodeURIComponent(pdfPath)}`);
    if (!pdfResponse.ok) {
      throw new Error('Failed to read PDF file');
    }
    
    const pdfArrayBuffer = await pdfResponse.arrayBuffer();
    
    // Clean up temp files
    await fetch('/api/cleanup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tempDir: tempDir })
    });
    
    return new Uint8Array(pdfArrayBuffer);
    
  } catch (error) {
    console.error('PDF conversion error:', error);
    
    // Fallback to simple PDF using jsPDF
    const doc = new jsPDF();
    doc.setFontSize(12);
    doc.text('PDF conversion unavailable in this environment.', 20, 20);
    doc.text(`File: ${outputFileName}`, 20, 30);
    doc.text('For exact formatting, please download the DOCX file.', 20, 40);
    
    const pdfOutput = doc.output('arraybuffer');
    return new Uint8Array(pdfOutput);
  }
}



/**
 * Downloads a PDF file to the user's device
 * @param pdfBytes - The PDF file content
 * @param fileName - The desired filename (without extension)
 */
export function downloadPdf(pdfBytes: Uint8Array, fileName: string): void {
  const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileName}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Checks if PDF conversion is available in the current environment
 * @returns boolean - true if PDF conversion is available (both desktop and browser)
 */
export function isPdfConversionAvailable(): boolean {
  // Available in both Tauri environment and browser
  return typeof window !== 'undefined';
}

