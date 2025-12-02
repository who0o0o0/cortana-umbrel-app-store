import { AppState, PlaceholderField, FormData, ConditionalGroup, BulkModeState } from './types.js';
import { FileUpload } from './components/FileUpload.js';
import { DynamicForm } from './components/DynamicForm.js';
import { PlaceholderList } from './components/PlaceholderList.js';
import { BulkModeBanner } from './components/BulkModeBanner.js';
import { BulkModeManager } from './utils/bulkMode.js';
import { processDocx, buildDocxData, processDocxToBytes } from './utils/docxProcessor.js';
import { buildPdfData } from './utils/pdfProcessor.js';
import { UmbrelSettings } from './components/UmbrelSettings.js';
import { umbrelService, UmbrelFile } from './utils/umbrelService.js';
import { convertDocxToPdf, downloadPdf, isPdfConversionAvailable } from './utils/pdfConverter.js';
import { PreviewModal } from './components/PreviewModal.js';
import { UserMenu } from './components/UserMenu.js';
import { HelpModal } from './components/HelpModal.js';
import logoImage from './assets/logo.png';

export class App {
  private container: HTMLElement;
  private state: AppState;
  private fileUpload: FileUpload | null = null;
  private dynamicForm: DynamicForm | null = null;
  private placeholderList: PlaceholderList | null = null;
  private bulkModeBanner: BulkModeBanner | null = null;
  private bulkModeManager: BulkModeManager | null = null;
  private bulkModeState: BulkModeState | null = null;
  private umbrelSettings: UmbrelSettings | null = null;
  private previewModal: PreviewModal | null = null;
  private userMenu: UserMenu | null = null;
  private helpModal: HelpModal | null = null;
  private isUmbrelEnabled: boolean = true; // Enable Umbrel search by default
  private isAddingTab: boolean = false; // Prevent multiple rapid tab additions

  constructor(container: HTMLElement) {
    this.container = container;
    this.state = {
      currentPage: 'upload',
      placeholders: [],
      conditionalOptions: [],
      formData: {},
      bulkModeState: {
        isActive: false,
        items: [],
        selectedItemId: null,
        isProcessing: false,
        progress: 0
      },
      isProcessing: false,
      template: null,
      error: null,
      importedPdfName: null
    };
    
    // Initialize bulk mode manager
    this.bulkModeManager = new BulkModeManager((state) => {
      this.updateBulkModeState(state);
    });
    
    // Listen for bulk mode tab clicks from DynamicForm
    this.container.addEventListener('bulkModeTabClick', (e: Event) => {
      const customEvent = e as CustomEvent;
      const { itemId } = customEvent.detail;
      console.log('Received bulk mode tab click event:', itemId);
      this.selectBulkModeItem(itemId);
    });
    
    // Listen for bulk mode tab delete events from DynamicForm
    this.container.addEventListener('bulkModeTabDelete', (e: Event) => {
      const customEvent = e as CustomEvent;
      const { itemId } = customEvent.detail;
      console.log('Received bulk mode tab delete event:', itemId);
      this.deleteBulkModeItem(itemId);
    });
    
    // Listen for bulk mode tab rename events from DynamicForm
    this.container.addEventListener('bulkModeTabRename', (e: Event) => {
      const customEvent = e as CustomEvent;
      const { itemId, newName } = customEvent.detail;
      console.log('Received bulk mode tab rename event:', itemId, newName);
      this.renameBulkModeItem(itemId, newName);
    });
    
    // Listen for bulk download all events from preview modal
    document.addEventListener('bulkDownloadAll', (e: Event) => {
      const customEvent = e as CustomEvent;
      console.log('Received bulk download all event from preview:', customEvent.detail);
      this.handleDownloadAll();
    });

    // Listen for preview modal closed events
    this.container.addEventListener('previewModalClosed', (e: Event) => {
      console.log('Preview modal closed, setting previewModal to null');
      this.previewModal = null;
    });

    // Listen for form data changes to refresh preview
    this.container.addEventListener('formDataChanged', (e: Event) => {
      const customEvent = e as CustomEvent;
      console.log('Form data changed event received, refreshing preview if open');
      console.log('Event detail:', customEvent.detail);
      
      // If in bulk mode, update the selected item's edited fields
      if (this.bulkModeState?.isActive && this.bulkModeState.selectedItemId && this.bulkModeManager) {
        console.log('Updating bulk mode item edited fields for:', this.bulkModeState.selectedItemId);
        this.bulkModeManager.updateItemEditedFields(this.bulkModeState.selectedItemId, customEvent.detail.formData);
      }
      
      this.refreshPreviewIfOpen();
    });

    // Listen for bulk mode data changes to refresh preview
    this.container.addEventListener('bulkModeDataChanged', (e: Event) => {
      const customEvent = e as CustomEvent;
      console.log('Bulk mode data changed, refreshing preview if open');
      this.refreshPreviewIfOpen();
    });
    
    // Listen for bulk mode add tab events from DynamicForm
    this.container.addEventListener('bulkModeAddTab', (e: Event) => {
      console.log('Received bulk mode add tab event');
      console.log('isAddingTab flag:', this.isAddingTab);
      
      // Prevent multiple rapid clicks
      if (this.isAddingTab) {
        console.log('Already adding a tab, ignoring request');
        return;
      }
      
      this.isAddingTab = true;
      console.log('Setting isAddingTab to true, calling addNewBulkModeTab');
      this.addNewBulkModeTab();
      
      // Reset the flag after a short delay
      setTimeout(() => {
        this.isAddingTab = false;
        console.log('Reset isAddingTab to false');
      }, 1000); // Increased delay to prevent rapid clicking
    });

    // Listen for bulk mode trigger events from FileUpload (network access)
    this.container.addEventListener('triggerBulkMode', (e: Event) => {
      const customEvent = e as CustomEvent;
      const { files } = customEvent.detail;
      console.log('Received triggerBulkMode event with files:', files.length);
      this.initializeBulkModeFromFiles(files);
    });
    
    this.render();
  }


  private generateFileName(): string {
    const now = new Date();
    // Format: YYMMDD (e.g., 251021 for October 21, 2025)
    const year = String(now.getFullYear()).slice(2); // Last 2 digits of year
    const month = String(now.getMonth() + 1).padStart(2, '0'); // Month (01-12)
    const day = String(now.getDate()).padStart(2, '0'); // Day (01-31)
    const dateStr = `${year}${month}${day}`;
    
    // Get template name without extension
    const templateName = this.state.template?.file?.name?.replace(/\.docx$/i, '') || 'document';
    
    // Build filename: date + template name + optional PDF name
    let fileName = `${dateStr} ${templateName}`;
    
    if (this.state.importedPdfName) {
      // Remove .pdf extension from imported PDF name
      const pdfNameWithoutExt = this.state.importedPdfName.replace(/\.pdf$/i, '');
      fileName += ` - ${pdfNameWithoutExt}`;
    }
    
    return fileName;
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="app" id="app-container" style="overflow-x: hidden; background: white; position: relative;">
        <header class="app-header" style="position: relative;">
          <div class="app-hero" style="position: relative;">
            <div class="app-hero-bg"></div>
            <div class="app-hero-content">
              <img id="cortana-logo" src="${logoImage}" alt="Cortana" style="cursor: pointer;" />
            </div>
          </div>
          <div id="user-menu-container" style="position: absolute; top: calc(18vh + 0.75rem); left: 1rem; z-index: 1000;"></div>
        </header>
        
        <main class="app-main" id="app-main" style="background: white;">
          <div class="upload-section" id="upload-section" style="background: white; padding-bottom: 0;">
            <!-- File upload component will be rendered here -->
          </div>
          
          
          <!-- Settings Section -->
          <div class="settings-section" id="settings-section" style="display: none; padding: 1rem; background: #f8fafc; border-top: 1px solid #e2e8f0;">
            <div class="settings-container" id="settings-container">
              <!-- Settings components will be rendered here -->
            </div>
          </div>
          
          <div class="content-section" id="content-section" style="display: none;">
            <div class="main-content" style="width:100%">
              <div id="form-container">
                <!-- Dynamic form will be rendered here -->
              </div>
              
              <div class="download-section" style="margin-top: -5rem;">
                <div id="pdf-status-container" style="display: flex; justify-content: center; align-items: center; margin-bottom: 0.5rem; height: 40px; visibility: hidden;">
                  <!-- Loading spinner -->
                  <svg id="pdf-loading-spinner" style="width: 32px; height: 32px; animation: spin 1s linear infinite;" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" stroke="#0ea5e9" stroke-width="3" fill="none" stroke-dasharray="31.4 31.4" stroke-linecap="round">
                      <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
                    </circle>
                  </svg>
                  <!-- Success checkmark -->
                  <svg id="pdf-success-check" style="display: none; width: 32px; height: 32px; opacity: 0; transition: opacity 0.3s ease-out;" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" fill="#10b981" stroke="#059669" stroke-width="2"/>
                    <path d="M7 12l3 3 7-7" stroke="white" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </div>
                <div class="form-field filename-group" style="margin-bottom: 1rem; max-width: 520px; margin-left: auto; margin-right: auto;">
                  <label for="output-name" class="form-label" style="justify-content:center;">File name</label>
                  <input id="output-name" type="text" class="form-input" placeholder="e.g. 250131 Client x Party - Services Agreement" />
                </div>
                <div style="display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap;">
                  <button id="download-btn" class="btn btn-primary" style="align-items: center; transform: translateY(0.25rem); height: 2.75rem; background-color: #5BA3FF;" disabled>
                    <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7,10 12,15 17,10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    Download DOCX
                  </button>
                  <button id="download-pdf-btn" class="btn btn-primary" style="align-items: center; transform: translateY(0.25rem); height: 2.75rem; background-color: #ef4444;" disabled>
                    <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7,10 12,15 17,10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    Download PDF
                  </button>
                  <button id="new-template-btn" class="btn btn-secondary" style="align-items: center; transform: translateY(0.25rem); height: 2.75rem;">
                    🏠 Home
                  </button>
                </div>
                <p class="download-hint">Generate and download your completed DOCX file or PDF</p>
              </div>
            </div>
          </div>
          
          <div class="error-section" id="error-section" style="display: none;">
            <div class="error-message">
              <h3>⚠️ Error</h3>
              <p id="error-text"></p>
              <button id="dismiss-error" class="btn btn-secondary">Dismiss</button>
            </div>
          </div>
        </main>
        
        <!-- Help Modal Container -->
        <div id="help-modal-container"></div>
      </div>
    `;

    this.setupEventListeners();
    this.initializeComponents();
  }

  private setupEventListeners(): void {
    const downloadBtn = this.container.querySelector('#download-btn') as HTMLButtonElement;
    const downloadPdfBtn = this.container.querySelector('#download-pdf-btn') as HTMLButtonElement;
    const newTemplateBtn = this.container.querySelector('#new-template-btn') as HTMLButtonElement;
    const dismissErrorBtn = this.container.querySelector('#dismiss-error') as HTMLButtonElement;
    const cortanaLogo = this.container.querySelector('#cortana-logo') as HTMLElement;

    downloadBtn.addEventListener('click', () => {
      this.handleDownload();
    });

    downloadPdfBtn.addEventListener('click', () => {
      this.handleDownloadPdf();
    });

    newTemplateBtn.addEventListener('click', () => {
      this.showMainPage();
    });

    dismissErrorBtn.addEventListener('click', () => {
      this.hideError();
    });

    cortanaLogo.addEventListener('click', () => {
      this.showMainPage();
    });

  }

  private initializeComponents(): void {
    const uploadSection = this.container.querySelector('#upload-section') as HTMLElement;
    const settingsContainer = this.container.querySelector('#settings-container') as HTMLElement;
    const userMenuContainer = this.container.querySelector('#user-menu-container') as HTMLElement;
    const helpModalContainer = this.container.querySelector('#help-modal-container') as HTMLElement;
    
    this.fileUpload = new FileUpload(
      uploadSection,
      (placeholders, conditionalOptions, file) => this.handleFileProcessed(placeholders, conditionalOptions, file),
      (error) => this.showError(error)
    );

    // Initialize PreviewModal
    this.previewModal = new PreviewModal(this.container);

    // Initialize Umbrel settings component
    this.umbrelSettings = new UmbrelSettings(
      settingsContainer,
      () => this.handleUmbrelConnected(),
      () => this.handleUmbrelDisconnected()
    );

    // Initialize User Menu
    if (userMenuContainer) {
      this.userMenu = new UserMenu(
        userMenuContainer,
        () => this.handleLogout(),
        () => this.handleShowHelp()
      );
    } else {
      console.error('User menu container not found');
    }

    // Initialize Help Modal
    if (helpModalContainer) {
      this.helpModal = new HelpModal(helpModalContainer);
    }
  }

  private handleFileProcessed(placeholders: PlaceholderField[], conditionalOptions: ConditionalGroup[], file: File): void {
    this.state.template = {
      file,
      placeholders,
      conditionalOptions,
      content: undefined
    };

    // Reset imported PDF name when loading a new template
    this.state.importedPdfName = null;

    // Clear bulk mode state when processing individual documents
    if (this.bulkModeState && this.bulkModeState.isActive) {
      console.log('Clearing bulk mode state for individual document processing');
      this.exitBulkMode();
    }

    // Set template placeholders in bulk mode manager for proper field mapping
    if (this.bulkModeManager) {
      this.bulkModeManager.setTemplatePlaceholders(placeholders);
      this.bulkModeManager.setTemplateName(file.name);
    }

    // Initialize form data with defaults
    this.state.formData = {};
    for (const placeholder of placeholders) {
      if (placeholder.isMultiple) {
        // For multiple entry fields, start with one empty entry
        this.state.formData[placeholder.key] = [''];
      } else if (placeholder.defaultValue) {
        this.state.formData[placeholder.key] = placeholder.defaultValue;
      }
    }

    this.showContent();
    this.renderDynamicForm();
    this.updateDownloadButton();
  }

  private showContent(): void {
    const uploadSection = this.container.querySelector('#upload-section') as HTMLElement;
    const contentSection = this.container.querySelector('#content-section') as HTMLElement;
    const appContainer = this.container.querySelector('#app-container') as HTMLElement;
    const appMain = this.container.querySelector('#app-main') as HTMLElement;
    
    uploadSection.style.display = 'none';
    contentSection.style.display = 'flex';
    
    // Restore grey background for the fill-in details page
    appMain.style.background = 'var(--apple-gray)';
    
    // Enable scrolling for the fill-in details page
    appContainer.style.height = 'auto';
    appContainer.style.overflowY = 'visible';
    appContainer.style.minHeight = '100vh';
  }


  private selectBulkModeItem(itemId: string): void {
    if (!this.bulkModeState) {
      console.log('No bulk mode state available');
      return;
    }
    
    console.log('Selecting bulk mode item:', itemId);
    console.log('Bulk mode state:', {
      isActive: this.bulkModeState.isActive,
      itemsCount: this.bulkModeState.items.length,
      selectedItemId: this.bulkModeState.selectedItemId
    });
    console.log('Available items:', this.bulkModeState.items.map(item => ({
      id: item.id,
      fileName: item.fileName,
      hasFields: !!item.fields,
      fieldKeys: item.fields ? Object.keys(item.fields) : []
    })));
    
    // Update selected item
    this.bulkModeState.selectedItemId = itemId;
    
    // Re-render tabs with new selection (pass the current bulkModeState)
    if (this.dynamicForm) {
      console.log('Re-rendering tabs with items:', this.bulkModeState.items.length);
      this.dynamicForm.renderBulkModeTabs(this.bulkModeState.items, itemId);
    }
    
    // Find and populate form with selected item data
    const selectedItem = this.bulkModeState.items.find(item => item.id === itemId);
    if (selectedItem) {
      // Use effective fields (edited if available, otherwise original)
      const effectiveFields = this.bulkModeManager?.getItemEffectiveFields(itemId) || selectedItem.fields;
      console.log('Selected item:', selectedItem.fileName, 'Effective fields:', effectiveFields);
      if (effectiveFields && Object.keys(effectiveFields).length > 0) {
        this.dynamicForm?.populateForm(effectiveFields);
        console.log('Form populated with effective data from:', selectedItem.fileName);
      } else {
        console.log('No data available for item:', selectedItem.fileName);
        // Clear the form when no data is available
        this.dynamicForm?.populateForm({});
      }
    } else {
      console.log('Item not found:', itemId);
    }
  }

  private deleteBulkModeItem(itemId: string): void {
    if (!this.bulkModeManager || !this.bulkModeState) return;

    console.log('Deleting bulk mode item:', itemId);
    
    // Remove the item from the bulk mode manager
    this.bulkModeManager.removeItem(itemId);
    
    // Update the local bulk mode state
    this.bulkModeState.items = this.bulkModeState.items.filter(item => item.id !== itemId);
    
    // If we deleted the currently selected item, select a new one
    if (this.bulkModeState.selectedItemId === itemId) {
      if (this.bulkModeState.items.length > 0) {
        // Select the first remaining item
        this.bulkModeState.selectedItemId = this.bulkModeState.items[0].id;
        const firstItem = this.bulkModeState.items[0];
        const effectiveFields = this.bulkModeManager.getItemEffectiveFields(firstItem.id);
        if (effectiveFields && Object.keys(effectiveFields).length > 0) {
          this.dynamicForm?.populateForm(effectiveFields);
        }
      } else {
        // No items left, clear the selection
        this.bulkModeState.selectedItemId = null;
        this.dynamicForm?.populateForm({});
      }
    }
    
    // Re-render the tabs
    if (this.dynamicForm) {
      this.dynamicForm.renderBulkModeTabs(this.bulkModeState.items, this.bulkModeState.selectedItemId || undefined);
    }
    
    // If no items left, exit bulk mode
    if (this.bulkModeState.items.length === 0) {
      this.exitBulkMode();
    }
    
    console.log('Item deleted. Remaining items:', this.bulkModeState.items.length);
  }

  private renameBulkModeItem(itemId: string, newName: string): void {
    if (!this.bulkModeManager || !this.bulkModeState) return;

    console.log('Renaming bulk mode item:', itemId, 'to:', newName);
    
    // Update the display name in the bulk mode manager
    this.bulkModeManager.updateItemDisplayName(itemId, newName);
    
    // Update the local bulk mode state
    const item = this.bulkModeState.items.find(item => item.id === itemId);
    if (item) {
      item.displayName = newName;
    }
    
    // Re-render the tabs to show the new name
    if (this.dynamicForm) {
      this.dynamicForm.renderBulkModeTabs(this.bulkModeState.items, this.bulkModeState.selectedItemId || undefined);
    }
    
    console.log('Item renamed successfully');
  }

  private addNewBulkModeTab(): void {
    if (!this.bulkModeManager || !this.bulkModeState) {
      console.log('Cannot add tab: bulkModeManager or bulkModeState not available');
      return;
    }

    console.log('Adding new bulk mode tab');
    console.log('Current items count before adding:', this.bulkModeState.items.length);
    
    // Create a new empty item with placeholder data
    const newItem = {
      id: crypto.randomUUID(),
      filePath: 'New Document',
      fileName: 'New Document.pdf',
      displayName: 'New Document',
      fields: this.createEmptyPlaceholderData(),
      status: 'ok' as const,
      issues: [],
      include: true
    };

    console.log('Created new item with ID:', newItem.id);

    // Add the item to the bulk mode manager - this will trigger the state change callback
    // which will handle the UI updates, so we don't need to do it manually here
    this.bulkModeManager.addItem(newItem);
    console.log('Added item to bulkModeManager - state change callback will handle UI updates');
  }

  private createEmptyPlaceholderData(): Record<string, string> {
    // Get the template placeholders to create empty data
    const placeholders = this.state.template?.placeholders || [];
    const emptyData: Record<string, string> = {};
    
    placeholders.forEach((placeholder: PlaceholderField) => {
      // Handle both string and object placeholders
      const placeholderKey = typeof placeholder === 'string' ? placeholder : placeholder.key || '';
      const placeholderString = typeof placeholder === 'string' ? placeholder : placeholder.key || '';
      
      // Use placeholder text like "e.g. $BTC" for token ticker fields
      if (placeholderString.toLowerCase().includes('ticker') || placeholderString.toLowerCase().includes('token')) {
        emptyData[placeholderKey] = 'e.g. $BTC';
      } else {
        emptyData[placeholderKey] = '';
      }
    });
    
    return emptyData;
  }

  private async initializeBulkModeFromFiles(files: File[]): Promise<void> {
    console.log('Initializing bulk mode from uploaded files:', files.length);
    
    if (!this.bulkModeManager) {
      console.error('Bulk mode manager not available');
      return;
    }
    
    try {
      // Clear any existing bulk mode state
      this.exitBulkMode();
      
      // Initialize bulk mode state
      this.bulkModeState = {
        isActive: true,
        items: [],
        selectedItemId: null,
        isProcessing: false,
        progress: 0
      };
      
      // Process each file
      const items = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        console.log(`Processing file ${i + 1}/${files.length}: ${file.name}`);
        
        const item = {
          id: crypto.randomUUID(),
          filePath: file.name,
          fileName: file.name,
          displayName: file.name.replace(/\.pdf$/i, ''),
          fields: {},
          status: 'ok' as 'ok' | 'warning' | 'error',
          issues: [] as string[],
          include: true
        };
        
        try {
          // Read file content
          const fileBuffer = await file.arrayBuffer();
          
          // Process PDF to extract fields
          const { AnchorTokenImporter } = await import('./utils/anchorTokenImporter.js');
          const importer = new AnchorTokenImporter();
          const parsedData = await importer.importFromPDF(fileBuffer, undefined, this.state.placeholders);
          
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
        
        // Update progress
        this.bulkModeState.progress = ((i + 1) / files.length) * 100;
        this.bulkModeState.items = [...items];
        this.updateBulkModeState(this.bulkModeState);
      }
      
      // Set the first item as selected
      if (items.length > 0) {
        this.bulkModeState.selectedItemId = items[0].id;
        this.bulkModeState.items = items;
        
        // Add items to bulk mode manager
        items.forEach(item => {
          this.bulkModeManager!.addItem(item);
        });
        
        // Populate form with first item
        const firstItem = items[0];
        if (firstItem.fields && Object.keys(firstItem.fields).length > 0) {
          this.dynamicForm?.populateForm(firstItem.fields);
        }
        
        // Update UI
        this.updateBulkModeState(this.bulkModeState);
        this.render();
        
        console.log('Bulk mode initialized successfully with', items.length, 'items');
      } else {
        console.log('No valid files processed');
        this.exitBulkMode();
      }
      
    } catch (error) {
      console.error('Error initializing bulk mode from files:', error);
      this.showError(`Failed to initialize bulk mode: ${error instanceof Error ? error.message : 'Unknown error'}`);
      this.exitBulkMode();
    }
  }

  private exitBulkMode(): void {
    console.log('Exiting bulk mode');
    
    // Clear bulk mode state
    this.bulkModeState = null;
    
    // Reset bulk mode manager
    if (this.bulkModeManager) {
      this.bulkModeManager.clearState();
    }
    
    // Hide tabs
    if (this.dynamicForm) {
      this.dynamicForm.setBulkModeState(false, 0);
    }
    
    // Clear form data
    this.state.formData = {};
    this.updateDownloadButton();
    
    console.log('Bulk mode exited');
  }

  private showContentForBulkMode(): void {
    const uploadSection = this.container.querySelector('#upload-section') as HTMLElement;
    const contentSection = this.container.querySelector('#content-section') as HTMLElement;
    const appContainer = this.container.querySelector('#app-container') as HTMLElement;
    const appMain = this.container.querySelector('#app-main') as HTMLElement;
    // Banner container removed - tabs are now in DynamicForm
    
    console.log('showContentForBulkMode - uploadSection:', uploadSection);
    console.log('showContentForBulkMode - contentSection:', contentSection);
    
    uploadSection.style.display = 'none';
    contentSection.style.display = 'flex';
    
    // Use grey background for bulk mode as well
    appMain.style.background = 'var(--apple-gray)';
    
    // Enable scrolling for bulk mode
    appContainer.style.height = 'auto';
    appContainer.style.overflowY = 'visible';
    appContainer.style.minHeight = '100vh';
    
    // Banner container removed - tabs are now in DynamicForm
  }

  private showMainPage(): void {
    const uploadSection = this.container.querySelector('#upload-section') as HTMLElement;
    const contentSection = this.container.querySelector('#content-section') as HTMLElement;
    const appContainer = this.container.querySelector('#app-container') as HTMLElement;
    const appMain = this.container.querySelector('#app-main') as HTMLElement;
    
    uploadSection.style.display = 'block';
    contentSection.style.display = 'none';
    
    // Restore white background for the upload page
    appMain.style.background = 'white';
    
    // Allow scrolling on the main page to accommodate folder lists
    appContainer.style.height = 'auto';
    appContainer.style.overflowY = 'visible';
    appContainer.style.minHeight = '100vh';
    
    // Reset app state
    this.state.template = null;
    this.state.formData = {};
    this.state.isProcessing = false;
    this.state.error = null;
    
    // Reset file upload component completely
    if (this.fileUpload) {
      this.fileUpload.reset(true); // Clear search when going back to main page
    }
    
    // Hide any processing indicators
    this.hideProcessingIndicator();
  }

  private hideProcessingIndicator(): void {
    const processingIndicator = this.container.querySelector('#processing-indicator') as HTMLElement;
    if (processingIndicator) {
      processingIndicator.style.display = 'none';
    }
    
    // Also hide any processing indicators in the file upload component
    if (this.fileUpload) {
      this.fileUpload.hideProcessingIndicator();
    }
  }

  private renderPlaceholderList(): void {}

  private renderDynamicForm(): void {
    if (!this.state.template) {
      console.log('No template loaded, skipping DynamicForm rendering');
      return;
    }

    console.log('Rendering DynamicForm with template:', this.state.template.file.name);
    const container = this.container.querySelector('#form-container') as HTMLElement;
    this.dynamicForm = new DynamicForm(
      container,
      this.state.template.placeholders,
      this.state.template.conditionalOptions,
      this.state.formData,
      (formData) => this.handleFormDataChange(formData),
      (this.state.template.file.name || 'Document').replace('.docx', ''),
      () => this.handleBulkModeRequested(),
      () => this.handleDownloadAll(),
      () => this.handleDownloadAllPdfs(),
      (pdfName) => this.handlePdfImported(pdfName),
      () => this.handlePreview(),
    );
    console.log('DynamicForm rendered with preview button');
  }

  private handleFormDataChange(formData: FormData): void {
    this.state.formData = formData;
    this.updateDownloadButton();
    
    // If we're in bulk mode and have a selected item, save the edited fields
    if (this.bulkModeManager && this.bulkModeState?.selectedItemId) {
      this.bulkModeManager.updateItemEditedFields(this.bulkModeState.selectedItemId, formData);
    }
  }

  private handlePdfImported(pdfName: string): void {
    this.state.importedPdfName = pdfName;
  }

  private updateDownloadButton(): void {
    const downloadBtn = this.container.querySelector('#download-btn') as HTMLButtonElement;
    const downloadPdfBtn = this.container.querySelector('#download-pdf-btn') as HTMLButtonElement;
    
    if (!this.state.template) {
      if (downloadBtn) downloadBtn.disabled = true;
      if (downloadPdfBtn) downloadPdfBtn.disabled = true;
      return;
    }

    // Update button text based on bulk mode
    if (this.bulkModeState?.isActive) {
      const includedCount = this.bulkModeState.items.filter(item => item.include).length;
      if (downloadBtn) {
        downloadBtn.innerHTML = `
          <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7,10 12,15 17,10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Download DOCX (${includedCount} files)
        `;
      }
      if (downloadPdfBtn) {
        downloadPdfBtn.innerHTML = `
          <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7,10 12,15 17,10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Download PDFs (${includedCount} files)
        `;
      }
    } else {
      // Reset to default text for single mode
      if (downloadBtn) {
        downloadBtn.innerHTML = `
          <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7,10 12,15 17,10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Download DOCX
        `;
      }
      if (downloadPdfBtn) {
        downloadPdfBtn.innerHTML = `
          <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7,10 12,15 17,10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Download PDF
        `;
      }
    }

    // Allow download without filling all fields
    if (downloadBtn) downloadBtn.disabled = false;
    if (downloadPdfBtn) downloadPdfBtn.disabled = false;
  }

  private async handleDownload(): Promise<void> {
    // If in bulk mode, redirect to bulk download
    if (this.bulkModeManager && this.bulkModeState?.isActive) {
      console.log('Bulk mode detected, redirecting to handleDownloadAll');
      return this.handleDownloadAll();
    }

    if (!this.state.template || this.state.isProcessing) return;

    // Validate required fields before proceeding
    if (this.dynamicForm && !this.dynamicForm.validateRequiredFields()) {
      return; // Stop if validation fails
    }

    console.log('Starting download process...');
    console.log('Template:', this.state.template);
    console.log('Form data:', this.state.formData);

    this.state.isProcessing = true;
    this.updateDownloadButton();

    try {
      // Build formatted data for processDocx (it doesn't call buildDocxData internally)
      const data = buildDocxData(
        this.state.template.placeholders,
        this.state.formData,
        'emdash'
      );
      
      console.log('Built docx data:', data);
      
      // Add conditional options data to the data object
      Object.keys(this.state.formData).forEach(key => {
        if (key.startsWith('conditional-')) {
          data[key] = this.state.formData[key];
        }
      });
      
      const nameInput = this.container.querySelector('#output-name') as HTMLInputElement | null;
      const outputName = (nameInput?.value && nameInput.value.trim() !== '') ? nameInput.value : this.generateFileName();
      
      console.log('Output name:', outputName);
      console.log('Conditional options:', this.state.template.conditionalOptions);
      
      await processDocx(this.state.template.file, data, this.state.template.conditionalOptions, outputName, this.state.template.placeholders);
      
      console.log('Download completed successfully');
    } catch (error) {
      console.error('Download failed:', error);
      this.showError(error instanceof Error ? error.message : 'Failed to generate document');
    } finally {
      this.state.isProcessing = false;
      this.updateDownloadButton();
    }
  }

  private async handleDownloadPdf(): Promise<void> {
    // If in bulk mode, redirect to bulk PDF download
    if (this.bulkModeManager && this.bulkModeState?.isActive) {
      console.log('Bulk mode detected, redirecting to handleDownloadAllPdfs');
      return this.handleDownloadAllPdfs();
    }

    if (!this.state.template || this.state.isProcessing) return;

    // Validate required fields before proceeding
    if (this.dynamicForm && !this.dynamicForm.validateRequiredFields()) {
      return; // Stop if validation fails
    }

    console.log('Starting PDF download process...');

    this.state.isProcessing = true;
    this.updateDownloadButton();
    
    // Show loading spinner
    const statusContainer = this.container.querySelector('#pdf-status-container') as HTMLElement;
    const spinner = this.container.querySelector('#pdf-loading-spinner') as HTMLElement;
    const checkmark = this.container.querySelector('#pdf-success-check') as HTMLElement;
    
    if (statusContainer) {
      statusContainer.style.visibility = 'visible';
    }
    if (spinner) {
      spinner.style.display = 'block';
    }
    if (checkmark) {
      checkmark.style.display = 'none';
      checkmark.style.opacity = '0';
    }

    try {
      // Get output name
      const nameInput = this.container.querySelector('#output-name') as HTMLInputElement | null;
      const outputName = (nameInput?.value && nameInput.value.trim() !== '') ? nameInput.value : this.generateFileName();
      
      // Pass the ORIGINAL formData directly to processDocxToBytes
      // Do NOT pre-format it, as processDocxToBytes will call buildDocxData internally
      const docxBytes = await processDocxToBytes(
        this.state.template.file,
        this.state.formData,
        this.state.template.conditionalOptions || [],
        this.state.template.placeholders || []
      );
      
      // Convert DOCX to PDF
      const pdfBytes = await convertDocxToPdf(new Uint8Array(docxBytes), outputName);
      
      // Download PDF
      downloadPdf(pdfBytes, outputName);
      
      console.log('PDF download completed successfully');
      
      // Show success checkmark
      const statusContainer = this.container.querySelector('#pdf-status-container') as HTMLElement;
      const spinner = this.container.querySelector('#pdf-loading-spinner') as HTMLElement;
      const checkmark = this.container.querySelector('#pdf-success-check') as HTMLElement;
      
      if (spinner) {
        spinner.style.display = 'none';
      }
      if (checkmark) {
        checkmark.style.display = 'block';
        // Trigger reflow to enable transition
        void checkmark.offsetWidth;
        checkmark.style.opacity = '1';
        
        // Hide after 3 seconds with fade out
        setTimeout(() => {
          if (checkmark) {
            checkmark.style.opacity = '0';
            setTimeout(() => {
              if (statusContainer) {
                statusContainer.style.visibility = 'hidden';
              }
            }, 300); // Wait for fade out transition
          }
        }, 3000);
      }
    } catch (error) {
      console.error('PDF download failed:', error);
      this.showError(error instanceof Error ? error.message : 'Failed to generate PDF. Please ensure Microsoft Word is installed.');
      
      // Hide spinner on error
      const statusContainer = this.container.querySelector('#pdf-status-container') as HTMLElement;
      const spinner = this.container.querySelector('#pdf-loading-spinner') as HTMLElement;
      if (spinner) {
        spinner.style.display = 'none';
      }
      if (statusContainer) {
        statusContainer.style.visibility = 'hidden';
      }
    } finally {
      this.state.isProcessing = false;
      this.updateDownloadButton();
    }
  }


  private async handlePreview(): Promise<void> {
    if (!this.state.template) return;
    
    // Reinitialize previewModal if it's null (was closed)
    if (!this.previewModal) {
      this.previewModal = new PreviewModal(this.container);
    }

    // Validate required fields before proceeding
    if (this.dynamicForm && !this.dynamicForm.validateRequiredFields()) {
      return; // Stop if validation fails
    }

    console.log('Starting preview generation...');

    try {
      // Get output name
      const nameInput = this.container.querySelector('#output-name') as HTMLInputElement | null;
      const outputName = (nameInput?.value && nameInput.value.trim() !== '') ? nameInput.value : this.generateFileName();
      
      // Pass the ORIGINAL formData directly to processDocxToBytes
      const docxBytes = await processDocxToBytes(
        this.state.template.file,
        this.state.formData,
        this.state.template.conditionalOptions || [],
        this.state.template.placeholders || []
      );
      
      // Convert Uint8Array to ArrayBuffer for the preview modal
      const arrayBuffer = new Uint8Array(docxBytes).buffer;
      
      // Show preview modal with the generated document and form data
      const bulkModeData = this.bulkModeState?.isActive ? {
        items: this.bulkModeState.items,
        selectedItemId: this.bulkModeState.selectedItemId
      } : undefined;
      
      // Import docxProcessor for bulk mode
      const docxProcessor = await import('./utils/docxProcessor.js');
      
      await this.previewModal.show(
        arrayBuffer, 
        `${outputName}.docx`, 
        this.state.formData, 
        bulkModeData,
        this.state.template,
        docxProcessor
      );
      
      console.log('Preview displayed successfully');
    } catch (error) {
      console.error('Preview generation failed:', error);
      this.showError(error instanceof Error ? error.message : 'Failed to generate preview');
    }
  }

  private showError(message: string): void {
    this.state.error = message;
    const errorSection = this.container.querySelector('#error-section') as HTMLElement;
    const errorText = this.container.querySelector('#error-text') as HTMLElement;
    
    errorText.textContent = message;
    errorSection.style.display = 'block';
  }

  private async refreshPreviewIfOpen(): Promise<void> {
    console.log('refreshPreviewIfOpen called, previewModal exists:', !!this.previewModal);
    if (!this.previewModal) {
      console.log('No preview modal open, skipping refresh');
      return;
    }

    try {
      let currentFormData: Record<string, any>;
      
      // In bulk mode, get the effective fields for the currently selected item
      if (this.bulkModeState?.isActive && this.bulkModeState.selectedItemId && this.bulkModeManager) {
        currentFormData = this.bulkModeManager.getItemEffectiveFields(this.bulkModeState.selectedItemId);
        console.log('Using effective fields for selected item in bulk mode:', currentFormData);
      } else {
        // For single document mode, use the global state
        currentFormData = this.state.formData;
        console.log('Using global state form data for single document mode:', currentFormData);
      }
      
      // Get current bulk mode data if active
      const bulkModeData = this.bulkModeState?.isActive ? {
        items: this.bulkModeState.items,
        selectedItemId: this.bulkModeState.selectedItemId
      } : undefined;

      console.log('Bulk mode data for refresh:', bulkModeData);

      // Refresh the preview with updated data
      console.log('Calling previewModal.refresh...');
      await this.previewModal.refresh(currentFormData, bulkModeData);
      console.log('Preview refresh completed');
    } catch (error) {
      console.error('Error refreshing preview:', error);
    }
  }

  private hideError(): void {
    this.state.error = null;
    const errorSection = this.container.querySelector('#error-section') as HTMLElement;
    errorSection.style.display = 'none';
  }

  private handleBulkModeRequested(): void {
    if (this.bulkModeManager) {
      this.bulkModeManager.selectFolder().catch(error => {
        this.showError(error.message);
      });
    }
  }

  private updateBulkModeState(state: BulkModeState): void {
    // Store the bulk mode state in the App
    this.bulkModeState = state;
    
    console.log('updateBulkModeState called with:', {
      isActive: state.isActive,
      itemsCount: state.items?.length || 0,
      selectedItemId: state.selectedItemId,
      hasDynamicForm: !!this.dynamicForm
    });
    
    // If bulk mode is active but no DynamicForm exists, create one with proper placeholders
    if (state.isActive && !this.dynamicForm) {
      // Show the content section when bulk mode is activated
      this.showContentForBulkMode();
      
      const container = this.container.querySelector('#form-container') as HTMLElement;
      
      if (!container) {
        console.error('Form container not found!');
        return;
      }
      
      // Get placeholders from the current template or create empty ones
      const placeholders = this.state.template?.placeholders || [];
      const conditionalOptions = this.state.template?.conditionalOptions || [];
      
      this.dynamicForm = new DynamicForm(
        container,
        placeholders,
        conditionalOptions,
        {}, // Empty form data
        (formData) => this.handleFormDataChange(formData),
        'Bulk Mode', // Document name
        () => this.handleBulkModeRequested(),
        () => this.handleDownloadAll(),
        () => this.handleDownloadAllPdfs(),
        (pdfName) => this.handlePdfImported(pdfName),
        () => this.handlePreview(),
      );
    }
    
    // Update the DynamicForm's bulk mode state
    if (this.dynamicForm) {
      this.dynamicForm.setBulkModeState(state.isActive, state.items.filter(item => item.include).length);
    }
    
    console.log('Bulk mode debug:', {
      isActive: state.isActive,
      itemsCount: state.items.length,
      hasDynamicForm: !!this.dynamicForm
    });
    
        // Render PDF tabs in bulk mode
        if (state.isActive && this.dynamicForm) {
          // Auto-select first item if none selected and we have items
          if (!state.selectedItemId && state.items.length > 0) {
            state.selectedItemId = state.items[0].id;
            // Populate form with first item's effective data
            const firstItem = state.items[0];
            const effectiveFields = this.bulkModeManager?.getItemEffectiveFields(firstItem.id) || firstItem.fields;
            if (effectiveFields && Object.keys(effectiveFields).length > 0) {
              this.dynamicForm.populateForm(effectiveFields);
              console.log('Auto-populated form with first item effective data:', firstItem.fileName);
            }
          }
          
          console.log('Rendering tabs with items:', state.items.length, 'selectedItemId:', state.selectedItemId);
          this.dynamicForm.renderBulkModeTabs(state.items, state.selectedItemId || undefined);
        }
    
    // Tabs are now handled by DynamicForm
  }

  private handleBulkItemSelect(itemId: string): void {
    if (this.bulkModeManager) {
      this.bulkModeManager.selectItem(itemId);
    }
  }

  private handleBulkItemToggle(itemId: string): void {
    if (this.bulkModeManager) {
      this.bulkModeManager.toggleItemInclude(itemId);
    }
  }

  private handleClearBulkMode(): void {
    if (this.bulkModeManager) {
      this.bulkModeManager.clearBulkMode();
    }
  }

  private handleUseInMainForm(item: any): void {
    // Copy the item's fields to the main form
    if (this.dynamicForm) {
      // This would need to be implemented in DynamicForm
      // For now, just show a message
      this.showError('Use in main form feature coming soon');
    }
  }

  private handlePopulateMainForm(item: any): void {
    // Convert PDF fields to form data and populate the main form
    const formData: FormData = {};
    
    // Get available template placeholders for better mapping
    const templatePlaceholders = this.state.template?.placeholders || [];
    const templateKeys = templatePlaceholders.map((p: PlaceholderField) => p.key.toLowerCase());
    const templateOriginalKeys = templatePlaceholders.map((p: PlaceholderField) => p.originalKey);
    
    console.log('Template placeholders for mapping:', templatePlaceholders.map((p: PlaceholderField) => `${p.originalKey} -> ${p.key}`));
    console.log('PDF fields to map:', Object.keys(item.fields));
    
    Object.entries(item.fields).forEach(([key, value]) => {
      // Convert field names to match the template placeholders
      let normalizedKey = key.toLowerCase()
        .replace(/^field_/, '') // Remove field_ prefix if present
        .replace(/_/g, ' ') // Replace underscores with spaces
        .replace(/\s+/g, ' ') // Normalize multiple spaces
        .trim();
      
      // Try to find a matching template placeholder
      let mappedKey = normalizedKey;
      
      // First try exact match with canonical keys
      if (templateKeys.includes(normalizedKey)) {
        // Find the original key that corresponds to this canonical key
        const matchingPlaceholder = templatePlaceholders.find((p: PlaceholderField) => p.key.toLowerCase() === normalizedKey);
        mappedKey = matchingPlaceholder ? matchingPlaceholder.originalKey : normalizedKey;
      } else {
        // Try fuzzy matching with canonical keys
        const fuzzyMatch = templateKeys.find((templateKey: string) => {
          // Check if the normalized key contains the template key or vice versa
          return templateKey.includes(normalizedKey) || 
                 normalizedKey.includes(templateKey) ||
                 this.areKeysSimilar(normalizedKey, templateKey);
        });
        
        if (fuzzyMatch) {
          // Find the original key that corresponds to this canonical key
          const matchingPlaceholder = templatePlaceholders.find((p: PlaceholderField) => p.key.toLowerCase() === fuzzyMatch);
          mappedKey = matchingPlaceholder ? matchingPlaceholder.originalKey : normalizedKey;
        } else {
          // Try direct match with original keys (case-insensitive)
          const originalMatch = templateOriginalKeys.find((originalKey: string) => 
            originalKey.toLowerCase() === normalizedKey
          );
          if (originalMatch) {
            mappedKey = originalMatch;
          } else {
            // Use the original normalized key as fallback
            mappedKey = normalizedKey;
          }
        }
      }
      
      formData[mappedKey] = String(value || '');
      console.log(`Mapped PDF field: "${key}" -> "${mappedKey}" = "${value}"`);
    });
    
    // Update the form data in the app state
    this.state.formData = formData;
    
    // Re-render the dynamic form with the new data
    if (this.dynamicForm) {
      this.renderDynamicForm();
    }
    
    console.log(`Populated main form with data from ${item.fileName}:`, formData);
  }
  
  private areKeysSimilar(key1: string, key2: string): boolean {
    // Simple similarity check - can be improved
    const words1 = key1.split(' ').sort();
    const words2 = key2.split(' ').sort();
    
    // Check if they share most words
    const commonWords = words1.filter(word => words2.includes(word));
    return commonWords.length >= Math.min(words1.length, words2.length) * 0.7;
  }

        private isRemoteAccess(): boolean {
          // Check if the app is being accessed remotely (not localhost)
          return window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
        }

        private async handleDownloadAll(): Promise<void> {
          if (!this.bulkModeManager) return;

          try {
            const includedItems = this.bulkModeManager.getIncludedItems();
            console.log('==== BULK DOWNLOAD DOCUMENTS ====');
            console.log('Total items to download:', includedItems.length);
            console.log('Items:', includedItems.map(item => ({ 
              id: item.id,
              fileName: item.fileName, 
              displayName: item.displayName,
              include: item.include 
            })));
            
            if (includedItems.length === 0) {
              this.showError('No files selected for download');
              return;
            }

            // Always prompt for folder selection
            let downloadDirHandle: FileSystemDirectoryHandle | null = null;
            try {
              const originalDirHandle = this.bulkModeManager.getSelectedDirHandle();
              downloadDirHandle = await (window as any).showDirectoryPicker({
                mode: 'readwrite',
                startIn: originalDirHandle || 'downloads'
              });
            } catch (error) {
              // User cancelled folder selection
              return;
            }

            // Show loading spinner after folder selection
            const statusContainer = this.container.querySelector('#pdf-status-container') as HTMLElement;
            const spinner = this.container.querySelector('#pdf-loading-spinner') as HTMLElement;
            const checkmark = this.container.querySelector('#pdf-success-check') as HTMLElement;
            
            if (statusContainer) {
              statusContainer.style.visibility = 'visible';
            }
            if (spinner) {
              spinner.style.display = 'block';
            }
            if (checkmark) {
              checkmark.style.display = 'none';
              checkmark.style.opacity = '0';
            }

            this.state.isProcessing = true;
            this.updateDownloadButton();

            // Process each item and download
            for (let i = 0; i < includedItems.length; i++) {
              const item = includedItems[i];
              const fileName = this.bulkModeManager.generateFileName(item.fileName, i + 1, item.id);
              console.log(`Generating file ${i + 1}/${includedItems.length}: ${fileName}`);

              try {
                // Get the template file from the current state
                if (!this.state.template) {
                  throw new Error('No template selected');
                }
                
                // Use effective fields (edited if available, otherwise original PDF data)
                const formData: FormData = this.bulkModeManager.getItemEffectiveFields(item.id);
                
                console.log(`Processing ${fileName} with effective data:`, formData);
                
                // Process the DOCX template with the current form data
                const docxBytes = await processDocxToBytes(
                  this.state.template.file, 
                  formData, 
                  this.state.template.conditionalOptions || [],
                  this.state.template.placeholders || []
                );
                
                // Write to the selected folder
                const fileHandle = await downloadDirHandle!.getFileHandle(`${fileName}.docx`, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(new Uint8Array(docxBytes));
                await writable.close();

                console.log(`Downloaded: ${fileName}.docx`);
              } catch (error) {
                console.error(`Failed to generate ${fileName}:`, error);
                // Continue with other files
              }
            }

            this.state.isProcessing = false;
            this.updateDownloadButton();
            
            // Show success checkmark
            if (spinner) spinner.style.display = 'none';
            if (checkmark) {
              checkmark.style.display = 'block';
              void checkmark.offsetWidth;
              checkmark.style.opacity = '1';
              setTimeout(() => {
                if (checkmark) {
                  checkmark.style.opacity = '0';
                  setTimeout(() => {
                    if (statusContainer) statusContainer.style.visibility = 'hidden';
                  }, 300);
                }
              }, 3000);
            }
          } catch (error) {
            this.state.isProcessing = false;
            this.updateDownloadButton();
            
            const statusContainer = this.container.querySelector('#pdf-status-container') as HTMLElement;
            const spinner = this.container.querySelector('#pdf-loading-spinner') as HTMLElement;
            if (spinner) spinner.style.display = 'none';
            if (statusContainer) statusContainer.style.visibility = 'hidden';
            
            this.showError(`Bulk download failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }


        private async handleDownloadAllPdfs(): Promise<void> {
          if (!this.bulkModeManager) return;

          try {
            const includedItems = this.bulkModeManager.getIncludedItems();
            console.log('==== BULK DOWNLOAD PDFs ====');
            console.log('Total items to download:', includedItems.length);
            console.log('Items:', includedItems.map(item => ({ 
              id: item.id,
              fileName: item.fileName, 
              displayName: item.displayName,
              include: item.include 
            })));
            
            if (includedItems.length === 0) {
              this.showError('No files selected for download');
              return;
            }

            // Show confirmation dialog
            const confirmDownload = confirm(`You are about to download ${includedItems.length} PDF file(s). This may take a few minutes depending on the number of files and the speed of Microsoft Word. Continue?`);
            if (!confirmDownload) {
              return;
            }

            // Always prompt for folder selection
            let downloadDirHandle: FileSystemDirectoryHandle | null = null;
            try {
              const originalDirHandle = this.bulkModeManager.getSelectedDirHandle();
              downloadDirHandle = await (window as any).showDirectoryPicker({
                mode: 'readwrite',
                startIn: originalDirHandle || 'downloads'
              });
            } catch (error) {
              // User cancelled folder selection
              return;
            }

            // Show loading spinner after folder selection
            const statusContainer = this.container.querySelector('#pdf-status-container') as HTMLElement;
            const spinner = this.container.querySelector('#pdf-loading-spinner') as HTMLElement;
            const checkmark = this.container.querySelector('#pdf-success-check') as HTMLElement;

            if (statusContainer) {
              statusContainer.style.visibility = 'visible';
            }
            if (spinner) {
              spinner.style.display = 'block';
            }
            if (checkmark) {
              checkmark.style.display = 'none';
              checkmark.style.opacity = '0';
            }

            this.state.isProcessing = true;
            this.updateDownloadButton();

            // Process each item and convert to PDF
            for (let i = 0; i < includedItems.length; i++) {
              const item = includedItems[i];
              const fileName = this.bulkModeManager.generateFileName(item.fileName, i + 1, item.id);
              console.log(`Generating PDF ${i + 1}/${includedItems.length}: ${fileName}`);

              try {
                // Get the template file from the current state
                if (!this.state.template) {
                  throw new Error('No template selected');
                }
                
                // Use effective fields (edited if available, otherwise original PDF data)
                const formData: FormData = this.bulkModeManager.getItemEffectiveFields(item.id);
                
                console.log(`Processing PDF ${fileName} with effective data:`, formData);
                
                // Process the DOCX template with the current form data
                const docxBytes = await processDocxToBytes(
                  this.state.template.file, 
                  formData, 
                  this.state.template.conditionalOptions || [],
                  this.state.template.placeholders || []
                );
                
                // Convert DOCX to PDF
                const pdfBytes = await convertDocxToPdf(new Uint8Array(docxBytes), fileName);
                
                // Write to the selected folder
                const fileHandle = await downloadDirHandle!.getFileHandle(`${fileName}.pdf`, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(new Blob([pdfBytes as any]));
                await writable.close();

                console.log(`Downloaded PDF: ${fileName}.pdf`);
              } catch (error) {
                console.error(`Failed to generate PDF ${fileName}:`, error);
                // Continue with other files
              }
            }

            this.state.isProcessing = false;
            this.updateDownloadButton();
            
            // Show success checkmark
            if (spinner) spinner.style.display = 'none';
            if (checkmark) {
              checkmark.style.display = 'block';
              void checkmark.offsetWidth;
              checkmark.style.opacity = '1';
              setTimeout(() => {
                if (checkmark) {
                  checkmark.style.opacity = '0';
                  setTimeout(() => {
                    if (statusContainer) statusContainer.style.visibility = 'hidden';
                  }, 300);
                }
              }, 3000);
            }
          } catch (error) {
            this.state.isProcessing = false;
            this.updateDownloadButton();
            
            const statusContainer = this.container.querySelector('#pdf-status-container') as HTMLElement;
            const spinner = this.container.querySelector('#pdf-loading-spinner') as HTMLElement;
            if (spinner) spinner.style.display = 'none';
            if (statusContainer) statusContainer.style.visibility = 'hidden';
            
            this.showError(`Bulk PDF download failed: ${error instanceof Error ? error.message : 'Unknown error'}. Please ensure Microsoft Word is installed.`);
          }
        }


  // Umbrel-related methods
  private toggleUmbrel(): void {
    const umbrelSection = this.container.querySelector('#umbrel-section') as HTMLElement;
    const settingsSection = this.container.querySelector('#settings-section') as HTMLElement;
    const umbrelToggle = this.container.querySelector('#umbrel-toggle') as HTMLButtonElement;
    
    if (umbrelSection.style.display === 'none') {
      // Show Umbrel section
      umbrelSection.style.display = 'block';
      settingsSection.style.display = 'none';
      umbrelToggle.textContent = '☁️ Umbrel ✓';
      umbrelToggle.style.backgroundColor = '#10b981';
      umbrelToggle.style.color = 'white';
    } else {
      // Hide Umbrel section
      umbrelSection.style.display = 'none';
      umbrelToggle.textContent = '☁️ Umbrel';
      umbrelToggle.style.backgroundColor = '';
      umbrelToggle.style.color = '';
    }
  }

  private toggleSettings(): void {
    const settingsSection = this.container.querySelector('#settings-section') as HTMLElement;
    const umbrelSection = this.container.querySelector('#umbrel-section') as HTMLElement;
    const settingsToggle = this.container.querySelector('#settings-toggle') as HTMLButtonElement;
    
    if (settingsSection.style.display === 'none') {
      // Show settings section
      settingsSection.style.display = 'block';
      umbrelSection.style.display = 'none';
      settingsToggle.textContent = '⚙️ Settings ✓';
      settingsToggle.style.backgroundColor = '#10b981';
      settingsToggle.style.color = 'white';
    } else {
      // Hide settings section
      settingsSection.style.display = 'none';
      settingsToggle.textContent = '⚙️ Settings';
      settingsToggle.style.backgroundColor = '';
      settingsToggle.style.color = '';
    }
  }

  private handleUmbrelConnected(): void {
    this.isUmbrelEnabled = true;
  }

  private handleUmbrelDisconnected(): void {
    this.isUmbrelEnabled = false;
  }

  private async handleLogout(): Promise<void> {
    try {
      // Fully disconnect from Umbrel - clear all credentials regardless of rememberDevice
      await umbrelService.disconnect();
      await umbrelService.clearStoredCredentials();
      
      // Clear Umbrel files from FileUpload component
      if (this.fileUpload) {
        this.fileUpload.clearUmbrelFiles();
      }
      
      // Update UmbrelSettings component to reflect disconnection
      if (this.umbrelSettings) {
        this.umbrelSettings.refresh();
      }
      
      this.handleUmbrelDisconnected();
      
      // Show success message
      this.showToast('Disconnected from Umbrel');
    } catch (error) {
      console.error('Error logging out:', error);
      this.showError('Failed to disconnect from Umbrel');
    }
  }

  private handleShowHelp(): void {
    if (this.helpModal) {
      this.helpModal.show();
    }
  }

  private async handleUmbrelFileSelect(umbrelFile: UmbrelFile): Promise<void> {
    try {
      // Download the file from Umbrel
      const blob = await umbrelService.downloadFile(umbrelFile.path);
      const file = new File([blob], umbrelFile.name, { 
        type: blob.type || 'application/octet-stream',
        lastModified: new Date(umbrelFile.modified).getTime()
      });

      // Add Umbrel metadata
      (file as any).isUmbrel = true;
      (file as any).umbrelPath = umbrelFile.path;

      // Process the file as if it was uploaded normally
      this.handleFileProcessed([], [], file);

      // Show success toast
      this.showToast(`Imported from Umbrel: ${umbrelFile.name}`);

    } catch (error) {
      console.error('Error importing Umbrel file:', error);
      this.showError(error instanceof Error ? error.message : 'Failed to import file from Umbrel');
    }
  }

  private showToast(message: string): void {
    // Create a simple toast notification
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #10b981;
      color: white;
      padding: 12px 20px;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 1000;
      font-size: 14px;
      font-weight: 500;
    `;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    // Remove after 3 seconds
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 3000);
  }
}
