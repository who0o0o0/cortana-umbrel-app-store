import { umbrelService, UmbrelCredentials } from '../utils/umbrelService.js';

export class UmbrelConnectionModal {
  private container: HTMLElement;
  private isOpen: boolean = false;
  private onClose: () => void;
  private onConnected: () => void;
  private credentials: UmbrelCredentials = {
    baseUrl: 'http://umbrel.local',
    username: 'umbrel',
    password: '',
    rememberDevice: false
  };
  private isConnecting: boolean = false;
  private error: string | null = null;
  private showPassword: boolean = false;
  private connectionMethod: 'local' | 'proxy' = 'local';

  constructor(container: HTMLElement, onClose: () => void, onConnected: () => void) {
    this.container = container;
    this.onClose = onClose;
    this.onConnected = onConnected;
    this.render();
  }

  show(): void {
    this.isOpen = true;
    this.loadStoredCredentials();
    this.render();
  }

  hide(): void {
    this.isOpen = false;
    this.render();
  }

  destroy(): void {
    this.isOpen = false;
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }

  private loadStoredCredentials(): void {
    const status = umbrelService.getConnectionStatus();
    if (status.baseUrl && status.username) {
      this.credentials = {
        ...this.credentials,
        baseUrl: status.baseUrl,
        username: status.username,
        rememberDevice: status.rememberDevice
      };
      // Determine connection method from stored baseUrl
      if (status.baseUrl.includes('100.86.166.93')) {
        this.connectionMethod = 'proxy';
      } else {
        this.connectionMethod = 'local';
      }
    }
  }

  private async handleSubmit(e: Event): Promise<void> {
    e.preventDefault();
    this.isConnecting = true;
    this.error = null;
    this.render();

    try {
      // Determine baseUrl based on connection method
      const baseUrl = this.connectionMethod === 'proxy' 
        ? 'http://100.86.166.93'
        : 'http://umbrel.local';
      
      // Use default values for baseUrl and username
      const credentials = {
        ...this.credentials,
        baseUrl: baseUrl,
        username: 'umbrel'
      };
      
      const result = await umbrelService.connect(credentials);
      
      if (result.success) {
        this.onConnected();
        this.hide();
      } else {
        this.error = result.error || 'Connection failed';
      }
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Connection failed';
    } finally {
      this.isConnecting = false;
      this.render();
    }
  }

  private handleInputChange(field: keyof UmbrelCredentials, value: string | boolean): void {
    this.credentials = {
      ...this.credentials,
      [field]: value
    };
    this.error = null; // Clear error when user starts typing
  }

  private render(): void {
    if (!this.isOpen) {
      this.container.innerHTML = '';
      return;
    }

    this.container.innerHTML = `
      <div style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
      ">
        <div style="
          background: var(--primary-bg);
          border-radius: 12px;
          padding: 24px;
          width: 100%;
          max-width: 400px;
          margin: 16px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        ">
          <div style="
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 20px;
          ">
            <div>
              <h2 style="
                font-size: 20px;
                font-weight: 600;
                color: var(--text-primary);
                margin: 0;
              ">Connect to Umbrel</h2>
              <p style="
                font-size: 14px;
                color: var(--text-muted);
                margin: 4px 0 0 0;
              ">Enter your Umbrel password to connect</p>
            </div>
            <button 
              id="umbrel-modal-close" 
              style="
                background: none;
                border: none;
                font-size: 18px;
                color: var(--text-secondary);
                cursor: pointer;
                padding: 4px;
                border-radius: 4px;
                transition: all 0.2s ease;
              "
              onmouseover="this.style.color='var(--text-primary)'; this.style.background='var(--secondary-bg)'"
              onmouseout="this.style.color='var(--text-secondary)'; this.style.background='none'"
              ${this.isConnecting ? 'disabled' : ''}
            >
              ✕
            </button>
          </div>

          <form id="umbrel-connection-form" style="display: flex; flex-direction: column; gap: 16px;">

            <div>
              <label style="
                display: block;
                font-size: 14px;
                font-weight: 500;
                color: var(--text-primary);
                margin-bottom: 8px;
              ">
                Connection Method
              </label>
              <div style="display: flex; flex-direction: column; gap: 8px;">
                <label style="
                  display: flex;
                  align-items: center;
                  font-size: 14px;
                  color: var(--text-primary);
                  cursor: pointer;
                  padding: 8px;
                  border-radius: 6px;
                  transition: background 0.2s ease;
                " onmouseover="this.style.background='var(--secondary-bg)'" onmouseout="this.style.background='transparent'">
                  <input
                    type="radio"
                    name="umbrel-connection-method"
                    value="local"
                    ${this.connectionMethod === 'local' ? 'checked' : ''}
                    style="
                      width: 16px;
                      height: 16px;
                      accent-color: var(--accent-blue);
                      margin-right: 8px;
                    "
                    ${this.isConnecting ? 'disabled' : ''}
                  />
                  Local Network
                </label>
                <label style="
                  display: flex;
                  align-items: center;
                  font-size: 14px;
                  color: var(--text-primary);
                  cursor: pointer;
                  padding: 8px;
                  border-radius: 6px;
                  transition: background 0.2s ease;
                " onmouseover="this.style.background='var(--secondary-bg)'" onmouseout="this.style.background='transparent'">
                  <input
                    type="radio"
                    name="umbrel-connection-method"
                    value="proxy"
                    ${this.connectionMethod === 'proxy' ? 'checked' : ''}
                    style="
                      width: 16px;
                      height: 16px;
                      accent-color: var(--accent-blue);
                      margin-right: 8px;
                    "
                    ${this.isConnecting ? 'disabled' : ''}
                  />
                  Proxy Network
                </label>
              </div>
            </div>

            <div>
              <label for="umbrel-password" style="
                display: block;
                font-size: 14px;
                font-weight: 500;
                color: var(--text-primary);
                margin-bottom: 4px;
              ">
                Password
              </label>
              <div style="position: relative;">
                <input
                  type="${this.showPassword ? 'text' : 'password'}"
                  id="umbrel-password"
                  value="${this.credentials.password}"
                  style="
                    width: 100%;
                    padding: 8px 40px 8px 12px;
                    border: 1px solid var(--border-color);
                    border-radius: 8px;
                    font-size: 14px;
                    color: var(--text-primary);
                    background: var(--primary-bg);
                    transition: all 0.2s ease;
                  "
                  onfocus="this.style.outline='none'; this.style.borderColor='var(--accent-blue)'; this.style.boxShadow='0 0 0 3px rgba(0, 122, 255, 0.1)'"
                  onblur="this.style.outline='none'; this.style.borderColor='var(--border-color)'; this.style.boxShadow='none'"
                  placeholder="Enter your Umbrel password"
                  required
                  ${this.isConnecting ? 'disabled' : ''}
                />
                <button
                  type="button"
                  id="umbrel-toggle-password"
                  style="
                    position: absolute;
                    right: 8px;
                    top: 50%;
                    transform: translateY(-50%);
                    background: none;
                    border: none;
                    color: var(--text-secondary);
                    cursor: pointer;
                    padding: 4px;
                    border-radius: 4px;
                    transition: all 0.2s ease;
                  "
                  onmouseover="this.style.color='var(--text-primary)'; this.style.background='var(--secondary-bg)'"
                  onmouseout="this.style.color='var(--text-secondary)'; this.style.background='none'"
                  ${this.isConnecting ? 'disabled' : ''}
                >
                  ${this.showPassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
            </div>

            <div style="display: flex; align-items: center;">
              <input
                type="checkbox"
                id="umbrel-remember-device"
                ${this.credentials.rememberDevice ? 'checked' : ''}
                style="
                  width: 16px;
                  height: 16px;
                  accent-color: var(--accent-blue);
                  margin-right: 8px;
                "
                ${this.isConnecting ? 'disabled' : ''}
              />
              <label for="umbrel-remember-device" style="
                font-size: 14px;
                color: var(--text-primary);
                cursor: pointer;
              ">
                Remember this device
              </label>
              <div style="margin-left: 4px; position: relative;">
                <span style="
                  color: var(--text-muted);
                  cursor: help;
                  font-size: 12px;
                ">ℹ️</span>
                <div style="
                  position: absolute;
                  bottom: 100%;
                  left: 50%;
                  transform: translateX(-50%);
                  margin-bottom: 8px;
                  padding: 6px 12px;
                  background: var(--text-primary);
                  color: var(--primary-bg);
                  font-size: 12px;
                  border-radius: 6px;
                  opacity: 0;
                  pointer-events: none;
                  white-space: nowrap;
                  z-index: 10;
                  transition: opacity 0.2s ease;
                " onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0'">
                  Stores credentials securely on this device to auto-reconnect
                </div>
              </div>
            </div>

            ${this.error ? `
              <div style="
                background: #fef2f2;
                border: 1px solid #fecaca;
                border-radius: 8px;
                padding: 12px;
              ">
                <div style="display: flex;">
                  <div style="flex-shrink: 0;">
                    <span style="color: #f87171; font-size: 16px;">⚠️</span>
                  </div>
                  <div style="margin-left: 12px;">
                    <p style="
                      font-size: 14px;
                      color: #991b1b;
                      margin: 0;
                    ">${this.error}</p>
                  </div>
                </div>
              </div>
            ` : ''}

            <div style="
              display: flex;
              justify-content: flex-end;
              gap: 12px;
              padding-top: 16px;
            ">
              <button
                type="button"
                id="umbrel-modal-cancel"
                style="
                  padding: 8px 16px;
                  font-size: 14px;
                  font-weight: 500;
                  color: var(--text-primary);
                  background: var(--secondary-bg);
                  border: 1px solid var(--border-color);
                  border-radius: 8px;
                  cursor: pointer;
                  transition: all 0.2s ease;
                "
                onmouseover="this.style.background='var(--border-color)'"
                onmouseout="this.style.background='var(--secondary-bg)'"
                onfocus="this.style.outline='none'; this.style.borderColor='var(--accent-blue)'; this.style.boxShadow='0 0 0 3px rgba(0, 122, 255, 0.1)'"
                onblur="this.style.outline='none'; this.style.borderColor='var(--border-color)'; this.style.boxShadow='none'"
                ${this.isConnecting ? 'disabled' : ''}
              >
                Cancel
              </button>
              <button
                type="submit"
                id="umbrel-modal-connect"
                style="
                  padding: 8px 16px;
                  font-size: 14px;
                  font-weight: 500;
                  color: white;
                  background: var(--accent-blue);
                  border: 1px solid var(--accent-blue);
                  border-radius: 8px;
                  cursor: pointer;
                  transition: all 0.2s ease;
                  opacity: ${this.isConnecting ? '0.5' : '1'};
                  cursor: ${this.isConnecting ? 'not-allowed' : 'pointer'};
                "
                onmouseover="if (!this.disabled) this.style.background='#0056b3'"
                onmouseout="if (!this.disabled) this.style.background='var(--accent-blue)'"
                onfocus="this.style.outline='none'; this.style.boxShadow='0 0 0 3px rgba(0, 122, 255, 0.1)'"
                onblur="this.style.outline='none'; this.style.boxShadow='none'"
                ${this.isConnecting ? 'disabled' : ''}
              >
                ${this.isConnecting ? 'Connecting...' : 'Connect'}
              </button>
            </div>
          </form>

          <div style="
            margin-top: 16px;
            padding: 12px;
            background: #eff6ff;
            border: 1px solid #bfdbfe;
            border-radius: 8px;
          ">
            <p style="
              font-size: 12px;
              color: #1e40af;
              margin: 0;
            ">
              <strong>Privacy Note:</strong> When "Remember this device" is enabled, your connection preferences are stored locally. 
              Your password is never stored and will be required for reconnection.
            </p>
          </div>
        </div>
      </div>
    `;

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    const form = this.container.querySelector('#umbrel-connection-form') as HTMLFormElement;
    const closeBtn = this.container.querySelector('#umbrel-modal-close') as HTMLButtonElement;
    const cancelBtn = this.container.querySelector('#umbrel-modal-cancel') as HTMLButtonElement;
    const togglePasswordBtn = this.container.querySelector('#umbrel-toggle-password') as HTMLButtonElement;
    const passwordInput = this.container.querySelector('#umbrel-password') as HTMLInputElement;
    const rememberDeviceInput = this.container.querySelector('#umbrel-remember-device') as HTMLInputElement;
    const connectionMethodInputs = this.container.querySelectorAll('input[name="umbrel-connection-method"]') as NodeListOf<HTMLInputElement>;

    form.addEventListener('submit', (e) => this.handleSubmit(e));
    closeBtn.addEventListener('click', () => this.hide());
    cancelBtn.addEventListener('click', () => this.hide());
    
    togglePasswordBtn.addEventListener('click', () => {
      this.showPassword = !this.showPassword;
      this.render();
    });

    passwordInput.addEventListener('input', (e) => {
      this.handleInputChange('password', (e.target as HTMLInputElement).value);
    });

    rememberDeviceInput.addEventListener('change', (e) => {
      this.handleInputChange('rememberDevice', (e.target as HTMLInputElement).checked);
    });

    connectionMethodInputs.forEach(input => {
      input.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        if (target.checked) {
          this.connectionMethod = target.value as 'local' | 'proxy';
          this.error = null; // Clear error when switching methods
        }
      });
    });
  }
}