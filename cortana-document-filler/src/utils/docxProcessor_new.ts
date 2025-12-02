import { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup } from 'pdf-lib';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { PlaceholderField, FormData, ConditionalGroup } from '../types.js';
import { extractPlaceholders } from './placeholderParser.js';
import { extractDataFromPDFText } from './pdfTextExtractor.js';

// ... existing code ...

export async function parseCompletedPDFFormFromBuffer(arrayBuffer: ArrayBuffer): Promise<FormData> {
  try {
    console.log('Starting PDF form data extraction from buffer...');
    
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    const form = pdfDoc.getForm();
    
    const result: FormData = {};
    let formFieldsFound = 0;
    
    // First, try to extract from form fields (preferred method)
    try {
      const fields = form.getFields();
      console.log(`Found ${fields.length} form fields in PDF`);
      
      fields.forEach((field) => {
        const fieldName = field.getName();
        let fieldValue: string | string[] | boolean | undefined;
        
        // Handle different field types
        if (field instanceof PDFTextField) {
          fieldValue = field.getText();
        } else if (field instanceof PDFCheckBox) {
          fieldValue = field.isChecked();
        } else if (field instanceof PDFDropdown) {
          const selectedOptions = field.getSelected();
          fieldValue = selectedOptions.length > 0 ? selectedOptions[0] as string : '';
        } else if (field instanceof PDFRadioGroup) {
          const selectedOption = field.getSelected();
          fieldValue = selectedOption ? selectedOption[0] as string : '';
        } else {
          // For other field types, try to get text value
          try {
            fieldValue = (field as any).getText?.() || '';
          } catch {
            fieldValue = '';
          }
        }
        
        // Only process fields with values
        if (fieldValue !== undefined && fieldValue !== null && fieldValue !== '' && fieldValue !== false) {
          formFieldsFound++;
          // Convert field name back to placeholder key
          // Field names are like "field_company_name" -> "company name"
          let placeholderKey = fieldName.replace('field_', '').replace(/_/g, ' ').trim();
          
          // Special handling for service(s) field
          if (placeholderKey === 'service s') {
            placeholderKey = 'service(s)';
          }
          
          console.log(`PDF Field: ${fieldName} -> Key: ${placeholderKey} -> Value: ${fieldValue} (Type: ${field.constructor.name})`);
          
          // Check if this is a multiple entry field (contains (s) in the original key)
          const isMultipleField = placeholderKey.toLowerCase().includes('(s)') || 
                                 placeholderKey.toLowerCase().includes('service(s)') ||
                                 placeholderKey.toLowerCase().includes('services');
          
          if (isMultipleField && typeof fieldValue === 'string') {
            // Split by comma and trim each item
            const items = fieldValue.split(',').map(item => item.trim()).filter(item => item.length > 0);
            result[placeholderKey] = items as string[];
            console.log(`PDF Multiple Field: ${fieldName} -> Key: ${placeholderKey} -> Values: [${items.join(', ')}]`);
          } else {
            // Convert boolean values to appropriate strings
            if (typeof fieldValue === 'boolean') {
              result[placeholderKey] = fieldValue ? 'Yes' : 'No';
            } else {
              result[placeholderKey] = String(fieldValue || '').trim();
            }
            console.log(`PDF Field: ${fieldName} -> Key: ${placeholderKey} -> Value: ${result[placeholderKey]}`);
          }
        }
      });
    } catch (formError) {
      console.warn('Error accessing PDF form fields:', formError);
    }
    
    // If no form fields were found or very few, try text extraction as fallback
    if (formFieldsFound === 0) {
      console.log('No form fields found, attempting text extraction fallback...');
      try {
        const textExtractionResult = await extractDataFromPDFText(pdfDoc as any);
        Object.assign(result, textExtractionResult);
        console.log('Text extraction fallback completed, found:', Object.keys(textExtractionResult).length, 'fields');
      } catch (textError) {
        console.warn('Text extraction fallback failed:', textError);
      }
    } else if (formFieldsFound < 3) {
      console.log(`Only ${formFieldsFound} form fields found, attempting text extraction as supplement...`);
      try {
        const textExtractionResult = await extractDataFromPDFText(pdfDoc as any);
        // Only add fields that weren't already found via form fields
        Object.keys(textExtractionResult).forEach(key => {
          if (!result[key]) {
            result[key] = (textExtractionResult as any)[key];
          }
        });
        console.log('Text extraction supplement completed');
      } catch (textError) {
        console.warn('Text extraction supplement failed:', textError);
      }
    }
    
    console.log('PDF form data extracted:', result);
    return result;
    
  } catch (error) {
    console.error('Error parsing PDF form:', error);
    throw new Error(`Failed to parse PDF form: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ... rest of existing code ...

