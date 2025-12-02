import { umbrelService } from '../utils/umbrelService.js';
import { UmbrelConnectionModal } from './UmbrelConnectionModal.js';

export class UmbrelSettings {
  private container: HTMLElement;
  private onConnected: () => void;
  private onDisconnected: () => void;
  private connectionModal: UmbrelConnectionModal | null = null;
  private connectionStatus = {
    connected: false,
    baseUrl: '',
    username: '',
    rememberDevice: false
  };
  private isDisconnecting: boolean = false;
  private isClearingCredentials: boolean = false;

  constructor(
    container: HTMLElement,
    onConnected: () => void,
    onDisconnected: () => void
  ) {
    this.container = container;
    this.onConnected = onConnected;
    this.onDisconnected = onDisconnected;
    this.updateConnectionStatus();
    this.attemptAutoReconnect();
    this.render();
  }

  private updateConnectionStatus(): void {
    const status = umbrelService.getConnectionStatus();
    this.connectionStatus = status;
  }

  public refresh(): void {
    this.updateConnectionStatus();
    this.render();
  }

  private async attemptAutoReconnect(): Promise<void> {
    if (umbrelService.shouldAutoReconnect()) {
      try {
        const result = await umbrelService.attemptAutoReconnect();
        if (result.success) {
          this.updateConnectionStatus();
          this.onConnected();
          this.render();
        }
      } catch (error) {
        console.log('Auto-reconnect failed:', error);
        // Silently fail - user can still connect manually
      }
    }
  }

  private handleConnect(): void {
    // Check if already connected
    this.updateConnectionStatus();
    if (this.connectionStatus.connected) {
      return;
    }

    if (!this.connectionModal) {
      const modalContainer = document.createElement('div');
      this.container.appendChild(modalContainer);
      this.connectionModal = new UmbrelConnectionModal(
        modalContainer,
        () => this.hideModal(),
        () => this.handleConnected()
      );
    }
    this.connectionModal.show();
  }

  private hideModal(): void {
    if (this.connectionModal) {
      this.connectionModal.hide();
    }
  }

  private handleConnected(): void {
    this.updateConnectionStatus();
    this.onConnected();
    this.render();
  }

  private async handleDisconnect(): Promise<void> {
    try {
      this.isDisconnecting = true;
      this.render();
      
      await umbrelService.disconnect();
      this.updateConnectionStatus();
      this.onDisconnected();
      this.render();
    } catch (error) {
      console.error('Error disconnecting from Umbrel:', error);
    } finally {
      this.isDisconnecting = false;
      this.render();
    }
  }

  private async handleClearCredentials(): Promise<void> {
    if (!window.confirm('This will clear all stored Umbrel credentials. You will need to reconnect manually. Continue?')) {
      return;
    }

    try {
      this.isClearingCredentials = true;
      this.render();
      
      await umbrelService.clearStoredCredentials();
      this.updateConnectionStatus();
      this.onDisconnected();
      this.render();
    } catch (error) {
      console.error('Error clearing Umbrel credentials:', error);
    } finally {
      this.isClearingCredentials = false;
      this.render();
    }
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-medium">Umbrel Integration</h3>
          <div class="flex items-center space-x-2">
            ${this.connectionStatus.connected ? `
              <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                ✓ Connected to ${this.connectionStatus.baseUrl}
              </span>
            ` : `
              <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                Disconnected
              </span>
            `}
          </div>
        </div>

        ${this.connectionStatus.connected ? `
          <div class="space-y-3">
            <div class="bg-gray-50 p-3 rounded-md">
              <div class="text-sm text-gray-600">
                <div><strong>Base URL:</strong> ${this.connectionStatus.baseUrl}</div>
                <div><strong>Username:</strong> ${this.connectionStatus.username}</div>
                <div><strong>Remember Device:</strong> ${this.connectionStatus.rememberDevice ? 'Yes' : 'No'}</div>
              </div>
            </div>

            <div class="flex space-x-2">
              <button
                id="umbrel-disconnect-btn"
                class="px-3 py-2 text-sm font-medium text-red-700 bg-red-100 border border-red-300 rounded-md hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
                ${this.isDisconnecting ? 'disabled' : ''}
              >
                ${this.isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
              </button>

              ${this.connectionStatus.rememberDevice ? `
                <button
                  id="umbrel-clear-credentials-btn"
                  class="px-3 py-2 text-sm font-medium text-orange-700 bg-orange-100 border border-orange-300 rounded-md hover:bg-orange-200 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50"
                  ${this.isClearingCredentials ? 'disabled' : ''}
                >
                  ${this.isClearingCredentials ? 'Clearing...' : 'Clear Stored Credentials'}
                </button>
              ` : ''}
            </div>
          </div>
        ` : `
          <div class="space-y-3">
            <p class="text-sm text-gray-600">
              Connect to your Umbrel instance to search and import documents directly from your Umbrel File Browser.
            </p>
            
            <button
              id="umbrel-connect-btn"
              class="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Connect to Umbrel
            </button>
          </div>
        `}

        <div class="border-t pt-4">
          <h4 class="text-sm font-medium text-gray-900 mb-2">Privacy & Security</h4>
          <div class="text-xs text-gray-600 space-y-1">
            <p>• Only selected files are imported to Cortana</p>
            <p>• Your Umbrel password is never stored</p>
            <p>• Connection credentials are stored locally on this device only</p>
            <p>• You can disconnect or clear credentials at any time</p>
          </div>
        </div>
      </div>
    `;

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    const connectBtn = this.container.querySelector('#umbrel-connect-btn') as HTMLButtonElement;
    const disconnectBtn = this.container.querySelector('#umbrel-disconnect-btn') as HTMLButtonElement;
    const clearCredentialsBtn = this.container.querySelector('#umbrel-clear-credentials-btn') as HTMLButtonElement;

    if (connectBtn) {
      connectBtn.addEventListener('click', () => this.handleConnect());
    }

    if (disconnectBtn) {
      disconnectBtn.addEventListener('click', () => this.handleDisconnect());
    }

    if (clearCredentialsBtn) {
      clearCredentialsBtn.addEventListener('click', () => this.handleClearCredentials());
    }
  }
}