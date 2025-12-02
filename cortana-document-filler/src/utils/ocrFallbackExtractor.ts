import { FormData } from '../types.js';

/**
 * Parse OCR text output to extract placeholder:value pairs
 * OCR output format:
 * --- Page 1 ---
 * Placeholder Name:
 * Placeholder Value
 * 
 * @param ocrText The OCR extracted text
 * @returns FormData object with extracted field:value pairs
 */
// Common section headers that should not be treated as field values
const SECTION_HEADERS = new Set([
  'dates', 'date', 'investor information', 'company information', 
  'other information', 'instructions', 'investor', 'company',
  'information', 'details', 'general', 'personal', 'contact',
  'address', 'payment', 'terms', 'agreement', 'signature',
  'please complete', 'fill in', 'required fields', 'optional fields',
  'save this document', 'return it'
]);

/**
 * Check if a line looks like a section header
 */
function isSectionHeader(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) return false;
  
  // Never treat numbers as section headers (e.g., "500,000", "123", "1,234.56")
  const numberPattern = /^[\d,.\s]+$/;
  if (numberPattern.test(trimmed.replace(/[$,€£¥]/g, ''))) {
    return false;
  }
  
  // Single word that's all caps or title case, and short
  if (trimmed.split(/\s+/).length === 1) {
    if (trimmed === trimmed.toUpperCase() || 
        trimmed === trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase()) {
      if (trimmed.length < 20) {
        return true;
      }
    }
  }
  
  // Check against known section headers
  const lowerLine = trimmed.toLowerCase();
  if (SECTION_HEADERS.has(lowerLine)) {
    return true;
  }
  
  // Common patterns: "Information", "Details", etc.
  const commonPatterns = /^(information|details|general|instructions|section|header)$/i;
  if (commonPatterns.test(trimmed)) {
    return true;
  }
  
  return false;
}

/**
 * Check if a value looks valid (not a section header, not too short/long, etc.)
 */
function isValidValue(value: string): boolean {
  if (!value || value.trim().length === 0) return false;
  
  const trimmed = value.trim();
  
  // Reject if it's a section header
  if (isSectionHeader(trimmed)) return false;
  
  // Reject if it looks like a token
  if (trimmed.match(/^\{\{.*\}\}$/)) return false;
  
  // Reject if it's just a single character or very short single word
  if (trimmed.length < 2) return false;
  
  // Be more lenient with short values - if it's not a section header and appears after a field name, accept it
  // Only reject if it's clearly a header (common header words)
  if (trimmed === trimmed.toUpperCase() && trimmed.length < 15 && !trimmed.includes(' ') && !trimmed.includes(',')) {
    // Common abbreviations and short values that are valid
    const allowedShort = [
      'usa', 'ca', 'ny', 'tx', 'fl', 'uk', 'gb', 'nsw', 'vic', 'qld', 'wa', 'sa', 'nt', 'act', 'tas',  // States/territories
      'ceo', 'cfo', 'cto', 'coo', 'cmo', 'cpo', 'president', 'director', 'manager',  // Titles
      'inc', 'ltd', 'llc', 'corp', 'llp', 'pc', 'plc',  // Company suffixes
      'usa', 'canada', 'australia', 'uk', 'nz'  // Countries (short forms)
    ];
    
    // If it's in the allowed list, accept it
    if (allowedShort.includes(trimmed.toLowerCase())) {
      return true;
    }
    
    // If it's very short (2-3 chars), it's likely an abbreviation - accept it if not a section header
    if (trimmed.length <= 3) {
      // Double-check it's not a section header
      if (!isSectionHeader(trimmed)) {
        return true;  // Short abbreviations are valid
      }
    }
    
    // For slightly longer short caps (4-10 chars), reject only if it's a known section header
    if (trimmed.length > 3 && trimmed.length <= 10) {
      // If it's not a section header, accept it
      if (!isSectionHeader(trimmed)) {
        return true;
      }
    }
  }
  
  // Allow numbers with commas and currency symbols
  const numberPattern = /^[\d,.\s]+$/;
  if (numberPattern.test(trimmed.replace(/[$,€£¥]/g, ''))) {
    return true;
  }
  
  return true;
}

export function parseOCRText(ocrText: string): FormData {
  const result: FormData = {};
  
  if (!ocrText || ocrText.trim().length === 0) {
    return result;
  }

  // Split by page markers but keep them for context
  const lines = ocrText.split('\n').map(line => line.trim());
  
  // Filter out empty lines but keep track of their positions
  const nonEmptyLines: { index: number; line: string }[] = [];
  lines.forEach((line, idx) => {
    if (line.length > 0) {
      nonEmptyLines.push({ index: idx, line });
    }
  });
  
  console.log('OCR parsing: Total lines:', lines.length, 'Non-empty lines:', nonEmptyLines.length);
  
  for (let i = 0; i < nonEmptyLines.length; i++) {
    const { line } = nonEmptyLines[i];
    
    // Skip page markers
    if (line.startsWith('--- Page')) {
      continue;
    }
    
    // Check if this line ends with ":" - it's likely a placeholder name
    // Also handle "Field Name: Value" format (colon not at end)
    let placeholderName = '';
    let valueOnSameLine = '';
    let isFieldName = false;
    
    if (line.endsWith(':')) {
      // Standard format: "Field Name:"
      placeholderName = line.slice(0, -1).trim();
      isFieldName = true;
    } else if (line.includes(':')) {
      // Check if it might be "Field Name: Value" format
      const colonIndex = line.indexOf(':');
      const beforeColon = line.slice(0, colonIndex).trim();
      const afterColon = line.slice(colonIndex + 1).trim();
      
      // If the part before colon looks like a field name and part after looks like a value
      if (beforeColon.length >= 2 && !isSectionHeader(beforeColon) && afterColon.length > 0) {
        placeholderName = beforeColon;
        valueOnSameLine = afterColon;
        isFieldName = true;
      }
    }
    
    if (isFieldName) {
      // Skip if placeholder name is too short or is a section header
      if (placeholderName.length < 2 || isSectionHeader(placeholderName)) {
        continue;
      }
      
      // Check if there's a value on the same line
      if (valueOnSameLine && isValidValue(valueOnSameLine)) {
        // Found value on same line - use it
        console.log(`Processing field "${placeholderName}": Found value on same line: "${valueOnSameLine}"`);
        const normalizedKey = normalizePlaceholderName(placeholderName);
        result[normalizedKey] = valueOnSameLine;
        result[placeholderName] = valueOnSameLine;
        // Also store common variations
        const lowerKey = placeholderName.toLowerCase();
        if (lowerKey !== normalizedKey) {
          result[lowerKey] = valueOnSameLine;
        }
        const titleKey = placeholderName.split(' ').map(word => 
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(' ');
        if (titleKey !== placeholderName && titleKey !== normalizedKey) {
          result[titleKey] = valueOnSameLine;
          result[normalizePlaceholderName(titleKey)] = valueOnSameLine;
        }
        const underscoreKey = placeholderName.replace(/\s+/g, '_').toLowerCase();
        if (underscoreKey !== normalizedKey && underscoreKey !== lowerKey) {
          result[underscoreKey] = valueOnSameLine;
        }
        continue;  // Move to next field
      }
      
      // No value on same line, look on following lines
      // Format: "Field Name:\n[empty line?]\n[section header?]\nValue\n"
      // Value is the first non-empty, non-header, non-field line after the field name
      let value = '';
      let nextIndex = i + 1;
      let linesSkipped = 0;
      const maxSearchLines = 15; // Search up to 15 lines ahead
      
      console.log(`Processing field "${placeholderName}":`);
      
      // Search for the value
      while (nextIndex < nonEmptyLines.length && linesSkipped < maxSearchLines) {
        const { line: nextLine, index: originalIndex } = nonEmptyLines[nextIndex];
        console.log(`  [Line ${originalIndex}] Checking: "${nextLine}"`);
        
        if (nextLine.startsWith('--- Page')) {
          console.log(`  Hit page break, stopping search`);
          break;
        }
        
        // If we encounter another field (ends with :), check if we already found a value
        if (nextLine.endsWith(':')) {
          const potentialField = nextLine.slice(0, -1).trim();
          // Check if it's actually a section header ending with colon
          if (isSectionHeader(potentialField)) {
            // It's a section header like "Dates:" or "Instructions:" - skip it and continue
            console.log(`  Skipping section header: "${nextLine}"`);
            nextIndex++;
            linesSkipped++;
            continue;
          }
          // This is another field name
          // If we already found a value, we're done. Otherwise, this field has no value.
          if (value) {
            console.log(`  Already found value, stopping at next field: "${nextLine}"`);
            break;
          }
          // No value found yet, but we hit the next field - this field has no value
          console.log(`  Hit next field "${nextLine}" without finding value - this field has no value`);
          break;
        }
        
        // Check if this line is a section header - skip it but continue searching
        if (isSectionHeader(nextLine)) {
          console.log(`  Skipping section header: "${nextLine}"`);
          nextIndex++;
          linesSkipped++;
          continue;
        }
        
        // This is likely the value - take the first valid value we find
        const candidateValue = nextLine.trim();
        
        // Validate the value before using it
        if (isValidValue(candidateValue)) {
          value = candidateValue;
          console.log(`  ✅ Found value for "${placeholderName}": "${value}"`);
          // Found a valid value - stop searching
          break;
        } else {
          // Invalid value, continue searching
          console.log(`  ⚠️ Invalid value for "${placeholderName}": "${candidateValue}" (rejected, continuing search)`);
          nextIndex++;
          linesSkipped++;
        }
      }
      
      if (!value) {
        console.log(`  ❌ No value found for "${placeholderName}" after searching ${linesSkipped} lines`);
      }
      
      // Only add if we found a valid value
      if (value && isValidValue(value)) {
        // Normalize placeholder name - remove common prefixes/suffixes, normalize spaces
        const normalizedKey = normalizePlaceholderName(placeholderName);
        
        // Store with both normalized and original key
        result[normalizedKey] = value;
        result[placeholderName] = value;
        
        // Also store common variations for better matching
        const lowerKey = placeholderName.toLowerCase();
        if (lowerKey !== normalizedKey) {
          result[lowerKey] = value;
        }
        
        const titleKey = placeholderName.split(' ').map(word => 
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(' ');
        if (titleKey !== placeholderName && titleKey !== normalizedKey) {
          result[titleKey] = value;
          result[normalizePlaceholderName(titleKey)] = value;
        }
        
        // Store with underscores for field_name style
        const underscoreKey = placeholderName.replace(/\s+/g, '_').toLowerCase();
        if (underscoreKey !== normalizedKey && underscoreKey !== lowerKey) {
          result[underscoreKey] = value;
        }
      } else {
        // Log why a field wasn't extracted (for debugging)
        if (placeholderName.length > 0) {
          console.log(`Skipped field "${placeholderName}": value="${value || '(empty)'}", isValid=${value ? isValidValue(value) : false}`);
        }
      }
    }
  }
  
  return result;
}

/**
 * Normalize placeholder names for matching
 */
function normalizePlaceholderName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-zA-Z0-9\s]/g, ' ') // Replace special chars with spaces
    .replace(/\s+/g, ' ') // Normalize multiple spaces
    .trim();
}

/**
 * Call OCR server endpoint to extract text from PDF
 * @param pdfArrayBuffer The PDF file as ArrayBuffer
 * @returns Extracted text from OCR
 */
export async function callOCREndpoint(pdfArrayBuffer: ArrayBuffer): Promise<string> {
  try {
    // Convert ArrayBuffer to base64 (handle large buffers)
    const uint8Array = new Uint8Array(pdfArrayBuffer);
    let binary = '';
    const chunkSize = 8192; // Process in chunks to avoid stack overflow
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.slice(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    const base64 = btoa(binary);
    
    // Call OCR endpoint - dynamically determine server URL
    const hostname = window.location.hostname;
    const serverUrl = (hostname === 'localhost' || hostname === '127.0.0.1') 
      ? 'http://localhost:3002/api/ocr'
      : `http://${hostname}:3002/api/ocr`;
    
    const response = await fetch(serverUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pdfData: base64
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`OCR server error: ${response.status} - ${errorData.error || response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.success || !data.text) {
      throw new Error('OCR extraction failed: ' + (data.error || 'Unknown error'));
    }
    
    return data.text;
  } catch (error) {
    console.error('Error calling OCR endpoint:', error);
    throw error;
  }
}

/**
 * Extract placeholder data from PDF using OCR as last resort
 * @param pdfArrayBuffer The PDF file as ArrayBuffer
 * @param templatePlaceholders Optional list of template placeholders for better matching
 * @returns FormData with extracted field values
 */
export async function extractDataWithOCRFallback(
  pdfArrayBuffer: ArrayBuffer,
  templatePlaceholders: any[] = []
): Promise<FormData> {
  try {
    console.log('=== OCR FALLBACK EXTRACTION START ===');
    console.log('Attempting OCR extraction as last resort...');
    console.log('PDF buffer size:', pdfArrayBuffer.byteLength, 'bytes');
    console.log('Template placeholders provided:', templatePlaceholders.length);
    
    // Call OCR endpoint
    let ocrText: string;
    try {
      ocrText = await callOCREndpoint(pdfArrayBuffer);
      console.log('✅ OCR endpoint call successful');
    } catch (ocrError) {
      console.error('❌ OCR endpoint call failed:', ocrError);
      console.error('Error details:', ocrError instanceof Error ? ocrError.message : String(ocrError));
      throw ocrError; // Re-throw to be caught by outer catch
    }
    
    if (!ocrText || ocrText.trim().length === 0) {
      console.log('OCR returned empty text');
      return {};
    }
    
    console.log('OCR text length:', ocrText.length);
    console.log('OCR text preview:', ocrText.substring(0, 500));
    
    // Parse OCR text to extract field:value pairs
    const extractedData = parseOCRText(ocrText);
    
    console.log('Extracted data from OCR:', Object.keys(extractedData).length, 'fields');
    console.log('Extracted fields:', Object.keys(extractedData));
    console.log('Full extracted data:', extractedData);
    
    // Try to match extracted data with template placeholders
    if (templatePlaceholders && templatePlaceholders.length > 0) {
      const matchedData: FormData = {};
      
      for (const placeholder of templatePlaceholders) {
        const possibleKeys = [
          placeholder.key,
          placeholder.originalKey,
          placeholder.key.toLowerCase(),
          placeholder.originalKey.toLowerCase(),
          placeholder.key.replace(/_/g, ' '),
          placeholder.originalKey.replace(/_/g, ' '),
          normalizePlaceholderName(placeholder.key),
          normalizePlaceholderName(placeholder.originalKey)
        ];
        
        for (const key of possibleKeys) {
          if (extractedData[key] !== undefined) {
            matchedData[placeholder.key] = extractedData[key];
            console.log(`Matched OCR data: ${key} -> ${placeholder.key} = ${extractedData[key]}`);
            break;
          }
        }
        
        // Try fuzzy matching if no exact match
        if (!matchedData[placeholder.key]) {
          const normalizedPlaceholder = normalizePlaceholderName(placeholder.key);
          for (const [ocrKey, ocrValue] of Object.entries(extractedData)) {
            const normalizedOCRKey = normalizePlaceholderName(ocrKey);
            if (normalizedPlaceholder === normalizedOCRKey ||
                normalizedPlaceholder.includes(normalizedOCRKey) ||
                normalizedOCRKey.includes(normalizedPlaceholder)) {
              matchedData[placeholder.key] = ocrValue;
              console.log(`Fuzzy matched OCR data: ${ocrKey} -> ${placeholder.key} = ${ocrValue}`);
              break;
            }
          }
        }
      }
      
      console.log('Matched OCR data with placeholders:', Object.keys(matchedData).length, 'fields');
      console.log('Matched data:', matchedData);
      
      // Log unmatched placeholders
      const matchedKeys = new Set(Object.keys(matchedData));
      const unmatched = templatePlaceholders.filter(p => !matchedKeys.has(p.key));
      if (unmatched.length > 0) {
        console.log('Unmatched placeholders:', unmatched.map(p => `${p.key} (${p.originalKey})`));
        console.log('Available OCR keys that might match:', Object.keys(extractedData));
      }
      
      console.log('=== OCR FALLBACK EXTRACTION END ===');
      return matchedData;
    }
    
    console.log('=== OCR FALLBACK EXTRACTION END ===');
    console.log('Returning extracted data with', Object.keys(extractedData).length, 'fields');
    return extractedData;
  } catch (error) {
    console.error('❌ OCR fallback extraction failed:', error);
    console.error('Error type:', error instanceof Error ? error.constructor.name : typeof error);
    console.error('Error message:', error instanceof Error ? error.message : String(error));
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return {};
  }
}

