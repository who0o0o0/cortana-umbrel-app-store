import { TextSpan } from '../types.js';

const DEBUG_IMPORT = true;

// Field synonyms for matching
const FIELD_SYNONYMS: Record<string, string[]> = {
  'Investor Name': ['Investor Name', 'Purchaser Name', 'Subscriber Name', 'INVESTOR NAME'],
  'Company Name': ['Company Name', 'Issuer', 'COMPANY NAME', 'Company'],
  'Purchase Amount': ['Purchase Amount', 'Investment Amount', 'Consideration', 'Amount'],
  'Date of Safe': ['Date of Safe', 'Date', 'Effective Date', 'Safe Date'],
  'Company State of Incorporation': ['Company State of Incorporation', 'State of Incorporation', 'Jurisdiction of Incorporation', 'State'],
  'Governing Law Jurisdiction': ['Governing Law Jurisdiction', 'Governing Law', 'Governing Law State', 'Jurisdiction'],
  'Company Authorized Representative Name': ['Company Authorized Representative Name', 'Authorized Signatory Name', 'Representative Name'],
  'Company Authorized Representative Title': ['Company Authorized Representative Title', 'Authorized Signatory Title', 'Representative Title']
};

export interface MappingResult {
  data: Record<string, string>;
  perFieldConfidence: Record<string, number>;
  confidentCount: number;
  source: 'text' | 'ocr' | 'zonal';
}

/**
 * Check if a span contains an anchor token
 */
function isAnchorToken(span: TextSpan): boolean {
  const text = span.text.trim();
  return /^\{\{.*\}\}$/.test(text);
}

/**
 * Check if text looks like a label (not a value)
 */
function looksLikeLabel(text: string, templatePlaceholders: any[] = []): boolean {
  const normalized = normalizeText(text);
  
  // If we have template placeholders, use them to determine if text looks like a label
  if (templatePlaceholders.length > 0) {
    const placeholderKeys = templatePlaceholders.map(p => normalizeText(p.key));
    const originalKeys = templatePlaceholders.map(p => normalizeText(p.originalKey));
    const allKeys = [...placeholderKeys, ...originalKeys];
    
    // Check if the text matches any placeholder key (indicating it's a label)
    return allKeys.some(key => 
      normalized.includes(key) || 
      key.includes(normalized) ||
      calculateJaroWinklerSimilarity(normalized, key) > 0.7
    );
  }
  
  // Fallback to generic label detection (not SAFE-specific)
  const genericLabelWords = ['name', 'date', 'amount', 'address', 'email', 'phone', 'title', 'company', 'signature', 'agreement', 'contract', 'service', 'fee', 'term', 'condition'];
  return genericLabelWords.some(word => normalized.includes(word));
}

/**
 * Check if text is a valid field value (not a token or invalid)
 */
function isValidFieldValue(text: string, fieldKey: string, templatePlaceholders: any[] = []): boolean {
  const trimmed = text.trim();
  
  // Reject empty strings
  if (!trimmed) return false;
  
  // Reject strings that are only braces, punctuation, or whitespace
  if (/^[\{\}\s\.,;:!?\-_]+$/.test(trimmed)) return false;
  
  // Reject strings that look like tokens
  if (/^\{\{.*\}\}$/.test(trimmed)) return false;
  
  // Reject strings that look like labels (using template-aware detection)
  if (looksLikeLabel(trimmed, templatePlaceholders)) return false;
  
  // Generic field type detection based on field key
  const fieldKeyLower = fieldKey.toLowerCase();
  
  // For numeric fields, allow digits, commas, periods, currency symbols
  if (fieldKeyLower.includes('amount') || fieldKeyLower.includes('price') || fieldKeyLower.includes('cost') || fieldKeyLower.includes('fee') || fieldKeyLower.includes('rate')) {
    return /^[\d\.,$€£¥\s]+$/.test(trimmed);
  }
  
  // For date fields, allow common date patterns
  if (fieldKeyLower.includes('date') || fieldKeyLower.includes('time')) {
    return /^[\d\s\-\/\.]+$/.test(trimmed) || /^[A-Za-z\s\d\-\/\.]+$/.test(trimmed);
  }
  
  // For email fields
  if (fieldKeyLower.includes('email') || fieldKeyLower.includes('e-mail')) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  }
  
  // For phone fields
  if (fieldKeyLower.includes('phone') || fieldKeyLower.includes('telephone') || fieldKeyLower.includes('mobile')) {
    return /^[\d\s\-\+\(\)\.]+$/.test(trimmed);
  }
  
  // For other fields, reject if it's only punctuation
  if (/^[^\w\s]+$/.test(trimmed)) return false;
  
  return true;
}

/**
 * Merge adjacent label spans into single label boxes
 */
function mergeLabelSpans(spans: TextSpan[], templatePlaceholders: any[] = []): TextSpan[] {
  const merged: TextSpan[] = [];
  const processed = new Set<number>();
  
  for (let i = 0; i < spans.length; i++) {
    if (processed.has(i)) continue;
    
    const span = spans[i];
    if (!looksLikeLabel(span.text, templatePlaceholders)) {
      merged.push(span);
      continue;
    }
    
    // Find adjacent spans that could be part of the same label
    const labelSpans = [span];
    processed.add(i);
    
    for (let j = i + 1; j < spans.length; j++) {
      if (processed.has(j)) continue;
      
      const nextSpan = spans[j];
      if (!looksLikeLabel(nextSpan.text, templatePlaceholders)) continue;
      
      // Check if spans are adjacent (small x-gap, strong y-overlap)
      const xGap = nextSpan.x - (span.x + span.w);
      const yOverlap = Math.min(span.y + span.h, nextSpan.y + nextSpan.h) - Math.max(span.y, nextSpan.y);
      const minHeight = Math.min(span.h, nextSpan.h);
      
      if (xGap <= 10 && yOverlap >= minHeight * 0.7) {
        labelSpans.push(nextSpan);
        processed.add(j);
      }
    }
    
    // Merge the label spans
    if (labelSpans.length > 1) {
      const mergedSpan = mergeSpans(labelSpans);
      merged.push(mergedSpan);
    } else {
      merged.push(span);
    }
  }
  
  return merged;
}

/**
 * Merge multiple spans into one
 */
function mergeSpans(spans: TextSpan[]): TextSpan {
  if (spans.length === 1) return spans[0];
  
  const sorted = spans.sort((a, b) => a.x - b.x);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  
  return {
    text: sorted.map(s => s.text).join(' '),
    x: first.x,
    y: Math.min(...sorted.map(s => s.y)),
    w: (last.x + last.w) - first.x,
    h: Math.max(...sorted.map(s => s.y + s.h)) - Math.min(...sorted.map(s => s.y)),
    page: first.page,
    conf: spans.reduce((sum, s) => sum + (s.conf || 0), 0) / spans.length
  };
}

/**
 * Map text spans to form fields using label-anchor proximity
 */
export function mapByAnchors(textSpans: TextSpan[], ocrSpans: TextSpan[] = [], templatePlaceholders: any[] = []): MappingResult {
  console.log('Starting label-anchor proximity mapping...');

  // Filter out tokens and separate by source
  const textValueSpans = textSpans.filter(span => !isAnchorToken(span));
  const textTokenSpans = textSpans.filter(span => isAnchorToken(span));
  const ocrValueSpans = ocrSpans.filter(span => !isAnchorToken(span));
  const ocrTokenSpans = ocrSpans.filter(span => isAnchorToken(span));

  console.log(`Text layer: ${textValueSpans.length} value candidates, ${textTokenSpans.length} tokens`);
  console.log(`OCR layer: ${ocrValueSpans.length} value candidates, ${ocrTokenSpans.length} tokens`);
  
  // Debug: Show what text spans we have
  if (DEBUG_IMPORT) {
    console.log('Text value spans:', textValueSpans.map(s => `"${s.text}"`).slice(0, 10));
    console.log('Text token spans:', textTokenSpans.map(s => `"${s.text}"`).slice(0, 10));
  }
  
  // Merge label spans for better matching
  const mergedTextSpans = mergeLabelSpans(textValueSpans, templatePlaceholders);
  const mergedOcrSpans = mergeLabelSpans(ocrValueSpans, templatePlaceholders);
  
  const result: Record<string, string> = {};
  const perFieldConfidence: Record<string, number> = {};
  let confidentCount = 0;
  
  // Use template placeholders if available, otherwise fall back to hardcoded synonyms
  const fieldsToProcess = templatePlaceholders.length > 0 
    ? templatePlaceholders.map(p => ({ key: p.key, synonyms: [p.key, p.originalKey] }))
    : Object.entries(FIELD_SYNONYMS).map(([key, synonyms]) => ({ key, synonyms }));

  // Process each field with per-field source selection
  for (const { key: fieldKey, synonyms: fieldSynonyms } of fieldsToProcess) {
    if (DEBUG_IMPORT) {
      console.log(`\n🔍 Processing field: ${fieldKey}`);
      console.log(`  Synonyms: ${fieldSynonyms.join(', ')}`);
    }
    const fieldResult = findFieldValuePerSource(mergedTextSpans, mergedOcrSpans, fieldSynonyms, fieldKey, textTokenSpans, ocrTokenSpans, templatePlaceholders);
    
                if (fieldResult.value && isValidFieldValue(fieldResult.value, fieldKey, templatePlaceholders)) {
                  result[fieldKey] = fieldResult.value;
                  perFieldConfidence[fieldKey] = fieldResult.confidence;

                  if (fieldResult.confidence >= 0.6) {
                    confidentCount++;
                  }

                  if (DEBUG_IMPORT) {
                    console.log(`Field=${fieldKey} value="${fieldResult.value}" source=${fieldResult.source} method=${fieldResult.rule} colon=${fieldResult.colon ? 'yes' : 'no'} tokenIgnored=${fieldResult.tokenIgnored} conf=${fieldResult.confidence.toFixed(2)}`);
                  }
                } else {
                  if (DEBUG_IMPORT) {
                    console.log(`No valid value found for ${fieldKey} (rejected: "${fieldResult.value}")`);
                    console.log(`  - Value empty: ${!fieldResult.value}`);
                    console.log(`  - Valid field value: ${fieldResult.value ? isValidFieldValue(fieldResult.value, fieldKey, templatePlaceholders) : 'N/A'}`);
                  }
                }
  }
  
  console.log(`Label mapping completed: ${Object.keys(result).length} fields, ${confidentCount} confident`);
  return { data: result, perFieldConfidence, confidentCount, source: 'text' };
}

/**
 * Find field value using per-field source selection
 */
function findFieldValuePerSource(
  textSpans: TextSpan[], 
  ocrSpans: TextSpan[], 
  synonyms: string[], 
  fieldKey: string,
  textTokens: TextSpan[],
  ocrTokens: TextSpan[],
  templatePlaceholders: any[] = []
): {
  value: string;
  confidence: number;
  rule: string;
  source: 'text' | 'ocr';
  colon: boolean;
  tokenIgnored: boolean;
} {
  // Try text layer first
  const textResult = findFieldValueInSource(textSpans, synonyms, fieldKey, textTokens, 'text', templatePlaceholders);
  
  // Try OCR layer
  const ocrResult = findFieldValueInSource(ocrSpans, synonyms, fieldKey, ocrTokens, 'ocr', templatePlaceholders);
  
  // Pick the best result
  if (textResult.value && ocrResult.value) {
    // Both found values, pick the one with higher confidence
    return textResult.confidence >= ocrResult.confidence ? textResult : ocrResult;
  } else if (textResult.value) {
    return textResult;
  } else if (ocrResult.value) {
    return ocrResult;
  } else {
    return { value: '', confidence: 0, rule: 'none', source: 'text', colon: false, tokenIgnored: false };
  }
}

/**
 * Find field value in a specific source
 */
function findFieldValueInSource(
  valueSpans: TextSpan[], 
  synonyms: string[], 
  fieldKey: string, 
  tokenSpans: TextSpan[],
  source: 'text' | 'ocr',
  templatePlaceholders: any[] = []
): {
  value: string;
  confidence: number;
  rule: string;
  source: 'text' | 'ocr';
  colon: boolean;
  tokenIgnored: boolean;
} {
  // Find the best matching label span (including tokens)
  let bestLabelSpan: TextSpan | null = null;
  let bestMatchScore = 0;
  let bestSynonym = '';
  let tokenIgnored = false;
  
  // Check regular spans first (labels like "Investor Name:")
  for (const span of valueSpans) {
    for (const synonym of synonyms) {
      const matchScore = calculateMatchScore(span.text, synonym);
      if (matchScore > bestMatchScore) {
        bestMatchScore = matchScore;
        bestLabelSpan = span;
        bestSynonym = synonym;
        tokenIgnored = false;
      }
    }
  }
  
  // If no regular match, check token spans as fallback
  if (bestMatchScore < 0.5) {
    for (const span of tokenSpans) {
      for (const synonym of synonyms) {
        const matchScore = calculateTokenMatchScore(span.text, synonym);
        if (matchScore > bestMatchScore) {
          bestMatchScore = matchScore;
          bestLabelSpan = span;
          bestSynonym = synonym;
          tokenIgnored = true;
        }
      }
    }
  }
  
  if (!bestLabelSpan || bestMatchScore < 0.5) {
    if (DEBUG_IMPORT) {
      console.log(`    No label match found for ${fieldKey} (best score: ${bestMatchScore})`);
    }
    return { value: '', confidence: 0, rule: 'none', source, colon: false, tokenIgnored: false };
  }
  
  if (DEBUG_IMPORT) {
    console.log(`    Best label match: "${bestLabelSpan.text}" (${bestSynonym}, score: ${bestMatchScore})`);
    console.log(`    Label position: x=${bestLabelSpan.x}, y=${bestLabelSpan.y}, w=${bestLabelSpan.w}, h=${bestLabelSpan.h}`);
  }
  
  // Find value using proximity rules (only from value spans)
  const valueResult = findValueNearLabel(valueSpans, bestLabelSpan, fieldKey, templatePlaceholders);
  
  // Calculate confidence
  const confidence = calculateConfidence(bestMatchScore, valueResult.rule, valueResult.distance);
  
  return {
    value: valueResult.value,
    confidence: confidence,
    rule: valueResult.rule,
    source: source,
    colon: valueResult.colon,
    tokenIgnored: tokenIgnored
  };
}

/**
 * Calculate match score for token spans
 */
function calculateTokenMatchScore(text: string, synonym: string): number {
  // Extract content from {{...}} tokens
  const tokenMatch = text.match(/^\{\{(.*)\}\}$/);
  if (!tokenMatch) return 0;
  
  const tokenContent = tokenMatch[1].trim();
  return calculateMatchScore(tokenContent, synonym);
}

/**
 * Calculate match score between text and synonym
 */
function calculateMatchScore(text: string, synonym: string): number {
  const normalizedText = normalizeText(text);
  const normalizedSynonym = normalizeText(synonym);
  
  // Exact match
  if (normalizedText === normalizedSynonym) {
    return 1.0;
  }
  
  // Contains match
  if (normalizedText.includes(normalizedSynonym) || normalizedSynonym.includes(normalizedText)) {
    return 0.8;
  }
  
  // Jaro-Winkler similarity
  const similarity = calculateJaroWinklerSimilarity(normalizedText, normalizedSynonym);
  if (similarity >= 0.82) {
    return similarity;
  }
  
  return 0;
}

/**
 * Normalize text for matching
 */
function normalizeText(text: string): string {
  return text.toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '')
    .trim();
}

/**
 * Find value near label using proximity rules
 */
function findValueNearLabel(valueSpans: TextSpan[], labelSpan: TextSpan, fieldKey: string, templatePlaceholders: any[] = []): {
  value: string;
  rule: string;
  distance: number;
  colon: boolean;
} {
  const labelX = labelSpan.x;
  const labelY = labelSpan.y;
  const labelWidth = labelSpan.w;
  const labelHeight = labelSpan.h;
  const labelRight = labelX + labelWidth;
  
  // Rule 1: Same-line right (increased y-overlap to 0.65)
  const sameLineSpans = valueSpans.filter(span => 
    span.page === labelSpan.page &&
    Math.abs(span.y - labelY) < labelHeight * 0.65 && // 65% y-overlap
    span.x >= labelX - 10 && // Within 10pt to the left of label start
    span.x <= labelRight + 50 && // Within 50pt of label end (allow some overlap)
    !span.text.includes(':') && // Exclude label text (contains colons)
    !span.text.includes('{{') // Exclude token text
  ).sort((a, b) => a.x - b.x);
  
  if (sameLineSpans.length > 0) {
    const value = concatenateSpans(sameLineSpans, 10); // 10pt gap tolerance
    if (DEBUG_IMPORT) {
      console.log(`    Found same-line spans for ${fieldKey}:`, sameLineSpans.map(s => `"${s.text}"`));
      console.log(`    Concatenated value: "${value}"`);
      console.log(`    Is valid field value: ${isValidFieldValue(value, fieldKey, templatePlaceholders)}`);
    }
    if (isValidFieldValue(value, fieldKey, templatePlaceholders)) {
      return {
        value: value,
        rule: 'same-line',
        distance: sameLineSpans[0].x - labelRight,
        colon: false
      };
    }
  }
  
  // Rule 2: Below box (3.6" wide × 0.9" tall)
  const belowSpans = valueSpans.filter(span => 
    span.page === labelSpan.page &&
    span.x >= labelX - 6 && // Within 6pt of label start
    span.x <= labelRight + 252 && // Within 3.6" of label end
    span.y <= labelY - 2 && // Below label
    span.y >= labelY - 65 && // Within 0.9" below
    !span.text.includes(':') && // Exclude label text
    !span.text.includes('{{') // Exclude token text
  ).sort((a, b) => b.y - a.y); // Sort by y descending (top to bottom)
  
  if (belowSpans.length > 0) {
    const value = concatenateSpans(belowSpans, 10);
    if (DEBUG_IMPORT) {
      console.log(`    Found below spans for ${fieldKey}:`, belowSpans.map(s => `"${s.text}"`));
      console.log(`    Concatenated value: "${value}"`);
      console.log(`    Is valid field value: ${isValidFieldValue(value, fieldKey, templatePlaceholders)}`);
    }
    if (isValidFieldValue(value, fieldKey, templatePlaceholders)) {
      return {
        value: value,
        rule: 'below',
        distance: labelY - belowSpans[0].y,
        colon: false
      };
    }
  }
  
  // Rule 3: Very flexible search - any span on the same page within reasonable distance
  const flexibleSpans = valueSpans.filter(span => 
    span.page === labelSpan.page &&
    span.x >= labelX - 50 && // Within 50pt of label start
    span.x <= labelRight + 400 && // Within 5.5" of label end
    span.y <= labelY + 20 && // Above or at same level as label
    span.y >= labelY - 120 && // Within 1.7" below
    !span.text.includes(':') && // Exclude label text
    !span.text.includes('{{') && // Exclude token text
    span.text.trim().length > 0 // Must have some content
  ).sort((a, b) => Math.abs(a.y - labelY) - Math.abs(b.y - labelY)); // Sort by distance from label
  
  if (flexibleSpans.length > 0) {
    const value = concatenateSpans(flexibleSpans.slice(0, 3), 15); // Take up to 3 closest spans
    if (DEBUG_IMPORT) {
      console.log(`    Found flexible spans for ${fieldKey}:`, flexibleSpans.slice(0, 3).map(s => `"${s.text}"`));
      console.log(`    Concatenated value: "${value}"`);
      console.log(`    Is valid field value: ${isValidFieldValue(value, fieldKey, templatePlaceholders)}`);
    }
    if (isValidFieldValue(value, fieldKey, templatePlaceholders)) {
      return {
        value: value,
        rule: 'flexible',
        distance: Math.abs(flexibleSpans[0].y - labelY),
        colon: false
      };
    }
  }
  
  // Rule 3: Colon shortcut
  if (labelSpan.text.includes(':')) {
    const colonIndex = labelSpan.text.indexOf(':');
    const afterColon = labelSpan.text.substring(colonIndex + 1).trim();
    if (afterColon && isValidFieldValue(afterColon, fieldKey, templatePlaceholders)) {
      return {
        value: afterColon,
        rule: 'colon',
        distance: 0,
        colon: true
      };
    }
  }
  
  return { value: '', rule: 'none', distance: Infinity, colon: false };
}

/**
 * Concatenate spans with gap tolerance
 */
function concatenateSpans(spans: TextSpan[], gapTolerance: number): string {
  if (spans.length === 0) return '';
  
  let result = spans[0].text;
  let lastX = spans[0].x + spans[0].w;
  
  for (let i = 1; i < spans.length; i++) {
    const span = spans[i];
    const gap = span.x - lastX;
    
    if (gap <= gapTolerance) {
      result += ' ' + span.text;
      lastX = span.x + span.w;
    } else {
      break; // Stop at first gap larger than tolerance
    }
  }
  
  return result.trim();
}

/**
 * Calculate confidence score
 */
function calculateConfidence(matchScore: number, rule: string, distance: number): number {
  let confidence = 0;
  
  // Base score from match quality (0.3-0.6)
  if (matchScore >= 0.8) {
    confidence += 0.6; // Exact/contains match
  } else if (matchScore >= 0.5) {
    confidence += 0.4; // Fuzzy match
  } else {
    confidence += 0.3; // Weak match
  }
  
  // Geometry rule bonus (0.3-0.6)
  switch (rule) {
    case 'same-line':
      confidence += 0.6;
      break;
    case 'below':
      confidence += 0.5;
      break;
    case 'colon':
      confidence += 0.4;
      break;
    default:
      confidence += 0.3;
  }
  
  // Distance penalty (0-0.2)
  const distancePenalty = Math.min(distance / 100, 0.2);
  confidence -= distancePenalty;
  
  return Math.max(0, Math.min(1, confidence));
}

/**
 * Calculate Jaro-Winkler similarity between two strings
 */
function calculateJaroWinklerSimilarity(str1: string, str2: string): number {
  const jaro = calculateJaroSimilarity(str1, str2);
  const prefixLength = getCommonPrefixLength(str1, str2, 4);
  return jaro + (0.1 * prefixLength * (1 - jaro));
}

/**
 * Calculate Jaro similarity
 */
function calculateJaroSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1.0;
  
  const len1 = str1.length;
  const len2 = str2.length;
  
  if (len1 === 0 || len2 === 0) return 0.0;
  
  const matchWindow = Math.floor(Math.max(len1, len2) / 2) - 1;
  if (matchWindow < 0) return 0.0;
  
  const str1Matches = new Array(len1).fill(false);
  const str2Matches = new Array(len2).fill(false);
  
  let matches = 0;
  let transpositions = 0;
  
  // Find matches
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, len2);
    
    for (let j = start; j < end; j++) {
      if (str2Matches[j] || str1[i] !== str2[j]) continue;
      str1Matches[i] = true;
      str2Matches[j] = true;
      matches++;
      break;
    }
  }
  
  if (matches === 0) return 0.0;
  
  // Count transpositions
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!str1Matches[i]) continue;
    while (!str2Matches[k]) k++;
    if (str1[i] !== str2[k]) transpositions++;
    k++;
  }
  
  return (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;
}

/**
 * Get common prefix length (up to maxLen)
 */
function getCommonPrefixLength(str1: string, str2: string, maxLen: number): number {
  let len = 0;
  const minLen = Math.min(str1.length, str2.length, maxLen);
  
  while (len < minLen && str1[len] === str2[len]) {
    len++;
  }
  
  return len;
}