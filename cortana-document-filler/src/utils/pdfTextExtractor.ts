import * as pdfjs from 'pdfjs-dist';
import 'pdfjs-dist/build/pdf.worker.mjs';

// Configure pdfjs-dist to work in browser
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

export type TextSpan = {
  text: string;
  x: number; y: number; w: number; h: number; // points (72/in), origin bottom-left
  page: number; // 0-based
};

type Options = { maxPages?: number };

export async function extractDataFromPDFText(pdfBuffer: Uint8Array | ArrayBuffer, opts: Options = {}): Promise<TextSpan[]> {
  console.log('=== TEXT EXTRACTION START ===');
  console.log('PDF buffer size:', pdfBuffer.byteLength || (pdfBuffer as Uint8Array).length);
  const data = pdfBuffer instanceof Uint8Array ? pdfBuffer : new Uint8Array(pdfBuffer);
  console.log('Data converted to Uint8Array, length:', data.length);
  
  const loadingTask = pdfjs.getDocument({ data });
  console.log('Loading task created');
  const pdf = await loadingTask.promise;
  console.log('PDF loaded successfully, pages:', pdf.numPages);

  const results: TextSpan[] = [];
  const maxPages = opts.maxPages ?? pdf.numPages;
  console.log('Will process', maxPages, 'pages');

  for (let p = 1; p <= Math.min(pdf.numPages, maxPages); p++) {
    console.log(`Processing page ${p}...`);
    const page = await pdf.getPage(p);
    console.log(`Page ${p} loaded`);
    const viewport = page.getViewport({ scale: 1 }); // 1 unit == PDF point
    console.log(`Page ${p} viewport:`, viewport.width, 'x', viewport.height);
    const content = await page.getTextContent();
    console.log(`Page ${p} text content items:`, content.items.length);

    // pdf.js items have transform matrices; convert to bounding boxes in page space
    let itemCount = 0;
    for (const item of content.items as any[]) {
      const str: string = (item.str ?? '').trim();
      if (!str) {
        console.log(`  Item ${itemCount++} skipped (empty)`);
        continue;
      }

      // Compute width/height in points using font size & transform
      // item.transform is [a, b, c, d, e, f] matrix
      const [a, b, c, d, e, f] = item.transform as number[];
      // Text matrix maps to top-left in pdf.js space where y grows up when scale=1
      const fontSize = Math.hypot(a, b); // approximate
      const w = item.width ?? (str.length * fontSize * 0.5);
      const h = Math.abs(d) || fontSize;

      const x = e;
      const yTop = f;
      const y = yTop - h; // convert top-left to bottom-left

      results.push({
        text: str,
        x, y, w, h,
        page: p - 1,
      });
      
      if (itemCount < 5) {
        console.log(`  Item ${itemCount}: "${str}" at (${x.toFixed(1)}, ${y.toFixed(1)})`);
      }
      itemCount++;
    }
    console.log(`Page ${p} extracted ${itemCount} text items, ${results.length} total spans so far`);
  }

  // Debug: Show all extracted text spans
  console.log('=== TEXT EXTRACTION COMPLETE ===');
  console.log('Total extracted text spans:', results.length);
  if (results.length > 0) {
    console.log('First 10 text spans:');
    results.slice(0, 10).forEach((span, index) => {
      console.log(`  ${index + 1}. "${span.text}" (page ${span.page}, x: ${span.x.toFixed(1)}, y: ${span.y.toFixed(1)})`);
    });
  } else {
    console.warn('⚠️ NO TEXT EXTRACTED FROM PDF! This will cause import to fail.');
  }
  
  return results;
}

// optional default export to avoid import shape confusion
export default extractDataFromPDFText;