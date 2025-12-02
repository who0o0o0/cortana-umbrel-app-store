// PDF Diagnostics utility
export interface PDFDiagnosticInfo {
  pageCount: number;
  hasFormFields: boolean;
  isFlattened: boolean;
  fieldCount: number;
  errors: string[];
  hasAcroForm: boolean;
  isTextless: boolean;
}

export interface TextSpan {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function analyzePDF(buffer: ArrayBuffer): Promise<PDFDiagnosticInfo> {
  try {
    const { PDFDocument } = await import('pdf-lib');
    const pdfDoc = await PDFDocument.load(buffer);
    
    const pageCount = pdfDoc.getPageCount();
    const form = pdfDoc.getForm();
    const fields = form.getFields();
    const fieldCount = fields.length;
    const hasFormFields = fieldCount > 0;
    const hasAcroForm = hasFormFields;
    
    // Check if PDF is flattened by looking for form field values
    let isFlattened = true;
    let hasFieldValues = false;
    
    for (const field of fields) {
      try {
        if (field.constructor.name === 'PDFTextField') {
          const value = (field as any).getText();
          if (value && value.trim()) {
            hasFieldValues = true;
            break;
          }
        } else if (field.constructor.name === 'PDFCheckBox') {
          const isChecked = (field as any).isChecked();
          if (isChecked) {
            hasFieldValues = true;
            break;
          }
        }
      } catch (e) {
        // Field might be read-only or have issues
      }
    }
    
    // If there are form fields but no values, it's likely flattened
    isFlattened = hasFormFields && !hasFieldValues;
    
    return {
      pageCount,
      hasFormFields,
      isFlattened,
      fieldCount,
      errors: [],
      hasAcroForm,
      isTextless: false
    };
  } catch (error) {
    return {
      pageCount: 0,
      hasFormFields: false,
      isFlattened: false,
      fieldCount: 0,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
      hasAcroForm: false,
      isTextless: false
    };
  }
}

export function logPDFDiagnostics(info: PDFDiagnosticInfo): void {
  console.log('PDF Diagnostics:', info);
}

export async function diagnosePDF(buffer: ArrayBuffer): Promise<PDFDiagnosticInfo> {
  return await analyzePDF(buffer);
}

export class PDFDiagnostics {
  static async analyze(buffer: ArrayBuffer): Promise<PDFDiagnosticInfo> {
    return await analyzePDF(buffer);
  }
  
  static isTextless(buffer: ArrayBuffer): boolean {
    return false;
  }
}
