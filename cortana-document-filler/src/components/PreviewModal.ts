import mammoth from 'mammoth';

export class PreviewModal {
  private container: HTMLElement;
  private modalElement: HTMLElement | null = null;
  private currentPreviewData: any = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public async show(docxBytes: ArrayBuffer, fileName: string, formData?: Record<string, any>, bulkModeData?: { items: any[], selectedItemId: string | null }, template?: any, docxProcessor?: any): Promise<void> {
    try {
      // Store current preview data for potential refresh
      this.currentPreviewData = {
        docxBytes,
        fileName,
        formData,
        bulkModeData,
        template,
        docxProcessor
      };

      // Check if this is bulk mode
      if (bulkModeData && bulkModeData.items && bulkModeData.items.length > 0) {
        await this.showBulkMode(bulkModeData, template, docxProcessor);
        return;
      }

      // Single document mode
      const result = await mammoth.convertToHtml(
        { arrayBuffer: docxBytes },
        {
          styleMap: [
            "p[style-name='Section Title'] => h1:fresh",
            "p[style-name='Subsection Title'] => h2:fresh"
          ]
        }
      );

      const htmlContent = result.value;
      
      // Process the HTML to highlight filled data in red
      const highlightedContent = this.highlightFilledData(htmlContent, formData);
      
      // Create modal
      this.createModal(highlightedContent, fileName);
    } catch (error) {
      console.error('Error converting document to HTML:', error);
      this.showError('Failed to generate preview. The document may contain unsupported elements.');
    }
  }

  private createModal(htmlContent: string, fileName: string): void {
    // Remove existing modal if any
    this.close();

    // Create modal overlay
    this.modalElement = document.createElement('div');
    this.modalElement.className = 'preview-modal-overlay';
    this.modalElement.innerHTML = `
      <div class="preview-modal">
        <div class="preview-modal-header">
          <h2>Document Preview</h2>
          <p class="preview-modal-filename">${fileName}</p>
          <button class="preview-modal-close" aria-label="Close preview">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="preview-modal-body">
          <div class="preview-content">
            ${htmlContent}
          </div>
        </div>
        <div class="preview-modal-footer">
          <p class="preview-note">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px; display: inline-block; vertical-align: middle; margin-right: 0.5rem;">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            This is a simplified preview. Filled data is highlighted in red. Some formatting may differ in the final document.
          </p>
          <button class="btn btn-secondary preview-modal-close-btn">Close Preview</button>
        </div>
      </div>
    `;

    document.body.appendChild(this.modalElement);

    // Add event listeners
    const closeButtons = this.modalElement.querySelectorAll('.preview-modal-close, .preview-modal-close-btn');
    closeButtons.forEach(btn => {
      btn.addEventListener('click', () => this.close());
    });

    // Close on overlay click
    this.modalElement.addEventListener('click', (e) => {
      if (e.target === this.modalElement) {
        this.close();
      }
    });

    // Close on ESC key
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.close();
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);
  }

  private showError(message: string): void {
    // Remove existing modal if any
    this.close();

    // Create error modal
    this.modalElement = document.createElement('div');
    this.modalElement.className = 'preview-modal-overlay';
    this.modalElement.innerHTML = `
      <div class="preview-modal" style="max-width: 500px;">
        <div class="preview-modal-header">
          <h2>Preview Error</h2>
          <button class="preview-modal-close" aria-label="Close preview">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="preview-modal-body">
          <div style="text-align: center; padding: 2rem;">
            <svg viewBox="0 0 24 24" fill="none" stroke="#ff3b30" stroke-width="2" style="width: 64px; height: 64px; margin-bottom: 1rem;">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <p style="color: var(--text-primary); margin-bottom: 1rem;">${message}</p>
          </div>
        </div>
        <div class="preview-modal-footer">
          <button class="btn btn-secondary preview-modal-close-btn">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(this.modalElement);

    // Add event listeners
    const closeButtons = this.modalElement.querySelectorAll('.preview-modal-close, .preview-modal-close-btn');
    closeButtons.forEach(btn => {
      btn.addEventListener('click', () => this.close());
    });

    // Close on overlay click
    this.modalElement.addEventListener('click', (e) => {
      if (e.target === this.modalElement) {
        this.close();
      }
    });
  }

  private highlightFilledData(htmlContent: string, formData?: Record<string, any>): string {
    if (!formData) {
      return htmlContent; // No form data to highlight
    }
    
    // Create a temporary DOM element to parse the HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    
    // Get all the filled values from form data
    const filledValues = Object.values(formData).filter(value => 
      value && 
      typeof value === 'string' && 
      value.trim().length > 0 &&
      !value.includes('{{') && 
      !value.includes('}}')
    ) as string[];
    
    if (filledValues.length === 0) {
      return htmlContent; // No values to highlight
    }
    
    // Function to process text nodes and highlight filled data
    const processTextNode = (textNode: Text): void => {
      const text = textNode.textContent || '';
      
      // Skip if this is just whitespace or very short
      if (text.trim().length < 2) return;
      
      let hasChanges = false;
      let processedText = text;
      
      // Check each filled value and highlight it
      filledValues.forEach(value => {
        if (value && value.trim().length > 0) {
          // Create a regex that matches the value as a whole word
          const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`\\b${escapedValue}\\b`, 'gi');
          
          if (regex.test(processedText)) {
            processedText = processedText.replace(regex, (match) => {
              hasChanges = true;
              return `<span class="filled-data-highlight">${match}</span>`;
            });
          }
        }
      });
      
      if (hasChanges) {
        const wrapper = document.createElement('span');
        wrapper.innerHTML = processedText;
        textNode.parentNode?.replaceChild(wrapper, textNode);
      }
    };
    
    // Find all text nodes and process them
    const walker = document.createTreeWalker(
      tempDiv,
      NodeFilter.SHOW_TEXT,
      null
    );
    
    const textNodes: Text[] = [];
    let node;
    while (node = walker.nextNode()) {
      if (node.nodeType === Node.TEXT_NODE) {
        textNodes.push(node as Text);
      }
    }
    
    // Process each text node
    textNodes.forEach(processTextNode);
    
    return tempDiv.innerHTML;
  }

  private async showBulkMode(bulkModeData: { items: any[], selectedItemId: string | null }, template?: any, docxProcessor?: any): Promise<void> {
    try {
      // Generate DOCX previews for each bulk item
      const previewData = await this.generateBulkPreviews(bulkModeData.items, template, docxProcessor);
      
      // Show bulk mode preview with tab navigation
      this.showBulkModeWithTabs(previewData, bulkModeData.selectedItemId);
    } catch (error) {
      console.error('Error generating bulk previews:', error);
      this.showError('Failed to generate bulk previews. Please try downloading all documents instead.');
    }
  }

  private async generateBulkPreviews(items: any[], template?: any, docxProcessor?: any): Promise<Array<{id: string, fileName: string, htmlContent: string, formData: any}>> {
    const previews = [];
    
    for (const item of items) {
      try {
        let htmlContent: string;
        
        if (template && docxProcessor) {
          // Generate actual DOCX preview using the template and item data
          htmlContent = await this.generateDocxPreview(item, template, docxProcessor);
        } else {
          // Fallback to placeholder preview
          htmlContent = this.generatePlaceholderPreview(item);
        }
        
        previews.push({
          id: item.id,
          fileName: item.displayName || item.fileName,
          htmlContent,
          formData: item.fields || item.editedFields || {}
        });
      } catch (error) {
        console.error(`Error generating preview for ${item.fileName}:`, error);
        // Add error preview
        previews.push({
          id: item.id,
          fileName: item.displayName || item.fileName,
          htmlContent: `<div style="text-align: center; padding: 2rem; color: var(--error);">
            <h3>Preview Error</h3>
            <p>Failed to generate preview for this document.</p>
          </div>`,
          formData: {}
        });
      }
    }
    
    return previews;
  }

  private async generateDocxPreview(item: any, template: any, docxProcessor: any): Promise<string> {
    try {
      // Get the form data for this item - prioritize edited fields over original fields
      const formData = item.editedFields || item.fields || {};
      
      // Generate DOCX bytes using the template and item data
      const docxBytes = await docxProcessor.processDocxToBytes(
        template.file,
        formData,
        template.conditionalOptions || [],
        template.placeholders || []
      );
      
      // Convert DOCX to HTML using mammoth
      const result = await mammoth.convertToHtml(
        { arrayBuffer: new Uint8Array(docxBytes).buffer },
        {
          styleMap: [
            "p[style-name='Section Title'] => h1:fresh",
            "p[style-name='Subsection Title'] => h2:fresh"
          ]
        }
      );

      // Highlight filled data in red
      const highlightedContent = this.highlightFilledData(result.value, formData);
      
      return highlightedContent;
    } catch (error) {
      console.error('Error generating DOCX preview:', error);
      throw error;
    }
  }

  private generatePlaceholderPreview(item: any): string {
    const fields = item.fields || item.editedFields || {};
    const fieldEntries = Object.entries(fields);
    
    if (fieldEntries.length === 0) {
      return `<div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
        <h3>No Data Available</h3>
        <p>This document has no filled data to preview.</p>
      </div>`;
    }
    
    const fieldsHtml = fieldEntries.map(([key, value]) => `
      <div style="margin-bottom: 1rem; padding: 1rem; background: var(--secondary-bg); border-radius: 8px;">
        <strong style="color: var(--text-primary);">${key}:</strong>
        <span class="filled-data-highlight" style="margin-left: 0.5rem;">${value}</span>
      </div>
    `).join('');
    
    return `
      <div style="padding: 2rem;">
        <h2 style="color: var(--text-primary); margin-bottom: 1.5rem;">Document Preview</h2>
        <div style="margin-bottom: 1rem; padding: 1rem; background: var(--accent-light-blue); border-radius: 8px;">
          <strong>File:</strong> ${item.displayName || item.fileName}
        </div>
        <h3 style="color: var(--text-primary); margin-bottom: 1rem;">Filled Data:</h3>
        ${fieldsHtml}
      </div>
    `;
  }

  private showBulkModeWithTabs(previewData: Array<{id: string, fileName: string, htmlContent: string, formData: any}>, selectedItemId: string | null): void {
    // Remove existing modal if any
    this.close();

    const currentIndex = selectedItemId ? previewData.findIndex(item => item.id === selectedItemId) : 0;
    const currentItem = previewData[currentIndex] || previewData[0];

    // Create modal with tab navigation
    this.modalElement = document.createElement('div');
    this.modalElement.className = 'preview-modal-overlay';
    this.modalElement.innerHTML = `
      <div class="preview-modal" style="max-width: 1000px; width: 90vw;">
        <div class="preview-modal-header">
          <h2>Bulk Mode Preview</h2>
          <div class="bulk-preview-tabs-row">
            <div class="bulk-preview-tabs">
              ${previewData.map((item, index) => `
                <button class="bulk-preview-tab ${index === currentIndex ? 'active' : ''}" 
                        data-index="${index}" 
                        data-item-id="${item.id}">
                  ${item.fileName}
                </button>
              `).join('')}
            </div>
            <div class="bulk-preview-header-controls">
              <button class="bulk-nav-btn circular-nav-btn" id="prev-document" title="Previous Document">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="15,18 9,12 15,6"></polyline>
                </svg>
              </button>
              <button class="bulk-nav-btn circular-nav-btn" id="next-document" title="Next Document">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="9,18 15,12 9,6"></polyline>
                </svg>
              </button>
              <button class="preview-modal-close" aria-label="Close preview">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>
        </div>
        <div class="preview-modal-body">
          <div class="preview-content">
            ${currentItem.htmlContent}
          </div>
        </div>
        <div class="preview-modal-footer">
          <p class="preview-note">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px; display: inline-block; vertical-align: middle; margin-right: 0.5rem;">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            Filled data is highlighted in red. Original formatting will be restored upon downloading.
          </p>
        </div>
      </div>
    `;

    document.body.appendChild(this.modalElement);

    // Store preview data for navigation
    (this.modalElement as any).previewData = previewData;
    (this.modalElement as any).currentIndex = currentIndex;

    // Add event listeners
    this.setupBulkPreviewEventListeners();
  }

  private setupBulkPreviewEventListeners(): void {
    if (!this.modalElement) return;

    // Close buttons
    const closeButtons = this.modalElement.querySelectorAll('.preview-modal-close, .preview-modal-close-btn');
    closeButtons.forEach(btn => {
      btn.addEventListener('click', () => this.close());
    });

    // Tab navigation
    const tabs = this.modalElement.querySelectorAll('.bulk-preview-tab');
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => this.switchToDocument(index));
    });

    // Previous/Next navigation
    const prevBtn = this.modalElement.querySelector('#prev-document') as HTMLButtonElement;
    const nextBtn = this.modalElement.querySelector('#next-document') as HTMLButtonElement;

    if (prevBtn) {
      prevBtn.addEventListener('click', () => this.navigateDocument(-1));
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => this.navigateDocument(1));
    }

    // Keyboard navigation
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        this.navigateDocument(-1);
      } else if (e.key === 'ArrowRight') {
        this.navigateDocument(1);
      } else if (e.key === 'Escape') {
        this.close();
        document.removeEventListener('keydown', handleKeydown);
      }
    };
    document.addEventListener('keydown', handleKeydown);

    // Close on overlay click
    this.modalElement.addEventListener('click', (e) => {
      if (e.target === this.modalElement) {
        this.close();
      }
    });
  }

  private switchToDocument(index: number): void {
    if (!this.modalElement) return;

    const previewData = (this.modalElement as any).previewData;
    if (!previewData || index < 0 || index >= previewData.length) return;

    const item = previewData[index];
    const previewContent = this.modalElement.querySelector('.preview-content');

    if (previewContent) {
      previewContent.innerHTML = item.htmlContent;
    }

    // Update tab states
    const tabs = this.modalElement.querySelectorAll('.bulk-preview-tab');
    tabs.forEach((tab, i) => {
      tab.classList.toggle('active', i === index);
    });

    // Navigation buttons are always enabled for circular navigation
    (this.modalElement as any).currentIndex = index;
  }

  private navigateDocument(direction: number): void {
    if (!this.modalElement) return;

    const currentIndex = (this.modalElement as any).currentIndex || 0;
    const previewData = (this.modalElement as any).previewData;
    if (!previewData) return;

    let newIndex = currentIndex + direction;
    
    // Implement circular navigation
    if (newIndex < 0) {
      newIndex = previewData.length - 1; // Go to last document
    } else if (newIndex >= previewData.length) {
      newIndex = 0; // Go to first document
    }
    
    this.switchToDocument(newIndex);
  }

  private showBulkModeMessage(bulkModeData: { items: any[], selectedItemId: string | null }): void {
    // Remove existing modal if any
    this.close();

    const itemCount = bulkModeData.items.length;
    const selectedItem = bulkModeData.items.find(item => item.id === bulkModeData.selectedItemId);

    // Create modal
    this.modalElement = document.createElement('div');
    this.modalElement.className = 'preview-modal-overlay';
    this.modalElement.innerHTML = `
      <div class="preview-modal" style="max-width: 600px;">
        <div class="preview-modal-header">
          <h2>Bulk Mode Preview</h2>
          <button class="preview-modal-close" aria-label="Close preview">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="preview-modal-body">
          <div style="text-align: center; padding: 2rem;">
            <svg viewBox="0 0 24 24" fill="none" stroke="#007aff" stroke-width="2" style="width: 64px; height: 64px; margin-bottom: 1rem;">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14,2 14,8 20,8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10,9 9,9 8,9"/>
            </svg>
            <h3 style="color: var(--text-primary); margin-bottom: 1rem;">Bulk Mode Preview</h3>
            <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">
              You have ${itemCount} document${itemCount === 1 ? '' : 's'} in bulk mode.
              ${selectedItem ? `Currently viewing: <strong>${selectedItem.displayName || selectedItem.fileName}</strong>` : ''}
            </p>
            <div style="background: var(--secondary-bg); padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem;">
              <p style="color: var(--text-primary); margin: 0; font-size: 0.9rem;">
                <strong>Note:</strong> Bulk mode preview is coming soon! For now, you can download all documents to see the filled results.
              </p>
            </div>
            <div style="display: flex; gap: 1rem; justify-content: center;">
              <button class="btn btn-primary" id="download-all-preview">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px; margin-right: 0.5rem;">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7,10 12,15 17,10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Download All Documents
              </button>
            </div>
          </div>
        </div>
        <div class="preview-modal-footer">
          <button class="btn btn-secondary preview-modal-close-btn">Close Preview</button>
        </div>
      </div>
    `;

    document.body.appendChild(this.modalElement);

    // Add event listeners
    const closeButtons = this.modalElement.querySelectorAll('.preview-modal-close, .preview-modal-close-btn');
    closeButtons.forEach(btn => {
      btn.addEventListener('click', () => this.close());
    });

    // Download all button
    const downloadAllBtn = this.modalElement.querySelector('#download-all-preview') as HTMLButtonElement;
    if (downloadAllBtn) {
      downloadAllBtn.addEventListener('click', () => {
        // Trigger download all functionality
        this.close();
        // Dispatch custom event to trigger download all
        const event = new CustomEvent('bulkDownloadAll', { detail: { fromPreview: true } });
        document.dispatchEvent(event);
      });
    }

    // Close on overlay click
    this.modalElement.addEventListener('click', (e) => {
      if (e.target === this.modalElement) {
        this.close();
      }
    });

    // Close on ESC key
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.close();
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);
  }

  public close(): void {
    if (this.modalElement && this.modalElement.parentNode) {
      this.modalElement.parentNode.removeChild(this.modalElement);
      this.modalElement = null;
    }
    
    // Dispatch event to notify that the modal is closed
    const event = new CustomEvent('previewModalClosed');
    this.container.dispatchEvent(event);
  }

  public async refresh(newFormData?: Record<string, any>, newBulkModeData?: { items: any[], selectedItemId: string | null }): Promise<void> {
    console.log('PreviewModal.refresh called with:', { newFormData, newBulkModeData });
    if (!this.currentPreviewData) {
      console.log('No current preview data to refresh');
      return;
    }

    console.log('Refreshing preview with new data');
    
    // Update the stored data with new form data or bulk mode data
    if (newFormData) {
      console.log('Updating form data:', newFormData);
      this.currentPreviewData.formData = newFormData;
    }
    
    if (newBulkModeData) {
      console.log('Updating bulk mode data:', newBulkModeData);
      this.currentPreviewData.bulkModeData = newBulkModeData;
    }

    // Regenerate the preview with updated data
    try {
      if (this.currentPreviewData.bulkModeData && this.currentPreviewData.bulkModeData.items && this.currentPreviewData.bulkModeData.items.length > 0) {
        console.log('Refreshing bulk mode preview with updated data');
        
        // Update the items with the new form data if provided
        if (newFormData && this.currentPreviewData.bulkModeData.selectedItemId) {
          const selectedItem = this.currentPreviewData.bulkModeData.items.find((item: any) => item.id === this.currentPreviewData.bulkModeData.selectedItemId);
          if (selectedItem) {
            console.log('Updating selected item with new form data:', newFormData);
            selectedItem.editedFields = { ...newFormData };
          }
        }
        
        // For bulk mode, we need to regenerate all previews with the updated data
        await this.showBulkMode(this.currentPreviewData.bulkModeData, this.currentPreviewData.template, this.currentPreviewData.docxProcessor);
      } else {
        console.log('Refreshing single document preview');
        // For single document, regenerate DOCX bytes with updated form data
        if (this.currentPreviewData.template && this.currentPreviewData.docxProcessor) {
          // Regenerate DOCX bytes with updated form data
          const docxBytes = await this.currentPreviewData.docxProcessor.processDocxToBytes(
            this.currentPreviewData.template.file,
            this.currentPreviewData.formData,
            this.currentPreviewData.template.conditionalOptions || [],
            this.currentPreviewData.template.placeholders || []
          );
          
          // Convert to HTML
          const result = await mammoth.convertToHtml(
            { arrayBuffer: new Uint8Array(docxBytes).buffer },
            {
              styleMap: [
                "p[style-name='Section Title'] => h1:fresh",
                "p[style-name='Subsection Title'] => h2:fresh"
              ]
            }
          );

          const htmlContent = result.value;
          const highlightedContent = this.highlightFilledData(htmlContent, this.currentPreviewData.formData);
          
          // Update the preview content
          const previewContent = this.modalElement?.querySelector('.preview-content');
          if (previewContent) {
            previewContent.innerHTML = highlightedContent;
          }
        } else {
          // Fallback to original method if no template/processor available
          const result = await mammoth.convertToHtml(
            { arrayBuffer: this.currentPreviewData.docxBytes },
            {
              styleMap: [
                "p[style-name='Section Title'] => h1:fresh",
                "p[style-name='Subsection Title'] => h2:fresh"
              ]
            }
          );

          const htmlContent = result.value;
          const highlightedContent = this.highlightFilledData(htmlContent, this.currentPreviewData.formData);
          
          // Update the preview content
          const previewContent = this.modalElement?.querySelector('.preview-content');
          if (previewContent) {
            previewContent.innerHTML = highlightedContent;
          }
        }
      }
    } catch (error) {
      console.error('Error refreshing preview:', error);
    }
  }
}

