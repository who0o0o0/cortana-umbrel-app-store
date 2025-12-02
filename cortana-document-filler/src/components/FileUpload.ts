import { PlaceholderField, ConditionalGroup } from '../types.js';
import { extractPlaceholders, extractConditionalOptions } from '../utils/placeholderParser.js';
import { extractTextFromDocx } from '../utils/docxProcessor.js';
import { getDirectoryHandle, saveDirectoryHandle, verifyDirPermission } from '../utils/storage.js';
import { umbrelApi, UmbrelFile } from '../utils/umbrelApi.js';

export class FileUpload {
  private container: HTMLElement;
  private onFileProcessed: (placeholders: PlaceholderField[], conditionalOptions: ConditionalGroup[], file: File) => void;
  private onError: (error: string) => void;
  private directoryHandle: any | null = null;
  private folderFiles: File[] = [];
  private searchValue = '';
  private folderStructure: Map<string, File[]> = new Map();
  private umbrelFiles: UmbrelFile[] = [];
  private isUmbrelMode = false;

  constructor(
    container: HTMLElement,
    onFileProcessed: (placeholders: PlaceholderField[], conditionalOptions: ConditionalGroup[], file: File) => void,
    onError: (error: string) => void
  ) {
    this.container = container;
    this.onFileProcessed = onFileProcessed;
    this.onError = onError;
    this.render();
    // Attempt auto-load of previously allowed templates folder
    // this.autoLoadFolder(); // Disabled to prevent showing old documents
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="upload-container" style="background: white;">
        <div class="form-container" style="margin-bottom:0;">
          <div class="form-header" style="margin-bottom:0;">
            <h3 style="margin-bottom:0;">Find Template</h3>
          </div>
          <div class="search-container">
            <input id="template-search" class="form-input search-input" type="text" placeholder="Start typing to search templates..." autocomplete="off" />
            <div id="search-suggestions" class="search-suggestions" style="display:none;"></div>
          </div>
        </div>
        <div class="folder-dropdown-container" style="margin-bottom: 0; margin-top: -4rem;">
          <div class="form-container" style="margin-bottom: 0;">
            <div class="form-header" style="margin-bottom: 0;">
              <h3 style="margin-bottom: 0;">Browse by Folder</h3>
            </div>
            <div class="folder-dropdown-wrapper">
              <div class="custom-dropdown-container">
                <button id="folder-dropdown-button" class="custom-dropdown-button" type="button">
                  <span class="custom-dropdown-text" style="color: var(--text-secondary);">Select a folder...</span>
                  <svg class="custom-dropdown-arrow" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M6 8l4 4 4-4"/>
                  </svg>
                </button>
                <div id="folder-dropdown-list" class="custom-dropdown-list" style="display: none;">
                  <div class="custom-dropdown-content"></div>
                </div>
              </div>
              <div id="folder-documents" class="folder-documents" style="display: none;">
                <div class="folder-documents-header">
                  <h4>Documents in this folder:</h4>
                </div>
                <div class="folder-documents-list"></div>
              </div>
            </div>
          </div>
        </div>
        <div class="form-actions" style="justify-content:center; margin-bottom:2rem; margin-top:-2rem; gap: 1rem;">
          <button type="button" class="btn btn-secondary" id="choose-folder">Choose Templates Folder</button>
          <button type="button" class="btn btn-secondary" id="umbrel-connect">☂️ Connect to Umbrel</button>
          <button type="button" class="btn btn-secondary" id="upload-area">
            <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7,10 12,15 17,10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Upload Template
          </button>
        </div>
        <input type="file" id="file-input" accept=".docx" style="display: none;">
      </div>
    `;

    this.setupEventListeners();

    // Check if Umbrel is already connected and update button styling
    this.updateUmbrelButtonStyle();
    
  }


  private selectMultipleFiles(): void {
    console.log('selectMultipleFiles called');
    
    // Check if we're in a remote context (network access)
    const isRemoteAccess = window.location.hostname !== 'localhost' && 
                          window.location.hostname !== '127.0.0.1';
    
    if (isRemoteAccess) {
      console.log('Remote access detected, showing folder upload options');
      this.showFolderUploadOptions();
      return;
    }
    
    // Use the existing file input but modify it for multiple selection
    const existingFileInput = this.container.querySelector('#file-input') as HTMLInputElement;
    console.log('Existing file input found:', !!existingFileInput);
    
    if (existingFileInput) {
      // Store original values
      const originalMultiple = existingFileInput.multiple;
      const originalAccept = existingFileInput.accept;
      
      console.log('Original values:', { multiple: originalMultiple, accept: originalAccept });
      
      // Set for multiple file selection
      existingFileInput.multiple = true;
      existingFileInput.accept = '.docx';
      
      console.log('Set multiple file selection:', { multiple: existingFileInput.multiple, accept: existingFileInput.accept });
      
      // Add a one-time event listener for multiple files
      const handleMultipleFiles = async (e: Event) => {
        const files = (e.target as HTMLInputElement).files;
        console.log('File selection event triggered, files:', files?.length || 0);
        
        if (files && files.length > 0) {
          console.log(`Selected ${files.length} files`);
          // Convert FileList to array and store as folder files
          this.folderFiles = Array.from(files);
          // For multiple file selection, we don't have a directory handle
          // Just populate the folder dropdown with the selected files
          this.populateFolderDropdownForFiles();
        }
        
        // Restore original values
        existingFileInput.multiple = originalMultiple;
        existingFileInput.accept = originalAccept;
        
        // Remove this event listener
        existingFileInput.removeEventListener('change', handleMultipleFiles);
      };
      
      existingFileInput.addEventListener('change', handleMultipleFiles);
      console.log('About to trigger file input click');
      existingFileInput.click();
    } else {
      console.log('No existing file input found, using fallback');
      // Fallback: create a new input if the existing one isn't found
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.multiple = true;
      fileInput.accept = '.docx';
      fileInput.style.display = 'none';
      
      fileInput.addEventListener('change', async (e) => {
        const files = (e.target as HTMLInputElement).files;
        console.log('Fallback file selection event triggered, files:', files?.length || 0);
        
        if (files && files.length > 0) {
          console.log(`Selected ${files.length} files (fallback)`);
          this.folderFiles = Array.from(files);
          // For multiple file selection, we don't have a directory handle
          // Just populate the folder dropdown with the selected files
          this.populateFolderDropdownForFiles();
        }
        // Clean up
        if (fileInput.parentNode) {
          fileInput.parentNode.removeChild(fileInput);
        }
      });
      
      document.body.appendChild(fileInput);
      console.log('About to trigger fallback file input click');
      fileInput.click();
    }
  }

  private showFolderUploadOptions(): void {
    // Create a modal or overlay to show folder upload options
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
    `;
    
    const content = document.createElement('div');
    content.style.cssText = `
      background: white;
      padding: 30px;
      border-radius: 12px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
      max-width: 500px;
      width: 90%;
      text-align: center;
    `;
    
    content.innerHTML = `
      <h3 style="margin: 0 0 20px 0; color: #333; font-size: 24px;">Upload Folder for Bulk Mode</h3>
      <p style="margin: 0 0 30px 0; color: #666; line-height: 1.5;">
        Since you're accessing this app over the network, you can upload multiple files at once for bulk processing.
        Select all the PDF files you want to process together.
      </p>
      <div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
        <button id="upload-pdfs-btn" style="
          background: #007AFF;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 16px;
          cursor: pointer;
          transition: background 0.2s;
        ">Upload PDF Files</button>
        <button id="upload-docx-btn" style="
          background: #34C759;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 16px;
          cursor: pointer;
          transition: background 0.2s;
        ">Upload DOCX Files</button>
        <button id="cancel-upload-btn" style="
          background: #8E8E93;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 16px;
          cursor: pointer;
          transition: background 0.2s;
        ">Cancel</button>
      </div>
    `;
    
    modal.appendChild(content);
    document.body.appendChild(modal);
    
    // Add event listeners
    const pdfBtn = content.querySelector('#upload-pdfs-btn') as HTMLButtonElement;
    const docxBtn = content.querySelector('#upload-docx-btn') as HTMLButtonElement;
    const cancelBtn = content.querySelector('#cancel-upload-btn') as HTMLButtonElement;
    
    pdfBtn.addEventListener('click', () => {
      document.body.removeChild(modal);
      this.uploadMultipleFiles('.pdf');
    });
    
    docxBtn.addEventListener('click', () => {
      document.body.removeChild(modal);
      this.uploadMultipleFiles('.docx');
    });
    
    cancelBtn.addEventListener('click', () => {
      document.body.removeChild(modal);
    });
    
    // Close on background click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    });
  }

  private uploadMultipleFiles(acceptType: string): void {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.multiple = true;
    fileInput.accept = acceptType;
    fileInput.style.display = 'none';
    
    fileInput.addEventListener('change', async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length > 0) {
        console.log(`Selected ${files.length} ${acceptType} files for bulk processing`);
        
        if (acceptType === '.pdf') {
          // For PDFs, trigger bulk mode
          await this.handleBulkModeUpload(Array.from(files));
        } else {
          // For DOCX files, use regular folder processing
          this.folderFiles = Array.from(files);
          this.populateFolderDropdownForFiles();
        }
      }
      
      // Clean up
      if (fileInput.parentNode) {
        fileInput.parentNode.removeChild(fileInput);
      }
    });
    
    document.body.appendChild(fileInput);
    fileInput.click();
  }

  private async handleBulkModeUpload(files: File[]): Promise<void> {
    try {
      // Create a temporary folder structure
      const folderName = `bulk_upload_${Date.now()}`;
      const formData = new FormData();
      
      // Add folder metadata
      formData.append('folderName', folderName);
      formData.append('fileList', JSON.stringify(files.map(f => ({ name: f.name, size: f.size }))));
      
      // Add all files
      files.forEach(file => {
        formData.append(file.name, file);
      });
      
      // Upload to server
      const response = await fetch('/api/upload-folder', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }
      
      const result = await response.json();
      console.log('Bulk upload result:', result);
      
      // Trigger bulk mode with the uploaded files
      this.triggerBulkMode(files);
      
    } catch (error) {
      console.error('Bulk upload error:', error);
      this.onError(`Failed to upload files: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private triggerBulkMode(files: File[]): void {
    // Dispatch a custom event to trigger bulk mode
    const event = new CustomEvent('triggerBulkMode', {
      detail: { files }
    });
    this.container.dispatchEvent(event);
  }

  private setupEventListeners(): void {
    const uploadArea = this.container.querySelector('#upload-area') as HTMLElement;
    const fileInput = this.container.querySelector('#file-input') as HTMLInputElement;
    const chooseFolderBtn = this.container.querySelector('#choose-folder') as HTMLButtonElement;
    const umbrelConnectBtn = this.container.querySelector('#umbrel-connect') as HTMLButtonElement;
    const searchInput = this.container.querySelector('#template-search') as HTMLInputElement;
    const suggestions = this.container.querySelector('#search-suggestions') as HTMLElement;
    const folderDropdownButton = this.container.querySelector('#folder-dropdown-button') as HTMLButtonElement;
    const folderDropdownList = this.container.querySelector('#folder-dropdown-list') as HTMLElement;
    
    console.log('Setting up event listeners:', {
      uploadArea: !!uploadArea,
      fileInput: !!fileInput,
      chooseFolderBtn: !!chooseFolderBtn,
      searchInput: !!searchInput,
      suggestions: !!suggestions,
      folderDropdownButton: !!folderDropdownButton,
      folderDropdownList: !!folderDropdownList
    });

    // Click to upload
    uploadArea.addEventListener('click', () => {
      console.log('Upload area clicked, triggering file input');
      fileInput.click();
    });


    // Search handlers
    const update = () => this.updateSuggestions();
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        this.searchValue = searchInput.value;
        update();
      });
      searchInput.addEventListener('focus', update);
    }
    document.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).closest('.search-container') && suggestions) {
        suggestions.style.display = 'none';
      }
    });

    // Folder dropdown handler - custom dropdown
    if (folderDropdownButton && folderDropdownList) {
      folderDropdownButton.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // Check if there are any folders available
        const hasLocalFolders = this.folderStructure && this.folderStructure.size > 0;
        const hasUmbrelFolders = this.isUmbrelMode && this.umbrelFiles && this.umbrelFiles.length > 0;
        
        // Also check if dropdown content has items
        const dropdownContent = folderDropdownList.querySelector('.custom-dropdown-content') as HTMLElement;
        const hasDropdownItems = dropdownContent && dropdownContent.querySelectorAll('.custom-dropdown-item').length > 0;
        
        // Only show dropdown if there are folders available and dropdown has items
        if ((!hasLocalFolders && !hasUmbrelFolders) || !hasDropdownItems) {
          return; // Don't show dropdown if no folders are available
        }
        
        const isVisible = folderDropdownList.style.display !== 'none';
        folderDropdownList.style.display = isVisible ? 'none' : 'block';
      });

      // Close dropdown when clicking outside
      document.addEventListener('click', (e) => {
        if (!(e.target as HTMLElement).closest('.custom-dropdown-container') && folderDropdownList) {
          folderDropdownList.style.display = 'none';
        }
      });
    }


    // File input change
    fileInput.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      console.log('File input changed, files:', target.files);
      if (target.files && target.files[0]) {
        console.log('Processing file:', target.files[0].name);
        this.handleFile(target.files[0]);
      }
    });

    // Drag and drop
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('drag-over');
    });

    uploadArea.addEventListener('dragleave', () => {
      uploadArea.classList.remove('drag-over');
    });

    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('drag-over');
      
      const files = e.dataTransfer?.files;
      if (files && files[0]) {
        this.handleFile(files[0]);
      }
    });

    // Choose directory
    if (!chooseFolderBtn) {
      console.error('Choose folder button not found!');
      return;
    }
    
    chooseFolderBtn.addEventListener('click', async () => {
      console.log('Choose folder button clicked!');
      try {
        // Check if showDirectoryPicker is available
        if (!(window as any).showDirectoryPicker) {
          console.log('Directory picker not available, using multiple file selection fallback');
          this.selectMultipleFiles();
          return;
        }

        // @ts-ignore - showDirectoryPicker is experimental
        const dirHandle = await (window as any).showDirectoryPicker?.();
        if (!dirHandle) {
          console.log('Directory picker was cancelled, using multiple file selection fallback');
          this.selectMultipleFiles();
          return;
        }
        this.directoryHandle = dirHandle;
        await saveDirectoryHandle('templates', dirHandle);
        await this.loadFolderFiles();
      } catch (err) {
        console.log('Directory picker error, falling back to multiple file selection:', err);
        // Fall back to multiple file selection instead of showing error
        this.selectMultipleFiles();
      }
    });

    // Umbrel connection button
    if (!umbrelConnectBtn) {
      console.error('Umbrel connect button not found!');
      return;
    }
    
    umbrelConnectBtn.addEventListener('click', async () => {
      console.log('Umbrel connect button clicked!');
      await this.connectToUmbrel();
    });

    // Update Umbrel button styling based on connection status
    this.updateUmbrelButtonStyle();

    // Hover effects for choose folder button
    chooseFolderBtn.addEventListener('mouseenter', () => {
      chooseFolderBtn.style.background = 'var(--apple-gray)';
      chooseFolderBtn.style.borderColor = '#6b7280';
      chooseFolderBtn.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.2)';
    });

    chooseFolderBtn.addEventListener('mouseleave', () => {
      chooseFolderBtn.style.background = 'var(--primary-bg)';
      chooseFolderBtn.style.borderColor = 'var(--border-color)';
      chooseFolderBtn.style.boxShadow = 'none';
    });
  }

  private async handleFile(file: File): Promise<void> {
    const isDocx = file.name.toLowerCase().endsWith('.docx');
    const isPdf = file.name.toLowerCase().endsWith('.pdf');
    
    if (!isDocx && !isPdf) {
      this.onError('Please select a valid .docx file.');
      return;
    }

    if (isPdf) {
      this.onError('PDF files can only be used for importing field data. Please use a .docx file for document generation.');
      return;
    }

    try {
      // Show loading state
      this.showLoading();

      // Only process DOCX files
      const textContent = await extractTextFromDocx(file);
      
      // Extract placeholders
      const placeholders = extractPlaceholders(textContent);
      
      // Extract conditional options
      const conditionalOptions = extractConditionalOptions(textContent);
      console.log('Detected conditional options:', conditionalOptions);
      
      if (placeholders.length === 0) {
        this.onError('No placeholders found in the document. Please add placeholders using the format {{placeholder_name}}.');
        return;
      }

      this.onFileProcessed(placeholders, conditionalOptions, file);
    } catch (error) {
      this.onError(error instanceof Error ? error.message : 'Failed to process the document.');
    }
  }

  private showLoading(): void {
    const uploadArea = this.container.querySelector('#upload-area') as HTMLElement;
    uploadArea.innerHTML = `
      <div class="upload-content">
        <div class="loading-spinner"></div>
        <h3>Processing Document...</h3>
        <p>Extracting placeholders and analyzing template</p>
      </div>
    `;
  }

  private async autoLoadFolder(): Promise<void> {
    try {
      const handle = await getDirectoryHandle('templates');
      if (!handle) return;
      const ok = await verifyDirPermission(handle as any);
      if (!ok) return;
      this.directoryHandle = handle as any;
      await this.loadFolderFiles();
    } catch {
      // ignore
    }
  }


  private isJunkFile(fileName: string): boolean {
    const junkPatterns = [
      '.DS_Store',
      '._*',
      '.Spotlight-V100',
      '.Trashes',
      'Thumbs.db',
      'desktop.ini',
      '.fseventsd',
      '.TemporaryItems',
      '.VolumeIcon.icns',
      '.apdisk'
    ];
    
    return junkPatterns.some(pattern => {
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace('*', '.*'));
        return regex.test(fileName);
      }
      return fileName === pattern;
    });
  }

  private async loadFolderFiles(): Promise<void> {
    this.folderFiles = [];
    this.folderStructure.clear();
    if (!this.directoryHandle) return;
    
    console.log('Loading folder files from:', this.directoryHandle.name);
    
    // Iterate entries
    // @ts-ignore
    for await (const [name, handle] of (this.directoryHandle as any).entries()) {
      console.log('Found entry:', name, 'kind:', handle.kind);
      
      // Skip junk files
      if (this.isJunkFile(name)) {
        console.log('  Skipped junk file:', name);
        continue;
      }
      
      if (handle.kind === 'directory') {
        console.log('Processing directory:', name);
        // This is a folder, get all .docx files in it
        const folderFiles: File[] = [];
        // @ts-ignore
        for await (const [fileName, fileHandle] of (handle as any).entries()) {
          console.log('  Found file in', name, ':', fileName, 'kind:', fileHandle.kind);
          
          // Skip junk files
          if (this.isJunkFile(fileName)) {
            console.log('    Skipped junk file:', fileName);
            continue;
          }
          
          if (fileHandle.kind === 'file' && fileName.toLowerCase().endsWith('.docx')) {
            const file = await fileHandle.getFile();
            folderFiles.push(file as File);
            this.folderFiles.push(file as File);
            console.log('  Added file:', fileName);
          }
        }
        // Only add folder to structure if it has .docx files
        if (folderFiles.length > 0) {
          this.folderStructure.set(name, folderFiles);
          console.log('Added folder to structure:', name, 'with', folderFiles.length, 'files');
        } else {
          console.log('Skipped empty folder:', name);
        }
      } else if (handle.kind === 'file' && name.toLowerCase().endsWith('.docx')) {
        console.log('Found .docx file in root:', name);
        // This is a .docx file in the root directory
        const file = await handle.getFile();
        this.folderFiles.push(file as File);
        // Add to a "Root" folder
        if (!this.folderStructure.has('Root')) {
          this.folderStructure.set('Root', []);
        }
        this.folderStructure.get('Root')!.push(file as File);
      }
    }
    
    console.log('Final folder structure:', Array.from(this.folderStructure.keys()));
    console.log('Total files found:', this.folderFiles.length);
    
    // Populate the dropdown
    this.populateFolderDropdown();
  }

  private populateFolderDropdown(): void {
    const dropdownList = this.container.querySelector('#folder-dropdown-list') as HTMLElement;
    const dropdownContent = dropdownList?.querySelector('.custom-dropdown-content') as HTMLElement;
    const dropdownText = this.container.querySelector('.custom-dropdown-text') as HTMLElement;
    if (!dropdownContent || !dropdownText) return;

    // Clear existing options
    dropdownContent.innerHTML = '';

    // Reset button text to placeholder
    dropdownText.textContent = 'Select a folder...';
    dropdownText.style.color = 'var(--text-secondary)';

    // Add folder options
    const sortedFolders = Array.from(this.folderStructure.keys()).sort();
    sortedFolders.forEach(folderName => {
      const option = document.createElement('div');
      option.className = 'custom-dropdown-item';
      option.textContent = `${folderName} (${this.folderStructure.get(folderName)!.length} docs)`;
      option.setAttribute('data-value', folderName);
      dropdownContent.appendChild(option);
    });

    // Add click handlers for each option
    dropdownContent.querySelectorAll('.custom-dropdown-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const folderName = (e.currentTarget as HTMLElement).getAttribute('data-value') || '';
        const buttonText = this.container.querySelector('.custom-dropdown-text') as HTMLElement;
        const dropdownListEl = this.container.querySelector('#folder-dropdown-list') as HTMLElement;
        
        if (buttonText) {
          buttonText.textContent = (e.currentTarget as HTMLElement).textContent || '';
          buttonText.style.color = 'var(--text-primary)';
        }
        
        if (dropdownListEl) {
          dropdownListEl.style.display = 'none';
        }
        
        this.showFolderDocuments(folderName);
      });
    });
  }

  private populateFolderDropdownForFiles(): void {
    const dropdownList = this.container.querySelector('#folder-dropdown-list') as HTMLElement;
    const dropdownContent = dropdownList?.querySelector('.custom-dropdown-content') as HTMLElement;
    const dropdownText = this.container.querySelector('.custom-dropdown-text') as HTMLElement;
    if (!dropdownContent || !dropdownText) return;

    // Clear existing options
    dropdownContent.innerHTML = '';
    
    // Reset button text to placeholder
    dropdownText.textContent = 'Select a folder...';
    dropdownText.style.color = 'var(--text-secondary)';

    // For multiple file selection, put all files in a "Selected Files" folder
    if (this.folderFiles.length > 0) {
      // Add to folder structure for consistency
      this.folderStructure.set('Selected Files', this.folderFiles);
      
      const option = document.createElement('div');
      option.className = 'custom-dropdown-item';
      option.textContent = `Selected Files (${this.folderFiles.length} docs)`;
      option.setAttribute('data-value', 'Selected Files');
      dropdownContent.appendChild(option);
      
      // Add click handler
      option.addEventListener('click', (e) => {
        const folderName = (e.currentTarget as HTMLElement).getAttribute('data-value') || '';
        const buttonText = this.container.querySelector('.custom-dropdown-text') as HTMLElement;
        const dropdownListEl = this.container.querySelector('#folder-dropdown-list') as HTMLElement;
        
        if (buttonText) {
          buttonText.textContent = (e.currentTarget as HTMLElement).textContent || '';
          buttonText.style.color = 'var(--text-primary)';
        }
        
        if (dropdownListEl) {
          dropdownListEl.style.display = 'none';
        }
        
        this.showFolderDocuments(folderName);
      });
    }
  }

  private showFolderDocuments(folderName: string): void {
    const documentsContainer = this.container.querySelector('#folder-documents') as HTMLElement;
    const documentsList = this.container.querySelector('.folder-documents-list') as HTMLElement;
    
    if (!documentsContainer || !documentsList) return;

    if (this.isUmbrelMode) {
      // Handle Umbrel files
      if (!folderName) {
        documentsContainer.style.display = 'none';
        return;
      }

      const files = this.umbrelFiles.filter(file => {
        const pathParts = file.path.split('/');
        const fileFolderName = pathParts[pathParts.length - 2] || 'Root';
        return fileFolderName === folderName;
      });

      if (files.length === 0) {
        documentsContainer.style.display = 'none';
        return;
      }

      documentsList.innerHTML = files
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((file, index) => `
          <div class="document-item" style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 0.5rem; background: var(--primary-bg);">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span style="font-size: 1.2rem;">☁️</span>
              <span style="font-weight: 500; color: var(--text-primary);">${file.name}</span>
            </div>
            <button type="button" class="btn btn-primary" data-umbrel-file="${file.path}" style="padding: 0.5rem 1rem; font-size: 0.875rem;">
              Use Template
            </button>
          </div>
        `)
        .join('');

      // Add event listeners to the Umbrel buttons
      documentsList.querySelectorAll('button[data-umbrel-file]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const target = e.currentTarget as HTMLButtonElement;
          const filePath = target.getAttribute('data-umbrel-file');
          const file = this.umbrelFiles.find(f => f.path === filePath);
          if (file) await this.loadUmbrelFile(file);
        });
      });

    } else {
      // Handle local files
      if (!folderName || !this.folderStructure.has(folderName)) {
        documentsContainer.style.display = 'none';
        return;
      }

      const files = this.folderStructure.get(folderName)!;
      documentsList.innerHTML = files
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((file, index) => `
          <div class="document-item" style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 0.5rem; background: var(--primary-bg);">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span style="font-size: 1.2rem;">📄</span>
              <span style="font-weight: 500; color: var(--text-primary);">${file.name}</span>
            </div>
            <button type="button" class="btn btn-primary" data-file-index="${this.folderFiles.indexOf(file)}" style="padding: 0.5rem 1rem; font-size: 0.875rem;">
              Use Template
            </button>
          </div>
        `)
        .join('');

      // Add event listeners to the local file buttons
      documentsList.querySelectorAll('button[data-file-index]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const target = e.currentTarget as HTMLButtonElement;
          const index = Number(target.getAttribute('data-file-index'));
          const file = this.folderFiles[index];
          if (file) await this.handleFile(file);
        });
      });
    }

    documentsContainer.style.display = 'block';
  }

  private updateSuggestions(): void {
    const query = this.searchValue.trim().toLowerCase();
    const suggestions = this.container.querySelector('#search-suggestions') as HTMLElement;
    if (!suggestions) return;
    if (!query) {
      suggestions.style.display = 'none';
      return;
    }
    
    // Search local files and determine folder for each
    const localMatches = this.folderFiles
      .filter(f => f.name.toLowerCase().includes(query))
      .map(f => {
        // Find which folder this file belongs to by matching file references
        let folderName = 'Root'; // Default to Root if not found
        for (const [folder, files] of this.folderStructure.entries()) {
          // Match by file reference for more reliable matching
          if (files.some(file => file === f || file.name === f.name)) {
            folderName = folder;
            break;
          }
        }
        return { 
          name: f.name, 
          type: 'local', 
          source: folderName,
          file: f 
        };
      });
    
    // Search Umbrel files
    const umbrelMatches = this.umbrelFiles
      .filter(f => f.name.toLowerCase().includes(query))
      .map(f => ({ 
        name: f.name, 
        type: 'umbrel', 
        source: f.folder || 'Umbrel',
        umbrelFile: f 
      }));
    
    // Combine and sort all matches
    const allMatches = [...localMatches, ...umbrelMatches]
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .slice(0, 8);
    
    if (allMatches.length === 0) {
      suggestions.style.display = 'none';
      return;
    }
    
    suggestions.innerHTML = allMatches
      .map(match => `
        <div class="suggestion-item" data-name="${encodeURIComponent(match.name)}" data-type="${match.type}">
          <div class="suggestion-name">${match.name}</div>
          <div class="suggestion-source">${match.source}</div>
        </div>
      `) 
      .join('');
    suggestions.style.display = 'block';
    suggestions.querySelectorAll('.suggestion-item').forEach(el => {
      el.addEventListener('click', async (e) => {
        const name = decodeURIComponent((e.currentTarget as HTMLElement).getAttribute('data-name') || '');
        const type = (e.currentTarget as HTMLElement).getAttribute('data-type');
        
        if (type === 'local') {
          const file = this.folderFiles.find(f => f.name === name);
          if (file) await this.handleFile(file);
        } else if (type === 'umbrel') {
          const umbrelFile = this.umbrelFiles.find(f => f.name === name);
          if (umbrelFile) await this.loadUmbrelFile(umbrelFile);
        }
      });
    });
  }

  public clearSearch(): void {
    const searchInput = this.container.querySelector('#template-search') as HTMLInputElement;
    const suggestions = this.container.querySelector('#search-suggestions') as HTMLElement;
    
    if (searchInput) {
      searchInput.value = '';
      this.searchValue = '';
    }
    if (suggestions) {
      suggestions.style.display = 'none';
    }
  }

  public reset(clearSearch: boolean = false): void {
    // Store current data before reset
    const currentData = {
      directoryHandle: this.directoryHandle,
      folderFiles: this.folderFiles,
      folderStructure: this.folderStructure,
      searchValue: clearSearch ? '' : this.searchValue,
      umbrelFiles: this.umbrelFiles,
      isUmbrelMode: this.isUmbrelMode
    };
    
    
    this.render();
    // Ensure loading state is cleared when resetting
    this.hideProcessingIndicator();
    
    // Restore data after rendering
    this.directoryHandle = currentData.directoryHandle;
    this.folderFiles = currentData.folderFiles;
    this.folderStructure = currentData.folderStructure;
    this.searchValue = currentData.searchValue;
    this.umbrelFiles = currentData.umbrelFiles;
    this.isUmbrelMode = currentData.isUmbrelMode;
    
    // Restore folder dropdown if we have folder data
    if (this.folderStructure && this.folderStructure.size > 0) {
      this.populateFolderDropdown();
    }
    
    // Restore Umbrel UI if we're in Umbrel mode
    if (this.isUmbrelMode && this.umbrelFiles.length > 0) {
      this.updateUmbrelUI();
    }
    
    // Update Umbrel button styling
    this.updateUmbrelButtonStyle();
    
    // Restore or clear search input
    const searchInput = this.container.querySelector('#template-search') as HTMLInputElement;
    if (searchInput) {
      searchInput.value = this.searchValue;
      if (this.searchValue) {
        this.updateSuggestions();
      } else {
        // Clear suggestions if search is empty
        const suggestions = this.container.querySelector('#search-suggestions') as HTMLElement;
        if (suggestions) {
          suggestions.style.display = 'none';
        }
      }
    }
  }

  public clearUmbrelFiles(): void {
    this.umbrelFiles = [];
    this.isUmbrelMode = false;
    
    // Reset search placeholder
    const searchInput = this.container.querySelector('#template-search') as HTMLInputElement;
    if (searchInput) {
      searchInput.placeholder = 'Search templates...';
    }
    
    // Clear folder dropdown
    const dropdownContent = this.container.querySelector('#folder-dropdown-list .custom-dropdown-content') as HTMLElement;
    const dropdownText = this.container.querySelector('.custom-dropdown-text') as HTMLElement;
    if (dropdownContent) {
      dropdownContent.innerHTML = '';
    }
    if (dropdownText) {
      dropdownText.textContent = 'Select folder...';
      dropdownText.style.color = 'var(--text-secondary)';
    }
    
    // Reset Umbrel button
    this.updateUmbrelButtonStyle();
    
    // Clear suggestions
    this.updateSuggestions();
  }

  public resetDropdownSelection(): void {
    const folderDropdownButton = this.container.querySelector('.custom-dropdown-text') as HTMLElement;
    const folderDocuments = this.container.querySelector('#folder-documents') as HTMLElement;
    
    if (folderDropdownButton) {
      // Reset dropdown to placeholder text
      folderDropdownButton.textContent = 'Select a folder...';
      folderDropdownButton.style.color = 'var(--text-secondary)'; // Grey for placeholder
    }
    
    if (folderDocuments) {
      // Hide the folder documents list
      folderDocuments.style.display = 'none';
    }
  }

  public hideProcessingIndicator(): void {
    const processingIndicator = this.container.querySelector('#processing-indicator') as HTMLElement;
    if (processingIndicator) {
      processingIndicator.style.display = 'none';
    }
    
    // Also reset the upload area if it's showing loading state
    const uploadArea = this.container.querySelector('#upload-area') as HTMLElement;
    if (uploadArea && uploadArea.innerHTML.includes('loading-spinner')) {
      // Reset upload area to original state
      uploadArea.innerHTML = `
        <div class="upload-content">
          <svg class="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7,10 12,15 17,10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          <h3>Upload Template</h3>
          <p>Drag and drop your .docx file here, or click to browse</p>
          <p style="font-size: 0.9rem; color: var(--text-muted); margin-top: 0.5rem;">
            <strong>Network users:</strong> Click the upload area above to select a file
          </p>
        </div>
      `;
      
      // Re-setup the click event listener
      uploadArea.addEventListener('click', () => {
        const fileInput = this.container.querySelector('#file-input') as HTMLInputElement;
        fileInput.click();
      });
    }
  }

  /**
   * Connect to Umbrel and load template files
   */
  private async connectToUmbrel(): Promise<void> {
    try {
      console.log('Connecting to Umbrel...');
      
      // Show connection modal to get credentials
      this.showUmbrelConnectionModal();
      
    } catch (error) {
      console.error('Error connecting to Umbrel:', error);
      this.onError(`Failed to connect to Umbrel: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Show Umbrel connection modal
   */
  private showUmbrelConnectionModal(): void {
    // Remove any existing modal first
    this.hideUmbrelConnectionModal();
    
    // Create modal container
    const modalContainer = document.createElement('div');
    modalContainer.id = 'umbrel-connection-modal-container';
    modalContainer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    document.body.appendChild(modalContainer);

    // Import and create the connection modal
    import('./UmbrelConnectionModal.js').then(({ UmbrelConnectionModal }) => {
      const modal = new UmbrelConnectionModal(
        modalContainer,
        () => this.hideUmbrelConnectionModal(),
        () => this.handleUmbrelConnected()
      );
      modal.show();
    });
  }

  /**
   * Hide Umbrel connection modal
   */
  private hideUmbrelConnectionModal(): void {
    const modalContainer = document.querySelector('#umbrel-connection-modal-container') as HTMLElement;
    if (modalContainer) {
      modalContainer.remove();
    }
  }

  /**
   * Handle successful Umbrel connection
   */
  private async handleUmbrelConnected(): Promise<void> {
    try {
      console.log('Umbrel connected successfully, loading files...');
      
      // Load files from all Template Docs folders
      const templatePath = '/Home/Documents/Template Docs';
      console.log('Loading files from all Umbrel Template Docs folders:', templatePath);
      
      const files = await umbrelApi.listFiles(templatePath);
      console.log('Found files in Umbrel:', files);
      
      // Filter for .docx files
      const docxFiles = files.filter(file => 
        file.type === 'file' && file.name.toLowerCase().endsWith('.docx')
      );
      
      if (docxFiles.length === 0) {
        this.onError('No .docx template files found in any Umbrel Template Docs folders');
        return;
      }

      this.umbrelFiles = docxFiles;
      this.isUmbrelMode = true;
      
      // Update the UI to show Umbrel files
      this.updateUmbrelUI();
      
      // Update search suggestions to include Umbrel files
      this.updateSuggestions();
      
      // Group files by folder for better organization
      const filesByFolder = docxFiles.reduce((acc, file) => {
        const folder = file.folder || 'Unknown';
        if (!acc[folder]) {
          acc[folder] = [];
        }
        acc[folder].push(file);
        return acc;
      }, {} as Record<string, typeof docxFiles>);
      
      console.log(`Successfully connected to Umbrel and found ${docxFiles.length} template files across ${Object.keys(filesByFolder).length} folders:`, filesByFolder);
      
      // Update button styling to show connected state
      this.updateUmbrelButtonStyle();
      
      // Hide the modal
      this.hideUmbrelConnectionModal();
      
    } catch (error) {
      console.error('Error loading Umbrel files:', error);
      this.onError(`Failed to load files from Umbrel: ${error instanceof Error ? error.message : 'Unknown error'}`);
      // Hide the modal even on error
      this.hideUmbrelConnectionModal();
    }
  }

  /**
   * Update Umbrel button styling based on connection status
   */
  private updateUmbrelButtonStyle(): void {
    const umbrelConnectBtn = this.container.querySelector('#umbrel-connect') as HTMLButtonElement;
    if (!umbrelConnectBtn) return;

    // Remove existing hover event listeners to prevent duplicates
    const existingMouseEnter = (umbrelConnectBtn as any)._umbrelMouseEnter;
    const existingMouseLeave = (umbrelConnectBtn as any)._umbrelMouseLeave;
    
    if (existingMouseEnter) {
      umbrelConnectBtn.removeEventListener('mouseenter', existingMouseEnter);
    }
    if (existingMouseLeave) {
      umbrelConnectBtn.removeEventListener('mouseleave', existingMouseLeave);
    }

    // Set fixed width to accommodate the longer "Connected to ☂️ Umbrel" text on one row
    umbrelConnectBtn.style.width = '220px';
    umbrelConnectBtn.style.minWidth = '220px';
    umbrelConnectBtn.style.textAlign = 'center';
    umbrelConnectBtn.style.display = 'flex';
    umbrelConnectBtn.style.alignItems = 'center';
    umbrelConnectBtn.style.justifyContent = 'center';

    if (this.isUmbrelMode) {
      // Connected state - light green (no hover effects)
      umbrelConnectBtn.style.background = '#dcfce7'; // light green background
      umbrelConnectBtn.style.borderColor = '#16a34a'; // green border
      umbrelConnectBtn.style.color = '#15803d'; // dark green text
      umbrelConnectBtn.textContent = 'Connected to ☂️ Umbrel';
    } else {
      // Disconnected state - default styling with hover effects
      umbrelConnectBtn.style.background = '';
      umbrelConnectBtn.style.borderColor = '';
      umbrelConnectBtn.style.color = '';
      umbrelConnectBtn.textContent = 'Connect to ☂️ Umbrel';
      
      // Add hover effects (same as Choose Templates Folder button)
      const mouseEnterHandler = () => {
        umbrelConnectBtn.style.background = 'var(--apple-gray)';
        umbrelConnectBtn.style.borderColor = '#6b7280';
        umbrelConnectBtn.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.2)';
      };

      const mouseLeaveHandler = () => {
        umbrelConnectBtn.style.background = 'var(--primary-bg)';
        umbrelConnectBtn.style.borderColor = 'var(--border-color)';
        umbrelConnectBtn.style.boxShadow = 'none';
      };

      // Store references for future removal
      (umbrelConnectBtn as any)._umbrelMouseEnter = mouseEnterHandler;
      (umbrelConnectBtn as any)._umbrelMouseLeave = mouseLeaveHandler;

      umbrelConnectBtn.addEventListener('mouseenter', mouseEnterHandler);
      umbrelConnectBtn.addEventListener('mouseleave', mouseLeaveHandler);
    }
  }

  /**
   * Update UI to show Umbrel files
   */
  private updateUmbrelUI(): void {
    // Update the search placeholder
    const searchInput = this.container.querySelector('#template-search') as HTMLInputElement;
    if (searchInput) {
      searchInput.placeholder = 'Search Umbrel templates...';
    }

    // Update the folder dropdown to show Umbrel files
    const dropdownList = this.container.querySelector('#folder-dropdown-list') as HTMLElement;
    const dropdownContent = dropdownList?.querySelector('.custom-dropdown-content') as HTMLElement;
    const dropdownText = this.container.querySelector('.custom-dropdown-text') as HTMLElement;
    
    if (dropdownContent && dropdownText) {
      // Clear existing options
      dropdownContent.innerHTML = '';
      
      // Update button text
      dropdownText.textContent = 'Umbrel Templates';
      dropdownText.style.color = 'var(--text-primary)';
      
      // Group files by folder structure
      const folderGroups = new Map<string, UmbrelFile[]>();
      
      this.umbrelFiles.forEach(file => {
        const pathParts = file.path.split('/');
        const folderName = pathParts[pathParts.length - 2] || 'Root';
        
        if (!folderGroups.has(folderName)) {
          folderGroups.set(folderName, []);
        }
        folderGroups.get(folderName)!.push(file);
      });

      // Add folder options
      folderGroups.forEach((files, folderName) => {
        const option = document.createElement('div');
        option.className = 'custom-dropdown-item';
        option.textContent = `${folderName} (${files.length} files)`;
        option.setAttribute('data-value', folderName);
        dropdownContent.appendChild(option);
      });

      // Add click handlers for each option
      dropdownContent.querySelectorAll('.custom-dropdown-item').forEach(item => {
        item.addEventListener('click', (e) => {
          const folderName = (e.currentTarget as HTMLElement).getAttribute('data-value') || '';
          const buttonText = this.container.querySelector('.custom-dropdown-text') as HTMLElement;
          const dropdownListEl = this.container.querySelector('#folder-dropdown-list') as HTMLElement;
          
          if (buttonText) {
            buttonText.textContent = (e.currentTarget as HTMLElement).textContent || '';
            buttonText.style.color = 'var(--text-primary)';
          }
          
          if (dropdownListEl) {
            dropdownListEl.style.display = 'none';
          }
          
          this.showFolderDocuments(folderName);
        });
      });
    }

    // Update button text
    const umbrelBtn = this.container.querySelector('#umbrel-connect') as HTMLButtonElement;
    if (umbrelBtn) {
      umbrelBtn.textContent = `Umbrel (${this.umbrelFiles.length} files)`;
      umbrelBtn.style.background = 'var(--accent-blue)';
      umbrelBtn.style.color = 'white';
    }
  }

  /**
   * Load and process a file from Umbrel
   */
  private async loadUmbrelFile(file: UmbrelFile): Promise<void> {
    try {
      console.log('Loading file from Umbrel:', file.name);
      
      // Download the file
      const blob = await umbrelApi.downloadFile(file.path);
      
      // Convert blob to File object
      const fileObj = new File([blob], file.name, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      
      // Process the file
      await this.processFile(fileObj);
      
    } catch (error) {
      console.error('Error loading file from Umbrel:', error);
      this.onError(`Failed to load file from Umbrel: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Process a file (either local or from Umbrel)
   */
  private async processFile(file: File): Promise<void> {
    try {
      console.log('Processing file:', file.name);
      
      // Extract text from DOCX
      const text = await extractTextFromDocx(file);
      console.log('Extracted text length:', text.length);
      
      // Extract placeholders and conditional options
      const placeholders = extractPlaceholders(text);
      const conditionalOptions = extractConditionalOptions(text);
      
      console.log('Found placeholders:', placeholders.length);
      console.log('Found conditional options:', conditionalOptions.length);
      
      // Call the callback with the processed data
      this.onFileProcessed(placeholders, conditionalOptions, file);
      
    } catch (error) {
      console.error('Error processing file:', error);
      this.onError(`Failed to process file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
