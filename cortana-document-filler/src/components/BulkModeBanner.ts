import { BulkItem, BulkModeState } from '../types.js';

export class BulkModeBanner {
  private container: HTMLElement;
  private onItemSelect: (itemId: string) => void;
  private onItemToggle: (itemId: string) => void;
  private onClearBulkMode: () => void;
  private onDownloadAll: () => void;
  private onUseInMainForm: (item: BulkItem) => void;
  private onPopulateMainForm: (item: BulkItem) => void;

  constructor(
    container: HTMLElement,
    onItemSelect: (itemId: string) => void,
    onItemToggle: (itemId: string) => void,
    onClearBulkMode: () => void,
    onDownloadAll: () => void,
    onUseInMainForm: (item: BulkItem) => void,
    onPopulateMainForm: (item: BulkItem) => void
  ) {
    this.container = container;
    this.onItemSelect = onItemSelect;
    this.onItemToggle = onItemToggle;
    this.onClearBulkMode = onClearBulkMode;
    this.onDownloadAll = onDownloadAll;
    this.onUseInMainForm = onUseInMainForm;
    this.onPopulateMainForm = onPopulateMainForm;
  }

  render(state: BulkModeState): void {
    console.log('BulkModeBanner.render called:', {
      isActive: state.isActive,
      itemsCount: state.items.length,
      container: this.container
    });
    
    if (!state.isActive) {
      this.container.innerHTML = '';
      return;
    }

    // Auto-select first item if none is selected and processing is complete
    const effectiveState = { ...state };
    if (!effectiveState.selectedItemId && effectiveState.items.length > 0 && !effectiveState.isProcessing) {
      effectiveState.selectedItemId = effectiveState.items[0].id;
      // Also populate the form with the first item's data
      const firstItem = effectiveState.items[0];
      if (firstItem && firstItem.status === 'ok') {
        this.onPopulateMainForm(firstItem);
      }
    }

    const html = `
      <div class="form-field" style="margin-bottom: 1rem; max-width: 520px; margin-left: auto; margin-right: auto; background: #f0f0f0; border: 2px solid red; padding: 1rem; position: relative; z-index: 1000;">
        <!-- TEST BANNER - This should always be visible -->
        <div style="background: #ff0000; color: white; padding: 10px; margin-bottom: 10px; text-align: center; font-weight: bold;">
          TEST BANNER - BULK MODE ACTIVE - ITEMS: ${effectiveState.items.length}
        </div>
        
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <label class="form-label" style="margin-bottom: 0;">
            PDF Files (${effectiveState.items.length})
          </label>
          <button type="button" class="btn btn-sm btn-secondary" id="clear-bulk-mode" style="padding: 0.25rem 0.5rem;">
            ✕ Clear
          </button>
        </div>
        <p style="margin: 0 0 1rem 0; font-size: 0.875rem; color: var(--text-secondary);">
          Click any tab to load data • Edit values in the form above • Download uses current form data
        </p>
        
        ${effectiveState.isProcessing ? this.renderProgress(effectiveState) : ''}
        
        ${effectiveState.items.length === 0 ? `
          <div style="text-align: center; padding: 2rem; color: var(--text-secondary); background: var(--primary-bg); border-radius: 8px; border: 1px solid var(--border-color);">
            <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">📁</div>
            <div>No PDF files found in this folder</div>
            <div style="font-size: 0.875rem; margin-top: 0.25rem; color: var(--text-muted);">
              Make sure the folder contains completed PDF forms with fillable fields
            </div>
          </div>
        ` : `
          <!-- Tab Interface -->
          <div class="pdf-tabs" style="
            display: flex;
            border: 1px solid #ddd;
            border-radius: 8px;
            background: #f8f9fa;
            overflow-x: auto;
            margin-bottom: 1rem;
            min-height: 50px;
          ">
            ${effectiveState.items.map((item, index) => `
              <button type="button" 
                class="pdf-tab ${effectiveState.selectedItemId === item.id ? 'active' : ''}" 
                data-item-id="${item.id}"
                style="
                  padding: 0.75rem 1rem;
                  border: none;
                  background: ${effectiveState.selectedItemId === item.id ? '#3b82f6' : 'transparent'};
                  color: ${effectiveState.selectedItemId === item.id ? 'white' : '#333'};
                  border-radius: ${effectiveState.selectedItemId === item.id ? '8px' : '0'};
                  margin: ${effectiveState.selectedItemId === item.id ? '2px' : '0'};
                  cursor: pointer;
                  white-space: nowrap;
                  font-size: 0.875rem;
                  display: flex;
                  align-items: center;
                  gap: 0.5rem;
                  transition: all 0.2s ease;
                  font-weight: 500;
                  min-height: 40px;
                "
              >
                <span style="font-size: 0.75rem;">${this.getStatusIcon(item.status)}</span>
                <span>${item.displayName || item.fileName.replace('.pdf', '')}</span>
                <input type="checkbox" 
                  ${item.include ? 'checked' : ''} 
                  style="margin-left: 0.5rem; accent-color: #3b82f6;"
                  onclick="event.stopPropagation();"
                />
              </button>
            `).join('')}
          </div>
        `}
      </div>
    `;
    
    console.log('BulkModeBanner HTML:', html);
    this.container.innerHTML = html;
    console.log('BulkModeBanner container after setting HTML:', this.container);
    console.log('BulkModeBanner container display:', window.getComputedStyle(this.container).display);
    console.log('BulkModeBanner container visibility:', window.getComputedStyle(this.container).visibility);
    console.log('BulkModeBanner container height:', window.getComputedStyle(this.container).height);
    console.log('BulkModeBanner container parent:', this.container.parentElement);
    
    // Force the container to be visible and ensure it stays visible
    this.container.style.display = 'block';
    this.container.style.visibility = 'visible';
    this.container.style.opacity = '1';
    this.container.style.height = 'auto';
    this.container.style.minHeight = '100px';
    console.log('BulkModeBanner container display set to block');
    
    // Also ensure the parent container is visible
    if (this.container.parentElement) {
      this.container.parentElement.style.display = 'block';
      this.container.parentElement.style.visibility = 'visible';
    }

    // Use multiple timeouts to ensure the banner stays visible
    setTimeout(() => {
      this.container.style.display = 'block';
      this.container.style.visibility = 'visible';
      this.container.style.opacity = '1';
      console.log('BulkModeBanner container visibility enforced after 50ms');
    }, 50);

    setTimeout(() => {
      this.container.style.display = 'block';
      this.container.style.visibility = 'visible';
      this.container.style.opacity = '1';
      console.log('BulkModeBanner container visibility enforced after 100ms');
    }, 100);

    setTimeout(() => {
      this.container.style.display = 'block';
      this.container.style.visibility = 'visible';
      this.container.style.opacity = '1';
      console.log('BulkModeBanner container visibility enforced after 200ms');
    }, 200);

    // Check if banner is still visible after timeout
    setTimeout(() => {
      const computedStyle = window.getComputedStyle(this.container);
      console.log('BulkModeBanner after 300ms - display:', computedStyle.display, 'visibility:', computedStyle.visibility);
      if (computedStyle.display === 'none' || computedStyle.visibility === 'hidden') {
        console.log('BulkModeBanner was hidden! Re-enabling...');
        this.container.style.display = 'block';
        this.container.style.visibility = 'visible';
        this.container.style.opacity = '1';
        this.container.style.height = 'auto';
        this.container.style.minHeight = '100px';
      }
    }, 300);

    // Add a simple test to see if the banner is actually visible
    setTimeout(() => {
      const rect = this.container.getBoundingClientRect();
      console.log('BulkModeBanner bounding rect:', {
        width: rect.width,
        height: rect.height,
        top: rect.top,
        left: rect.left,
        visible: rect.width > 0 && rect.height > 0
      });
      
      // If the banner has no dimensions, force it to be visible
      if (rect.width === 0 || rect.height === 0) {
        console.log('BulkModeBanner has no dimensions! Forcing visibility...');
        this.container.style.display = 'block';
        this.container.style.visibility = 'visible';
        this.container.style.opacity = '1';
        this.container.style.height = 'auto';
        this.container.style.minHeight = '100px';
        this.container.style.width = '100%';
      }
    }, 500);

    this.setupEventListeners(effectiveState);
  }

  private renderProgress(state: BulkModeState): string {
    return `
      <div class="progress-container" style="margin-bottom: 1rem;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem;">
          <span style="font-size: 0.875rem; color: var(--text-secondary);">Processing PDFs...</span>
          <span style="font-size: 0.875rem; color: var(--text-secondary);">${Math.round(state.progress || 0)}%</span>
        </div>
        <div style="
          width: 100%;
          height: 8px;
          background: var(--border-color);
          border-radius: 8px;
          overflow: hidden;
          border: 1px solid var(--border-accent);
        ">
          <div style="
            width: ${state.progress || 0}%;
            height: 100%;
            background: var(--accent-blue);
            transition: width 0.3s ease;
          "></div>
        </div>
      </div>
    `;
  }

  private getStatusIcon(status: string): string {
    return status === 'ok' ? '✓' : status === 'warning' ? '!' : '✕';
  }

  private renderPdfItem(item: BulkItem, selectedId: string | null): string {
    const statusIcon = item.status === 'ok' ? '✓' : item.status === 'warning' ? '!' : '✕';
    const statusColor = item.status === 'ok' ? '#10b981' : item.status === 'warning' ? '#f59e0b' : '#ef4444';
    const isSelected = item.id === selectedId;

    return `
      <div class="pdf-item" data-item-id="${item.id}" style="
        display: flex;
        align-items: center;
        padding: 0.5rem;
        border-radius: 4px;
        cursor: pointer;
        background: ${isSelected ? '#dbeafe' : 'transparent'};
        border: 1px solid ${isSelected ? '#3b82f6' : 'transparent'};
        transition: all 0.2s ease;
      ">
        <input type="checkbox" 
               ${item.include ? 'checked' : ''} 
               style="margin-right: 0.5rem;"
               ${item.status === 'error' ? 'disabled' : ''}>
        <span style="color: ${statusColor}; margin-right: 0.5rem; font-weight: bold;">${statusIcon}</span>
        <span style="flex: 1; font-size: 0.875rem; color: #374151;">${item.displayName || item.fileName}</span>
        ${item.issues && item.issues.length > 0 ? `
          <span style="color: #6b7280; font-size: 0.75rem;" title="${item.issues.join(', ')}">
            ${item.issues.length} issue${item.issues.length > 1 ? 's' : ''}
          </span>
        ` : ''}
      </div>
    `;
  }


  private formatFieldLabel(key: string): string {
    return key
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }

  private setupEventListeners(state: BulkModeState): void {
    // Clear bulk mode
    const clearBtn = this.container.querySelector('#clear-bulk-mode');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.onClearBulkMode();
      });
    }

    // Tab selection - populate main form when clicked
    const pdfTabs = this.container.querySelectorAll('.pdf-tab');
    pdfTabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const itemId = tab.getAttribute('data-item-id');
        
        if (target.tagName !== 'INPUT' && itemId) {
          // Select the tab and populate the main form
          this.onItemSelect(itemId);
          const selectedItem = state.items.find(item => item.id === itemId);
          if (selectedItem) {
            this.onPopulateMainForm(selectedItem);
          }
        }
      });
    });

    // Checkbox toggles in tabs
    const checkboxes = this.container.querySelectorAll('.pdf-tab input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        const itemId = target.closest('.pdf-tab')?.getAttribute('data-item-id');
        if (itemId) {
          this.onItemToggle(itemId);
        }
      });
    });

    // Download All button is now handled in the main form
  }

  private getSelectedItem(): BulkItem | null {
    // This will be provided by the parent component
    return null;
  }
}
