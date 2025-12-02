import { BulkItem, BulkModeState, PlaceholderField } from '../types.js';
import { parseCompletedPDFFormFromBuffer } from './docxProcessor.js';
import { AnchorTokenImporter } from './anchorTokenImporter.js';

export class BulkModeManager {
  private state: BulkModeState = {
    isActive: false,
    items: [],
    selectedItemId: null,
    isProcessing: false,
    progress: 0
  };

  private onStateChange: (state: BulkModeState) => void;
  private templatePlaceholders: any[] = [];
  private selectedDirHandle: any = null;
  private templateName: string = 'document';

  constructor(onStateChange: (state: BulkModeState) => void) {
    this.onStateChange = onStateChange;
  }

  getState(): BulkModeState {
    return this.state;
  }

  // Method to update the display name of a bulk item
  updateItemDisplayName(itemId: string, displayName: string): void {
    const item = this.state.items.find(item => item.id === itemId);
    if (item) {
      item.displayName = displayName;
      this.onStateChange(this.state);
    }
  }

  // Method to add a new item to bulk mode
  addItem(item: BulkItem): void {
    this.state.items.push(item);
    this.onStateChange(this.state);
  }

  setTemplatePlaceholders(placeholders: any[]): void {
    this.templatePlaceholders = placeholders;
    console.log('BulkModeManager: Set template placeholders:', placeholders.map(p => p.key));
  }

  setTemplateName(templateName: string): void {
    this.templateName = templateName.replace(/\.docx$/i, '');
    console.log('BulkModeManager: Set template name:', this.templateName);
  }

  private isRemoteAccess(): boolean {
    // Check if the app is being accessed remotely (not localhost)
    return window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
  }

  private async selectMultipleFiles(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Create a file input for multiple file selection
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.multiple = true;
      fileInput.accept = '.pdf';
      fileInput.style.display = 'none';
      
      // Add to DOM first
      document.body.appendChild(fileInput);
      
      fileInput.addEventListener('change', async (e) => {
        const files = (e.target as HTMLInputElement).files;
        if (files && files.length > 0) {
          try {
            console.log(`Selected ${files.length} PDF files for network user bulk mode`);
            this.state.isActive = true;
            this.state.isProcessing = true;
            this.state.progress = 0;
            this.state.items = [];
            this.state.selectedItemId = null;
            this.onStateChange(this.state);

            // Process the selected files
            await this.processFiles(Array.from(files));
            resolve();
          } catch (error) {
            reject(error);
          }
        } else {
          reject(new Error('No files selected'));
        }
        
        // Clean up after processing
        if (fileInput.parentNode) {
          fileInput.parentNode.removeChild(fileInput);
        }
      });
      
      // Trigger the file selection dialog immediately
      fileInput.click();
    });
  }

  async selectFolder(): Promise<void> {
    try {
      console.log('Starting folder selection...');
      
      // Check if this is remote access
      if (this.isRemoteAccess()) {
        // For remote access, use multiple file selection as fallback
        await this.selectMultipleFiles();
        return;
      }
      
      // Check if showDirectoryPicker is available
      if (!(window as any).showDirectoryPicker) {
        throw new Error('Directory picker not supported in this browser. Please use Chrome or Edge.');
      }
      
      // Use File System Access API to select a directory
      // @ts-ignore - showDirectoryPicker is experimental
      const dirHandle = await (window as any).showDirectoryPicker({
        mode: 'read'
      });
      
      if (!dirHandle) {
        throw new Error('No folder selected');
      }

      console.log('Folder selected successfully:', dirHandle.name);
      
      // Store the directory handle for later use in downloads
      this.selectedDirHandle = dirHandle;
      
      this.state.isActive = true;
      this.state.isProcessing = true;
      this.state.progress = 0;
      this.state.items = [];
      this.state.selectedItemId = null;
      this.onStateChange(this.state);

      await this.processFolder(dirHandle);
    } catch (error) {
      console.error('Error selecting folder:', error);
      if (error instanceof Error && error.message.includes('not supported')) {
        throw new Error('Directory picker not supported. Please use Chrome or Edge browser.');
      }
      throw new Error(`Failed to select folder: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async processFolder(dirHandle: any): Promise<void> {
    const items: BulkItem[] = [];
    let processedCount = 0;
    let totalFiles = 0;

    try {
      // First pass: count total PDF files
      // @ts-ignore
      for await (const [name, handle] of dirHandle.entries()) {
        if (handle.kind === 'file' && name.toLowerCase().endsWith('.pdf')) {
          totalFiles++;
        }
      }

      if (totalFiles === 0) {
        console.log('No PDF files found in the selected folder');
        this.state.isProcessing = false;
        this.state.progress = 100;
        this.onStateChange(this.state);
        return;
      }

      console.log(`Found ${totalFiles} PDF files for bulk processing`);

      // Second pass: process files
      // @ts-ignore
      for await (const [name, handle] of dirHandle.entries()) {
        console.log(`Found entry: ${name} kind: ${handle.kind}`);
        if (handle.kind === 'file' && name.toLowerCase().endsWith('.pdf')) {
          console.log(`Processing PDF file: ${name}`);
          const item: BulkItem = {
            id: crypto.randomUUID(),
            filePath: name,
            fileName: name,
            displayName: name.replace(/\.pdf$/i, ''), // Set initial display name
            fields: {},
            status: 'ok',
            issues: [],
            include: true
          };

          try {
            // Read the PDF file
            const file = await handle.getFile();
            if (!file) {
              throw new Error('Could not read file');
            }
            const fileBuffer = await file.arrayBuffer();
            
            // Use comprehensive PDF processing that handles both flattened and unflattened PDFs
            const importer = new AnchorTokenImporter();
            const parsedData = await importer.importFromPDF(fileBuffer, undefined, this.templatePlaceholders);
            
            if (parsedData && Object.keys(parsedData).length > 0) {
              item.fields = parsedData;
              item.status = 'ok';
              console.log(`Successfully processed ${name}: ${Object.keys(parsedData).length} fields`);
            } else {
              item.status = 'warning';
              item.issues = ['No data extracted from PDF'];
            }
          } catch (error) {
            item.status = 'error';
            item.issues = [`Failed to parse PDF: ${error instanceof Error ? error.message : 'Unknown error'}`];
            item.include = false;
            console.error(`Error processing ${name}:`, error);
          }

          items.push(item);
          processedCount++;
          this.state.progress = (processedCount / totalFiles) * 100;
          this.state.items = [...items]; // Create a copy to avoid reference issues
          this.onStateChange(this.state);
        }
      }

      this.state.items = items;
      this.state.isProcessing = false;
      this.state.progress = 100;
      
      console.log(`Successfully processed ${items.length} PDF files for bulk processing`);
      this.onStateChange(this.state);
    } catch (error) {
      console.error('Error processing folder:', error);
      this.state.isProcessing = false;
      this.state.issues = [`Failed to process folder: ${error instanceof Error ? error.message : 'Unknown error'}`];
      this.onStateChange(this.state);
    }
  }

  private async processFiles(files: File[]): Promise<void> {
    const items: BulkItem[] = [];
    let processedCount = 0;

    try {
      console.log(`Processing ${files.length} files`);
      
      // Process each file
      for (const file of files) {
        console.log(`Processing PDF file: ${file.name}`);
        const item: BulkItem = {
          id: crypto.randomUUID(),
          filePath: file.name,
          fileName: file.name,
          displayName: file.name.replace(/\.pdf$/i, ''), // Set initial display name
          fields: {},
          status: 'ok',
          issues: [],
          include: true
        };

        try {
          // Read the PDF file
          const fileBuffer = await file.arrayBuffer();
          
          // Use comprehensive PDF processing that handles both flattened and unflattened PDFs
          const importer = new AnchorTokenImporter();
          const parsedData = await importer.importFromPDF(fileBuffer, undefined, this.templatePlaceholders);
          
          if (parsedData && Object.keys(parsedData).length > 0) {
            item.fields = parsedData;
            item.status = 'ok';
            console.log(`Successfully processed ${file.name}: ${Object.keys(parsedData).length} fields`);
          } else {
            item.status = 'warning';
            item.issues = ['No data extracted from PDF'];
          }
        } catch (error) {
          item.status = 'error';
          item.issues = [`Failed to parse PDF: ${error instanceof Error ? error.message : 'Unknown error'}`];
          item.include = false;
          console.error(`Error processing ${file.name}:`, error);
        }

        items.push(item);
        processedCount++;
        this.state.progress = (processedCount / files.length) * 100;
        this.state.items = [...items]; // Create a copy to avoid reference issues
        this.onStateChange(this.state);
      }

      this.state.items = items;
      this.state.isProcessing = false;
      this.state.progress = 100;
      
      if (items.length === 0) {
        console.log('No PDF files found in the selected files');
      } else {
        console.log(`Successfully processed ${items.length} PDF files for bulk processing`);
      }
      
      this.onStateChange(this.state);
    } catch (error) {
      console.error('Error processing files:', error);
      this.state.isProcessing = false;
      this.state.issues = [`Failed to process files: ${error instanceof Error ? error.message : 'Unknown error'}`];
      this.onStateChange(this.state);
    }
  }

  selectItem(itemId: string): void {
    this.state.selectedItemId = itemId;
    this.onStateChange(this.state);
  }

  toggleItemInclude(itemId: string): void {
    const item = this.state.items.find(item => item.id === itemId);
    if (item) {
      item.include = !item.include;
      this.onStateChange(this.state);
    }
  }

  getSelectedItem(): BulkItem | null {
    if (!this.state.selectedItemId) return null;
    return this.state.items.find(item => item.id === this.state.selectedItemId) || null;
  }

  getIncludedItems(): BulkItem[] {
    return this.state.items.filter(item => item.include);
  }

  clearBulkMode(): void {
    this.state = {
      isActive: false,
      items: [],
      selectedItemId: null,
      isProcessing: false,
      progress: 0
    };
    this.selectedDirHandle = null;
    this.onStateChange(this.state);
  }

  getSelectedDirHandle(): any {
    return this.selectedDirHandle;
  }

  // Update the edited fields for a specific item
  updateItemEditedFields(itemId: string, editedFields: Record<string, any>): void {
    const item = this.state.items.find(item => item.id === itemId);
    if (item) {
      item.editedFields = { ...editedFields };
      console.log(`Updated edited fields for ${item.fileName}:`, editedFields);
      this.onStateChange(this.state);
    }
  }

  // Get the effective fields for an item (edited if available, otherwise original)
  getItemEffectiveFields(itemId: string): Record<string, any> {
    const item = this.state.items.find(item => item.id === itemId);
    if (!item) return {};
    
    // Merge edited fields with original fields - edited fields override original, but all original fields are preserved
    if (item.editedFields && Object.keys(item.editedFields).length > 0) {
      return { ...item.fields, ...item.editedFields };
    }
    
    // Return original fields if no edits
    return item.fields;
  }

  // Remove an item from the bulk mode state
  removeItem(itemId: string): void {
    const initialLength = this.state.items.length;
    this.state.items = this.state.items.filter(item => item.id !== itemId);
    
    // If we removed the selected item, clear the selection
    if (this.state.selectedItemId === itemId) {
      this.state.selectedItemId = null;
    }
    
    console.log(`Removed item ${itemId}. Items: ${initialLength} -> ${this.state.items.length}`);
    this.onStateChange(this.state);
  }

  // Clear the entire bulk mode state
  clearState(): void {
    this.state = {
      isActive: false,
      items: [],
      selectedItemId: null,
      isProcessing: false,
      progress: 0
    };
    this.selectedDirHandle = null;
    console.log('BulkModeManager state cleared');
    this.onStateChange(this.state);
  }

  generateFileName(originalFileName: string, index: number, itemId?: string): string {
    // Get current date in YYMMDD format
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const datePrefix = `${year}${month}${day}`;

    // Use display name (tab name) from the item
    let tabName = originalFileName.replace(/\.pdf$/i, '');
    if (itemId) {
      const item = this.state.items.find(item => item.id === itemId);
      if (item) {
        // displayName is the tab name (can be edited by user)
        tabName = item.displayName || item.fileName.replace(/\.pdf$/i, '');
      }
    }

    // Create filename: YYMMDD [Template Name] - [Tab Name]
    // Example: 251021 SAFE - Post Money MFN only - Bob Bobberton
    return `${datePrefix} ${this.templateName} - ${tabName}`;
  }
}
