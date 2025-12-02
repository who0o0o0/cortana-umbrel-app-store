import { TextSpan } from '../types.js';
import { MappingResult } from './labelMapper.js';

const DEBUG_IMPORT = true;

export interface RegionField {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RegionTemplate {
  template: string;
  fingerprint: {
    page1_must_include: string[];
  };
  pages: Array<{
    number: number;
    fields: Record<string, RegionField>;
  }>;
  units: string;
}

/**
 * Map text spans to form fields using region-based extraction
 */
export function mapByRegions(spans: TextSpan[], templateName: string = 'SAFE'): MappingResult {
  console.log(`Starting region-based mapping with template: ${templateName}`);
  
  if (!spans || spans.length === 0) {
    console.log('No spans available for region mapping');
    return { data: {}, perFieldConfidence: {}, confidentCount: 0, source: 'zonal' };
  }
  
  // Load template (for now, use hardcoded SAFE template)
  const template = loadSAFETemplate();
  
  // Check if this looks like a SAFE document
  if (!looksLikeSAFE(spans, template)) {
    console.log('Document does not match SAFE template fingerprint');
    return { data: {}, perFieldConfidence: {}, confidentCount: 0, source: 'zonal' };
  }
  
  const result: Record<string, string> = {};
  const perFieldConfidence: Record<string, number> = {};
  let confidentCount = 0;
  
  // Process each page
  for (const pageTemplate of template.pages) {
    const pageSpans = spans.filter(s => s.page === pageTemplate.number - 1); // Convert to 0-based
    
    for (const [fieldName, region] of Object.entries(pageTemplate.fields)) {
      const fieldValue = extractValueFromRegion(pageSpans, region, fieldName);
      
      if (fieldValue.value) {
        result[fieldName] = fieldValue.value;
        perFieldConfidence[fieldName] = fieldValue.confidence;
        
        if (fieldValue.confidence >= 0.6) {
          confidentCount++;
        }
        
        if (DEBUG_IMPORT) {
          console.log(`[Region] Found ${fieldName}: "${fieldValue.value}" (confidence: ${fieldValue.confidence.toFixed(2)})`);
        }
      }
    }
  }
  
  console.log(`Region mapping completed: ${Object.keys(result).length} fields, ${confidentCount} confident`);
  return { data: result, perFieldConfidence, confidentCount, source: 'zonal' };
}

/**
 * Check if document looks like a SAFE template
 */
export function looksLikeSAFE(spans: TextSpan[], template?: RegionTemplate): boolean {
  if (!template) {
    template = loadSAFETemplate();
  }
  
  const page1Spans = spans.filter(s => s.page === 0);
  const page1Text = page1Spans.map(s => s.text).join(' ').toLowerCase();
  
  for (const requiredText of template.fingerprint.page1_must_include) {
    if (!page1Text.includes(requiredText.toLowerCase())) {
      return false;
    }
  }
  
  return true;
}

/**
 * Extract value from a specific region
 */
function extractValueFromRegion(spans: TextSpan[], region: RegionField, fieldName: string): {
  value: string;
  confidence: number;
} {
  // Find spans that intersect with the region
  const intersectingSpans = spans.filter(span => {
    return span.x < region.x + region.w &&
           span.x + span.w > region.x &&
           span.y < region.y + region.h &&
           span.y + span.h > region.y;
  });
  
  if (intersectingSpans.length === 0) {
    return { value: '', confidence: 0 };
  }
  
  // Sort by y descending, then x ascending
  intersectingSpans.sort((a, b) => {
    if (Math.abs(a.y - b.y) > 5) return b.y - a.y;
    return a.x - b.x;
  });
  
  // Concatenate spans with gap tolerance
  const value = concatenateSpans(intersectingSpans, 10);
  
  // Calculate confidence based on coverage and text quality
  const coverage = calculateRegionCoverage(intersectingSpans, region);
  const textQuality = calculateTextQuality(intersectingSpans);
  const confidence = (coverage * 0.6 + textQuality * 0.4);
  
  return { value, confidence };
}

/**
 * Calculate how well spans cover the region
 */
function calculateRegionCoverage(spans: TextSpan[], region: RegionField): number {
  if (spans.length === 0) return 0;
  
  // Calculate total area covered by spans
  let coveredArea = 0;
  for (const span of spans) {
    const x1 = Math.max(span.x, region.x);
    const y1 = Math.max(span.y, region.y);
    const x2 = Math.min(span.x + span.w, region.x + region.w);
    const y2 = Math.min(span.y + span.h, region.y + region.h);
    
    if (x2 > x1 && y2 > y1) {
      coveredArea += (x2 - x1) * (y2 - y1);
    }
  }
  
  const totalArea = region.w * region.h;
  return Math.min(coveredArea / totalArea, 1.0);
}

/**
 * Calculate text quality based on confidence and length
 */
function calculateTextQuality(spans: TextSpan[]): number {
  if (spans.length === 0) return 0;
  
  const avgConf = spans.reduce((sum, s) => sum + (s.conf || 100), 0) / spans.length;
  const hasReasonableLength = spans.some(s => s.text.length >= 2);
  
  let quality = avgConf / 100; // Convert confidence to 0-1 scale
  if (!hasReasonableLength) quality *= 0.5;
  
  return Math.min(quality, 1.0);
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
 * Load SAFE template (hardcoded for now)
 */
function loadSAFETemplate(): RegionTemplate {
  return {
    template: 'SAFE',
    fingerprint: {
      page1_must_include: [
        'SAFE (Simple Agreement for Future Equity)',
        'Investor'
      ]
    },
    pages: [
      {
        number: 1,
        fields: {
          'Company Name': { x: 130, y: 580, w: 320, h: 24 },
          'Investor Name': { x: 130, y: 540, w: 320, h: 24 },
          'Purchase Amount': { x: 420, y: 505, w: 180, h: 24 },
          'Date of Safe': { x: 420, y: 470, w: 180, h: 24 },
          'Company State of Incorporation': { x: 130, y: 505, w: 260, h: 24 },
          'Governing Law Jurisdiction': { x: 130, y: 440, w: 260, h: 24 },
          'Company Authorized Representative Name': { x: 130, y: 320, w: 320, h: 24 },
          'Company Authorized Representative Title': { x: 130, y: 295, w: 320, h: 24 }
        }
      }
    ],
    units: 'points'
  };
}

/**
 * Merge results, preferring anchor results over region results
 */
export function mergeResultsPrefer(anchorResult: MappingResult, regionResult: MappingResult): MappingResult {
  const mergedData = { ...regionResult.data };
  const mergedConfidence = { ...regionResult.perFieldConfidence };
  let confidentCount = regionResult.confidentCount;
  
  // Override with anchor results where available
  for (const [field, value] of Object.entries(anchorResult.data)) {
    if (value) {
      mergedData[field] = value;
      mergedConfidence[field] = anchorResult.perFieldConfidence[field] || 0;
      
      // Update confident count
      if (mergedConfidence[field] >= 0.6) {
        confidentCount++;
      } else if (regionResult.perFieldConfidence[field] >= 0.6) {
        confidentCount--; // Remove region confidence if anchor is lower
      }
    }
  }
  
  return {
    data: mergedData,
    perFieldConfidence: mergedConfidence,
    confidentCount: Math.max(0, confidentCount),
    source: 'zonal'
  };
}






