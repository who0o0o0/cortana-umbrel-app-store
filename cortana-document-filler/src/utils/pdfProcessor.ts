import { PlaceholderField, FormData, ConditionalGroup } from '../types.js';

/**
 * Extract text content from PDF for placeholder detection
 */
export async function extractTextFromPdf(file: File): Promise<string> {
  try {
    // Validate file
    if (!file) {
      throw new Error('No file provided');
    }
    
    if (file.type !== 'application/pdf') {
      throw new Error('File must be a valid PDF file');
    }
    
    if (file.size === 0) {
      throw new Error('File is empty');
    }
    
    // Check file size limit (50MB)
    const maxSize = 50 * 1024 * 1024; // 50MB in bytes
    if (file.size > maxSize) {
      throw new Error(`File is too large (${Math.round(file.size / 1024 / 1024)}MB). Maximum file size is 50MB.`);
    }
    
    console.log(`Reading PDF file: ${file.name}, size: ${file.size} bytes`);
    
    // Read file as ArrayBuffer
    let arrayBuffer: ArrayBuffer;
    try {
      const readPromise = file.arrayBuffer();
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('File read timeout')), 10000)
      );
      
      arrayBuffer = await Promise.race([readPromise, timeoutPromise]);
    } catch (readError) {
      console.error('Failed to read file with arrayBuffer(), trying alternative method:', readError);
      
      try {
        const textPromise = file.text();
        const timeoutPromise = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('File read timeout')), 10000)
        );
        
        const text = await Promise.race([textPromise, timeoutPromise]);
        const encoder = new TextEncoder();
        arrayBuffer = encoder.encode(text).buffer;
      } catch (textError) {
        console.error('Failed to read file as text:', textError);
        if (textError instanceof Error && textError.message.includes('timeout')) {
          throw new Error('File read timed out. The file may be too large or corrupted.');
        }
        throw new Error('File could not be read using any method. The file may be corrupted or in an unsupported format.');
      }
    }
    
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      throw new Error('Failed to read file content - file appears to be empty or corrupted');
    }
    
    console.log(`Successfully read file: ${arrayBuffer.byteLength} bytes`);
    
    // Extract text from the raw PDF content
    const uint8Array = new Uint8Array(arrayBuffer);
    const textDecoder = new TextDecoder('utf-8', { fatal: false });
    const rawText = textDecoder.decode(uint8Array);
    
    // Look for placeholders in the raw PDF content
    const placeholderMatches = rawText.match(/\{\{[^}]+\}\}/g);
    if (placeholderMatches && placeholderMatches.length > 0) {
      console.log(`Found ${placeholderMatches.length} potential placeholders in PDF raw content:`, placeholderMatches);
      return placeholderMatches.join(' ');
    } else {
      // If no placeholders found in raw content, try to extract readable text
      const textPatterns = rawText.match(/[A-Za-z0-9\s\.,;:!?\-\(\)\[\]{}]+/g);
      if (textPatterns && textPatterns.length > 0) {
        const fullText = textPatterns.join(' ');
        console.log(`Extracted ${fullText.length} characters of readable text from PDF`);
        console.log('Sample extracted text:', fullText.substring(0, 200) + '...');
        return fullText;
      } else {
        // Last resort: try to find any text-like content
        const anyText = rawText.replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim();
        if (anyText.length > 0) {
          console.log(`Extracted ${anyText.length} characters of basic text from PDF`);
          console.log('Sample extracted text:', anyText.substring(0, 200) + '...');
          return anyText;
        }
      }
    }
    
    if (!rawText || rawText.trim().length === 0) {
      throw new Error('Failed to extract text from PDF. The file may be corrupted or contain only images.');
    }
    
    console.log(`Successfully extracted ${rawText.length} characters from PDF`);
    return rawText;
    
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    
    if (error instanceof Error) {
      if (error.name === 'NotReadableError') {
        throw new Error('File could not be read. Please try uploading the file again or check if the file is corrupted.');
      } else if (error.name === 'NotFoundError') {
        throw new Error('Invalid PDF file structure. The document appears to be corrupted or not a valid PDF document. Please try a different file.');
      } else if (error.message.includes('timeout')) {
        throw new Error('File read timed out. The file may be too large or corrupted.');
      } else if (error.message.includes('too large')) {
        throw new Error(error.message);
      } else if (error.message.includes('Failed to extract text')) {
        throw new Error('Failed to extract text from PDF. The file may be corrupted or contain only images.');
      } else {
        throw error;
      }
    }
    
    throw new Error(`Failed to read PDF: ${String(error)}`);
  }
}

/**
 * Build data object for PDF processing from placeholders and typed form data
 * This is used for exporting field data, not for PDF generation
 */
export function buildPdfData(
  placeholders: PlaceholderField[],
  formData: FormData,
  emptyMode: 'emdash' | 'empty' = 'emdash'
): Record<string, any> {
  console.log('buildPdfData called with:', { placeholders: placeholders.length, formData: Object.keys(formData) });
  console.log('Form data contents:', formData);

  const getEmptyValue = () => (emptyMode === 'empty' ? '' : '—');
  const result: Record<string, any> = {};

  for (const ph of placeholders) {
    // Extract raw tag name between the braces, including any type/default/optional suffixes
    const rawTag = ph.originalPlaceholder.slice(2, -2).trim();
    
    console.log(`Processing placeholder: ${ph.key} (${ph.type}, isMultiple: ${ph.isMultiple})`);

    // Try multiple key variations to find the value
    let value = formData[ph.key];
    if (value === undefined || value === null || value === '') {
      // Try the original key (with original case)
      value = formData[ph.originalKey];
      console.log(`Tried original key ${ph.originalKey}:`, value);
    }
    if (value === undefined || value === null || value === '') {
      // Try the original placeholder (with braces)
      value = formData[ph.originalPlaceholder];
      console.log(`Tried original placeholder ${ph.originalPlaceholder}:`, value);
    }
    if (value === undefined || value === null || value === '') {
      // Try case variations
      const upperKey = ph.originalKey.toUpperCase();
      const lowerKey = ph.originalKey.toLowerCase();
      const titleKey = ph.originalKey.charAt(0).toUpperCase() + ph.originalKey.slice(1).toLowerCase();
      
      value = formData[upperKey] || formData[lowerKey] || formData[titleKey];
      console.log(`Tried case variations (${upperKey}, ${lowerKey}, ${titleKey}):`, value);
    }
    
    console.log(`Final value for ${ph.key}:`, value);

    // If no value provided, use default if any
    if (value === undefined || value === null || value === '') {
      if (ph.defaultValue !== undefined) {
        value = ph.defaultValue;
      } else if (ph.isOptional) {
        value = '';
      } else {
        value = getEmptyValue();
      }
    }

    // Normalize by type
    switch (ph.type) {
      case 'number':
        if (typeof value === 'string' && value !== '') {
          const num = parseFloat(value);
          value = isNaN(num) ? getEmptyValue() : num;
        } else if (typeof value === 'number') {
          value = value;
        } else {
          value = getEmptyValue();
        }
        break;
      case 'date':
        if (value instanceof Date) {
          value = value.toLocaleDateString();
        } else if (typeof value === 'string' && value !== '') {
          // Try to parse the date string
          const date = new Date(value);
          value = isNaN(date.getTime()) ? getEmptyValue() : date.toLocaleDateString();
        } else {
          value = getEmptyValue();
        }
        break;
      case 'multiline':
        if (typeof value === 'string') {
          value = value.replace(/\n/g, '<br>');
        } else {
          value = getEmptyValue();
        }
        break;
      case 'multiple':
        if (Array.isArray(value)) {
          value = value.join(', ');
        } else if (typeof value === 'string' && value !== '') {
          value = value;
        } else {
          value = getEmptyValue();
        }
        break;
      default: // text
        if (typeof value === 'string') {
          value = value;
        } else if (typeof value === 'number') {
          value = value.toString();
        } else {
          value = getEmptyValue();
        }
    }

    // Format value based on original placeholder case
    let formattedValue = value;
    if (typeof value === 'string') {
      // Check if the original placeholder is all caps
      if (ph.originalKey === ph.originalKey.toUpperCase() && ph.originalKey.includes(' ')) {
        // All caps placeholder - make value all caps
        formattedValue = value.toUpperCase();
      } else if (ph.originalKey === ph.originalKey.toLowerCase()) {
        // All lowercase placeholder - make value lowercase
        formattedValue = value.toLowerCase();
      } else if (ph.originalKey === ph.originalKey.charAt(0).toUpperCase() + ph.originalKey.slice(1).toLowerCase()) {
        // Title case placeholder - make value title case
        formattedValue = value.toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
      }
    }
    
    // Provide multiple mappings to ensure all formats are supported:
    // 1) canonical key used by custom parser
    result[normalizeTagToKey(rawTag)] = formattedValue;
    // 2) raw tag for templates without custom parser reliance
    result[rawTag] = formattedValue;
    // 3) original placeholder (exact format) for precise matching - THIS IS THE KEY ONE
    result[ph.originalPlaceholder] = formattedValue;
    // 4) original key (without braces) for additional matching
    result[ph.originalKey] = formattedValue;
    
    // 5) Add case variations for better matching
    const upperKey = ph.originalKey.toUpperCase();
    const lowerKey = ph.originalKey.toLowerCase();
    const titleKey = ph.originalKey.charAt(0).toUpperCase() + ph.originalKey.slice(1).toLowerCase();
    
    result[upperKey] = formattedValue;
    result[lowerKey] = formattedValue;
    result[titleKey] = formattedValue;
    
    // 6) Add placeholder variations with braces
    result[`{{${upperKey}}}`] = formattedValue;
    result[`{{${lowerKey}}}`] = formattedValue;
    result[`{{${titleKey}}}`] = formattedValue;
    
    console.log(`Added to result: ${ph.key} =`, value);
    console.log(`  - Canonical key: ${normalizeTagToKey(rawTag)} = ${formattedValue}`);
    console.log(`  - Raw tag: ${rawTag} = ${formattedValue}`);
    console.log(`  - Original placeholder: ${ph.originalPlaceholder} = ${formattedValue}`);
    console.log(`  - Original key: ${ph.originalKey} = ${formattedValue}`);
    console.log(`  - Formatted value: ${formattedValue}`);
  }

  console.log('Final PDF data object:', result);
  return result;
}

/**
 * Normalize tag to key for consistent mapping
 */
function normalizeTagToKey(tag: string): string {
  return tag.trim().replace(/\s+/g, ' ').toLowerCase();
}
