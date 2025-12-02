export class HelpModal {
  private container: HTMLElement;
  private isVisible: boolean = false;

  constructor(container: HTMLElement) {
    this.container = container;
    this.render();
  }

  private render(): void {
    this.container.innerHTML = `
      <div 
        id="help-modal-overlay" 
        class="help-modal-overlay"
        style="
          display: ${this.isVisible ? 'flex' : 'none'};
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          z-index: 10000;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          backdrop-filter: blur(4px);
        "
      >
        <div 
          id="help-modal-content" 
          class="help-modal-content"
          style="
            background: white;
            border-radius: 12px !important;
            max-width: 600px;
            width: 100%;
            max-height: 90vh;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            position: relative;
            border-top-left-radius: 12px !important;
            border-top-right-radius: 12px !important;
            border-bottom-left-radius: 12px !important;
            border-bottom-right-radius: 12px !important;
            overflow: hidden;
            display: flex;
            flex-direction: column;
          "
        >
          <div 
            class="help-modal-scrollable"
            style="
            flex: 1;
            overflow-y: auto;
            overflow-x: hidden;
            padding: 2rem;
            padding-right: 2.5rem;
            margin-right: 0.5rem;
          ">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
              <h2 style="font-size: 1.75rem; font-weight: 700; color: var(--text-primary); margin: 0;">
                Help & Information
              </h2>
              <button 
                id="help-modal-close"
                style="
                  background: none;
                  border: none;
                  cursor: pointer;
                  padding: 0.5rem;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  border-radius: 6px;
                  transition: background 0.2s ease;
                  color: var(--text-secondary);
                "
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <div style="display: flex; flex-direction: column; gap: 2rem;">
              <!-- How the App Works -->
              <section>
                <h3 style="font-size: 1.25rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.5rem;">
                  <span>📄</span> How Cortana Works
                </h3>
                <div style="color: #000; line-height: 1.6; font-size: 0.9375rem;">
                  <p style="margin-bottom: 0.75rem;">
                    Cortana is a document automation tool that helps you fill in Word templates quickly and efficiently.
                  </p>
                  <ul style="margin-left: 1.5rem; margin-top: 0.5rem; list-style: disc;">
                    <li style="margin-bottom: 0.5rem;"><strong>Upload a Template:</strong> Start by uploading a Word (.docx) template with placeholders</li>
                    <li style="margin-bottom: 0.5rem;"><strong>Fill in Fields:</strong> Enter the required information in the form</li>
                    <li style="margin-bottom: 0.5rem;"><strong>Preview & Download:</strong> Preview your document, then download as DOCX or PDF</li>
                    <li style="margin-bottom: 0.5rem;"><strong>Bulk Mode:</strong> Process multiple PDFs at once by importing field data from completed forms</li>
                  </ul>
                </div>
              </section>

              <!-- Connecting to Umbrel -->
              <section>
                <h3 style="font-size: 1.25rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.5rem;">
                  <span>☁️</span> Connecting to Umbrel
                </h3>
                <div style="color: #000; line-height: 1.6; font-size: 0.9375rem;">
                  <p style="margin-bottom: 0.75rem;">
                    Connect to your Umbrel instance to search and import documents directly from your Umbrel File Browser.
                  </p>
                  
                  <div style="background: var(--apple-gray); padding: 1rem; border-radius: 8px; margin-top: 0.75rem;">
                    <h4 style="font-weight: 600; color: var(--text-primary); margin-bottom: 0.5rem; font-size: 1rem;">
                      Local Network Connection
                    </h4>
                    <p style="margin-bottom: 0.75rem; font-size: 0.875rem;">
                      Connect when you're on the same network as your Umbrel device:
                    </p>
                    <ol style="margin-left: 1.5rem; list-style: decimal; font-size: 0.875rem;">
                      <li style="margin-bottom: 0.5rem;">Go to Settings in the app</li>
                      <li style="margin-bottom: 0.5rem;">Click "Connect to Umbrel"</li>
                      <li style="margin-bottom: 0.5rem;">Select "Local Network" connection method</li>
                      <li style="margin-bottom: 0.5rem;">Enter your Umbrel password</li>
                      <li style="margin-bottom: 0.5rem;">Optionally enable "Remember Device" for auto-reconnect</li>
                    </ol>
                  </div>

                  <div style="background: var(--apple-gray); padding: 1rem; border-radius: 8px; margin-top: 0.75rem;">
                    <h4 style="font-weight: 600; color: var(--text-primary); margin-bottom: 0.5rem; font-size: 1rem;">
                      Proxy Network Connection
                    </h4>
                    <p style="margin-bottom: 0.75rem; font-size: 0.875rem;">
                      Connect to Umbrel while away from the office's local network using Tailscale. Download Tailscale at <a href="https://tailscale.com/" target="_blank" rel="noopener noreferrer" style="color: var(--accent-color); text-decoration: none; font-weight: 500;">tailscale.com</a>
                    </p>
                    <ol style="margin-left: 1.5rem; list-style: decimal; font-size: 0.875rem;">
                      <li style="margin-bottom: 0.5rem;">Download and install Tailscale on your device</li>
                      <li style="margin-bottom: 0.5rem;">Ensure your Umbrel proxy server is running</li>
                      <li style="margin-bottom: 0.5rem;">Go to Settings in the app</li>
                      <li style="margin-bottom: 0.5rem;">Click "Connect to Umbrel"</li>
                      <li style="margin-bottom: 0.5rem;">Select "Proxy Network" connection method</li>
                      <li style="margin-bottom: 0.5rem;">Enter your Umbrel password</li>
                    </ol>
                  </div>
                </div>
              </section>

              <!-- Security -->
              <section>
                <h3 style="font-size: 1.25rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.5rem;">
                  <span>🔒</span> Document Storage & Security
                </h3>
                <div style="color: #000; line-height: 1.6; font-size: 0.9375rem;">
                  <p style="margin-bottom: 0.75rem;">
                    Your privacy and security are our top priorities:
                  </p>
                  <ul style="margin-left: 1.5rem; margin-top: 0.5rem; list-style: disc;">
                    <li style="margin-bottom: 0.5rem;"><strong>Local Processing:</strong> All document processing happens locally on your device</li>
                    <li style="margin-bottom: 0.5rem;"><strong>No Cloud Upload:</strong> Your documents never leave your computer</li>
                    <li style="margin-bottom: 0.5rem;"><strong>Secure Credentials:</strong> Umbrel passwords are never stored - only connection settings</li>
                    <li style="margin-bottom: 0.5rem;"><strong>Selective Import:</strong> Only files you explicitly select are imported from Umbrel</li>
                    <li style="margin-bottom: 0.5rem;"><strong>Local Storage Only:</strong> All credentials are stored locally on this device</li>
                  </ul>
                </div>
              </section>

              <!-- Tips -->
              <section>
                <h3 style="font-size: 1.25rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.5rem;">
                  <span>💡</span> Tips & Tricks
                </h3>
                <div style="color: #000; line-height: 1.6; font-size: 0.9375rem;">
                  <ul style="margin-left: 1.5rem; margin-top: 0.5rem; list-style: disc;">
                    <li style="margin-bottom: 0.5rem;">Use <strong>Bulk Mode</strong> to process multiple PDFs with the same template</li>
                    <li style="margin-bottom: 0.5rem;">The <strong>Preview</strong> button lets you review your document before downloading</li>
                    <li style="margin-bottom: 0.5rem;">You can <strong>Import Field Data</strong> from a completed PDF to auto-fill the form</li>
                    <li style="margin-bottom: 0.5rem;">Enable "Remember Device" in Umbrel settings for automatic reconnection</li>
                    <li style="margin-bottom: 0.5rem;">PDF conversion requires Microsoft Word to be installed on your system</li>
                  </ul>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    `;

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    const overlay = this.container.querySelector('#help-modal-overlay') as HTMLElement;
    const closeBtn = this.container.querySelector('#help-modal-close') as HTMLButtonElement;
    const content = this.container.querySelector('#help-modal-content') as HTMLElement;

    // Close button
    closeBtn?.addEventListener('click', () => {
      this.hide();
    });

    // Add hover effect to close button
    closeBtn?.addEventListener('mouseenter', () => {
      closeBtn.style.background = 'var(--apple-gray)';
      closeBtn.style.color = 'var(--text-primary)';
    });
    closeBtn?.addEventListener('mouseleave', () => {
      closeBtn.style.background = 'none';
      closeBtn.style.color = 'var(--text-secondary)';
    });

    // Close on overlay click
    overlay?.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.hide();
      }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible) {
        this.hide();
      }
    });

    // Prevent content clicks from closing
    content?.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  public show(): void {
    this.isVisible = true;
    const overlay = this.container.querySelector('#help-modal-overlay') as HTMLElement;
    if (overlay) {
      overlay.style.display = 'flex';
    }
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';
  }

  public hide(): void {
    this.isVisible = false;
    const overlay = this.container.querySelector('#help-modal-overlay') as HTMLElement;
    if (overlay) {
      overlay.style.display = 'none';
    }
    // Restore body scroll
    document.body.style.overflow = '';
  }
}

