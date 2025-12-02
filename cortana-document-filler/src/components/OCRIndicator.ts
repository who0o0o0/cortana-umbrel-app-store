/**
 * OCR Indicator Component
 * Shows a small indicator when OCR was used for text extraction
 */
export class OCRIndicator {
  private container: HTMLElement;
  private isVisible: boolean = false;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  /**
   * Show OCR indicator
   */
  show(message: string = 'Imported via OCR (no text layer detected)'): void {
    if (this.isVisible) {
      this.hide();
    }

    const indicator = document.createElement('div');
    indicator.id = 'ocr-indicator';
    indicator.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #f59e0b;
      color: white;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      font-size: 0.875rem;
      font-weight: 500;
      z-index: 1000;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      display: flex;
      align-items: center;
      gap: 0.5rem;
    `;

    indicator.innerHTML = `
      <span>🔍</span>
      <span>${message}</span>
      <button 
        onclick="this.parentElement.remove()" 
        style="
          background: none; 
          border: none; 
          color: white; 
          cursor: pointer; 
          font-size: 1.2rem; 
          padding: 0; 
          margin-left: 0.5rem;
        "
      >×</button>
    `;

    this.container.appendChild(indicator);
    this.isVisible = true;

    // Auto-hide after 5 seconds
    setTimeout(() => {
      this.hide();
    }, 5000);
  }

  /**
   * Hide OCR indicator
   */
  hide(): void {
    const indicator = this.container.querySelector('#ocr-indicator');
    if (indicator) {
      indicator.remove();
      this.isVisible = false;
    }
  }

  /**
   * Check if indicator is visible
   */
  getVisible(): boolean {
    return this.isVisible;
  }
}

/**
 * Create a new OCR indicator instance
 */
export function createOCRIndicator(container: HTMLElement): OCRIndicator {
  return new OCRIndicator(container);
}






