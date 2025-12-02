export interface PlaceholderField {
  key: string;
  originalKey: string;
  originalPlaceholder: string;
  type: 'text' | 'date' | 'number' | 'multiline' | 'multiple';
  isOptional: boolean;
  isMultiple: boolean;
  defaultValue?: string;
  conditionalDependencies?: string[];
}

export interface FormData {
  [key: string]: string | number | Date | string[];
}

export interface ConditionalGroup {
  groupName: string;
  options: string[];
  dependentFields: string[];
}

export interface BulkItem {
  id: string;
  filePath: string;
  fileName: string;
  displayName?: string;  // Custom display name for tabs (defaults to fileName if not set)
  fields: Record<string, any>;  // Original PDF data
  editedFields?: Record<string, any>;  // User-edited form data
  status: 'ok' | 'warning' | 'error';
  issues?: string[];
  include: boolean;
}

export interface BulkModeState {
  isActive: boolean;
  items: BulkItem[];
  selectedItemId: string | null;
  isProcessing: boolean;
  progress: number;
  issues?: string[];
}

export interface FieldRect {
  pageIndex: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FieldInfo {
  key: string;
  rect: FieldRect;
}

export interface AnchorTokenOptions {
  font?: string;
  size?: number;
  opacity?: number;
}

export interface TextSpan {
  text: string;
  conf?: number;  // 0..100 for OCR, undefined for text layer
  x: number;      // PDF user units (points, 72/in)
  y: number;      // PDF user units (points, 72/in)
  w: number;      // PDF user units (points, 72/in)
  h: number;      // PDF user units (points, 72/in)
  page: number;   // 0-based
}

export interface AppState {
  currentPage: 'upload' | 'form' | 'bulk';
  placeholders: PlaceholderField[];
  conditionalOptions: ConditionalGroup[];
  formData: FormData;
  bulkModeState: BulkModeState;
  isProcessing: boolean;
  template: any | null;
  error: string | null;
  importedPdfName: string | null;
}