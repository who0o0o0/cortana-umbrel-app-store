import { PlaceholderField, ConditionalGroup } from '../types.js';

function canonicalizeKey(key: string): string {
  return key.trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeOriginalKey(key: string): string {
  // Keep the original case formatting from the placeholder
  return key.trim().replace(/\s+/g, ' ');
}

function isBetterCaseFormatting(newKey: string, existingKey: string): boolean {
  // Prefer Title Case over ALL CAPS
  const isNewTitleCase = /^[A-Z][a-z]+(\s+[A-Z][a-z]+)*$/.test(newKey);
  const isExistingTitleCase = /^[A-Z][a-z]+(\s+[A-Z][a-z]+)*$/.test(existingKey);
  const isNewAllCaps = /^[A-Z\s]+$/.test(newKey);
  const isExistingAllCaps = /^[A-Z\s]+$/.test(existingKey);
  
  // If new is Title Case and existing is ALL CAPS, prefer new
  if (isNewTitleCase && isExistingAllCaps) {
    return true;
  }
  
  // If new is Title Case and existing is not, prefer new
  if (isNewTitleCase && !isExistingTitleCase) {
    return true;
  }
  
  // If both are the same type, prefer the one that's not ALL CAPS
  if (isNewAllCaps && isExistingAllCaps) {
    return false; // Keep existing if both are ALL CAPS
  }
  
  if (isNewTitleCase && isExistingTitleCase) {
    return false; // Keep existing if both are Title Case
  }
  
  // Default: keep existing
  return false;
}

/**
 * Parse placeholder syntax and extract field information
 * Supports: {{key}}, {{key:type}}, {{key|default}}, {{key?optional}}, {{key:type|default}}, {{key:type?optional}}
 */
export function parsePlaceholder(placeholder: string): PlaceholderField | null {
  // Remove the {{ }} wrapper
  const content = placeholder.slice(2, -2).trim();
  
  if (!content) return null;

  let key = content;
  let originalKey = content; // This will be the clean key for display
  let type: 'text' | 'number' | 'date' | 'multiline' | 'multiple' = 'text';
  let defaultValue: string | undefined;
  let isOptional = false;
  let isMultiple = false;

  // Check for multiple entries pattern (s)
  if (/\(s\)/i.test(content)) {
    isMultiple = true;
    type = 'multiple';
  }

  // Check for optional flag
  if (/\?optional\s*$/i.test(content)) {
    isOptional = true;
    key = content.replace(/\?optional\s*$/i, '').trim();
  }

  // Check for type hint
  const typeMatch = key.match(/^([\s\S]+):(text|number|date|multiline|multiple)$/i);
  if (typeMatch) {
    key = typeMatch[1].trim();
    type = (typeMatch[2].toLowerCase() as 'text' | 'number' | 'date' | 'multiline' | 'multiple');
  }

  // Check for default value
  const defaultMatch = key.match(/^([\s\S]+)\|([\s\S]+)$/);
  if (defaultMatch) {
    key = defaultMatch[1].trim();
    defaultValue = defaultMatch[2].trim();
  }

  // Validate key
  if (!key) {
    return null;
  }

  // Set originalKey to the clean key (without type hints, defaults, etc.)
  originalKey = key;

  return {
    key: canonicalizeKey(key),
    originalKey: normalizeOriginalKey(key),
    type,
    defaultValue,
    isOptional,
    originalPlaceholder: placeholder,
    isMultiple
  };
}

/**
 * Extract all placeholders from document content
 */
export function extractPlaceholders(content: string): PlaceholderField[] {
  const placeholderRegex = /\{\{[^}]+\}\}/g;
  const matches = content.match(placeholderRegex) || [];
  
  // Process all placeholders and create mappings for different case variations
  const fields: PlaceholderField[] = [];
  const seenCanonicalKeys = new Set<string>();
  const caseVariations = new Map<string, PlaceholderField[]>();
  
  console.log('🔍 Found placeholders in document:', matches);
  console.log('🔍 Total placeholders found:', matches.length);
  console.log('🔍 Document content sample (first 500 chars):', content.substring(0, 500));
  console.log('🔍 Document content sample (last 500 chars):', content.substring(Math.max(0, content.length - 500)));
  
  // Show all placeholders in a more readable format
  if (matches.length > 0) {
    console.log('📋 All placeholders found:');
    matches.forEach((match, index) => {
      console.log(`  ${index + 1}. ${match}`);
    });
  } else {
    console.log('❌ No placeholders found in this document');
  }
  
  // Special debugging for Stage 1 Costs
  const stage1CostsMatches = matches.filter(match => match.toLowerCase().includes('stage 1 costs'));
  if (stage1CostsMatches.length > 0) {
    console.log('🔍 STAGE 1 COSTS FOUND IN DOCUMENT:', stage1CostsMatches);
  } else {
    console.log('❌ STAGE 1 COSTS NOT FOUND IN DOCUMENT');
  }
  
  // Special debugging for Company Name (case-insensitive)
  const companyNameMatches = matches.filter(match => match.toLowerCase().includes('company name'));
  if (companyNameMatches.length > 0) {
    console.log('🔍 COMPANY NAME FOUND IN DOCUMENT:', companyNameMatches);
  } else {
    console.log('❌ COMPANY NAME NOT FOUND IN DOCUMENT');
    // Let's also check for variations
    const companyMatches = matches.filter(match => match.toLowerCase().includes('company'));
    console.log('🔍 Any COMPANY matches:', companyMatches);
  }
  
  // Check for case variations of Company Name
  const companyNameVariations = matches.filter(match => {
    const lower = match.toLowerCase();
    return lower.includes('company name') || lower.includes('companyname');
  });
  if (companyNameVariations.length > 0) {
    console.log('🔍 COMPANY NAME VARIATIONS FOUND:', companyNameVariations);
  }
  
  // First, extract conditional options to understand the structure
  const conditionalOptions = extractConditionalOptions(content);
  const conditionalGroups = new Map<string, string[]>();
  conditionalOptions.forEach(group => {
    conditionalGroups.set(group.groupName, group.options);
  });
  
  console.log('🔍 Conditional groups for dependency analysis:', Array.from(conditionalGroups.entries()));
  
  // Debug: Find all conditional block patterns in the content
  const conditionalBlockRegex = /\{\{#([^}]+)\}\}/g;
  const conditionalBlocks = content.match(conditionalBlockRegex) || [];
  console.log('🔍 Found conditional blocks in content:', conditionalBlocks);
  
  for (const placeholder of matches) {
    // Skip conditional tags
    const innerContent = placeholder.slice(2, -2).trim();
    if (innerContent.startsWith('#if') || 
        innerContent.startsWith('/if') || 
        innerContent.startsWith('#') ||  // Skip all conditional options like {{#restraints_country}}
        innerContent.startsWith('/') ||  // Skip closing tags like {{/restraints_country}}
        innerContent.startsWith('service_type_') ||
        innerContent.startsWith('#service_type_') ||
        innerContent.startsWith('/service_type_') ||
        innerContent.startsWith('restraint_period_') ||
        innerContent.startsWith('#restraint_period_') ||
        innerContent.startsWith('/restraint_period_') ||
        innerContent.startsWith('payment_terms_') ||
        innerContent.startsWith('#payment_terms_') ||
        innerContent.startsWith('/payment_terms_') ||
        innerContent.startsWith('contract_type_') ||
        innerContent.startsWith('#contract_type_') ||
        innerContent.startsWith('/contract_type_')) {
      continue;
    }
    
    const field = parsePlaceholder(placeholder);
    if (!field) continue;
    
    // Special debugging for Stage 1 Costs
    if (placeholder.toLowerCase().includes('stage 1 costs')) {
      console.log('🔍 STAGE 1 COSTS PARSING DEBUG:', {
        placeholder,
        parsedField: field,
        originalKey: field?.originalKey,
        canonicalKey: field?.key
      });
    }
    
    // Check if this placeholder is conditional by analyzing its context
    const conditionalDependencies = findConditionalDependencies(placeholder, content, conditionalGroups);
    if (conditionalDependencies.length > 0) {
      field.conditionalDependencies = conditionalDependencies;
      console.log(`🔗 ${placeholder} has conditional dependencies:`, conditionalDependencies);
    } else {
      console.log(`📝 ${placeholder} has no conditional dependencies - will always show`);
    }
    
    // Group placeholders by canonical key to handle case variations
    const canonicalKey = field.key;
    
    if (!caseVariations.has(canonicalKey)) {
      caseVariations.set(canonicalKey, []);
    }
    
    // Check if this exact placeholder already exists
    const existingVariation = caseVariations.get(canonicalKey)!.find(f => f.originalPlaceholder === field.originalPlaceholder);
    
    if (!existingVariation) {
      caseVariations.get(canonicalKey)!.push(field);
      console.log(`✅ Added placeholder: ${field.originalPlaceholder} -> key: ${field.key}`);
    } else {
      console.log(`⚠️ Skipped exact duplicate placeholder: ${field.originalPlaceholder} -> key: ${field.key} (already seen)`);
    }
  }

  // Flatten all case variations into the final fields array
  const allFields: PlaceholderField[] = [];
  for (const variations of caseVariations.values()) {
    allFields.push(...variations);
  }
  
  console.log(`📊 Final placeholder summary: ${allFields.length} total placeholders from ${caseVariations.size} canonical groups`);
  caseVariations.forEach((variations, canonicalKey) => {
    console.log(`  - ${canonicalKey}: ${variations.length} variations (${variations.map(v => v.originalPlaceholder).join(', ')})`);
  });
  
  return allFields.sort((a, b) => a.originalKey.localeCompare(b.originalKey));
}

/**
 * Replace placeholders in content with actual values
 */
export function replacePlaceholders(content: string, formData: Record<string, any>): string {
  let result = content;
  
  // Replace all placeholders with their values
  const placeholderRegex = /\{\{[^}]+\}\}/g;
  result = result.replace(placeholderRegex, (placeholder) => {
    const field = parsePlaceholder(placeholder);
    if (!field) return placeholder;
    
    // For case variations, always use the canonical key
    let value;
    if (field.key.includes('_')) {
      // This is a case variation, use the canonical key
      const canonicalKey = field.key.split('_')[0];
      value = formData[canonicalKey];
    } else {
      // This is the canonical key
      value = formData[field.key];
    }
    
    if (value === undefined || value === null || value === '') {
      return field.isOptional ? '' : '—'; // em-dash for empty required fields
    }
    
    // Format value based on type
    switch (field.type) {
      case 'date':
        if (value instanceof Date) {
          return value.toLocaleDateString();
        }
        return String(value);
      case 'number':
        return String(value);
      case 'multiline':
        return String(value).replace(/\n/g, '\n');
      case 'multiple':
        if (Array.isArray(value)) {
          // Filter out empty values
          const nonEmptyValues = value.filter(v => v && v.trim() !== '');
          if (nonEmptyValues.length === 0) {
            return field.isOptional ? '' : '—';
          }
          // Format as bullet points
          return nonEmptyValues.map(v => `• ${v}`).join('\n');
        }
        return String(value);
      default:
        return String(value);
    }
  });
  
  return result;
}

/**
 * Extract conditional options from document content
 * Looks for [OPTION: Name] ... [/OPTION] patterns
 */
export function extractConditionalOptions(content: string): ConditionalGroup[] {
  // Support both formats: {{#if service_type_full}}...{{/if}} and {{#variable}}...{{/variable}}
  const optionRegex = /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;
  const optionsMap = new Map<string, Set<string>>();
  
  let match;
  while ((match = optionRegex.exec(content)) !== null) {
    const conditionName = match[1].trim();
    
    // Process any conditional variables with generic logic
    if (conditionName.includes('_')) {
      const parts = conditionName.split('_');
      
      // Group name: first word + "Options" (e.g., "service_full_package" -> "Service Options")
      const firstWord = parts[0];
      const groupName = firstWord.charAt(0).toUpperCase() + firstWord.slice(1) + ' Options';
      
      // Option name: everything after the first underscore, formatted nicely
      // (e.g., "service_full_package" -> "Full Package")
      let optionName = parts.slice(1).join('_')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());
      
      // Special handling for period options - add time unit to display name
      if (firstWord === 'period' && parts.length >= 2) {
        const number = parts[1];
        if (number === '1') {
          optionName = '1 year';
        } else if (number === '2') {
          optionName = '2 years';
        } else {
          optionName = `${number} months`;
        }
      }
      
      if (!optionsMap.has(groupName)) {
        optionsMap.set(groupName, new Set());
      }
      optionsMap.get(groupName)!.add(optionName);
    }
  }
  
  const result = Array.from(optionsMap.entries()).map(([groupName, options]) => ({
    groupName,
    options: Array.from(options),
    dependentFields: [] // TODO: Implement dependent fields detection
  }));
  
  console.log('🔍 Detected conditional options:', result);
  return result;
}

/**
 * Process document by removing unselected options
 */
export function processConditionalOptions(content: string, selections: Record<string, string>): string {
  // This function is no longer needed with the new docxtemplater approach
  // The conditional logic will be handled by docxtemplater itself
  console.log('Using docxtemplater conditional logic - no preprocessing needed');
  return content;
}

/**
 * Find conditional dependencies for a placeholder by analyzing its context in the document
 */
function findConditionalDependencies(
  placeholder: string, 
  content: string, 
  conditionalGroups: Map<string, string[]>
): string[] {
  const dependencies: string[] = [];
  
  // Find the position of the placeholder in the content
  const placeholderIndex = content.indexOf(placeholder);
  if (placeholderIndex === -1) return dependencies;
  
  console.log(`🔍 Checking if ${placeholder} is between conditional blocks...`);
  
  // Look for all conditional blocks in the content
  const conditionalBlockRegex = /\{\{#([^}]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;
  let match;
  
  while ((match = conditionalBlockRegex.exec(content)) !== null) {
    const conditionName = match[1];
    const startIndex = match.index;
    const endIndex = match.index + match[0].length;
    
    // Check if this placeholder is inside this conditional block
    if (placeholderIndex > startIndex && placeholderIndex < endIndex) {
      console.log(`  ✅ ${placeholder} is inside conditional block {{#${conditionName}}}...{{/${conditionName}}}`);
      
      // Map the condition name to a conditional group and specific option
      for (const [groupName, options] of conditionalGroups) {
        const groupPrefix = groupName.replace(' Options', '').toLowerCase();
        
        // Check if this condition name matches the group
        if (conditionName.toLowerCase().includes(groupPrefix.toLowerCase())) {
          console.log(`  🔗 Mapped to group: ${groupName}`);
          
          // Find the specific option that matches this condition
          const matchingOption = options.find(option => {
            const optionKey = option.toLowerCase().replace(/\s+/g, '_');
            return conditionName.toLowerCase().includes(optionKey) || 
                   conditionName.toLowerCase().includes(option.toLowerCase());
          });
          
          if (matchingOption) {
            console.log(`  🎯 Specific option required: ${matchingOption}`);
            // Store both group and specific option requirement
            const dependencyKey = `${groupName}:${matchingOption}`;
            if (!dependencies.includes(dependencyKey)) {
              dependencies.push(dependencyKey);
            }
          } else {
            // Fallback to just group if no specific option found
            if (!dependencies.includes(groupName)) {
              dependencies.push(groupName);
            }
          }
        }
      }
    }
  }
  
  if (dependencies.length === 0) {
    console.log(`  📝 ${placeholder} is NOT between any conditional blocks - will always show`);
  }
  
  return dependencies;
}
