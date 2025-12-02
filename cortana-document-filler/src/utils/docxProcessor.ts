import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import { PDFDocument, PDFForm, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup, rgb } from 'pdf-lib';
import { FormData, PlaceholderField, ConditionalGroup } from '../types.js';
import { processConditionalOptions } from './placeholderParser.js';
import { extractDataFromPDFText } from './pdfTextExtractor';
import { AnchorTokenGenerator, extractFieldInfoFromPDF } from './anchorTokenGenerator.js';
import { createAnchorTokenImporter } from './anchorTokenImporter.js';
import { getSettings } from './settings.js';

// Global variable to store current template text for comparison
let currentTemplateText: string = '';

// Store template text when DOCX is processed
export function storeTemplateText(templateText: string): void {
  currentTemplateText = templateText;
  console.log('Template text stored globally:', templateText.length, 'characters');
  console.log('Template text sample:', templateText.substring(0, 200) + '...');
}

// Get stored template text
export function getStoredTemplateText(): string {
  console.log('Retrieved template text:', currentTemplateText.length, 'characters');
  return currentTemplateText;
}

/**
 * Process conditional options in XML content
 * This function handles the XML format where OPTION patterns might be split across XML elements
 */
function processConditionalOptionsInXml(xmlContent: string, selections: Record<string, string>): string {
  let result = xmlContent;
  
  console.log('Processing conditional options in XML with selections:', selections);
  
  // Find all option blocks in XML - they might be split across XML elements
  // Look for patterns like: <w:t>[OPTION1: Full Service]</w:t>...content...<w:t>[/OPTION1]</w:t>
  const optionRegex = /<w:t[^>]*>\[OPTION(\d+):\s*([^\]]+)\]<\/w:t>([\s\S]*?)<w:t[^>]*>\[\/OPTION\1\]<\/w:t>/g;
  const matches: Array<{match: RegExpExecArray, optionName: string, optionNumber: string}> = [];
  
  let match;
  while ((match = optionRegex.exec(xmlContent)) !== null) {
    const optionNumber = match[1];
    const optionName = match[2].trim();
    
    console.log(`Found XML option block: "${optionName}" (OPTION${optionNumber}) at position ${match.index}`);
    
    matches.push({
      match,
      optionName: optionName,
      optionNumber: optionNumber
    });
  }
  
  console.log(`Found ${matches.length} XML option blocks:`, matches.map(m => `${m.optionName} (OPTION${m.optionNumber})`));
  
  // Process matches in reverse order to maintain indices
  matches.reverse().forEach(({match, optionName}) => {
    const selectedOption = selections['Options']; // Use 'Options' as the group name
    
    console.log(`Processing XML option: "${optionName}", selected: "${selectedOption}"`);
    
    if (selectedOption === optionName) {
      // Keep this option but remove the markers
      const content = match[2]; // The content between the markers
      result = result.substring(0, match.index!) + content + result.substring(match.index! + match[0].length);
      console.log(`Kept XML option: "${optionName}"`);
    } else {
      // Remove this entire option block
      result = result.substring(0, match.index!) + result.substring(match.index! + match[0].length);
      console.log(`Removed XML option: "${optionName}"`);
    }
  });
  
  console.log('XML conditional options processing complete');
  return result;
}

function normalizeTagToKey(tag: string): string {
  // Remove whitespace
  let t = tag.trim();
  // Drop optional flag
  t = t.replace(/\?optional\s*$/i, '');
  // Split default value
  const [left] = t.split('|', 1).length ? [t.split('|', 1)[0]] : [t];
  // Split type suffix
  const base = left.includes(':') ? left.split(':')[0] : left;
  // Canonicalize like parser (collapse spaces, lowercase)
  return base.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Process a DOCX file and replace placeholders with form data
 */
export async function processDocx(file: File, data: Record<string, any>, conditionalOptions: ConditionalGroup[] = [], outputName?: string, placeholders: PlaceholderField[] = []): Promise<void> {
  try {
    // Validate file
    if (!file) {
      throw new Error('No file provided');
    }
    
    if (file.type !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      throw new Error('File must be a valid DOCX file');
    }
    
    if (file.size === 0) {
      throw new Error('File is empty');
    }
    
    // Check file size limit (50MB)
    const maxSize = 50 * 1024 * 1024; // 50MB in bytes
    if (file.size > maxSize) {
      throw new Error(`File is too large (${Math.round(file.size / 1024 / 1024)}MB). Maximum file size is 50MB.`);
    }
    
    console.log(`Processing DOCX file: ${file.name}, size: ${file.size} bytes`);
    
    // Try multiple approaches to read the file with timeout
    let arrayBuffer: ArrayBuffer;
    try {
      // Add timeout to prevent hanging
      const readPromise = file.arrayBuffer();
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('File read timeout')), 10000)
      );
      
      arrayBuffer = await Promise.race([readPromise, timeoutPromise]);
    } catch (readError) {
      console.error('Failed to read file with arrayBuffer(), trying alternative method:', readError);
      
      // Alternative approach: read as text and convert
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
    
    // Load the DOCX file
    let zip = new PizZip(arrayBuffer);
    
    // Check for essential DOCX structure
    const requiredFiles = [
      'word/document.xml',
      '[Content_Types].xml',
      '_rels/.rels'
    ];
    
    const missingFiles = requiredFiles.filter(file => !zip.file(file));
    if (missingFiles.length > 0) {
      console.error('Missing required DOCX files:', missingFiles);
      throw new Error(`Invalid DOCX file structure. Missing required files: ${missingFiles.join(', ')}`);
    }
    
    // Fix malformed closing tags in the XML content
    const docXml = zip.file('word/document.xml');
    if (docXml) {
      let xmlContent = docXml.asText();
      
      // Store the template text for comparison with filled PDFs
      storeTemplateText(xmlContent);
      
      // Debug: Show what conditional tags are in the document
      console.log('🔍 Looking for conditional tags in document:');
      const conditionalTagRegex = /\{\{#([^}]+)\}\}/g;
      let tagMatch;
      while ((tagMatch = conditionalTagRegex.exec(xmlContent)) !== null) {
        console.log(`   Found opening tag: {{#${tagMatch[1]}}}`);
      }
      
      const closingTagRegex = /\{\{\/([^}]+)\}\}/g;
      while ((tagMatch = closingTagRegex.exec(xmlContent)) !== null) {
        console.log(`   Found closing tag: {{/${tagMatch[1]}}}`);
      }
      
      // Fix malformed closing tags - normalize spaces and underscores
      // Look for patterns like {{/restraints_country }} (with extra space) and fix them
      const closingTagFixRegex = /\{\{\/([^}]+?)\s+\}\}/g;
      xmlContent = xmlContent.replace(closingTagFixRegex, (match, tagName) => {
        const cleanTagName = tagName.trim();
        console.log(`Fixing malformed closing tag: "${match}" -> "{{/${cleanTagName}}}"`);
        return `{{/${cleanTagName}}}`;
      });
      
      // Fix mismatched opening/closing tags where one has spaces and the other has underscores
      // Look for opening tags with spaces and matching closing tags with underscores
      const openingTagRegex = /\{\{#([^}]+?)\}\}/g;
      const openingMatches = [...xmlContent.matchAll(openingTagRegex)];
      
      for (const match of openingMatches) {
        const fullMatch = match[0];
        const tagName = match[1];
        
        // If opening tag has spaces, find corresponding closing tag and fix it
        if (tagName.includes(' ')) {
          const normalizedTagName = tagName.replace(/\s+/g, '_');
          const closingPattern = new RegExp(`\\{\\{/${tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}`, 'g');
          const replacement = `{{/${normalizedTagName}}}`;
          
          if (xmlContent.includes(fullMatch)) {
            console.log(`Fixing mismatched tags: "${tagName}" -> "${normalizedTagName}"`);
            xmlContent = xmlContent.replace(closingPattern, replacement);
          }
        }
      }
      
      // Update the zip with the fixed XML content
      zip.file('word/document.xml', xmlContent);
    }
    
    // Conditional options will be processed later in the function
    
    // Old conditional logic removed - now handled later in the function
    if (false && conditionalOptions.length > 0) {
      // Get the selected option
      const selections: Record<string, string> = {};
      conditionalOptions.forEach(group => {
        const selectionKey = `conditional-${group.groupName}`;
        if (data[selectionKey]) {
          selections[group.groupName] = data[selectionKey];
        }
      });
      
      const selectedOption = selections[conditionalOptions[0].groupName];
      if (selectedOption) {
        console.log('Ultra-simple approach: Setting conditional data');
        console.log('Selected option:', selectedOption);
        
        // Get all the options
        const allOptions = conditionalOptions[0].options;
        console.log('All options:', allOptions);
        
        // Set the selected option to true, others to false
        allOptions.forEach(option => {
          // Convert option back to variable name (e.g., "Full Service" -> "service_type_full")
          const variableName = option.toLowerCase().replace(/\s+/g, '_');
          
          // Try to find the original variable name from the conditional options
          let fullVariableName = '';
          if (conditionalOptions[0].groupName === 'ServiceType') {
            fullVariableName = `service_type_${variableName}`;
          } else if (conditionalOptions[0].groupName === 'RestraintPeriod') {
            fullVariableName = `restraint_period_${variableName}`;
          } else if (conditionalOptions[0].groupName === 'PaymentTerms') {
            fullVariableName = `payment_terms_${variableName}`;
          } else if (conditionalOptions[0].groupName === 'ContractType') {
            fullVariableName = `contract_type_${variableName}`;
          } else {
            // Fallback: assume it's a generic option
            fullVariableName = `option_${variableName}`;
          }
          
          if (option === selectedOption) {
            console.log(`Setting ${fullVariableName} = true`);
            data[fullVariableName] = true;
          } else {
            console.log(`Setting ${fullVariableName} = false`);
            data[fullVariableName] = false;
          }
        });
        
        console.log('Conditional data set successfully');
      }
    }

    // Data is already formatted by buildDocxData function
    const formattedData = { ...data };

    // Debug: Show what data we're setting
    console.log('Setting data for docxtemplater:', formattedData);
    console.log('Looking for service_type_full in data:', 'service_type_full' in formattedData);
    console.log('Value of service_type_full:', formattedData['service_type_full']);
    
    // Debug: Show all keys that contain "company" (case insensitive)
    const companyKeys = Object.keys(formattedData).filter(key => 
      key.toLowerCase().includes('company')
    );
    console.log('Keys containing "company":', companyKeys);
    
    // Debug: Show what placeholders are actually in the document
    const documentContent = zip.file('word/document.xml')?.asText() || '';
    const placeholderMatches = documentContent.match(/\{\{[^}]+\}\}/g) || [];
    const companyPlaceholders = placeholderMatches.filter(placeholder => 
      placeholder.toLowerCase().includes('company')
    );
    console.log('Company placeholders in document:', companyPlaceholders);
    
    // Debug: Show specific company name keys and their values
    console.log('COMPANY NAME key:', formattedData['COMPANY NAME']);
    console.log('Company Name key:', formattedData['Company Name']);
    console.log('{{COMPANY NAME}} key:', formattedData['{{COMPANY NAME}}']);
    console.log('{{Company Name}} key:', formattedData['{{Company Name}}']);

    // Now create docxtemplater with the processed zip
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      // Avoid hard failures when a tag exists in the DOCX that wasn't detected/fed
      nullGetter: () => '',
      delimiters: { start: '{{', end: '}}' },
    });

    // Create a clean data object for docxtemplater using formatted data
    const docxData: Record<string, any> = {};
    
    // Add all the form data with original keys, using formatted data
    Object.keys(formattedData).forEach(key => {
      if (!key.startsWith('#if') && !key.startsWith('/if')) {
        docxData[key] = formattedData[key];
      }
    });
    
    // Add the conditional data
    if (conditionalOptions.length > 0) {
      // Extract selections from form data
      const selections: Record<string, string> = {};
      conditionalOptions.forEach(group => {
        const selectionKey = `conditional-${group.groupName}`;
        if (formattedData[selectionKey]) {
          selections[group.groupName] = formattedData[selectionKey];
        }
      });
      
      console.log('Conditional options selections:', selections);
      
      // Process each conditional group
      conditionalOptions.forEach(group => {
        const selectedOption = selections[group.groupName];
        console.log(`Processing group: ${group.groupName}, selected: ${selectedOption}`);
        
        if (selectedOption) {
          // Generate the correct key format based on the group name
          let conditionKey: string;
          let otherConditionKey: string;
          
          // Generic logic: extract the prefix from group name and create condition key
          // Group name format: "Service Options" -> prefix: "service"
          const groupPrefix = group.groupName.replace(' Options', '').toLowerCase();
          
          if (groupPrefix === 'period') {
            // Special handling for period options - preserve time units
            let timeUnit = 'months';
            if (selectedOption === '2 years') {
              timeUnit = 'years';
            } else if (selectedOption === '1 year') {
              timeUnit = 'year'; // singular for 1 year
            }
            // Extract just the number from the selected option
            const number = selectedOption.split(' ')[0];
            conditionKey = `period_${number}_${timeUnit}`;
            // For restraint period, we'll generate keys dynamically in the loop below
            otherConditionKey = 'period_dynamic';
          } else {
            // Generic format: prefix_option_name (e.g., service_full_package)
            // Special handling for signature options to match template format
            if (groupPrefix === 'signature') {
              // Map signature options to match template format
              let mappedOption = selectedOption.toLowerCase().replace(/\s+/g, '_');
              if (mappedOption === 'aus_company') {
                mappedOption = 'AUS_Company';
              } else if (mappedOption === 'international_company') {
                mappedOption = 'International_Company';
              } else if (mappedOption === 'personal') {
                mappedOption = 'personal';
              }
              conditionKey = `${groupPrefix}_${mappedOption}`;
              // For signature options, we'll generate keys dynamically in the loop below
              otherConditionKey = 'signature_dynamic';
            } else {
              conditionKey = `${groupPrefix}_${selectedOption.toLowerCase().replace(/\s+/g, '_')}`;
              // For generic options, we'll generate keys dynamically in the loop below
              otherConditionKey = 'generic_dynamic';
            }
          }
          
          // Set the selected option to true
          docxData[conditionKey] = true;
          console.log(`✅ Added ${conditionKey} = true to docxData`);
          
          // Set all other options in this group to false
          group.options.forEach(option => {
            if (option !== selectedOption) {
              let key: string;
              
              if (otherConditionKey === 'period_dynamic') {
                // Generate period keys dynamically
                let unit = 'months';
                if (option === '2 years') {
                  unit = 'years';
                } else if (option === '1 year') {
                  unit = 'year';
                }
                const optionNumber = option.split(' ')[0];
                key = `period_${optionNumber}_${unit}`;
              } else if (otherConditionKey === 'signature_dynamic') {
                // Generate signature keys dynamically
                let mapped = option.toLowerCase().replace(/\s+/g, '_');
                if (mapped === 'aus_company') {
                  mapped = 'AUS_Company';
                } else if (mapped === 'international_company') {
                  mapped = 'International_Company';
                } else if (mapped === 'personal') {
                  mapped = 'personal';
                }
                key = `${groupPrefix}_${mapped}`;
              } else if (otherConditionKey === 'generic_dynamic') {
                // Generate generic keys dynamically
                key = `${groupPrefix}_${option.toLowerCase().replace(/\s+/g, '_')}`;
              } else {
                // Fallback to the original key
                key = otherConditionKey;
              }
              
              docxData[key] = false;
              console.log(`❌ Added ${key} = false to docxData`);
            }
          });
          
          // Debug: Show all keys we're generating for this group
          const generatedKeys = group.options.map(option => {
            if (otherConditionKey === 'period_dynamic') {
              let unit = 'months';
              if (option === '2 years') {
                unit = 'years';
              } else if (option === '1 year') {
                unit = 'year';
              }
              const optionNumber = option.split(' ')[0];
              return `period_${optionNumber}_${unit}`;
            } else if (otherConditionKey === 'signature_dynamic') {
              let mapped = option.toLowerCase().replace(/\s+/g, '_');
              if (mapped === 'aus_company') {
                mapped = 'AUS_Company';
              } else if (mapped === 'international_company') {
                mapped = 'International_Company';
              } else if (mapped === 'personal') {
                mapped = 'personal';
              }
              return `${groupPrefix}_${mapped}`;
            } else if (otherConditionKey === 'generic_dynamic') {
              return `${groupPrefix}_${option.toLowerCase().replace(/\s+/g, '_')}`;
            } else {
              return otherConditionKey;
            }
          });
          console.log(`🔍 Generated keys for ${group.groupName}:`, generatedKeys);
        }
      });
      
      console.log('Final docxData with conditionals:', docxData);
      
      // Debug: Show all conditional keys that were set
      const conditionalKeys = Object.keys(docxData).filter(key => 
        key.startsWith('restraints_') || key.startsWith('period_') || key.startsWith('conditional-') || key.startsWith('signature_') || key.startsWith('stages_') || key.startsWith('retainer_')
      );
      console.log('🎯 All conditional keys in docxData:', conditionalKeys);
      conditionalKeys.forEach(key => {
        console.log(`   ${key}: ${docxData[key]}`);
      });
      
      // Debug: Show what the document template expects
      console.log('🔍 Looking for restraint-related keys in docxData:');
      Object.keys(docxData).forEach(key => {
        if (key.toLowerCase().includes('restraint') || key.toLowerCase().includes('period')) {
          console.log(`   Found: ${key} = ${docxData[key]}`);
        }
      });
      
      console.log('🔍 Looking for company-related keys in docxData:');
      Object.keys(docxData).forEach(key => {
        if (key.toLowerCase().includes('company')) {
          console.log(`   Found: ${key} = ${docxData[key]}`);
        }
      });
      
      console.log('🔍 Looking for signature-related keys in docxData:');
      Object.keys(docxData).forEach(key => {
        if (key.toLowerCase().includes('signature')) {
          console.log(`   Found: ${key} = ${docxData[key]}`);
        }
      });
      
      // Debug: Show what signature keys the template expects
      console.log('🔍 Template expects these signature keys:');
      console.log('   signature_personal');
      console.log('   signature_AUS_Company');
      console.log('   signature_International_Company');
    }
    
    console.log('Clean data for docxtemplater:', docxData);
    console.log('Conditional data in docxData:', {
      service_type_full: docxData['service_type_full'],
      service_type_half: docxData['service_type_half'],
      service_type_quarter: docxData['service_type_quarter']
    });
    
    try {
      // Debug: Log what docxtemplater is processing
      console.log('About to render with docxtemplater...');
      console.log('Data being passed to render:', docxData);
      
      // Test: Try a simple conditional first
      console.log('Testing simple conditional logic...');
      const testData = { test_condition: true };
      console.log('Test data:', testData);
      
      // Render the document with data (replaces deprecated setData + render)
      doc.render(docxData);
      
      console.log('Document rendered successfully');
    } catch (error) {
      // Surface detailed docxtemplater errors
      const err = error as any;
      console.error('Error rendering document:', err);
      if (err && err.properties && Array.isArray(err.properties.errors)) {
        const messages = err.properties.errors
          .map((e: any) => e.properties && (e.properties.explanation || e.properties.id) || String(e))
          .join('\n');
        throw new Error(messages || 'Template rendering failed. Check placeholder tags.');
      }
      throw err instanceof Error ? err : new Error('Template rendering failed.');
    }

    // Generate the output
    const buf = doc.getZip().generate({
      type: 'arraybuffer',
      compression: 'DEFLATE',
      compressionOptions: {
        level: 4,
      },
    });

    // Create blob and download
    const blob = new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    // Generate filename
    const originalName = file.name.replace(/\.docx?$/i, '');
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
    const baseName = outputName && outputName.trim().length > 0 ? outputName.trim().replace(/\.docx?$/i, '') : `${originalName}_filled_${timestamp}`;
    const filename = `${baseName}.docx`;

    saveAs(blob, filename);
  } catch (error) {
    console.error('Error processing DOCX:', error);
    
    if (error instanceof Error) {
      if (error.name === 'NotReadableError') {
        throw new Error('File could not be read. Please try uploading the file again or check if the file is corrupted.');
      } else if (error.name === 'NotFoundError') {
        throw new Error('Invalid DOCX file structure. The document appears to be corrupted or not a valid Word document. Please try a different file.');
      } else if (error.message.includes('Invalid DOCX')) {
        throw new Error('Invalid DOCX file. Please ensure you\'re uploading a valid Microsoft Word document (.docx).');
      } else if (error.message.includes('Failed to read file content')) {
        throw new Error('Failed to read file content. The file may be corrupted or in an unsupported format.');
      } else if (error.message.includes('Missing required files')) {
        throw new Error('Invalid DOCX file structure. The document appears to be corrupted or not a valid Word document. Please try a different file.');
      } else {
        throw error;
      }
    }
    
    throw new Error(`Failed to process document: ${String(error)}`);
  }
}

/**
 * Process a DOCX file and return the processed bytes (for bulk operations)
 */
export async function processDocxToBytes(
  file: File, 
  data: Record<string, any>, 
  conditionalOptions: ConditionalGroup[] = [], 
  placeholders: PlaceholderField[] = []
): Promise<Uint8Array> {
  try {
    // Validate file
    if (!file) {
      throw new Error('No file provided');
    }
    
    if (file.type !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      throw new Error('File must be a valid DOCX file');
    }
    
    if (file.size === 0) {
      throw new Error('File is empty');
    }
    
    // Check file size limit (50MB)
    const maxSize = 50 * 1024 * 1024; // 50MB in bytes
    if (file.size > maxSize) {
      throw new Error(`File is too large (${Math.round(file.size / 1024 / 1024)}MB). Maximum file size is 50MB.`);
    }
    
    console.log(`Processing DOCX file to bytes: ${file.name}, size: ${file.size} bytes`);
    
    // Read the file
    let arrayBuffer: ArrayBuffer;
    try {
      const readPromise = file.arrayBuffer();
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('File read timeout')), 10000)
      );
      arrayBuffer = await Promise.race([readPromise, timeoutPromise]);
    } catch (error) {
      console.error('Error reading file:', error);
      throw new Error(`Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    console.log('Successfully read file:', arrayBuffer.byteLength, 'bytes');
    
    // Process with PizZip
    const zip = new PizZip(arrayBuffer);
    console.log('Created PizZip instance');
    
    // Fix malformed closing tags in the XML content (same as processDocx)
    const docXml = zip.file('word/document.xml');
    if (docXml) {
      let xmlContent = docXml.asText();
      
      // Fix malformed closing tags - normalize spaces and underscores
      // Look for patterns like {{/restraints_country }} (with extra space) and fix them
      const closingTagFixRegex = /\{\{\/([^}]+?)\s+\}\}/g;
      xmlContent = xmlContent.replace(closingTagFixRegex, (match, tagName) => {
        const cleanTagName = tagName.trim();
        console.log(`Fixing malformed closing tag: "${match}" -> "{{/${cleanTagName}}}"`);
        return `{{/${cleanTagName}}}`;
      });
      
      // Fix mismatched opening/closing tags where one has spaces and the other has underscores
      // Look for opening tags with spaces and matching closing tags with underscores
      const openingTagRegex = /\{\{#([^}]+?)\}\}/g;
      const openingMatches = [...xmlContent.matchAll(openingTagRegex)];
      
      for (const match of openingMatches) {
        const fullMatch = match[0];
        const tagName = match[1];
        
        // If opening tag has spaces, find corresponding closing tag and fix it
        if (tagName.includes(' ')) {
          const normalizedTagName = tagName.replace(/\s+/g, '_');
          const closingPattern = new RegExp(`\\{\\{/${tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}`, 'g');
          const replacement = `{{/${normalizedTagName}}}`;
          
          if (xmlContent.includes(fullMatch)) {
            console.log(`Fixing mismatched tags: "${tagName}" -> "${normalizedTagName}"`);
            xmlContent = xmlContent.replace(closingPattern, replacement);
          }
        }
      }
      
      // Update the zip with the fixed XML content
      zip.file('word/document.xml', xmlContent);
    }
    
    // Build the data object for docxtemplater
    const formattedData = buildDocxData(placeholders, data);
    
    // Create docxtemplater with the processed zip
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: () => '',
      delimiters: { start: '{{', end: '}}' },
    });

    // Create a clean data object for docxtemplater using formatted data
    const docxData: Record<string, any> = {};
    
    // Add all the form data with original keys, using formatted data
    Object.keys(formattedData).forEach(key => {
      if (!key.startsWith('#if') && !key.startsWith('/if')) {
        docxData[key] = formattedData[key];
      }
    });
    
    // Add the conditional data
    if (conditionalOptions.length > 0) {
      // Extract selections from form data
      const selections: Record<string, string> = {};
      conditionalOptions.forEach(group => {
        const selectionKey = `conditional-${group.groupName}`;
        if (formattedData[selectionKey]) {
          selections[group.groupName] = formattedData[selectionKey];
        }
      });
      
      console.log('Conditional options selections:', selections);
      
      // Process each conditional group
      conditionalOptions.forEach(group => {
        const selectedOption = selections[group.groupName];
        console.log(`Processing group: ${group.groupName}, selected: ${selectedOption}`);
        
        if (selectedOption) {
          // Generate the correct key format based on the group name
          let conditionKey: string;
          if (group.groupName === 'Service Type') {
            conditionKey = `service_type_${selectedOption.toLowerCase()}`;
          } else {
            conditionKey = `${group.groupName.toLowerCase().replace(/\s+/g, '_')}_${selectedOption.toLowerCase()}`;
          }
          
          docxData[conditionKey] = true;
          console.log(`Set condition key: ${conditionKey} = true`);
        }
      });
    }
    
    console.log('Clean data for docxtemplater:', docxData);
    
    try {
      // Render the document with data
      doc.render(docxData);
      console.log('Document rendered successfully');
    } catch (error) {
      // Surface detailed docxtemplater errors
      const err = error as any;
      console.error('Error rendering document:', err);
      if (err && err.properties && Array.isArray(err.properties.errors)) {
        const messages = err.properties.errors
          .map((e: any) => e.properties && (e.properties.explanation || e.properties.id) || String(e))
          .join('\n');
        throw new Error(messages || 'Template rendering failed. Check placeholder tags.');
      }
      throw err instanceof Error ? err : new Error('Template rendering failed.');
    }

    // Generate the output bytes
    const buf = doc.getZip().generate({
      type: 'arraybuffer',
      compression: 'DEFLATE',
      compressionOptions: {
        level: 4,
      },
    });

    console.log('Generated DOCX bytes:', buf.byteLength);
    return new Uint8Array(buf);
    
  } catch (error) {
    console.error('Error processing DOCX to bytes:', error);
    throw new Error(`Failed to process DOCX: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Build data object for docxtemplater from our placeholders and typed form data.
 * This maps the original tag content (e.g., "amount:number") to the provided value.
 */
export function buildDocxData(
  placeholders: PlaceholderField[],
  formData: FormData,
  emptyMode: 'emdash' | 'empty' = 'emdash'
): Record<string, any> {
  const result: Record<string, any> = {};
  
  console.log('buildDocxData called with:', { placeholders: placeholders.length, formData: Object.keys(formData) });
  console.log('Form data contents:', formData);

  const getEmptyValue = () => (emptyMode === 'empty' ? '' : '—');

  for (const ph of placeholders) {
    // Extract raw tag name between the braces, including any type/default/optional suffixes
    const rawTag = ph.originalPlaceholder.slice(2, -2).trim();
    
    console.log(`Processing placeholder: ${ph.key} (${ph.type}, isMultiple: ${ph.isMultiple})`);

    // Try to find the ORIGINAL unformatted value from formData
    // Use ONLY the canonical key to avoid getting case-formatted values
    let value = formData[ph.key];
    
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
      case 'date':
        if (value instanceof Date) {
          // Use ISO date or locale string as a safe default
          value = value.toLocaleDateString();
        }
        break;
      case 'number':
        if (typeof value === 'string' && value.trim() !== '') {
          const num = Number(value);
          value = Number.isNaN(num) ? value : num;
        }
        break;
      case 'multiline':
        // Docxtemplater with linebreaks=true will handle \n
        value = String(value);
        break;
      case 'multiple':
        // Handle multiple entry fields - format with bullet points and line breaks
        if (Array.isArray(value)) {
          const nonEmptyValues = value.filter(v => v && v.trim() !== '');
          if (nonEmptyValues.length === 0) {
            value = ph.isOptional ? '' : '—'; // Fallback for empty optional/required
          } else {
            // Format as bullet points with line breaks
            // Use \u2022 for bullet point and \n for line breaks
            value = nonEmptyValues.map(item => `• ${item.trim()}`).join('\n');
          }
        } else {
          value = ph.isOptional ? '' : '—'; // Fallback if not an array
        }
        break;
      default:
        value = String(value);
    }

    // Format value to match the original placeholder case
    let formattedValue = value;
    if (typeof value === 'string' && value.length > 0) {
      // Determine the case format of the placeholder key
      const hasLetters = /[a-zA-Z]/.test(ph.originalKey);
      
      if (!hasLetters) {
        // No letters to format
        formattedValue = value;
      } else {
        const isAllCaps = ph.originalKey === ph.originalKey.toUpperCase();
        const isAllLower = ph.originalKey === ph.originalKey.toLowerCase();
        const letterCount = (ph.originalKey.match(/[a-zA-Z]/g) || []).length;
        
        console.log(`🔤 Case formatting for ${ph.originalKey}:`, {
          originalKey: ph.originalKey,
          isAllCaps: isAllCaps,
          isAllLower: isAllLower,
          letterCount: letterCount,
          value: value
        });
        
        // Apply case formatting based on placeholder format
        if (isAllCaps && letterCount > 0) {
          // All caps placeholder - make value all caps
          formattedValue = value.toUpperCase();
          console.log(`  → All caps formatting: ${value} → ${formattedValue}`);
        } else if (isAllLower && letterCount > 0) {
          // All lowercase placeholder - make value lowercase
          formattedValue = value.toLowerCase();
          console.log(`  → All lowercase formatting: ${value} → ${formattedValue}`);
        } else {
          // Mixed case or title case - keep original value
          formattedValue = value;
          console.log(`  → No case formatting applied: ${value} → ${formattedValue}`);
        }
      }
    }
    
    // Store the formatted value ONLY under keys that exactly match this placeholder
    // This prevents case-formatted values from being picked up by placeholders with different casing
    
    // 1) canonical key used by custom parser
    result[normalizeTagToKey(rawTag)] = formattedValue;
    // 2) raw tag for templates without custom parser reliance
    result[rawTag] = formattedValue;
    // 3) original placeholder (exact format) for precise matching - THIS IS THE KEY ONE
    result[ph.originalPlaceholder] = formattedValue;
    // 4) original key (without braces) for additional matching
    result[ph.originalKey] = formattedValue;
    
    console.log(`Added to result: ${ph.key} =`, value);
    console.log(`  - Canonical key: ${normalizeTagToKey(rawTag)} = ${formattedValue}`);
    console.log(`  - Raw tag: ${rawTag} = ${formattedValue}`);
    console.log(`  - Original placeholder: ${ph.originalPlaceholder} = ${formattedValue}`);
    console.log(`  - Original key: ${ph.originalKey} = ${formattedValue}`);
    console.log(`  - Formatted value: ${formattedValue}`);
  }

  // Add conditional selections from formData
  for (const [key, value] of Object.entries(formData)) {
    if (key.startsWith('conditional-')) {
      console.log(`Adding conditional selection: ${key} = ${value}`);
      result[key] = value;
    }
  }

  console.log('Final buildDocxData result:', result);
  return result;
}

/**
 * Generate a fillable PDF document with placeholders for client completion
 */
export async function generatePlaceholderForm(placeholders: PlaceholderField[], templateName: string): Promise<void> {
  const templateText = getStoredTemplateText();
  console.log('generatePlaceholderForm called with template text length:', templateText.length);
  const pdfBytes = await generatePlaceholderFormBytes(placeholders, templateName, templateText);
  
  // Save the PDF
  console.log('Saving PDF...');
  console.log('PDF bytes generated:', pdfBytes.length);
  const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
  
  // Generate filename in format: YYMMDD File Name - Form.pdf
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2); // Last 2 digits of year
  const month = (now.getMonth() + 1).toString().padStart(2, '0'); // Month (01-12)
  const day = now.getDate().toString().padStart(2, '0'); // Day (01-31)
  const datePrefix = `${year}${month}${day}`;
  
  const filename = `${datePrefix} ${templateName} - Form.pdf`;
  console.log('Downloading PDF with filename:', filename);
  saveAs(blob, filename);
  
  console.log('Fillable PDF generated and downloaded successfully');
}

export async function generatePlaceholderFormBytes(placeholders: PlaceholderField[], templateName: string, templateText?: string): Promise<Uint8Array> {
  try {
    console.log('Starting fillable PDF form generation...', { placeholders: placeholders.length, templateName });
    
        // Store the template text for comparison with filled PDFs
        if (templateText) {
          storeTemplateText(templateText);
          console.log('Template text stored for comparison:', templateText.length, 'characters');
        } else {
          console.log('No template text provided to generatePlaceholderFormBytes');
        }
    
    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    const form = pdfDoc.getForm();
    
    // Add a page
    let page = pdfDoc.addPage([612, 792]); // Standard letter size
    const { width, height } = page.getSize();
    
    // Set up layout constants - keep it simple
    const margin = 50;
    const fieldHeight = 20;
    const lineHeight = 16;
    let yPosition = height - margin;
    
    // Embed fonts once
    const helveticaFont = await pdfDoc.embedFont('Helvetica');
    const helveticaBoldFont = await pdfDoc.embedFont('Helvetica-Bold');
    
    // Helper function to add text and return the height consumed
    const addText = (text: string, x: number, y: number, size: number = 12, bold: boolean = false) => {
      page.drawText(text, {
        x,
        y,
        size,
        font: bold ? helveticaBoldFont : helveticaFont,
      });
      return size + 5; // Return text height plus small buffer
    };
    
    // Helper function to add a fillable text field and return the height consumed
    const addTextField = (name: string, x: number, y: number, width: number, height: number, defaultValue?: string) => {
      const textField = form.createTextField(name);
      textField.addToPage(page, {
        x,
        y,
        width,
        height,
        borderWidth: 1,
        borderColor: rgb(0.5, 0.5, 0.5),
        backgroundColor: rgb(1, 1, 1),
      });
      
      if (defaultValue) {
        textField.setText(defaultValue);
      }
      
      return height + 10; // Return field height plus buffer
    };
    
    // Introduction - make it a proper heading with adequate space
    const introText = "Please complete the following information.";
    addText(introText, margin, yPosition, 14, true); // Make it bold and slightly larger
    yPosition -= 30; // Spacing after intro
    
    // Filter out case variations first - only keep canonical placeholders
    console.log('All placeholders before filtering:', placeholders.map(p => `${p.key} (${p.originalKey})`));
    
    // Group placeholders by their canonical key (lowercase, normalized)
    const placeholderGroups = new Map<string, PlaceholderField[]>();
    placeholders.forEach(placeholder => {
      const canonicalKey = placeholder.key.includes('_') ? placeholder.key.split('_')[0] : placeholder.key;
      if (!placeholderGroups.has(canonicalKey)) {
        placeholderGroups.set(canonicalKey, []);
      }
      placeholderGroups.get(canonicalKey)!.push(placeholder);
    });
    
    // For each group, keep only the first placeholder (prefer the one without underscores)
    const canonicalPlaceholders: PlaceholderField[] = [];
    placeholderGroups.forEach((group, canonicalKey) => {
      // Sort to prefer placeholders without underscores
      const sortedGroup = group.sort((a, b) => {
        const aHasUnderscore = a.key.includes('_');
        const bHasUnderscore = b.key.includes('_');
        if (aHasUnderscore && !bHasUnderscore) return 1;
        if (!aHasUnderscore && bHasUnderscore) return -1;
        return 0;
      });
      canonicalPlaceholders.push(sortedGroup[0]);
    });
    
    console.log(`Filtered placeholders for PDF: ${canonicalPlaceholders.length} canonical placeholders (removed ${placeholders.length - canonicalPlaceholders.length} case variations)`);
    console.log('Canonical placeholders:', canonicalPlaceholders.map(p => `${p.key} (${p.originalKey})`));
    
    // Group placeholders
    const sortedPlaceholders = sortPlaceholdersForForm(canonicalPlaceholders);
    
    console.log(`Grouped placeholders for PDF: ${sortedPlaceholders.length} groups`);
    
    // Debug: Log all placeholders that will be processed
    const allPlaceholders = sortedPlaceholders.flatMap(group => group.placeholders);
    console.log('All placeholders being processed for PDF:', allPlaceholders.map(p => `${p.key} (${p.originalKey})`));
    
    // Check for duplicate field names
    const fieldNames = allPlaceholders.map(p => `field_${p.key.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')}`);
    const duplicateFieldNames = fieldNames.filter((name, index) => fieldNames.indexOf(name) !== index);
    if (duplicateFieldNames.length > 0) {
      console.error('Duplicate field names detected:', duplicateFieldNames);
    }
    
    // Track field names to prevent duplicates
    const usedFieldNames = new Set<string>();
    
    for (const group of sortedPlaceholders) {
      // Check if we need a new page for the group heading
      if (yPosition < 100) { // Need space for group heading
        page = pdfDoc.addPage([612, 792]);
        yPosition = height - margin;
      }
      
      // Group heading
      addText(group.title, margin, yPosition, 14, true);
      yPosition -= 20; // Spacing after group heading
      
      // Add placeholders in this group
      for (const placeholder of group.placeholders) {
        // Check if we need a new page for the field (need space for label + field + spacing)
        if (yPosition < 100) { // Need space for field
          page = pdfDoc.addPage([612, 792]);
          yPosition = height - margin;
        }
        
        const label = formatLabelForForm(placeholder.originalKey);
        const optionalText = placeholder.isOptional ? ' (Optional)' : '';
        const defaultText = placeholder.defaultValue ? ` (Default: ${placeholder.defaultValue})` : '';
        
        // Add hint for multiple entry fields or fields with (s) in the name
        const hasMultipleHint = placeholder.isMultiple || placeholder.originalKey.toLowerCase().includes('(s)');
        const multipleHint = hasMultipleHint ? ' (Please add a comma in between each item)' : '';
        
        // Field label - each placeholder gets its own title
        addText(`${label}${optionalText}${defaultText}:`, margin, yPosition, 11, true);
        
        // Add hint in regular text on the same line if it exists
        if (multipleHint) {
          // Calculate the width of the label text to position the hint right after it
          const labelText = `${label}${optionalText}${defaultText}:`;
          const labelWidth = labelText.length * 6.5; // Approximate character width
          addText(multipleHint, margin + labelWidth, yPosition, 10, false);
        }
        
        yPosition -= 5; // Spacing after label
        
        // Create fillable text field with unique name
        let fieldName = `field_${placeholder.key.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')}`;
        
        // Ensure field name is unique by adding a suffix if needed
        let counter = 1;
        const originalFieldName = fieldName;
        while (usedFieldNames.has(fieldName)) {
          fieldName = `${originalFieldName}_${counter}`;
          counter++;
        }
        
        usedFieldNames.add(fieldName);
        console.log(`Creating field: ${placeholder.key} -> ${fieldName}`);
        const fieldWidth = width - (margin * 2);
        const fieldY = yPosition - fieldHeight;
        
        addTextField(fieldName, margin, fieldY, fieldWidth, fieldHeight, placeholder.defaultValue);
        yPosition -= 45; // Spacing between text boxes
      }
      
      yPosition -= 15; // Spacing between groups
    }
    
    // Add instructions - use current page if there's space, otherwise create new page
    let instructionsPage = page;
    let instructionsYPosition = yPosition;
    
    // Check if we have enough space on current page for instructions
    if (yPosition < 150) { // Need space for title + 4 instruction lines + spacing
      instructionsPage = pdfDoc.addPage([612, 792]);
      instructionsYPosition = height - margin;
    }
    
    // Add some space before instructions
    instructionsYPosition -= 30;
    
    // Add instructions title
    instructionsPage.drawText('Instructions:', {
      x: margin,
      y: instructionsYPosition,
      size: 12,
      font: helveticaBoldFont,
    });
    instructionsYPosition -= 30;
    
    const instructions = [
      'Fill in all required fields (marked as required)',
      'For date fields, use format: Day Month Year (e.g., 1 January 2025)',
      'Save this document and return it to complete the process'
    ];
    
    instructions.forEach((instruction) => {
      instructionsPage.drawText(`• ${instruction}`, {
        x: margin,
        y: instructionsYPosition,
        size: 11,
        font: helveticaFont,
      });
      instructionsYPosition -= 20;
    });
    
    // Embed anchor tokens if enabled
    const settings = getSettings();
    if (settings.embedAnchorTokens) {
      console.log('Embedding anchor tokens...');
      try {
        const fieldInfo = extractFieldInfoFromPDF(pdfDoc as any);
        const tokenGenerator = new AnchorTokenGenerator();
        await tokenGenerator.embedAnchorTokens(pdfDoc, fieldInfo);
        console.log('Anchor tokens embedded successfully');
      } catch (error) {
        console.warn('Failed to embed anchor tokens:', error);
        // Continue without tokens rather than failing the entire export
      }
    } else {
      console.log('Anchor token embedding disabled in settings');
    }
    
    // Generate PDF bytes
    console.log('Generating PDF bytes...');
    const pdfBytes = await pdfDoc.save();
    console.log('PDF bytes generated:', pdfBytes.length);
    
    return pdfBytes;
    
  } catch (error) {
    console.error('Error generating fillable PDF form:', error);
    throw new Error(`Failed to generate fillable PDF form: ${error instanceof Error ? error.message : String(error)}`);
  }
}


/**
 * Sort placeholders into logical groups for the form
 */
function sortPlaceholdersForForm(placeholders: PlaceholderField[]): Array<{title: string, placeholders: PlaceholderField[]}> {
  const groups: {[key: string]: PlaceholderField[]} = {
    'Investor Information': [],
    'Company Information': [],
    'Contractor Information': [],
    'Payment Information': [],
    'Dates': [],
    'Stages': [],
    'Stage Costs': [],
    'Contact Information': [],
    'Other Information': []
  };

  placeholders.forEach(placeholder => {
    const key = placeholder.originalKey.toLowerCase();
    
    // Stage Costs - specifically stage costs (must be checked before general cost pattern)
    if (key.includes('stage') && (key.includes('cost') || key.includes('costs'))) {
      groups['Stage Costs'].push(placeholder);
    }
    // Investor Information - investor/purchaser/buyer related fields
    else if (/(investor|purchaser|buyer)/.test(key)) {
      groups['Investor Information'].push(placeholder);
    }
    // Company Information - company/issuer/seller related fields
    else if (/(company|issuer|seller)/.test(key)) {
      groups['Company Information'].push(placeholder);
    }
    // Contractor Information - contractor related fields
    else if (/(^contractor|contractor[_\s])/.test(key)) {
      groups['Contractor Information'].push(placeholder);
    }
    // Payment Information - costs, fees, amounts, retainer, deposit, payment terms (but not stage costs)
    else if (/(cost|fee|amount|price|value|retainer|deposit|payment|monthly|trust|billing|invoice)/.test(key)) {
      groups['Payment Information'].push(placeholder);
    }
    // Dates - any date-related fields
    else if (/(^date|date[_\s]|effective[_\s]date|expiry[_\s]date|expiration[_\s]date|due[_\s]date|issue[_\s]date)/.test(key)) {
      groups['Dates'].push(placeholder);
    }
    // Stages - stage titles and descriptions only (not costs, not matter description)
    else if (key.includes('stage') && (key.includes('title') || key.includes('description'))) {
      groups['Stages'].push(placeholder);
    }
    // Contact Information - addresses, emails, phones
    else if (/(address|email|phone|contact)/.test(key)) {
      groups['Contact Information'].push(placeholder);
    }
    // Matter Description - specific handling to avoid being caught by stage description pattern
    else if (key.includes('matter') && key.includes('description')) {
      groups['Other Information'].push(placeholder);
    }
    // Other Information - everything else
    else {
      groups['Other Information'].push(placeholder);
    }
  });

  // Return only non-empty groups
  return Object.entries(groups)
    .filter(([_, placeholders]) => placeholders.length > 0)
    .map(([title, placeholders]) => ({ title, placeholders }));
}

/**
 * Format label for form display - matches the format used in fill-in details page
 */
function formatLabelForForm(key: string): string {
  // Handle all caps words (like COMPANY NAME) by converting to title case
  if (key === key.toUpperCase() && key.includes(' ')) {
    // All caps with spaces - convert to title case
    return key.toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
  }
  
  // Handle snake_case or camelCase
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2') // Add space between camelCase
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

/**
 * Parse completed form data from a PDF document
 */
export async function parseCompletedPDFForm(file: File): Promise<FormData> {
  try {
    console.log('Starting PDF form data extraction...', file.name);
    
    // Read the PDF file
    const arrayBuffer = await file.arrayBuffer();
    return await parseCompletedPDFFormFromBuffer(arrayBuffer);
  } catch (error) {
    console.error('Error parsing PDF form:', error);
    throw error;
  }
}

export async function parseCompletedPDFFormFromBuffer(arrayBuffer: ArrayBuffer): Promise<FormData> {
  try {
    console.log("Starting PDF form data extraction from buffer...");
    
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    const form = pdfDoc.getForm();
    
    const result: FormData = {};
    let formFieldsFound = 0;
    
    // First, try to extract from form fields (preferred method)
    try {
      const fields = form.getFields();
      console.log(`Found ${fields.length} form fields in PDF`);
      if (fields.length === 0) {
        console.log("No form fields found - will use text extraction fallback");
      }
      
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
          fieldValue = selectedOptions.length > 0 ? selectedOptions[0] : "";
        } else if (field instanceof PDFRadioGroup) {
          const selectedOption = field.getSelected();
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
          formFieldsFound++;
          // Convert field name back to placeholder key
          // Field names are like "field_company_name" -> "company name"
          let placeholderKey = fieldName.replace("field_", "").replace(/_/g, " ").trim();
          
          // Special handling for service(s) field
          if (placeholderKey === "service s") {
            placeholderKey = "service(s)";
          }
          
          console.log(`PDF Field: ${fieldName} -> Key: ${placeholderKey} -> Value: ${fieldValue} (Type: ${field.constructor.name})`);
          
          // Check if this is a multiple entry field (contains (s) in the original key)
          const isMultipleField = placeholderKey.toLowerCase().includes("(s)") || 
                                 placeholderKey.toLowerCase().includes("service(s)") ||
                                 placeholderKey.toLowerCase().includes("services");
          
          if (isMultipleField && typeof fieldValue === "string") {
            // Split by comma and trim each item
            const items = fieldValue.split(",").map(item => item.trim()).filter(item => item.length > 0);
            result[placeholderKey] = items;
            console.log(`PDF Multiple Field: ${fieldName} -> Key: ${placeholderKey} -> Values: [${items.join(", ")}]`);
          } else {
            // Convert boolean values to appropriate strings
            if (typeof fieldValue === "boolean") {
              result[placeholderKey] = fieldValue ? "Yes" : "No";
            } else {
              result[placeholderKey] = String(fieldValue).trim();
            }
            console.log(`PDF Field: ${fieldName} -> Key: ${placeholderKey} -> Value: ${result[placeholderKey]}`);
          }
        }
      });
    } catch (formError) {
      console.warn("Error accessing PDF form fields:", formError);
    }
    
    // If no form fields were found, try anchor token extraction as fallback
    if (formFieldsFound === 0) {
      console.log("No form fields found, attempting anchor token extraction fallback...");
      try {
        const templateText = getStoredTemplateText();
        const anchorTokenImporter = createAnchorTokenImporter();
        const anchorTokenResult = await anchorTokenImporter.importFromPDF(arrayBuffer, templateText);
        Object.assign(result, anchorTokenResult);
        console.log("Anchor token extraction fallback completed, found:", Object.keys(anchorTokenResult).length, "fields");
      } catch (anchorError) {
        console.warn("Anchor token extraction failed, trying text extraction fallback:", anchorError);
        
        // Final fallback to text extraction
        try {
          const textExtractionResult = await extractDataFromPDFText(arrayBuffer);
          Object.assign(result, textExtractionResult);
          console.log("Text extraction fallback completed, found:", Object.keys(textExtractionResult).length, "fields");
        } catch (textError) {
          console.warn("Text extraction fallback failed:", textError);
        }
      }
    }
    
    console.log("PDF form data extracted:", result);
    return result;
    
  } catch (error) {
    console.error("Error parsing PDF form:", error);
    throw new Error(`Failed to parse PDF form: ${error instanceof Error ? error.message : String(error)}`);
  }
}


/**
 * Parse completed placeholder form from Word document
 */
export async function parseCompletedForm(file: File): Promise<FormData> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const zip = new PizZip(arrayBuffer);
    
    // Try to extract text content from the document
    const textContent = await extractTextFromDocxBuffer(zip);
    
    // Parse the extracted text to find placeholder values
    const formData = parseFormDataFromText(textContent);
    
    return formData;
  } catch (error) {
    console.error('Error parsing completed form:', error);
    throw new Error('Failed to parse completed form. Please ensure the document is a valid Word document with completed placeholders.');
  }
}

/**
 * Extract text from DOCX buffer
 */
async function extractTextFromDocxBuffer(zip: PizZip): Promise<string> {
  // Get the main document part
  const docXml = zip.file('word/document.xml');
  if (!docXml) {
    throw new Error('Invalid DOCX file structure');
  }
  
  let xmlContent = docXml.asText();
  
  // Fix malformed closing tags - normalize spaces and underscores
  // Look for patterns like {{/restraints_country }} (with extra space) and fix them
  const closingTagRegex = /\{\{\/([^}]+?)\s+\}\}/g;
  xmlContent = xmlContent.replace(closingTagRegex, (match, tagName) => {
    const cleanTagName = tagName.trim();
    console.log(`Fixing malformed closing tag: "${match}" -> "{{/${cleanTagName}}}"`);
    return `{{/${cleanTagName}}}`;
  });
  
  // Fix mismatched opening/closing tags where one has spaces and the other has underscores
  // Look for opening tags with spaces and matching closing tags with underscores
  const openingTagRegex = /\{\{#([^}]+?)\}\}/g;
  const openingMatches = [...xmlContent.matchAll(openingTagRegex)];
  
  for (const match of openingMatches) {
    const fullMatch = match[0];
    const tagName = match[1];
    
    // If opening tag has spaces, find corresponding closing tag and fix it
    if (tagName.includes(' ')) {
      const normalizedTagName = tagName.replace(/\s+/g, '_');
      const closingPattern = new RegExp(`\\{\\{/${tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}`, 'g');
      const replacement = `{{/${normalizedTagName}}}`;
      
      if (xmlContent.includes(fullMatch)) {
        console.log(`Fixing mismatched tags: "${tagName}" -> "${normalizedTagName}"`);
        xmlContent = xmlContent.replace(closingPattern, replacement);
      }
    }
  }
  
  // Extract text content from XML
  const textContent = xmlContent
    .replace(/<[^>]*>/g, '') // Remove XML tags
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  
  return textContent;
}

/**
 * Parse form data from extracted text
 * This is a simplified parser - in production you'd want more sophisticated parsing
 */
function parseFormDataFromText(text: string): FormData {
  const formData: FormData = {};
  
  // This is a basic implementation that looks for patterns in the text
  // In production, you'd want to use a more sophisticated approach
  
  // Look for common patterns like "Field Name: Value" or "Field Name = Value"
  const patterns = [
    /([A-Za-z\s]+):\s*([^\n\r]+)/g,
    /([A-Za-z\s]+)=\s*([^\n\r]+)/g,
    /([A-Za-z\s]+)\s*-\s*([^\n\r]+)/g
  ];
  
  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const fieldName = match[1].trim().toLowerCase().replace(/\s+/g, '_');
      const value = match[2].trim();
      
      if (value && value.length > 0 && !value.includes('[INPUT FIELD]') && !value.includes('[TEXT AREA]')) {
        formData[fieldName] = value;
      }
    }
  });
  
  return formData;
}

/**
 * Extract text content from DOCX for placeholder detection
 */
export async function extractTextFromDocx(file: File): Promise<string> {
  try {
    // Validate file
    if (!file) {
      throw new Error('No file provided');
    }
    
    if (file.type !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      throw new Error('File must be a valid DOCX file');
    }
    
    if (file.size === 0) {
      throw new Error('File is empty');
    }
    
    console.log(`Reading DOCX file: ${file.name}, size: ${file.size} bytes`);
    
    // Try multiple approaches to read the file
    let arrayBuffer: ArrayBuffer;
    try {
      arrayBuffer = await file.arrayBuffer();
    } catch (readError) {
      console.error('Failed to read file with arrayBuffer(), trying alternative method:', readError);
      
      // Alternative approach: read as text and convert
      try {
        const text = await file.text();
        const encoder = new TextEncoder();
        arrayBuffer = encoder.encode(text).buffer;
      } catch (textError) {
        console.error('Failed to read file as text:', textError);
        throw new Error('File could not be read using any method. The file may be corrupted or in an unsupported format.');
      }
    }
    
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      throw new Error('Failed to read file content - file appears to be empty or corrupted');
    }
    
    console.log(`Successfully read file: ${arrayBuffer.byteLength} bytes`);
    
    const zip = new PizZip(arrayBuffer);
    
    // Check if it's a valid ZIP file
    if (Object.keys(zip.files).length === 0) {
      throw new Error('Invalid DOCX file - not a valid ZIP archive');
    }
    
    // Check for essential DOCX structure
    const requiredFiles = [
      'word/document.xml',
      '[Content_Types].xml',
      '_rels/.rels'
    ];
    
    const missingFiles = requiredFiles.filter(file => !zip.file(file));
    if (missingFiles.length > 0) {
      console.error('Missing required DOCX files:', missingFiles);
      throw new Error(`Invalid DOCX file structure. Missing required files: ${missingFiles.join(', ')}`);
    }
    
    // Get the main document part
    const docXml = zip.file('word/document.xml');
    if (!docXml) {
      throw new Error('Invalid DOCX file structure - missing document.xml');
    }
    
    const xmlContent = docXml.asText();
    
    if (!xmlContent) {
      throw new Error('Failed to extract XML content from document');
    }
    
    // Store the template text for comparison with filled PDFs
    storeTemplateText(xmlContent);
    
    // Extract text content from XML with proper placeholder handling
    // First, extract all text nodes while preserving placeholder structure
    let textContent = xmlContent;
    
    // Handle placeholders that might be split across XML elements
    // Look for patterns like <w:t>{{Company</w:t><w:t> Name}}</w:t>
    // and merge them into <w:t>{{Company Name}}</w:t>
    
    // First pass: merge split placeholders that start with {{ and end with }}
    let placeholderMergeRegex = /<w:t[^>]*>([^<]*\{\{[^}]*?)<\/w:t>\s*<w:t[^>]*>([^}]*\}\}[^<]*)<\/w:t>/g;
    textContent = textContent.replace(placeholderMergeRegex, (match, part1, part2) => {
      const merged = part1 + part2;
      console.log(`Merged split placeholder: "${part1}" + "${part2}" = "${merged}"`);
      return `<w:t>${merged}</w:t>`;
    });
    
    // Second pass: handle cases where placeholders might be split into more than 2 parts
    // Look for consecutive <w:t> elements that together form a complete placeholder
    const consecutiveTextRegex = /<w:t[^>]*>([^<]*)<\/w:t>(\s*<w:t[^>]*>([^<]*)<\/w:t>)+/g;
    textContent = textContent.replace(consecutiveTextRegex, (match) => {
      // Extract all text content from consecutive <w:t> elements
      const textMatches = match.match(/<w:t[^>]*>([^<]*)<\/w:t>/g);
      if (textMatches) {
        const allText = textMatches.map(t => t.replace(/<w:t[^>]*>([^<]*)<\/w:t>/, '$1')).join('');
        // Check if this forms a complete placeholder
        if (allText.includes('{{') && allText.includes('}}')) {
          console.log(`Merged multi-part placeholder: "${allText}"`);
          return `<w:t>${allText}</w:t>`;
        }
      }
      return match; // Return original if not a placeholder
    });
    
    // Now extract text content
    textContent = textContent
      .replace(/<[^>]*>/g, '') // Remove XML tags
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
    
    console.log(`Successfully extracted ${textContent.length} characters from DOCX`);
    console.log('🔍 DOCX content sample (first 500 chars):', textContent.substring(0, 500));
    console.log('🔍 DOCX content sample (last 500 chars):', textContent.substring(Math.max(0, textContent.length - 500)));
    
    // Check for Company Name specifically
    if (textContent.includes('{{Company Name}}')) {
      console.log('✅ Found {{Company Name}} in DOCX content');
    } else {
      console.log('❌ Did not find {{Company Name}} in DOCX content');
      // Check for variations
      if (textContent.includes('Company Name')) {
        console.log('🔍 Found "Company Name" without braces in DOCX content');
      }
      if (textContent.includes('{{')) {
        console.log('🔍 Found some placeholders in DOCX content');
        const placeholderMatches = textContent.match(/\{\{[^}]+\}\}/g);
        console.log('🔍 All placeholders found:', placeholderMatches);
      }
    }
    
    return textContent;
  } catch (error) {
    console.error('Error extracting text from DOCX:', error);
    
    if (error instanceof Error) {
      if (error.name === 'NotReadableError') {
        throw new Error('File could not be read. Please try uploading the file again or check if the file is corrupted.');
      } else if (error.name === 'NotFoundError') {
        throw new Error('Invalid DOCX file structure. The document appears to be corrupted or not a valid Word document. Please try a different file.');
      } else if (error.message.includes('Invalid DOCX')) {
        throw new Error('Invalid DOCX file. Please ensure you\'re uploading a valid Microsoft Word document (.docx).');
      } else {
        throw new Error(`Failed to read document: ${error.message}`);
      }
    }
    
    throw new Error('Failed to read document content. Please ensure it\'s a valid DOCX file.');
  }
}
