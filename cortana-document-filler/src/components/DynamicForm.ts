import { PlaceholderField, FormData, ConditionalGroup } from '../types.js';
import { generatePlaceholderForm, parseCompletedForm, parseCompletedPDFForm } from '../utils/docxProcessor.js';
import { AnchorTokenImporter } from '../utils/anchorTokenImporter.js';

export class DynamicForm {
  private container: HTMLElement;
  private placeholders: PlaceholderField[];
  private conditionalOptions: ConditionalGroup[];
  private formData: FormData;
  private onChange: (formData: FormData) => void;
  private onBulkModeRequested?: () => void;
  private onDownloadAll?: () => void;
  private onDownloadAllPdfs?: () => void;
  private onPreview?: () => void;
  private documentName: string;
  private bulkModeState: { isActive: boolean; itemsCount: number } = { isActive: false, itemsCount: 0 };
  
  // Bound event handlers to prevent duplicate listeners
  private handleInput = (e: Event) => {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement;
    if (target.name) {
      this.updateFormData(target.name, target.value);
      
      // Clear error styling for fields with (s) when user starts typing
      const placeholder = this.placeholders.find(p => p.key === target.name);
      if (placeholder && placeholder.originalKey.toLowerCase().includes('(s)')) {
        target.style.borderColor = '';
        target.style.backgroundColor = '';
        const fieldContainer = target.closest('.form-field');
        if (fieldContainer) {
          const errorMsg = fieldContainer.querySelector('.field-error');
          if (errorMsg) {
            errorMsg.remove();
          }
        }
      }
    }
  };

  private handleChange = (e: Event) => {
    const target = e.target as HTMLSelectElement;
    if (target.id && target.id.startsWith('conditional-')) {
      // Change text color based on selection
      if (target.value === '') {
        target.style.color = 'var(--text-secondary)'; // Grey for placeholder
      } else {
        target.style.color = 'var(--text-primary)'; // Black for selected option
      }
      console.log(`Conditional option changed: ${target.name} = ${target.value}`);
      this.updateFormData(target.name, target.value);
      
      // Clear any error styling when a selection is made
      if (target.value !== '') {
        target.style.borderColor = '';
        target.style.backgroundColor = '';
        const errorMsg = target.parentElement?.querySelector('.field-error');
        if (errorMsg) {
          errorMsg.remove();
        }
      }
      
      // Re-render the form to show/hide conditional placeholders
      console.log('🔄 Re-rendering form due to conditional option change...');
      this.render();
    }
  };

  private handleClick = (e: Event) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('btn-add-more') || target.classList.contains('btn-add-more-inline')) {
      const fieldKey = target.getAttribute('data-field');
      if (fieldKey) {
        this.addMultipleEntry(fieldKey);
      }
    } else if (target.classList.contains('btn-remove-entry')) {
      const index = parseInt(target.getAttribute('data-index') || '0');
      const fieldKey = target.closest('.multiple-field')?.querySelector('.btn-add-more, .btn-add-more-inline')?.getAttribute('data-field');
      if (fieldKey) {
        this.removeMultipleEntry(fieldKey, index);
      }
    }
  };

  private handleSubmit = (e: Event) => {
    e.preventDefault();
    if (this.validateRequiredFields()) {
      // Form is valid, allow submission
      console.log('Form validation passed');
    }
  };

  constructor(
    container: HTMLElement,
    placeholders: PlaceholderField[],
    conditionalOptions: ConditionalGroup[],
    initialData: FormData,
    onChange: (formData: FormData) => void,
    documentName: string,
    onBulkModeRequested?: () => void,
    onDownloadAll?: () => void,
    onDownloadAllPdfs?: () => void,
    private onPdfImported?: (pdfName: string) => void,
    onPreview?: () => void,
  ) {
    this.container = container;
    this.placeholders = sortPlaceholders(placeholders);
    this.conditionalOptions = conditionalOptions;
    this.formData = { ...initialData };
    this.onChange = onChange;
    this.onBulkModeRequested = onBulkModeRequested;
    this.onDownloadAll = onDownloadAll;
    this.onDownloadAllPdfs = onDownloadAllPdfs;
    this.onPreview = onPreview;
    this.documentName = documentName;
    this.render();
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="form-container">
        <div class="form-header">
          <h3>Fill in the Details</h3>
          <h4>${this.documentName}</h4>
        </div>
        <div class="form-actions" style="margin-bottom: 1.5rem; display: flex; align-items: flex-start; gap: 1rem; flex-wrap: wrap;">
          <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
            <button type="button" class="btn btn-secondary" id="export-data">Export Data (PDF)</button>
            <button type="button" class="btn btn-secondary" id="import-data">Import Data (PDF)</button>
            <button type="button" class="btn btn-secondary" id="bulk-mode-btn">
              <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px; margin-right: 0.5rem;">
                <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H5a2 2 0 0 0-2-2z"/>
                <path d="M8 21v-4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v4"/>
                <path d="M12 3v18"/>
              </svg>
              Bulk Mode
            </button>
            <button type="button" class="btn btn-secondary" id="clear-form">Clear Form</button>
            <button type="button" class="btn btn-secondary" id="preview-document-btn" style="border-radius: 20px; display: flex !important; align-items: center !important; visibility: visible !important;">
              <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px; margin-right: 0.5rem; vertical-align: middle;">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              Preview
            </button>
          </div>
          <input type="file" id="import-input" accept=".pdf" style="display: none;">
        </div>
        
        <!-- Bulk Mode PDF Tabs (only visible in bulk mode) -->
        <div id="bulk-mode-tabs-container" style="display: none; margin: 1rem 0; border-bottom: 1px solid #e5e7eb;">
          <div class="pdf-tabs" style="
            display: flex;
            gap: 0;
            overflow-x: auto;
            padding: 0;
            min-height: 32px;
            align-items: flex-end;
          ">
            <!-- PDF tabs will be rendered here -->
          </div>
        </div>
        ${this.conditionalOptions.length > 0 ? this.renderConditionalOptions() : ''}
        <form class="dynamic-form" id="dynamic-form">
          ${this.renderGroupedFields()}
        </form>
        
        <!-- Download All Button (only visible in bulk mode) -->
        <div id="download-all-container" style="display: none; margin-top: 2rem; text-align: center;">
          <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
            <button type="button" class="btn btn-primary" id="download-all-btn" style="padding: 0.75rem 2rem;">
              <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px; margin-right: 0.5rem;">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7,10 12,15 17,10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download All
            </button>
            <button type="button" class="btn btn-primary" id="download-all-pdfs-btn" style="padding: 0.75rem 2rem; background-color: #ef4444;">
              <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px; margin-right: 0.5rem;">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7,10 12,15 17,10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download PDFs
            </button>
          </div>
        </div>
      </div>
    `;

    this.setupEventListeners();
    
    // Set initial color for conditional options dropdowns
    this.container.querySelectorAll('.form-select').forEach((select) => {
      (select as HTMLElement).style.color = 'var(--text-secondary)'; // Grey for placeholder
    });
    
    // Banner visibility is now controlled by App.ts
  }

  // Method to show/hide Download All button based on bulk mode state
  public setBulkModeState(isActive: boolean, itemCount: number = 0): void {
    // Update internal state
    this.bulkModeState = { isActive, itemsCount: itemCount };
    
    const downloadAllContainer = this.container.querySelector('#download-all-container') as HTMLElement;
    const downloadAllBtn = this.container.querySelector('#download-all-btn') as HTMLButtonElement;
    const downloadAllPdfsBtn = this.container.querySelector('#download-all-pdfs-btn') as HTMLButtonElement;
    const tabsContainer = this.container.querySelector('#bulk-mode-tabs-container') as HTMLElement;
    
    console.log('setBulkModeState called:', { isActive, itemCount });
    
    // Keep download-all-container hidden - we use the main download buttons at the bottom instead
    if (downloadAllContainer) {
      downloadAllContainer.style.display = 'none';
    }
    
    if (tabsContainer) {
      tabsContainer.style.display = isActive ? 'block' : 'none';
      console.log('Tabs container visibility set to:', isActive ? 'block' : 'none');
      console.log('Tabs container element:', tabsContainer);
    } else {
      console.log('Tabs container not found in setBulkModeState!');
    }
    
    if (downloadAllBtn && isActive) {
      downloadAllBtn.innerHTML = `
        <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px; margin-right: 0.5rem;">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7,10 12,15 17,10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Download All (${itemCount} files)
      `;
    }
    
    if (downloadAllPdfsBtn && isActive) {
      downloadAllPdfsBtn.innerHTML = `
        <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px; margin-right: 0.5rem;">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7,10 12,15 17,10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Download PDFs (${itemCount} files)
      `;
    }
  }

  // Method to render PDF tabs for bulk mode
  public renderBulkModeTabs(items: any[], selectedItemId?: string): void {
    console.log('renderBulkModeTabs called with:', { items: items.length, selectedItemId });
    const tabsContainer = this.container.querySelector('#bulk-mode-tabs-container .pdf-tabs') as HTMLElement;
    console.log('Tabs container found:', !!tabsContainer);
    if (!tabsContainer) {
      console.log('No tabs container found!');
      return;
    }

    if (items.length === 0) {
      tabsContainer.innerHTML = '';
      console.log('No items, clearing tabs');
      return;
    }

    const tabsHtml = items.map((item, index) => {
      const displayName = item.displayName || item.fileName.replace('.pdf', '');
      return `
        <div 
          class="pdf-tab ${selectedItemId === item.id ? 'active' : ''}" 
          data-item-id="${item.id}"
          style="
            padding: 0.25rem 0.75rem;
            border: 1px solid ${selectedItemId === item.id ? '#3b82f6' : '#d1d5db'};
            background: ${selectedItemId === item.id ? '#3b82f6' : '#ffffff'};
            color: ${selectedItemId === item.id ? 'white' : '#374151'};
            border-radius: 0.375rem 0.375rem 0 0;
            cursor: pointer;
            white-space: nowrap;
            font-size: 0.8125rem;
            font-weight: 500;
            transition: all 0.15s ease;
            display: flex;
            align-items: center;
            gap: 0.25rem;
            min-width: 100px;
            justify-content: space-between;
            margin: 0 2px 0 0;
            z-index: 1000;
            position: relative;
            height: 32px;
            border-bottom: ${selectedItemId === item.id ? 'none' : '1px solid #d1d5db'};
          "
        >
          <div style="display: flex; align-items: center; gap: 0.125rem; flex: 1; min-width: 0;">
            <span 
              class="tab-name" 
              data-item-id="${item.id}"
              style="
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                max-width: 80px;
                font-size: 0.8125rem;
                line-height: 1.2;
              "
            >${displayName}</span>
          </div>
          <span 
            class="tab-delete-btn" 
            data-item-id="${item.id}"
            style="
              color: ${selectedItemId === item.id ? 'white' : '#6b7280'};
              cursor: pointer;
              padding: 0.125rem;
              border-radius: 0.25rem;
              font-size: 0.875rem;
              font-weight: bold;
              display: flex;
              align-items: center;
              justify-content: center;
              width: 1rem;
              height: 1rem;
              transition: all 0.15s ease;
              line-height: 1;
              flex-shrink: 0;
            "
            onmouseover="this.style.background='rgba(239,68,68,0.1)'; this.style.color='#dc2626'"
            onmouseout="this.style.background='none'; this.style.color='${selectedItemId === item.id ? 'white' : '#6b7280'}'"
          >
            ×
          </span>
        </div>
      `;
    }).join('');

    // Add the + button for creating new tabs
    const addButtonHtml = `
      <div 
        class="pdf-tab add-tab-btn" 
        style="
          padding: 0.25rem 0.75rem;
          border: 1px dashed #3b82f6;
          background: #ffffff;
          color: #3b82f6;
          border-radius: 0.375rem 0.375rem 0 0;
          cursor: pointer;
          white-space: nowrap;
          font-size: 0.8125rem;
          font-weight: 500;
          transition: all 0.15s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          min-width: 32px;
          margin: 0 2px 0 0;
          z-index: 1000;
          position: relative;
          height: 32px;
          border-bottom: 1px solid #d1d5db;
        "
        title="Add new tab"
      >
        <span style="font-size: 1rem; font-weight: bold;">+</span>
      </div>
    `;

    tabsContainer.innerHTML = tabsHtml + addButtonHtml;
    console.log('PDF tabs rendered:', items.length, 'tabs');
    console.log('Tabs HTML:', tabsHtml);
    console.log('Tabs container after rendering:', tabsContainer);
    
    // Force visibility and check dimensions
    const outerContainer = this.container.querySelector('#bulk-mode-tabs-container') as HTMLElement;
    if (outerContainer) {
      outerContainer.style.display = 'block';
      outerContainer.style.visibility = 'visible';
      outerContainer.style.opacity = '1';
      console.log('Outer container visibility forced:', {
        display: outerContainer.style.display,
        visibility: outerContainer.style.visibility,
        opacity: outerContainer.style.opacity,
        height: outerContainer.offsetHeight,
        width: outerContainer.offsetWidth
      });
    }
    
    // Set up click handlers for the tabs
    this.setupTabClickHandlers();
  }

  private getStatusIcon(status: string): string {
    switch (status) {
      case 'ok': return '✓';
      case 'warning': return '!';
      case 'error': return '✕';
      default: return '?';
    }
  }

  private getBulkModeItemById(itemId: string): any {
    // This is a helper method to get item details for the confirmation dialog
    // We'll need to access the bulk mode items from the parent App
    // For now, return null and let the App handle the item lookup
    return null;
  }

  private setupTabClickHandlers(): void {
    const tabs = this.container.querySelectorAll('.pdf-tab');
    const deleteButtons = this.container.querySelectorAll('.tab-delete-btn');
    const tabNames = this.container.querySelectorAll('.tab-name');
    const addButton = this.container.querySelector('.add-tab-btn');
    console.log('Setting up click handlers for', tabs.length, 'tabs and', deleteButtons.length, 'delete buttons');
    
    // Set up tab click handlers (excluding add button and tab names)
    tabs.forEach(tab => {
      // Skip the add button
      if (tab.classList.contains('add-tab-btn')) {
        return;
      }
      
      // Remove any existing event listeners to prevent duplicates
      const existingHandler = (tab as any)._clickHandler;
      if (existingHandler) {
        tab.removeEventListener('click', existingHandler);
      }
      
      const clickHandler = (e: Event) => {
        // Don't handle clicks on delete buttons or tab names
        const target = e.target as HTMLElement;
        if (target.classList.contains('tab-delete-btn') || target.classList.contains('tab-name')) {
          return;
        }
        
        e.preventDefault();
        e.stopPropagation();
        
        const div = e.currentTarget as HTMLDivElement;
        if (div) {
          const itemId = div.getAttribute('data-item-id');
          console.log('Tab clicked:', itemId);
          
          if (itemId) {
            const event = new CustomEvent('bulkModeTabClick', {
              detail: { itemId },
              bubbles: true
            });
            this.container.dispatchEvent(event);
          }
        }
      };
      
      // Store the handler reference for cleanup
      (tab as any)._clickHandler = clickHandler;
      tab.addEventListener('click', clickHandler);
    });
    
    // Set up delete button click handlers
    deleteButtons.forEach(deleteBtn => {
      // Remove any existing event listeners to prevent duplicates
      const existingHandler = (deleteBtn as any)._deleteClickHandler;
      if (existingHandler) {
        deleteBtn.removeEventListener('click', existingHandler);
      }
      
      const deleteClickHandler = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        
        const span = e.currentTarget as HTMLSpanElement;
        const itemId = span.getAttribute('data-item-id');
        console.log('Delete button clicked for item:', itemId);
        
        if (itemId) {
          // Show confirmation dialog
          const item = this.getBulkModeItemById(itemId);
          const fileName = item ? item.fileName : 'this PDF';
          
          if (confirm(`Are you sure you want to remove this tab? This action cannot be undone.`)) {
            // Dispatch a custom event to notify the parent App
            const event = new CustomEvent('bulkModeTabDelete', {
              detail: { itemId },
              bubbles: true
            });
            this.container.dispatchEvent(event);
          }
        }
      };
      
      // Store the handler reference for cleanup
      (deleteBtn as any)._deleteClickHandler = deleteClickHandler;
      deleteBtn.addEventListener('click', deleteClickHandler);
    });

    // Set up click and double-click handlers for tab names
    tabNames.forEach(tabName => {
      // Remove any existing event listeners to prevent duplicates
      const existingClickHandler = (tabName as any)._clickHandler;
      const existingDblClickHandler = (tabName as any)._dblClickHandler;
      
      if (existingClickHandler) {
        tabName.removeEventListener('click', existingClickHandler);
      }
      if (existingDblClickHandler) {
        tabName.removeEventListener('dblclick', existingDblClickHandler);
      }
      
      // Use a timeout-based approach for double-click detection
      let clickTimeout: number | null = null;
      let clickCount = 0;
      
      const clickHandler = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        
        const itemId = tabName.getAttribute('data-item-id');
        console.log('Tab name clicked:', itemId, 'click count:', clickCount + 1);
        
        clickCount++;
        
        if (clickCount === 1) {
          // First click - set a timeout to detect double-click
          clickTimeout = window.setTimeout(() => {
            // Single click - select tab
            if (itemId) {
              const event = new CustomEvent('bulkModeTabClick', {
                detail: { itemId },
                bubbles: true
              });
              this.container.dispatchEvent(event);
            }
            clickCount = 0;
          }, 300); // 300ms delay to detect double-click
        } else if (clickCount === 2) {
          // Double click - rename tab
          if (clickTimeout) {
            clearTimeout(clickTimeout);
            clickTimeout = null;
          }
          
          console.log('Tab double-clicked for rename:', itemId, 'element:', tabName);
          
          if (itemId) {
            console.log('Starting tab name edit for item:', itemId);
            this.startTabNameEdit(itemId, tabName as HTMLElement);
          } else {
            console.log('No itemId found for double-clicked tab name');
          }
          clickCount = 0;
        }
      };
      
      // Store the handler reference for cleanup
      (tabName as any)._clickHandler = clickHandler;
      tabName.addEventListener('click', clickHandler);
    });

    // Set up add button click handler with better debouncing
    if (addButton) {
      // Remove any existing event listeners to prevent duplicates
      const existingHandler = (addButton as any)._addClickHandler;
      if (existingHandler) {
        addButton.removeEventListener('click', existingHandler);
      }
      
      const addClickHandler = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('Add tab button clicked');
        
        // Add a small delay to prevent rapid clicking
        if ((addButton as any)._isProcessing) {
          console.log('Add button is already processing, ignoring click');
          return;
        }
        
        (addButton as any)._isProcessing = true;
        
        // Dispatch a custom event to notify the parent App
        const event = new CustomEvent('bulkModeAddTab', {
          detail: {},
          bubbles: true
        });
        this.container.dispatchEvent(event);
        
        // Reset the processing flag after a short delay
        setTimeout(() => {
          (addButton as any)._isProcessing = false;
        }, 300);
      };
      
      // Store the handler reference for cleanup
      (addButton as any)._addClickHandler = addClickHandler;
      addButton.addEventListener('click', addClickHandler);
    }
  }


  // Method to start editing a tab name
  private startTabNameEdit(itemId: string, tabNameElement: HTMLElement): void {
    console.log('startTabNameEdit called with itemId:', itemId, 'element:', tabNameElement);
    const currentName = tabNameElement.textContent || '';
    console.log('Current name:', currentName);
    
    // Create input element
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentName;
    input.style.cssText = `
      background: transparent;
      border: 1px solid #3b82f6;
      border-radius: 3px;
      padding: 1px 4px;
      font-size: 0.8125rem;
      font-weight: 500;
      color: inherit;
      width: 100%;
      min-width: 60px;
      max-width: 80px;
      height: 20px;
    `;
    
    // Replace the span with input
    const parent = tabNameElement.parentElement;
    if (parent) {
      parent.replaceChild(input, tabNameElement);
      input.focus();
      input.select();
      
      // Handle save on blur or enter
      const saveEdit = () => {
        const newName = input.value.trim();
        if (newName && newName !== currentName) {
          // Dispatch event to update the display name
          const event = new CustomEvent('bulkModeTabRename', {
            detail: { itemId, newName },
            bubbles: true
          });
          this.container.dispatchEvent(event);
        }
        
        // Replace input with span
        const newSpan = document.createElement('span');
        newSpan.className = 'tab-name';
        newSpan.setAttribute('data-item-id', itemId);
        newSpan.style.cssText = `
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 80px;
          font-size: 0.8125rem;
          line-height: 1.2;
        `;
        newSpan.textContent = newName || currentName;
        
        parent.replaceChild(newSpan, input);
        
        // Re-setup the double-click handler
        newSpan.addEventListener('dblclick', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.startTabNameEdit(itemId, e.target as HTMLElement);
        });
      };
      
      // Handle escape key to cancel
      const cancelEdit = () => {
        const newSpan = document.createElement('span');
        newSpan.className = 'tab-name';
        newSpan.setAttribute('data-item-id', itemId);
        newSpan.style.cssText = `
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 80px;
          font-size: 0.8125rem;
          line-height: 1.2;
        `;
        newSpan.textContent = currentName;
        
        parent.replaceChild(newSpan, input);
        
        // Re-setup the double-click handler
        newSpan.addEventListener('dblclick', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.startTabNameEdit(itemId, e.target as HTMLElement);
        });
      };
      
      input.addEventListener('blur', saveEdit);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          saveEdit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancelEdit();
        }
      });
    }
  }

  // Method to populate form with data from selected PDF
  public populateForm(data: any): void {
    console.log('DynamicForm.populateForm called with data:', data);
    console.log('Data keys:', Object.keys(data || {}));
    console.log('Data values:', data);
    
    this.formData = { ...data };
    
    // Update form fields without re-rendering the entire form (which would remove tabs)
    this.updateFormFields();
    this.onChange(this.formData);
    console.log('Form populated successfully. New formData:', this.formData);
  }

  // Method to update form fields without re-rendering the entire form
  private updateFormFields(): void {
    // First, clear all form input fields
    const allInputs = this.container.querySelectorAll('input, textarea');
    allInputs.forEach(input => {
      if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
        input.value = '';
      }
    });

    // Then update fields with the current formData
    Object.keys(this.formData).forEach(key => {
      // Find the matching template placeholder key
      const templateKey = this.findMatchingTemplateKey(key);
      if (templateKey) {
        const input = this.container.querySelector(`input[name="${templateKey}"], textarea[name="${templateKey}"]`) as HTMLInputElement | HTMLTextAreaElement;
        if (input) {
          input.value = String(this.formData[key] || '');
        }
      }
    });
  }

  // Method to find matching template key for a given data key
  private findMatchingTemplateKey(dataKey: string): string | null {
    // First try exact match
    if (this.placeholders.some(p => p.key === dataKey)) {
      return dataKey;
    }

    // Try case-insensitive match
    const caseInsensitiveMatch = this.placeholders.find(p => 
      p.key.toLowerCase() === dataKey.toLowerCase()
    );
    if (caseInsensitiveMatch) {
      return caseInsensitiveMatch.key;
    }

    // Try normalized match (spaces vs underscores, etc.)
    const normalizedDataKey = dataKey.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizedMatch = this.placeholders.find(p => {
      const normalizedTemplateKey = p.key.toLowerCase().replace(/[^a-z0-9]/g, '');
      return normalizedTemplateKey === normalizedDataKey;
    });
    if (normalizedMatch) {
      return normalizedMatch.key;
    }

    // Try fuzzy matching for common variations
    const fuzzyMatch = this.placeholders.find(p => {
      const templateKey = p.key.toLowerCase();
      const dataKeyLower = dataKey.toLowerCase();
      
      // Check if one contains the other or they're very similar
      return templateKey.includes(dataKeyLower) || 
             dataKeyLower.includes(templateKey) ||
             this.areKeysSimilar(templateKey, dataKeyLower);
    });
    if (fuzzyMatch) {
      return fuzzyMatch.key;
    }

    return null;
  }

  // Helper method to check if two keys are similar
  private areKeysSimilar(key1: string, key2: string): boolean {
    const normalize = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
    const norm1 = normalize(key1);
    const norm2 = normalize(key2);
    
    // Check if they're very similar (allowing for small differences)
    if (Math.abs(norm1.length - norm2.length) > 2) return false;
    
    // Check if they share most characters
    let matches = 0;
    const minLength = Math.min(norm1.length, norm2.length);
    for (let i = 0; i < minLength; i++) {
      if (norm1[i] === norm2[i]) matches++;
    }
    
    return matches / minLength > 0.8;
  }

  private renderField(placeholder: PlaceholderField): string {
    const value = this.formData[placeholder.key] || placeholder.defaultValue || '';
    const isRequired = false;
    const isDateLike = /date/i.test(placeholder.originalKey);
    const safeId = placeholder.key
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'field';
    const fieldId = `field-${safeId}`;

    // Handle multiple entry fields
    if (placeholder.isMultiple) {
      const values = Array.isArray(value) ? value : [''];
      return this.renderMultipleField(placeholder, values, fieldId);
    }

    let inputElement = '';
    
    switch (placeholder.type) {
      case 'number':
        inputElement = `
          <input 
            type="number" 
            id="${fieldId}" 
            name="${placeholder.key}" 
            value="${value}" 
            class="form-input"
            placeholder="Enter a number"
          >
        `;
        break;
      case 'date':
        inputElement = `
          <input 
            type="text" 
            id="${fieldId}" 
            name="${placeholder.key}" 
            value="${value}" 
            class="form-input"
            placeholder="e.g. 1 July 2025"
          >
        `;
        break;
      case 'multiline':
        inputElement = `
          <textarea 
            id="${fieldId}" 
            name="${placeholder.key}" 
            class="form-input form-textarea"
            placeholder="Enter multiple lines of text"
            rows="4"
          >${value}</textarea>
        `;
        break;
      default:
        // Check if this is a token ticker field
        const isTokenTicker = placeholder.originalKey.toLowerCase().includes('ticker');
        inputElement = `
          <input 
            type="text" 
            id="${fieldId}" 
            name="${placeholder.key}" 
            value="${value}" 
            class="form-input"
            placeholder="${isDateLike ? 'e.g. 1 July 2025' : isTokenTicker ? 'e.g. $BTC' : 'Enter text'}"
          >
        `;
    }

    // Check if this field has (s) and should be required
    const hasMultipleIndicator = placeholder.originalKey.toLowerCase().includes('(s)');
    const asterisk = hasMultipleIndicator ? ' <span style="color: #ef4444;">*</span>' : '';

    return `
      <div class="form-field">
        <label for="${fieldId}" class="form-label">
          ${this.formatLabel(placeholder.originalKey)}${asterisk}
        </label>
        ${inputElement}
        ${this.renderHint(placeholder)}
      </div>
    `;
  }

  private renderMultipleField(placeholder: PlaceholderField, values: string[], fieldId: string): string {
    const isDateLike = /date/i.test(placeholder.originalKey);
    const isTokenTicker = placeholder.originalKey.toLowerCase().includes('ticker');

    const entriesHtml = values.map((value, index) => {
      const isLastEntry = index === values.length - 1;
      const showAddButton = isLastEntry;
      const showRemoveButton = !isLastEntry && values.length > 1;
      
      return `
        <div class="multiple-entry" data-index="${index}">
          <input
            type="text"
            id="${fieldId}-${index}"
            name="${placeholder.key}[${index}]"
            value="${value}"
            class="form-input multiple-input"
            placeholder="${isDateLike ? 'e.g. 1 July 2025' : isTokenTicker ? 'e.g. $BTC' : 'Enter text'}"
          >
          ${showAddButton ? `<button type="button" class="btn-add-more-inline" data-field="${placeholder.key}">+</button>` : ''}
          ${showRemoveButton ? `<button type="button" class="btn-remove-entry" data-index="${index}">×</button>` : ''}
        </div>
      `;
    }).join('');

    // Check if this field has (s) and should be required
    const hasMultipleIndicator = placeholder.originalKey.toLowerCase().includes('(s)');
    const asterisk = hasMultipleIndicator ? ' <span style="color: #ef4444;">*</span>' : '';

    return `
      <div class="form-field multiple-field">
        <label class="form-label">
          ${this.formatLabel(placeholder.originalKey)}${asterisk}
        </label>
        <div class="multiple-entries" id="${fieldId}-entries">
          ${entriesHtml}
        </div>
        ${this.renderHint(placeholder)}
      </div>
    `;
  }

  private renderGroupedFields(): string {
    // Filter placeholders based on conditional selections
    const filteredPlaceholders = this.filterConditionalPlaceholders(this.placeholders);
    const groupedPlaceholders = sortPlaceholdersForForm(filteredPlaceholders);
    
    return groupedPlaceholders.map(group => {
      // Split placeholders into two columns
      const midPoint = Math.ceil(group.placeholders.length / 2);
      const leftColumn = group.placeholders.slice(0, midPoint);
      const rightColumn = group.placeholders.slice(midPoint);
      
      return `
        <div class="field-group">
          <h5 class="group-heading">${group.title}</h5>
          <div class="two-column-layout">
            <div class="column">
              ${leftColumn.map(placeholder => this.renderField(placeholder)).join('')}
            </div>
            <div class="column">
              ${rightColumn.map(placeholder => this.renderField(placeholder)).join('')}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  private filterConditionalPlaceholders(placeholders: PlaceholderField[]): PlaceholderField[] {
    console.log('🔍 Filtering placeholders based on conditional selections...');
    console.log('Current form data:', this.formData);
    console.log('All placeholders being filtered:', placeholders.map(p => p.originalKey));
    
    const filtered = placeholders.filter(placeholder => {
      // Special debugging for Stage 1 Costs
      if (placeholder.originalKey.toLowerCase().includes('stage 1 costs')) {
        console.log('🔍 STAGE 1 COSTS DEBUG:', {
          originalKey: placeholder.originalKey,
          conditionalDependencies: placeholder.conditionalDependencies,
          hasDependencies: !!(placeholder.conditionalDependencies && placeholder.conditionalDependencies.length > 0)
        });
      }
      
      // If placeholder has no conditional dependencies, always show it
      if (!placeholder.conditionalDependencies || placeholder.conditionalDependencies.length === 0) {
        console.log(`✅ ${placeholder.originalKey} - No dependencies, showing`);
        return true;
      }
      
      // Special logic for Stage placeholders - show if retainer is "No" OR if stage number is <= selected stages
      if (placeholder.originalKey.toLowerCase().includes('stage')) {
        const retainerSelection = this.formData['conditional-Retainer Options'];
        const stagesSelection = this.formData['conditional-Stages Options'];
        
        // Extract stage number from placeholder name (e.g., "Stage 1 Title" -> 1)
        const stageMatch = placeholder.originalKey.match(/Stage (\d+)/i);
        if (stageMatch) {
          const stageNumber = parseInt(stageMatch[1]);
          const selectedStages = stagesSelection ? parseInt(String(stagesSelection)) : 0;
          
          // Show if retainer is "No" OR if stage number is <= selected stages
          const shouldShowStage = retainerSelection === 'No' || (selectedStages > 0 && stageNumber <= selectedStages);
          console.log(`  Special Stage logic for ${placeholder.originalKey}: stage=${stageNumber}, selected=${selectedStages}, retainer=${retainerSelection}, showing=${shouldShowStage}`);
          return shouldShowStage;
        }
      }
      
      // Check if all required conditional groups have the correct selections
      const shouldShow = placeholder.conditionalDependencies.every(dependency => {
        // Check if dependency includes specific option requirement (format: "Group:Option")
        if (dependency.includes(':')) {
          const [groupName, requiredOption] = dependency.split(':');
          const selectionKey = `conditional-${groupName}`;
          const selectedValue = this.formData[selectionKey];
          const hasCorrectSelection = selectedValue === requiredOption;
          console.log(`  Checking ${placeholder.originalKey} dependency ${dependency}: ${hasCorrectSelection} (selected: ${selectedValue}, required: ${requiredOption})`);
          return hasCorrectSelection;
        } else {
          // Fallback to old logic for simple group dependencies
          const selectionKey = `conditional-${dependency}`;
          const selectedValue = this.formData[selectionKey];
          const hasSelection = selectedValue && selectedValue !== '';
          console.log(`  Checking ${placeholder.originalKey} dependency ${dependency}: ${hasSelection} (${selectedValue})`);
          return hasSelection;
        }
      });
      
      console.log(`${shouldShow ? '✅' : '❌'} ${placeholder.originalKey} - ${shouldShow ? 'showing' : 'hiding'}`);
      return shouldShow;
    });
    
    console.log(`Filtered placeholders: ${filtered.length}/${placeholders.length}`);
    return filtered;
  }

  private renderConditionalOptions(): string {
    if (this.conditionalOptions.length === 0) return '';
    
    return `
      <div class="conditional-options">
        ${this.conditionalOptions.map(group => `
          <div class="conditional-group">
            <h4>${group.groupName}</h4>
            <label for="conditional-${group.groupName}" class="form-label">
              Select Option <span style="color: #ef4444;">*</span>
            </label>
            <select 
              id="conditional-${group.groupName}" 
              name="conditional-${group.groupName}"
              class="form-select"
              required
            >
              <option value="" disabled selected class="placeholder-option">Select an option...</option>
              ${group.options.map(option => {
                const selectedValue = this.formData[`conditional-${group.groupName}`];
                const isSelected = selectedValue === option ? 'selected' : '';
                return `<option value="${option}" ${isSelected}>${option}</option>`;
              }).join('')}
            </select>
          </div>
        `).join('')}
      </div>
    `;
  }

  private formatLabel(key: string): string {
    // Handle all caps words (like COMPANY NAME) by converting to title case
    if (key === key.toUpperCase() && key.includes(' ')) {
      // All caps with spaces - convert to title case
      return key.toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
    }
    
    // Handle snake_case or camelCase
    return key
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2') // Add space between camelCase
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }

  private setupEventListeners(): void {
    // Remove existing event listeners first to prevent duplicates
    this.container.removeEventListener('input', this.handleInput);
    this.container.removeEventListener('change', this.handleChange);
    this.container.removeEventListener('click', this.handleClick);
    this.container.removeEventListener('submit', this.handleSubmit);

    const form = this.container.querySelector('#dynamic-form') as HTMLFormElement;
    const exportBtn = this.container.querySelector('#export-data') as HTMLButtonElement;
    const importBtn = this.container.querySelector('#import-data') as HTMLButtonElement;
    const clearBtn = this.container.querySelector('#clear-form') as HTMLButtonElement;
    const importInput = this.container.querySelector('#import-input') as HTMLInputElement;

    console.log('Setting up event listeners...');
    console.log('Clear button found:', clearBtn);
    console.log('Clear button element:', clearBtn?.tagName, clearBtn?.id);

    // Add event listeners using bound methods
    this.container.addEventListener('input', this.handleInput);

    // Form submission validation
    form.addEventListener('submit', this.handleSubmit);

    // Conditional options changes - use container for event delegation
    this.container.addEventListener('change', this.handleChange);

    // Export data
    if (exportBtn) {
      console.log('Export button found, adding event listener');
      exportBtn.addEventListener('click', () => {
        console.log('Export button clicked');
        this.exportData();
      });
    } else {
      console.error('Export button not found!');
    }

    // Clear form
        if (clearBtn) {
          clearBtn.addEventListener('click', () => {
            console.log('Clear form button clicked!');
            const confirmClear = confirm('Are you sure you want to clear all form data? This cannot be undone.');
            if (confirmClear) {
              console.log('User confirmed clear, clearing form data...');
              this.formData = {};
              
              // Banner visibility is now controlled by App.ts
              
              this.render();
              this.onChange(this.formData);
              console.log('Form cleared successfully');
            } else {
              console.log('User cancelled clear');
            }
          });
        } else {
      console.error('Clear button not found!');
    }

    // Import data
    importBtn.addEventListener('click', () => {
      console.log('Import button clicked, triggering file input...');
      console.log('File input value before reset:', importInput.value);
      // Reset the file input first to ensure it can be used again
      importInput.value = '';
      console.log('File input value after reset:', importInput.value);
      // Small delay to ensure the reset takes effect
      setTimeout(() => {
        console.log('About to trigger file input click...');
        importInput.click();
      }, 10);
    });

    importInput.addEventListener('change', async (e) => {
      console.log('File input change event triggered');
      const target = e.target as HTMLInputElement;
      if (target.files && target.files[0]) {
        const file = target.files[0];
        console.log('File selected:', file.name);
        
        // Check if there's already data imported
        const hasExistingData = Object.keys(this.formData).some(key => 
          this.formData[key] !== undefined && this.formData[key] !== '' && this.formData[key] !== null
        );
        
        console.log('Has existing data:', hasExistingData);
        console.log('Current form data:', this.formData);
        
        if (hasExistingData) {
          const confirmReplace = confirm('You already have data in the form. Do you want to replace it with the new data from the PDF?');
          if (!confirmReplace) {
            console.log('User cancelled import, resetting file input');
            // Reset the file input so it can be used again
            target.value = '';
            return;
          }
          console.log('User confirmed replacement, proceeding with import');
        }
        
        try {
          await this.importData(file);
        } catch (error) {
          console.error('Import failed:', error);
        }
        // Note: File input is reset when the button is clicked, not here
      }
    });

    // Add More buttons for multiple entry fields
    this.container.addEventListener('click', this.handleClick);

    // Preview button
    const previewBtn = this.container.querySelector('#preview-document-btn') as HTMLButtonElement;
    console.log('Preview button found:', previewBtn);
    if (previewBtn) {
      console.log('Adding preview button event listener');
      previewBtn.addEventListener('click', () => {
        console.log('Preview button clicked!');
        this.onPreview?.();
      });
    } else {
      console.error('Preview button not found in DOM!');
    }

    // Bulk Mode button
    const bulkModeBtn = this.container.querySelector('#bulk-mode-btn') as HTMLButtonElement;
    if (bulkModeBtn) {
      bulkModeBtn.addEventListener('click', () => {
        this.onBulkModeRequested?.();
      });
    }

    // Download All button (for bulk mode)
    const downloadAllBtn = this.container.querySelector('#download-all-btn') as HTMLButtonElement;
    if (downloadAllBtn) {
      downloadAllBtn.addEventListener('click', () => {
        this.onDownloadAll?.();
      });
    }

    // Download All PDFs button (for bulk mode)
    const downloadAllPdfsBtn = this.container.querySelector('#download-all-pdfs-btn') as HTMLButtonElement;
    if (downloadAllPdfsBtn) {
      downloadAllPdfsBtn.addEventListener('click', () => {
        this.onDownloadAllPdfs?.();
      });
    }

  }

  private renderHint(placeholder: PlaceholderField): string {
    if (placeholder.type === 'date') {
      return `<small class="field-hint">Format: e.g. 1 January 2025</small>`;
    }
    if (placeholder.defaultValue) {
      return `<small class="field-hint">Default: ${placeholder.defaultValue}</small>`;
    }
    return '';
  }

  private updateFormData(key: string, value: string): void {
    console.log(`updateFormData called: ${key} = ${value}`);
    
    // Handle conditional options (they don't have placeholders)
    if (key.startsWith('conditional-')) {
      this.formData[key] = value;
      console.log(`Updated conditional option: ${key} = ${value}`);
      this.onChange(this.formData);
      
      // Dispatch event to notify that form data has changed
      const event = new CustomEvent('formDataChanged', {
        detail: { formData: this.formData }
      });
      this.container.dispatchEvent(event);
      return;
    }
    
    // Handle multiple entry fields (array inputs)
    if (key.includes('[') && key.includes(']')) {
      const fieldKey = key.split('[')[0];
      const placeholder = this.placeholders.find(p => p.key === fieldKey);
      if (placeholder && placeholder.isMultiple) {
        // Get the current values from formData and update the specific index
        const currentValues = (this.formData[fieldKey] as string[]) || [];
        const inputIndex = parseInt(key.match(/\[(\d+)\]$/)?.pop() || '0');
        
        // Update the specific index with the new value
        if (inputIndex >= 0 && inputIndex < currentValues.length) {
          currentValues[inputIndex] = value;
        } else {
          // If index is out of bounds, add to the end
          currentValues.push(value);
        }
        
        this.formData[fieldKey] = currentValues;
        this.onChange(this.formData);
        
        // Dispatch event to notify that form data has changed
        const event = new CustomEvent('formDataChanged', {
          detail: { formData: this.formData }
        });
        this.container.dispatchEvent(event);
        return;
      }
    }
    
    // Convert value based on field type for regular placeholders
    const placeholder = this.placeholders.find(p => p.key === key);
    if (!placeholder) {
      console.log(`No placeholder found for key: ${key}`);
      return;
    }

    let convertedValue: any = value;

    switch (placeholder.type) {
      case 'number':
        convertedValue = value ? parseFloat(value) : '';
        break;
      case 'date':
        convertedValue = value ? new Date(value) : '';
        break;
      default:
        convertedValue = value;
    }

    this.formData[key] = convertedValue;
    this.onChange(this.formData);
    
    // Dispatch event to notify that form data has changed
    console.log('Dispatching formDataChanged event with data:', this.formData);
    const event = new CustomEvent('formDataChanged', {
      detail: { formData: this.formData }
    });
    this.container.dispatchEvent(event);
    console.log('formDataChanged event dispatched');
  }

  private addMultipleEntry(fieldKey: string): void {
    const currentValues = Array.isArray(this.formData[fieldKey]) ? this.formData[fieldKey] as string[] : [];
    const newValues = [...currentValues, ''];
    this.formData[fieldKey] = newValues;
    this.onChange(this.formData);
    this.render(); // Re-render to show the new entry
  }

  private removeMultipleEntry(fieldKey: string, index: number): void {
    const currentValues = Array.isArray(this.formData[fieldKey]) ? this.formData[fieldKey] as string[] : [];
    if (currentValues.length > 1) {
      const newValues = currentValues.filter((_, i) => i !== index);
      this.formData[fieldKey] = newValues;
      this.onChange(this.formData);
      this.render(); // Re-render to remove the entry
    }
  }

  private async exportData(): Promise<void> {
    try {
      console.log('Starting export data...');
      console.log('Placeholders count:', this.placeholders.length);
      console.log('Placeholders:', this.placeholders);
      
      if (this.placeholders.length === 0) {
        alert('No placeholders found to export. Please select a template first.');
        return;
      }
      
      // Get template name from the current form or use a default
      const templateName = this.getTemplateName();
      console.log('Template name:', templateName);
      
      await generatePlaceholderForm(this.placeholders, templateName);
      console.log('Export completed successfully');
    } catch (error) {
      alert('Failed to export placeholder form. Please try again.');
      console.error('Export error:', error);
    }
  }

  private getTemplateName(): string {
    // Use the document name that was passed to the constructor
    if (this.documentName && this.documentName !== 'Cortana.') {
      return this.documentName;
    }
    return 'Document';
  }

  private async importData(file: File): Promise<void> {
    try {
      // Check file type
      const fileName = file.name.toLowerCase();
      if (fileName.endsWith('.json')) {
        // Handle JSON import (legacy support)
        const text = await file.text();
        const importedData = JSON.parse(text);
        
        // Validate imported data
        const validData: FormData = {};
        for (const placeholder of this.placeholders) {
          if (importedData[placeholder.key] !== undefined) {
            validData[placeholder.key] = importedData[placeholder.key];
          }
        }
        
        // Merge imported data with existing form data to preserve conditional selections
        console.log('Before merge - existing formData:', this.formData);
        console.log('Before merge - imported validData:', validData);
        this.formData = { ...this.formData, ...validData };
        console.log('After merge - final formData:', this.formData);
        this.render(); // Re-render with imported data
        this.onChange(this.formData);
      } else if (fileName.endsWith('.pdf')) {
        // Handle PDF import using the new AnchorTokenImporter
        const arrayBuffer = await file.arrayBuffer();
        const importer = new AnchorTokenImporter();
        const importedData = await importer.importFromPDF(arrayBuffer, undefined, this.placeholders);

        const validData: FormData = {};
        console.log('Available placeholders:', this.placeholders.map(p => ({ key: p.key, originalKey: p.originalKey })));
        console.log('Imported data keys:', Object.keys(importedData));
        
        for (const placeholder of this.placeholders) {
          const possibleKeys = [
            // Exact matches first
            placeholder.key,
            placeholder.originalKey,
            // Case variations
            placeholder.key.toLowerCase(),
            placeholder.originalKey.toLowerCase(),
            placeholder.key.toUpperCase(),
            placeholder.originalKey.toUpperCase(),
            // Space/underscore variations
            placeholder.key.replace(/_/g, ' '),
            placeholder.originalKey.replace(/_/g, ' '),
            placeholder.key.replace(/\s+/g, '_'),
            placeholder.originalKey.replace(/\s+/g, '_'),
            // Normalized versions
            placeholder.key.replace(/[^a-zA-Z0-9]/g, ' ').toLowerCase().trim(),
            placeholder.originalKey.replace(/[^a-zA-Z0-9]/g, ' ').toLowerCase().trim(),
            placeholder.key.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase(),
            placeholder.originalKey.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase(),
            // Remove common prefixes/suffixes
            placeholder.key.replace(/^(field_|input_|form_)/, ''),
            placeholder.originalKey.replace(/^(field_|input_|form_)/, ''),
            // Handle special characters
            placeholder.key.replace(/[()]/g, ''),
            placeholder.originalKey.replace(/[()]/g, ''),
            placeholder.key.replace(/[()]/g, '').toLowerCase(),
            placeholder.originalKey.replace(/[()]/g, '').toLowerCase()
          ];

          let matched = false;
          for (const key of possibleKeys) {
            if (importedData[key] !== undefined) {
              validData[placeholder.key] = importedData[key];
              console.log(`Matched: ${key} -> ${placeholder.key} = ${importedData[key]}`);
              matched = true;
              break;
            }
          }
          
          // Try fuzzy matching if no exact match found
          if (!matched) {
            const normalizedPlaceholder = placeholder.key.toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
            for (const [importKey, importValue] of Object.entries(importedData)) {
              const normalizedImportKey = importKey.toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
              if (normalizedPlaceholder === normalizedImportKey || 
                  normalizedPlaceholder.includes(normalizedImportKey) ||
                  normalizedImportKey.includes(normalizedPlaceholder)) {
                validData[placeholder.key] = importValue;
                console.log(`Fuzzy matched: ${importKey} -> ${placeholder.key} = ${importValue}`);
                matched = true;
                break;
              }
            }
          }
          
          if (!matched) {
            console.log(`No match found for placeholder: ${placeholder.key} (original: ${placeholder.originalKey})`);
            console.log(`Looking for keys:`, possibleKeys);
            console.log('Available import keys:', Object.keys(importedData));
          }
        }

        // Merge imported data with existing form data to preserve conditional selections
        console.log('Before merge - existing formData:', this.formData);
        console.log('Before merge - imported validData:', validData);
        
        // Check for conditional selections in existing formData
        const conditionalSelections = Object.keys(this.formData).filter(key => key.startsWith('conditional-'));
        console.log('Existing conditional selections:', conditionalSelections);
        
        this.formData = { ...this.formData, ...validData };
        
        // Check for conditional selections after merge
        const conditionalSelectionsAfter = Object.keys(this.formData).filter(key => key.startsWith('conditional-'));
        console.log('After merge - conditional selections:', conditionalSelectionsAfter);
        console.log('After merge - final formData:', this.formData);
        this.render();
        this.onChange(this.formData);

        // Notify parent component of PDF import
        if (this.onPdfImported) {
          this.onPdfImported(file.name);
        }

        const filledCount = Object.keys(validData).length;
        alert(`Successfully imported ${filledCount} field(s) from the completed PDF form.`);
      } else if (fileName.endsWith('.docx') || fileName.endsWith('.doc')) {
        // Handle Word document import (legacy support)
        const importedData = await parseCompletedForm(file);
        
        // Map imported data to our placeholders
        const validData: FormData = {};
        for (const placeholder of this.placeholders) {
          // Try to match by various key formats
          const possibleKeys = [
            placeholder.key,
            placeholder.originalKey,
            placeholder.key.toLowerCase(),
            placeholder.originalKey.toLowerCase(),
            placeholder.key.replace(/_/g, ' '),
            placeholder.originalKey.replace(/_/g, ' ')
          ];
          
          for (const key of possibleKeys) {
            if (importedData[key] !== undefined) {
              validData[placeholder.key] = importedData[key];
              break;
            }
          }
        }
        
        this.formData = validData;
        this.render(); // Re-render with imported data
        this.onChange(this.formData);
        
        // Show success message
        const filledCount = Object.keys(validData).length;
        alert(`Successfully imported ${filledCount} field(s) from the completed form.`);
      } else {
        alert('Please select a valid PDF file (.pdf), Word document (.docx or .doc), or JSON file.');
      }
    } catch (error) {
      alert('Failed to import data. Please ensure the file is a valid Word document with completed placeholders.');
      console.error('Import error:', error);
    }
  }

  public getFormData(): FormData {
    return { ...this.formData };
  }

  public validateRequiredFields(): boolean {
    const conditionalSelects = this.container.querySelectorAll('select[id^="conditional-"]') as NodeListOf<HTMLSelectElement>;
    let isValid = true;
    const missingFields: string[] = [];

    // Validate conditional dropdowns
    conditionalSelects.forEach(select => {
      if (select.required && (!select.value || select.value === '')) {
        isValid = false;
        const fieldName = select.name.replace('conditional-', '');
        missingFields.push(fieldName);
        
        // Add visual indication that this field is required
        select.style.borderColor = '#ef4444'; // Red border
        select.style.backgroundColor = '#fef2f2'; // Light red background
        
        // Add error message if it doesn't exist
        let errorMsg = select.parentElement?.querySelector('.field-error');
        if (!errorMsg) {
          errorMsg = document.createElement('div');
          errorMsg.className = 'field-error';
          (errorMsg as HTMLElement).style.color = '#ef4444';
          (errorMsg as HTMLElement).style.fontSize = '0.875rem';
          (errorMsg as HTMLElement).style.marginTop = '0.25rem';
          select.parentElement?.appendChild(errorMsg);
        }
        errorMsg.textContent = `Please select an option for ${fieldName}`;
      } else {
        // Remove error styling if field is now valid
        select.style.borderColor = '';
        select.style.backgroundColor = '';
        const errorMsg = select.parentElement?.querySelector('.field-error');
        if (errorMsg) {
          errorMsg.remove();
        }
      }
    });

    // Validate fields with (s) - ensure at least one item is entered
    this.placeholders.forEach(placeholder => {
      if (placeholder.originalKey.toLowerCase().includes('(s)')) {
        const fieldValue = this.formData[placeholder.key];
        let hasValidEntry = false;

        if (placeholder.isMultiple) {
          // For multiple fields, check if any entry has content
          if (Array.isArray(fieldValue)) {
            hasValidEntry = fieldValue.some(value => value && value.trim() !== '');
          }
        } else {
          // For single fields, check if value exists and is not empty
          hasValidEntry = !!(fieldValue && fieldValue.toString().trim() !== '');
        }

        if (!hasValidEntry) {
          isValid = false;
          const fieldName = this.formatLabel(placeholder.originalKey);
          missingFields.push(fieldName);

          // Add visual indication
          const fieldElement = this.container.querySelector(`[name="${placeholder.key}"]`) as HTMLInputElement;
          if (fieldElement) {
            fieldElement.style.borderColor = '#ef4444';
            fieldElement.style.backgroundColor = '#fef2f2';
          }

          // Add error message
          const fieldContainer = fieldElement?.closest('.form-field');
          if (fieldContainer) {
            let errorMsg = fieldContainer.querySelector('.field-error');
            if (!errorMsg) {
              errorMsg = document.createElement('div');
              errorMsg.className = 'field-error';
              (errorMsg as HTMLElement).style.color = '#ef4444';
              (errorMsg as HTMLElement).style.fontSize = '0.875rem';
              (errorMsg as HTMLElement).style.marginTop = '0.25rem';
              fieldContainer.appendChild(errorMsg);
            }
            errorMsg.textContent = `Please enter at least one item for ${fieldName}`;
          }
        } else {
          // Remove error styling if field is now valid
          const fieldElement = this.container.querySelector(`[name="${placeholder.key}"]`) as HTMLInputElement;
          if (fieldElement) {
            fieldElement.style.borderColor = '';
            fieldElement.style.backgroundColor = '';
          }
          const fieldContainer = fieldElement?.closest('.form-field');
          if (fieldContainer) {
            const errorMsg = fieldContainer.querySelector('.field-error');
            if (errorMsg) {
              errorMsg.remove();
            }
          }
        }
      }
    });

    if (!isValid) {
      alert(`Please complete the required fields:\n• ${missingFields.join('\n• ')}`);
    }

    return isValid;
  }

  public updatePlaceholders(placeholders: PlaceholderField[]): void {
    this.placeholders = placeholders;
    this.render();
  }
}

function sortPlaceholders(placeholders: PlaceholderField[]): PlaceholderField[] {
  const priority = (p: PlaceholderField): number => {
    const k = p.originalKey.toLowerCase();
    if (/(investor|purchaser|buyer)/.test(k)) return 1;
    if (/(company|issuer|seller)/.test(k)) return 2;
    if (/date/.test(k)) return 3;
    if (/(address|email|phone)/.test(k)) return 4;
    return 5;
  };

  return [...placeholders]
    .sort((a, b) => a.originalKey.localeCompare(b.originalKey))
    .sort((a, b) => priority(a) - priority(b));
}

/**
 * Sort placeholders into logical groups for the form
 */
function sortPlaceholdersForForm(placeholders: PlaceholderField[]): Array<{title: string, placeholders: PlaceholderField[]}> {
  const groups: {[key: string]: PlaceholderField[]} = {
    'Investor Information': [],
    'Company Information': [],
    'Contractor Information': [],
    'Payment Information': [],
    'Dates': [],
    'Stages': [],
    'Stage Costs': [],
    'Contact Information': [],
    'Other Information': []
  };

  // Group placeholders by canonical key to handle case variations
  const canonicalGroups = new Map<string, PlaceholderField[]>();
  placeholders.forEach(placeholder => {
    const canonicalKey = placeholder.key.includes('_') ? placeholder.key.split('_')[0] : placeholder.key;
    if (!canonicalGroups.has(canonicalKey)) {
      canonicalGroups.set(canonicalKey, []);
    }
    canonicalGroups.get(canonicalKey)!.push(placeholder);
  });

  // For each canonical group, pick the best representative (prefer Title Case)
  const representativePlaceholders: PlaceholderField[] = [];
  canonicalGroups.forEach((variations, canonicalKey) => {
    if (variations.length === 1) {
      representativePlaceholders.push(variations[0]);
    } else {
      // Multiple case variations - pick the best one
      const bestVariation = variations.reduce((best, current) => {
        const isCurrentTitleCase = /^[A-Z][a-z]+(\s+[A-Z][a-z]+)*$/.test(current.originalKey);
        const isBestTitleCase = /^[A-Z][a-z]+(\s+[A-Z][a-z]+)*$/.test(best.originalKey);
        
        if (isCurrentTitleCase && !isBestTitleCase) {
          return current;
        } else if (!isCurrentTitleCase && isBestTitleCase) {
          return best;
        } else {
          // Both same type, prefer the first one
          return best;
        }
      });
      
      // Update the key to be the canonical key so form data maps correctly
      bestVariation.key = canonicalKey;
      representativePlaceholders.push(bestVariation);
      
      console.log(`📝 Selected representative for ${canonicalKey}: ${bestVariation.originalPlaceholder} (from ${variations.length} variations)`);
    }
  });

  representativePlaceholders.forEach(placeholder => {
    const key = placeholder.originalKey.toLowerCase();
    
    // Special debugging for Stage 1 Costs
    if (key.includes('stage 1 costs')) {
      console.log('🔍 STAGE 1 COSTS GROUPING DEBUG:', {
        originalKey: placeholder.originalKey,
        lowerKey: key,
        willMatchCost: /(cost|fee|amount|price|value|retainer|deposit|payment|monthly|trust|billing|invoice)/.test(key),
        willMatchStage: /(^stage|stage[_\s]|phase|step|milestone|title|description)/.test(key)
      });
    }
    
    // Stage Costs - specifically stage costs (must be checked before general cost pattern)
    if (key.includes('stage') && (key.includes('cost') || key.includes('costs'))) {
      groups['Stage Costs'].push(placeholder);
    }
    // Investor Information - investor/purchaser/buyer related fields
    else if (/(investor|purchaser|buyer)/.test(key)) {
      groups['Investor Information'].push(placeholder);
    }
    // Company Information - company/issuer/seller related fields
    else if (/(company|issuer|seller)/.test(key)) {
      groups['Company Information'].push(placeholder);
    }
    // Contractor Information - contractor related fields
    else if (/(^contractor|contractor[_\s])/.test(key)) {
      groups['Contractor Information'].push(placeholder);
    }
    // Payment Information - costs, fees, amounts, retainer, deposit, payment terms (but not stage costs)
    else if (/(cost|fee|amount|price|value|retainer|deposit|payment|monthly|trust|billing|invoice)/.test(key)) {
      groups['Payment Information'].push(placeholder);
    }
    // Dates - any date-related fields
    else if (/(^date|date[_\s]|effective[_\s]date|expiry[_\s]date|expiration[_\s]date|due[_\s]date|issue[_\s]date)/.test(key)) {
      groups['Dates'].push(placeholder);
    }
    // Stages - stage titles and descriptions only (not costs, not matter description)
    else if (key.includes('stage') && (key.includes('title') || key.includes('description'))) {
      groups['Stages'].push(placeholder);
    }
    // Contact Information - addresses, emails, phones
    else if (/(address|email|phone|contact)/.test(key)) {
      groups['Contact Information'].push(placeholder);
    }
    // Matter Description - specific handling to avoid being caught by stage description pattern
    else if (key.includes('matter') && key.includes('description')) {
      groups['Other Information'].push(placeholder);
    }
    // Other Information - everything else
    else {
      groups['Other Information'].push(placeholder);
    }
  });

  // Return only groups that have placeholders
  return Object.entries(groups)
    .filter(([_, placeholders]) => placeholders.length > 0)
    .map(([title, placeholders]) => {
      // Special sorting for 'Stages' group
      if (title === 'Stages') {
        const sortedPlaceholders = [...placeholders].sort((a, b) => {
          const aKey = a.originalKey;
          const bKey = b.originalKey;

          // Extract stage number
          const aStageMatch = aKey.match(/Stage (\d+)/);
          const bStageMatch = bKey.match(/Stage (\d+)/);

          const aStageNum = aStageMatch ? parseInt(aStageMatch[1]) : Infinity;
          const bStageNum = bStageMatch ? parseInt(bStageMatch[1]) : Infinity;

          // Primary sort by stage number
          if (aStageNum !== bStageNum) {
            return aStageNum - bStageNum;
          }

          // Secondary sort: 'Title' before 'Description'
          if (aKey.includes('Title') && !bKey.includes('Title')) return -1;
          if (!aKey.includes('Title') && bKey.includes('Title')) return 1;
          
          // Fallback for same stage number and same type
          return aKey.localeCompare(bKey);
        });
        return { title, placeholders: sortedPlaceholders };
      }
      
      // Special sorting for 'Stage Costs' group
      if (title === 'Stage Costs') {
        const sortedPlaceholders = [...placeholders].sort((a, b) => {
          const aKey = a.originalKey;
          const bKey = b.originalKey;

          // Extract stage number
          const aStageMatch = aKey.match(/Stage (\d+)/);
          const bStageMatch = bKey.match(/Stage (\d+)/);

          const aStageNum = aStageMatch ? parseInt(aStageMatch[1]) : Infinity;
          const bStageNum = bStageMatch ? parseInt(bStageMatch[1]) : Infinity;

          // Sort by stage number
          return aStageNum - bStageNum;
        });
        return { title, placeholders: sortedPlaceholders };
      }
      return { title, placeholders };
    });
}
