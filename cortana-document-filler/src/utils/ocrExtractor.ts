import { PDFDocument } from 'pdf-lib';
import { TextSpan } from '../types.js';
import { createWorker } from 'tesseract.js';
import * as pdfjs from 'pdfjs-dist';

const DEBUG_IMPORT = true;

let worker: any = null;

/**
 * Initialize Tesseract worker with local files - pinned to stable version
 */
async function initializeTesseractWorker(): Promise<any> {
  if (worker) return worker;
  
  try {
    console.log('Initializing Tesseract OCR worker (v4.0.2)...');
    
    // Create worker with local file paths - NO FUNCTIONS in worker messages
    worker = await createWorker({
      workerPath: '/tesseract/worker.min.js',
      langPath: '/tesseract/',
      corePath: '/tesseract/tesseract-core.wasm'
      // No logger - causes DataCloneError when passed to worker
    });
    
    // Load exactly one language: 'eng' (string, not array)
    await worker.loadLanguage('eng');
    await worker.initialize('eng');
    
    console.log('Tesseract OCR worker initialized successfully');
    return worker;
  } catch (error) {
    console.error('Failed to initialize Tesseract OCR worker:', error);
    throw error;
  }
}

/**
 * Convert PDF page to canvas using pdfjs-dist
 */
async function pdfPageToCanvas(pdfBytes: Uint8Array, pageNum: number, targetDPI: number = 300): Promise<HTMLCanvasElement> {
  // Load PDF with pdfjs-dist
  const loadingTask = pdfjs.getDocument({ data: pdfBytes });
  const pdf = await loadingTask.promise;
  
  const page = await pdf.getPage(pageNum + 1); // pdfjs-dist uses 1-based page numbers
  const scale = targetDPI / 72;
  const viewport = page.getViewport({ scale });
  
  // Create canvas at 2x scale for better OCR quality
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }
  
  // Render PDF page to canvas
  const renderContext = {
    canvasContext: ctx,
    viewport: viewport,
    canvas: canvas
  };
  
  await page.render(renderContext).promise;
  
  return canvas;
}

/**
 * Convert pixel coordinates to PDF points
 */
function pixelToPDFPoints(pixelX: number, pixelY: number, pixelW: number, pixelH: number, scale: number): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  return {
    x: pixelX / scale,
    y: pixelY / scale,
    w: pixelW / scale,
    h: pixelH / scale
  };
}

/**
 * Validate OCR inputs before calling recognize
 */
function validateOCRInputs(lang: string, image: HTMLCanvasElement | ImageData, options: any): void {
  // Validate language
  if (typeof lang !== 'string' || lang !== 'eng') {
    throw new Error(`Invalid language: expected 'eng', got ${typeof lang} '${lang}'`);
  }
  
  // Validate image
  if (image instanceof HTMLCanvasElement) {
    if (!image.width || !image.height) {
      throw new Error(`Invalid canvas: expected HTMLCanvasElement with width/height, got dimensions ${image?.width}x${image?.height}`);
    }
  } else if (image instanceof ImageData) {
    if (!image.data || image.data.length === 0) {
      throw new Error(`Invalid ImageData: expected ImageData with data, got data length ${image?.data?.length || 0}`);
    }
  } else {
    throw new Error(`Invalid image: expected HTMLCanvasElement or ImageData, got ${typeof image}`);
  }
  
  // Validate options is plain JSON object
  if (options && typeof options === 'object') {
    try {
      JSON.stringify(options);
    } catch (e) {
      throw new Error('Options must be JSON-serializable');
    }
  }
}

/**
 * Sanitize data to ensure it's structured-cloneable
 */
function sanitizeForWorker(data: any): any {
  if (data === null || typeof data === 'undefined') {
    return data;
  }
  
  if (typeof data === 'function' || typeof data === 'symbol' || typeof data === 'bigint') {
    throw new Error('Cannot serialize function, symbol, or BigInt to worker');
  }
  
  if (data instanceof Date || data instanceof RegExp || data instanceof Error) {
    throw new Error('Cannot serialize Date, RegExp, or Error to worker');
  }
  
  if (data instanceof HTMLElement || data instanceof Node || data instanceof HTMLCanvasElement) {
    throw new Error('Cannot serialize DOM nodes to worker');
  }
  
  if (typeof data === 'object') {
    if (data.constructor && data.constructor !== Object && data.constructor !== Array) {
      // Check if it's a plain object or array
      if (data.constructor.name !== 'Object' && data.constructor.name !== 'Array') {
        throw new Error(`Cannot serialize class instance ${data.constructor.name} to worker`);
      }
    }
    
    if (Array.isArray(data)) {
      return data.map(item => sanitizeForWorker(item));
    } else {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(data)) {
        sanitized[key] = sanitizeForWorker(value);
      }
      return sanitized;
    }
  }
  
  return data;
}

/**
 * Extract text spans using real OCR via Tesseract
 */
export async function extractDataFromPDFWithOCR(pdfDoc: PDFDocument): Promise<TextSpan[]> {
  try {
    console.log('Starting real OCR text extraction...');
    
    // Get PDF bytes
    const pdfBytes = await pdfDoc.save();
    
    // Initialize Tesseract worker
    const ocrWorker = await initializeTesseractWorker();
    
    if (!ocrWorker) {
      throw new Error('Failed to initialize OCR worker');
    }
    
    const allSpans: TextSpan[] = [];
    const pages = pdfDoc.getPageCount();
    const targetDPI = 300;
    const scale = targetDPI / 72;
    
    // Process each page
    for (let pageNum = 0; pageNum < pages; pageNum++) {
      try {
        // Progress logging on main thread only
        if (DEBUG_IMPORT) {
          const progress = ((pageNum + 1) / pages * 100).toFixed(1);
          console.log(`OCR progress: ${progress}% - Processing page ${pageNum + 1}/${pages}...`);
        }
        
        // Convert PDF page to canvas
        const canvas = await pdfPageToCanvas(pdfBytes, pageNum, targetDPI);
        
        // Debug: Log canvas properties
        if (DEBUG_IMPORT) {
          console.log(`Page ${pageNum + 1}: Canvas - width: ${canvas.width}, height: ${canvas.height}`);
          console.log(`Page ${pageNum + 1}: Canvas type:`, typeof canvas, canvas.constructor.name);
        }
        
        // Convert canvas to ImageData for Tesseract
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Failed to get canvas context');
        }
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // Validate inputs before calling recognize
        validateOCRInputs('eng', imageData, {});
        
        // Run OCR on the ImageData
        let ocrResult;
        try {
          if (DEBUG_IMPORT) {
            console.log(`Page ${pageNum + 1}: Calling recognize with ImageData:`, {
              width: imageData.width,
              height: imageData.height,
              dataLength: imageData.data.length
            });
          }
          
          // Try different approaches to pass data to Tesseract
          try {
            // Method 1: Pass ImageData directly
            ocrResult = await ocrWorker.recognize(imageData, {
              lang: 'eng'
            });
          } catch (method1Error) {
            console.log(`Method 1 failed, trying method 2:`, method1Error instanceof Error ? method1Error.message : 'Unknown error');
            
            // Method 2: Convert ImageData to ArrayBuffer
            const arrayBuffer = imageData.data.buffer.slice(
              imageData.data.byteOffset,
              imageData.data.byteOffset + imageData.data.byteLength
            );
            
            try {
              ocrResult = await ocrWorker.recognize(arrayBuffer, {
                lang: 'eng'
              });
            } catch (method2Error) {
              console.log(`Method 2 failed, trying method 3:`, method2Error instanceof Error ? method2Error.message : 'Unknown error');
              
              // Method 3: Convert canvas to data URL and pass as string
              const dataUrl = canvas.toDataURL('image/png');
              ocrResult = await ocrWorker.recognize(dataUrl, {
                lang: 'eng'
              });
            }
          }
        } catch (recognizeError) {
          console.error(`OCR recognize failed for page ${pageNum + 1}:`, recognizeError);
          continue; // Skip this page and continue with others
        }
        
        const { data: { words } } = ocrResult;
        
        // Sanitize and convert OCR words to TextSpan format
        const sanitizedWords = sanitizeForWorker(words);
        
        if (!Array.isArray(sanitizedWords)) {
          console.warn(`Page ${pageNum + 1}: OCR returned non-array words:`, typeof sanitizedWords);
          continue;
        }
        
        for (const word of sanitizedWords) {
          if (word && 
              typeof word === 'object' &&
              word.text && 
              typeof word.text === 'string' && 
              word.text.trim() && 
              typeof word.confidence === 'number' && 
              word.confidence > 0) {
            
            // Ensure bbox properties are numbers
            const bbox = {
              x0: Number(word.bbox?.x0) || 0,
              y0: Number(word.bbox?.y0) || 0,
              x1: Number(word.bbox?.x1) || 0,
              y1: Number(word.bbox?.y1) || 0
            };
            
            // Convert pixel coordinates to PDF points
            const coords = pixelToPDFPoints(
              bbox.x0, 
              bbox.y0, 
              bbox.x1 - bbox.x0, 
              bbox.y1 - bbox.y0, 
              scale
            );
            
            // Create sanitized TextSpan
            const span = {
              text: String(word.text).trim(),
              x: Number(coords.x) || 0,
              y: Number(coords.y) || 0,
              w: Number(coords.w) || 0,
              h: Number(coords.h) || 0,
              page: Number(pageNum) || 0,
              conf: Number(word.confidence) || 0
            };
            
            // Final sanitization check
            const sanitizedSpan = sanitizeForWorker(span);
            allSpans.push(sanitizedSpan);
          }
        }
        
        console.log(`Page ${pageNum + 1}: Found ${sanitizedWords.length} words`);
        
      } catch (pageError) {
        console.error(`Error processing page ${pageNum + 1}:`, pageError);
        // Continue with other pages
      }
    }
    
    // Final validation: ensure all spans are properly structured
    const validatedSpans = allSpans.filter(span => {
      return span && 
             typeof span.text === 'string' && 
             typeof span.x === 'number' && 
             typeof span.y === 'number' && 
             typeof span.w === 'number' && 
             typeof span.h === 'number' && 
             typeof span.page === 'number' && 
             (typeof span.conf === 'number' || span.conf === undefined);
    });
    
    // Check if OCR yielded too few words or low confidence
    const totalWords = validatedSpans.length;
    const avgConfidence = validatedSpans.reduce((sum, s) => sum + (s.conf || 0), 0) / Math.max(totalWords, 1);
    
    if (totalWords < 20) {
      console.warn(`OCR yielded too few words: ${totalWords} (minimum 20)`);
      return [];
    }
    
    if (avgConfidence < 60) {
      console.warn(`OCR average confidence too low: ${avgConfidence.toFixed(1)}% (minimum 60%)`);
      return [];
    }
    
    // Log diagnostic info
    const firstWords = validatedSpans.slice(0, 10).map(s => s.text).join(' ');
    console.log(`OCR extraction completed: ${totalWords} words, avg confidence ${avgConfidence.toFixed(1)}%`);
    console.log(`First 10 words: ${firstWords}`);
    
    return validatedSpans;
    
  } catch (error) {
    console.error('OCR extraction failed:', error);
    console.log('Falling back to text layer + regions');
    return [];
  }
}

/**
 * Check if OCR was successful
 */
export function isOCRSuccessful(spans: TextSpan[]): boolean {
  return spans.length > 0;
}

/**
 * Get OCR statistics
 */
export function getOCRStats(spans: TextSpan[]): { totalWords: number; avgConfidence: number; lowQualityPages: number } {
  const totalWords = spans.length;
  const avgConfidence = spans.reduce((sum, s) => sum + (s.conf || 0), 0) / Math.max(totalWords, 1);
  const lowQualityPages = new Set(spans.filter(s => (s.conf || 0) < 35).map(s => s.page)).size;
  
  return { totalWords, avgConfidence, lowQualityPages };
}

/**
 * Cleanup Tesseract worker
 */
export async function cleanupOCRWorker(): Promise<void> {
  if (worker) {
    try {
      await worker.terminate();
      worker = null;
      console.log('Tesseract OCR worker terminated');
    } catch (error) {
      console.error('Error terminating OCR worker:', error);
    }
  }
}