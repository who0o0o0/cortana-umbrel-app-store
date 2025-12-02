import { PDFDocument } from 'pdf-lib';
import { FormData } from '../types.js';
import { diagnosePDF, PDFDiagnostics } from './pdfDiagnostics';
import { extractDataFromPDFText } from './pdfTextExtractor';
import { extractDataFromPDFWithOCR, isOCRSuccessful, getOCRStats } from './ocrExtractor';
import { mapByAnchors, MappingResult } from './labelMapper';
import { mapByRegions, looksLikeSAFE, mergeResultsPrefer } from './regionExtractor';
import { extractDataWithOCRFallback } from './ocrFallbackExtractor';

const DEBUG_IMPORT = true;

/**
 * Import data from PDF using robust extraction pipeline with positioned spans
 */
export class AnchorTokenImporter {
  
  /**
   * Import data from PDF using the new routing logic
   */
  async importFromPDF(arrayBuffer: ArrayBuffer, originalTemplateText?: string, templatePlaceholders: any[] = []): Promise<FormData> {
    // Create a copy of the ArrayBuffer immediately to prevent detachment issues
    // This copy will be used for OCR fallback if needed
    let ocrBufferCopy: ArrayBuffer | null = null;
    try {
      ocrBufferCopy = arrayBuffer.slice(0);
      console.log('Created OCR fallback buffer copy:', ocrBufferCopy.byteLength, 'bytes');
    } catch (copyError) {
      console.warn('Could not create OCR buffer copy (buffer may be detached):', copyError);
    }
    
    try {
      console.log('=== PDF IMPORT START ===');
      console.log('Starting automatic PDF import...');
      console.log('Template placeholders passed to importFromPDF:', templatePlaceholders.length);
      console.log('Original PDF buffer size:', arrayBuffer.byteLength);
      
      // Load PDF document
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      console.log('PDF loaded successfully');
      
      // Run comprehensive diagnostics
      const diagnostics = await diagnosePDF(arrayBuffer);
      console.log('PDF Diagnostics:', diagnostics);
      console.log('hasAcroForm:', diagnostics.hasAcroForm);
      console.log('fieldCount:', diagnostics.fieldCount);
      console.log('isFlattened:', diagnostics.isFlattened);
      
      // Route based on PDF type - AcroForm takes precedence
      if (diagnostics.hasAcroForm) {
        console.log('✅ ROUTE: PDF has form fields - using AcroForm extraction');
        const formData = await this.extractFromFormFields(pdfDoc);
        
        // If form field extraction yielded too few fields, try OCR fallback
        if (Object.keys(formData).length < 2 && ocrBufferCopy) {
          console.log('⚠️ Form field extraction yielded too few fields, trying OCR fallback...');
          const ocrData = await extractDataWithOCRFallback(ocrBufferCopy, templatePlaceholders);
          if (Object.keys(ocrData).length > Object.keys(formData).length) {
            console.log('✅ OCR fallback yielded more fields, using OCR results');
            return ocrData;
          }
        }
        
        return formData;
      }

      // For flattened PDFs, automatically use text layer extraction
      console.log('✅ ROUTE: PDF appears to be flattened - using text layer extraction');
      console.log('Passing', templatePlaceholders.length, 'placeholders to extraction');
      // IMPORTANT: Pass original arrayBuffer, not re-saved PDF bytes
      // Re-saving can strip the text layer on Windows
      const flattenedData = await this.extractFromFlattenedPDFTextOnly(arrayBuffer, { embedAnchorTokens: true }, diagnostics, templatePlaceholders);
      
      // If text layer extraction yielded too few fields, try OCR fallback
      if (Object.keys(flattenedData).length < 2 && ocrBufferCopy) {
        console.log('⚠️ Text layer extraction yielded too few fields, trying OCR fallback...');
        const ocrData = await extractDataWithOCRFallback(ocrBufferCopy, templatePlaceholders);
        if (Object.keys(ocrData).length > Object.keys(flattenedData).length) {
          console.log('✅ OCR fallback yielded more fields, using OCR results');
          return ocrData;
        }
      }
      
      return flattenedData;
      
    } catch (error) {
      console.error('Error importing from PDF:', error);
      console.log('⚠️ Primary extraction failed, attempting OCR fallback as last resort...');
      
      // Last resort: try OCR fallback (use the copy we made earlier)
      try {
        if (ocrBufferCopy) {
          const ocrData = await extractDataWithOCRFallback(ocrBufferCopy, templatePlaceholders);
          if (Object.keys(ocrData).length > 0) {
            console.log('✅ OCR fallback succeeded, returning OCR results');
            return ocrData;
          }
        } else {
          console.error('OCR buffer copy not available - cannot attempt OCR fallback');
        }
      } catch (ocrError) {
        console.error('OCR fallback also failed:', ocrError);
      }
      
      return {};
    }
  }

  /**
   * Extract data from form fields (existing fast path)
   */
  private async extractFromFormFields(pdfDoc: PDFDocument): Promise<FormData> {
    try {
      const form = pdfDoc.getForm();
      const fields = form.getFields();
      const result: FormData = {};
      
      console.log(`Found ${fields.length} form fields in PDF`);
      
      for (const field of fields) {
        const fieldName = field.getName();
        let fieldValue: string | string[] | boolean | undefined;
        
        // Handle different field types using the correct methods
        if (field.constructor.name === 'PDFTextField') {
          fieldValue = (field as any).getText();
        } else if (field.constructor.name === 'PDFCheckBox') {
          fieldValue = (field as any).isChecked();
        } else if (field.constructor.name === 'PDFDropdown') {
          const selectedOptions = (field as any).getSelected();
          fieldValue = selectedOptions.length > 0 ? selectedOptions[0] : "";
        } else if (field.constructor.name === 'PDFRadioGroup') {
          const selectedOption = (field as any).getSelected();
          fieldValue = selectedOption ? selectedOption[0] : "";
        } else {
          // For other field types, try to get text value
          try {
            fieldValue = (field as any).getText?.() || "";
          } catch {
            fieldValue = "";
          }
        }
        
        // Only process fields with values
        if (fieldValue !== undefined && fieldValue !== null && fieldValue !== "" && fieldValue !== false) {
          // Convert field name back to placeholder key
          // Field names are like "field_company_name" -> "company name"
          let placeholderKey = fieldName.replace("field_", "").replace(/_/g, " ").trim();
          
          // Special handling for service(s) field
          if (placeholderKey === "service s") {
            placeholderKey = "service(s)";
          }
          
          console.log(`PDF Field: ${fieldName} -> Key: ${placeholderKey} -> Value: ${fieldValue} (Type: ${field.constructor.name})`);
          
          // Convert boolean values to appropriate strings
          if (typeof fieldValue === "boolean") {
            result[placeholderKey] = fieldValue ? "Yes" : "No";
          } else {
            result[placeholderKey] = String(fieldValue).trim();
          }
        }
      }
      
      console.log(`Extracted ${Object.keys(result).length} fields from form`);
      return result;
    } catch (error) {
      console.error('Error extracting from form fields:', error);
      return {};
    }
  }

  /**
   * Extract from flattened PDF using text layer only (OCR disabled)
   */
  private async extractFromFlattenedPDFTextOnly(pdfBytes: ArrayBuffer, settings: any, diagnostics: PDFDiagnostics, templatePlaceholders: any[] = []): Promise<FormData> {
    console.log('=== FLATTENED PDF EXTRACTION START ===');
    console.log('Extracting from flattened PDF using text layer only...');
    console.log('Template placeholders provided:', templatePlaceholders.length);
    console.log('Template placeholder keys:', templatePlaceholders.map(p => p.key));
    console.log('PDF buffer size for text extraction:', pdfBytes.byteLength);
    
    // Extract text layer spans directly from original PDF bytes
    // IMPORTANT: Don't re-save the PDF as it can strip the text layer on Windows
    console.log('Extracting text from original PDF bytes...');
    const textSpans = await extractDataFromPDFText(pdfBytes);
    console.log('Text extraction complete!');
    console.log('Text layer stats:', {
      totalSpans: textSpans.length,
      totalChars: textSpans.reduce((sum, span) => sum + span.text.length, 0),
      pages: new Set(textSpans.map(s => s.page)).size
    });
    console.log('First 10 text spans:', textSpans.slice(0, 10).map(s => `"${s.text}" at (${s.x}, ${s.y})`));
    
    // Use text layer for mapping (no OCR)
    console.log('Calling mapByAnchors with', textSpans.length, 'spans and', templatePlaceholders.length, 'placeholders');
    const mappingResult = mapByAnchors(textSpans, [], templatePlaceholders);
    console.log('Mapping complete!');
    console.log('Mapping result:', mappingResult);
    console.log('Extracted field count:', Object.keys(mappingResult.data).length);
    console.log('Extracted fields:', Object.keys(mappingResult.data));
    
    // Convert MappingResult to FormData with final token filtering
    const formData: FormData = {};
    console.log('Converting mapping result to form data...');
    console.log('Raw mapping data keys:', Object.keys(mappingResult.data));
    for (const [key, value] of Object.entries(mappingResult.data)) {
      // Final safety check: reject any value that looks like a token
      if (value && !/^\{\{.*\}\}$/.test(value.trim())) {
        formData[key] = value;
        console.log(`✅ Accepted: ${key} = "${value}"`);
      } else {
        console.log(`❌ Rejected token-like value for ${key}: "${value}"`);
      }
    }
    
    console.log('Final extracted data count:', Object.keys(formData).length);
    console.log('Final extracted data:', formData);
    console.log('=== FLATTENED PDF EXTRACTION END ===');
    return formData;
  }

  /**
   * Extract data from flattened PDF using positioned spans
   */
  private async extractFromFlattenedPDF(pdfDoc: PDFDocument, settings: any, diagnostics: PDFDiagnostics, templatePlaceholders: any[] = []): Promise<FormData> {
    console.log('Extracting from flattened PDF using positioned spans...');
    
    // Step 1: Extract text spans using pdfjs-dist
    const pdfBytes = await pdfDoc.save();
    console.debug('[extractor] typeof extractDataFromPDFText =', typeof extractDataFromPDFText);
    const textSpans = await extractDataFromPDFText(pdfBytes);
    
    if (DEBUG_IMPORT) {
      console.log('Text layer stats:', {
        totalSpans: textSpans.length,
        totalChars: textSpans.reduce((sum, s) => sum + s.text.length, 0),
        pages: new Set(textSpans.map(s => s.page)).size
      });
    }
    
    // Step 2: Calculate token and label ratios
    const tokenSpans = textSpans.filter(span => /^\{\{.*\}\}$/.test(span.text.trim()));
    const labelSpans = textSpans.filter(span => {
      const text = span.text.toLowerCase();
      const labelWords = ['investor', 'name', 'company', 'purchase', 'amount', 'date', 'safe', 'state', 'incorporation', 'governing', 'law', 'jurisdiction', 'authorized', 'representative', 'title'];
      return labelWords.some(word => text.includes(word));
    });
    
    const tokenRatio = textSpans.length > 0 ? tokenSpans.length / textSpans.length : 0;
    const labelHintRatio = textSpans.length > 0 ? labelSpans.length / textSpans.length : 0;
    const charsPerPage = textSpans.length > 0 ? textSpans.reduce((sum, s) => sum + s.text.length, 0) / new Set(textSpans.map(s => s.page)).size : 0;
    
    console.log(`Text analysis: tokenRatio=${tokenRatio.toFixed(3)}, labelHintRatio=${labelHintRatio.toFixed(3)}, charsPerPage=${charsPerPage.toFixed(0)}`);
    
    // Step 3: Route based on text quality
    let spans = textSpans;
    let ocrSpans: any[] = [];
    
    if (tokenRatio >= 0.15 || charsPerPage < 200 || PDFDiagnostics.isTextless(pdfDoc as any)) {
      console.log('Text layer is token-heavy or sparse - using OCR');
      if (settings.useOCR) {
        ocrSpans = await extractDataFromPDFWithOCR(pdfDoc);
        
        if (isOCRSuccessful(ocrSpans)) {
          const ocrStats = getOCRStats(ocrSpans);
          console.log(`OCR stats: totalWords=${ocrStats.totalWords}, avgConfidence=${ocrStats.avgConfidence.toFixed(1)}, lowQualityPages=${ocrStats.lowQualityPages}`);
          spans = ocrSpans;
        } else {
          console.log('OCR failed - falling back to text layer + regions');
        }
      } else {
        console.log('OCR disabled - using text layer + regions');
      }
    } else {
      console.log('Text layer looks good - using text layer with OCR fallback');
      if (settings.useOCR) {
        ocrSpans = await extractDataFromPDFWithOCR(pdfDoc);
        if (isOCRSuccessful(ocrSpans)) {
          const ocrStats = getOCRStats(ocrSpans);
          console.log(`OCR available: totalWords=${ocrStats.totalWords}, avgConfidence=${ocrStats.avgConfidence.toFixed(1)}`);
        }
      }
    }
    
    // Step 4: Map using label-anchor proximity with per-field source selection
    let result = mapByAnchors(spans, ocrSpans, templatePlaceholders);
    
    if (DEBUG_IMPORT) {
      console.log(`Anchor mapping result: ${result.confidentCount} confident fields`);
      console.log('Extracted fields:', Object.keys(result.data));
    }
    
    // Step 5: If not enough confident fields and looks like SAFE, try region mapping
    if (result.confidentCount < 4 && looksLikeSAFE(spans)) {
      console.log('Low confidence anchor mapping, trying region-based extraction...');
      const regionResult = mapByRegions(spans, 'SAFE');
      
      if (DEBUG_IMPORT) {
        console.log(`Region mapping result: ${regionResult.confidentCount} confident fields`);
      }
      
      // Merge results, preferring anchor over region
      result = mergeResultsPrefer(result, regionResult);
    }
    
    // Convert MappingResult to FormData with final token filtering
    const formData: FormData = {};
    for (const [key, value] of Object.entries(result.data)) {
      // Final safety check: reject any value that looks like a token
      if (value && !/^\{\{.*\}\}$/.test(value.trim())) {
        formData[key] = value;
      } else {
        console.log(`Rejected token-like value for ${key}: "${value}"`);
      }
    }
    
    if (DEBUG_IMPORT) {
      console.log(`Final extraction result: ${Object.keys(formData).length} fields`);
      console.log('Per-field confidence:', result.perFieldConfidence);
      console.log('Final field values:', formData);
    }
    
    return formData;
  }
}

/**
 * Create a new anchor token importer instance
 */
export function createAnchorTokenImporter(): AnchorTokenImporter {
  return new AnchorTokenImporter();
}