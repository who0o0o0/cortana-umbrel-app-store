/**
 * Test the anchor token system
 */
import { AnchorTokenGenerator, extractFieldInfoFromPDF } from './anchorTokenGenerator.js';
import { createAnchorTokenImporter } from './anchorTokenImporter.js';
import { PDFDocument } from 'pdf-lib';

export async function testAnchorTokenSystem(): Promise<void> {
  console.log('Testing anchor token system...');
  
  try {
    // Create a test PDF with form fields
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);
    const form = pdfDoc.getForm();
    
    // Add some test form fields
    const textField1 = form.createTextField('field_company_name');
    textField1.addToPage(page, { x: 100, y: 700, width: 200, height: 20 });
    
    const textField2 = form.createTextField('field_investor_name');
    textField2.addToPage(page, { x: 100, y: 650, width: 200, height: 20 });
    
    // Extract field info
    const fieldInfo = extractFieldInfoFromPDF(pdfDoc as any);
    console.log('Extracted field info:', fieldInfo);
    
    // Embed anchor tokens
    const tokenGenerator = new AnchorTokenGenerator();
    await tokenGenerator.embedAnchorTokens(pdfDoc, fieldInfo);
    console.log('Anchor tokens embedded');
    
    // Save the PDF
    const pdfBytes = await pdfDoc.save();
    console.log('Test PDF created with', pdfBytes.length, 'bytes');
    
    // Test importing from the PDF
    const anchorTokenImporter = createAnchorTokenImporter();
    const importedData = await anchorTokenImporter.importFromPDF(pdfBytes.buffer.slice(0) as ArrayBuffer);
    console.log('Imported data:', importedData);
    
    console.log('Anchor token system test completed successfully!');
    
  } catch (error) {
    console.error('Anchor token system test failed:', error);
  }
}

// Run test if this file is executed directly
if (typeof window !== 'undefined') {
  // Browser environment - add to window for testing
  (window as any).testAnchorTokens = testAnchorTokenSystem;
}
