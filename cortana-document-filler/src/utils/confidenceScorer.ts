import { TextSpan } from './pdfDiagnostics';

export interface ConfidenceScore {
  score: number;
  factors: {
    anchorMatch: number;
    geometryRule: number;
    source: number;
    textQuality: number;
  };
  explanation: string;
}

export interface ExtractedValue {
  key: string;
  value: string;
  confidence: ConfidenceScore;
  source: 'form' | 'text' | 'ocr' | 'anchor';
  spans?: TextSpan[];
}

/**
 * Calculate confidence score for extracted values
 */
export class ConfidenceScorer {
  private settings: {
    anchorMatchWeight: number;
    geometryRuleWeight: number;
    sourceWeight: number;
    textQualityWeight: number;
  };

  constructor() {
    this.settings = {
      anchorMatchWeight: 0.3,
      geometryRuleWeight: 0.25,
      sourceWeight: 0.25,
      textQualityWeight: 0.2
    };
  }

  /**
   * Calculate confidence score for a single extracted value
   */
  calculateConfidence(
    key: string,
    value: string,
    source: 'form' | 'text' | 'ocr' | 'anchor',
    spans?: TextSpan[],
    anchorTokens?: string[]
  ): ConfidenceScore {
    const factors = {
      anchorMatch: this.calculateAnchorMatch(key, value, anchorTokens),
      geometryRule: this.calculateGeometryRule(key, value, spans),
      source: this.calculateSourceScore(source),
      textQuality: this.calculateTextQuality(value)
    };

    const score = 
      factors.anchorMatch * this.settings.anchorMatchWeight +
      factors.geometryRule * this.settings.geometryRuleWeight +
      factors.source * this.settings.sourceWeight +
      factors.textQuality * this.settings.textQualityWeight;

    const explanation = this.generateExplanation(factors, source);

    return {
      score: Math.min(Math.max(score, 0), 1), // Clamp between 0 and 1
      factors,
      explanation
    };
  }

  /**
   * Calculate anchor match score
   */
  private calculateAnchorMatch(key: string, value: string, anchorTokens?: string[]): number {
    if (!anchorTokens || anchorTokens.length === 0) {
      return 0.5; // Neutral score if no anchor tokens
    }

    // Look for exact key matches in anchor tokens
    const keyVariations = this.generateKeyVariations(key);
    const exactMatch = anchorTokens.some(token => 
      keyVariations.some(variation => 
        token.toLowerCase().includes(variation.toLowerCase())
      )
    );

    if (exactMatch) {
      return 1.0; // Perfect match
    }

    // Look for partial matches
    const partialMatch = anchorTokens.some(token => 
      this.calculateLevenshteinSimilarity(key.toLowerCase(), token.toLowerCase()) >= 0.8
    );

    if (partialMatch) {
      return 0.8; // Good partial match
    }

    return 0.3; // Low score for no match
  }

  /**
   * Calculate geometry rule score based on text positioning
   */
  private calculateGeometryRule(key: string, value: string, spans?: TextSpan[]): number {
    if (!spans || spans.length === 0) {
      return 0.5; // Neutral score if no position data
    }

    // Look for spans that contain the key and value
    const keySpans = spans.filter(span => 
      span.text.toLowerCase().includes(key.toLowerCase())
    );
    const valueSpans = spans.filter(span => 
      span.text.toLowerCase().includes(value.toLowerCase())
    );

    if (keySpans.length === 0 || valueSpans.length === 0) {
      return 0.3; // Low score if key or value not found
    }

    // Check if value is to the right of key (same line)
    const sameLineRight = keySpans.some(keySpan => 
      valueSpans.some(valueSpan => 
        Math.abs(valueSpan.y - keySpan.y) < 20 && // Same line (within 20px)
        valueSpan.x > keySpan.x // To the right
      )
    );

    if (sameLineRight) {
      return 1.0; // Perfect geometry match
    }

    // Check if value is below key
    const belowKey = keySpans.some(keySpan => 
      valueSpans.some(valueSpan => 
        valueSpan.y < keySpan.y && // Below
        Math.abs(valueSpan.x - keySpan.x) < 50 // Roughly aligned
      )
    );

    if (belowKey) {
      return 0.8; // Good geometry match
    }

    return 0.5; // Neutral score for other positions
  }

  /**
   * Calculate source score based on extraction method
   */
  private calculateSourceScore(source: 'form' | 'text' | 'ocr' | 'anchor'): number {
    switch (source) {
      case 'form':
        return 1.0; // Highest confidence for form fields
      case 'anchor':
        return 0.9; // High confidence for anchor tokens
      case 'text':
        return 0.8; // Good confidence for text extraction
      case 'ocr':
        return 0.6; // Lower confidence for OCR
      default:
        return 0.5;
    }
  }

  /**
   * Calculate text quality score
   */
  private calculateTextQuality(value: string): number {
    if (!value || value.trim().length === 0) {
      return 0.0;
    }

    let score = 0.5; // Base score

    // Length check (not too short, not too long)
    if (value.length >= 2 && value.length <= 100) {
      score += 0.2;
    }

    // Contains letters
    if (/[A-Za-z]/.test(value)) {
      score += 0.1;
    }

    // Contains numbers (for amounts, dates)
    if (/\d/.test(value)) {
      score += 0.1;
    }

    // No excessive special characters
    const specialCharRatio = (value.match(/[^A-Za-z0-9\s.,-]/g) || []).length / value.length;
    if (specialCharRatio < 0.3) {
      score += 0.1;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Generate key variations for matching
   */
  private generateKeyVariations(key: string): string[] {
    const variations = [key];
    
    // Add common variations
    variations.push(key.replace(/\s+/g, ' ').trim());
    variations.push(key.toLowerCase());
    variations.push(key.toUpperCase());
    variations.push(key.replace(/\s+/g, '_'));
    variations.push(key.replace(/\s+/g, '-'));
    
    // Add without common words
    const withoutCommon = key.replace(/\b(the|a|an|of|in|on|at|to|for|with|by)\b/gi, '').trim();
    if (withoutCommon !== key) {
      variations.push(withoutCommon);
    }
    
    return [...new Set(variations)]; // Remove duplicates
  }

  /**
   * Calculate Levenshtein similarity between two strings
   */
  private calculateLevenshteinSimilarity(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => 
      Array(str1.length + 1).fill(null)
    );

    for (let i = 0; i <= str1.length; i++) {
      matrix[0][i] = i;
    }

    for (let j = 0; j <= str2.length; j++) {
      matrix[j][0] = j;
    }

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,     // deletion
          matrix[j - 1][i] + 1,     // insertion
          matrix[j - 1][i - 1] + cost // substitution
        );
      }
    }

    const maxLength = Math.max(str1.length, str2.length);
    return maxLength === 0 ? 1 : (maxLength - matrix[str2.length][str1.length]) / maxLength;
  }

  /**
   * Generate explanation for confidence score
   */
  private generateExplanation(factors: any, source: string): string {
    const explanations = [];

    if (factors.anchorMatch >= 0.8) {
      explanations.push('Strong anchor token match');
    } else if (factors.anchorMatch >= 0.5) {
      explanations.push('Partial anchor token match');
    } else {
      explanations.push('No anchor token match');
    }

    if (factors.geometryRule >= 0.8) {
      explanations.push('Good text positioning');
    } else if (factors.geometryRule >= 0.5) {
      explanations.push('Reasonable text positioning');
    } else {
      explanations.push('Poor text positioning');
    }

    if (factors.source >= 0.8) {
      explanations.push('High-quality source');
    } else if (factors.source >= 0.6) {
      explanations.push('Medium-quality source');
    } else {
      explanations.push('Lower-quality source');
    }

    if (factors.textQuality >= 0.8) {
      explanations.push('High text quality');
    } else if (factors.textQuality >= 0.6) {
      explanations.push('Medium text quality');
    } else {
      explanations.push('Lower text quality');
    }

    return explanations.join(', ');
  }

  /**
   * Filter extracted values by confidence threshold
   */
  filterByConfidence(values: ExtractedValue[], threshold: number = 0.7): ExtractedValue[] {
    return values.filter(value => value.confidence.score >= threshold);
  }

  /**
   * Sort extracted values by confidence score
   */
  sortByConfidence(values: ExtractedValue[]): ExtractedValue[] {
    return values.sort((a, b) => b.confidence.score - a.confidence.score);
  }
}

/**
 * Create a new confidence scorer instance
 */
export function createConfidenceScorer(): ConfidenceScorer {
  return new ConfidenceScorer();
}






