export interface UmbrelCredentials {
  baseUrl: string;
  username: string;
  password: string;
  rememberDevice: boolean;
}

export interface UmbrelFile {
  name: string;
  path: string;
  size: number;
  modified: string;
  type: 'file' | 'directory';
  isDirectory: boolean;
  folder?: string; // Add folder information for organization
}

export interface UmbrelAuthResponse {
  token: string;
  expiresAt: number;
}

export interface UmbrelFileListResponse {
  files: UmbrelFile[];
  currentPath: string;
  breadcrumbs: Array<{ name: string; path: string }>;
}

class UmbrelService {
  private baseUrl: string = '';
  private username: string = '';
  private jwt: string = '';
  private jwtExpiresAt: number = 0;
  private rememberDevice: boolean = false;
  private isConnected: boolean = false;

  constructor() {
    this.loadStoredCredentials();
  }

  /**
   * Connect to Umbrel with credentials
   */
  async connect(credentials: UmbrelCredentials): Promise<{ success: boolean; error?: string }> {
    try {
      this.baseUrl = credentials.baseUrl.replace(/\/$/, ''); // Remove trailing slash
      this.username = credentials.username;
      this.rememberDevice = credentials.rememberDevice;

      // Authenticate with Umbrel File Browser
      const authResponse = await this.authenticate(credentials.password);
      
      if (authResponse.success) {
        this.jwt = authResponse.token!;
        this.jwtExpiresAt = authResponse.expiresAt!;
        this.isConnected = true;

        // Store credentials if remember device is enabled
        if (this.rememberDevice) {
          await this.storeCredentials(credentials);
        }

        return { success: true };
      } else {
        return { success: false, error: authResponse.error };
      }
    } catch (error) {
      console.error('Umbrel connection error:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Connection failed' 
      };
    }
  }

  /**
   * Get the proxy server URL based on current location
   */
  private getProxyUrl(): string {
    // If accessing from localhost, use localhost
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://localhost:3002';
    }
    // Otherwise, use the same host as the web app
    return `http://${window.location.hostname}:3002`;
  }

  /**
   * Authenticate with Umbrel using SSH proxy
   */
  private async authenticate(password: string): Promise<{ success: boolean; token?: string; expiresAt?: number; error?: string }> {
    try {
      const proxyUrl = this.getProxyUrl();
      
      // First, set credentials in the SSH proxy
      const credentialsResponse = await fetch(`${proxyUrl}/api/umbrel/credentials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          host: this.baseUrl.replace('http://', '').replace('https://', ''),
          username: this.username,
          password: password
        })
      });

      if (!credentialsResponse.ok) {
        let errorMessage = `Failed to set credentials: ${credentialsResponse.status} ${credentialsResponse.statusText}`;
        try {
          const contentType = credentialsResponse.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const errorData = await credentialsResponse.json();
            errorMessage = errorData.error || errorData.message || errorMessage;
          } else {
            const errorText = await credentialsResponse.text();
            errorMessage = `Failed to set credentials: ${errorMessage}. Server returned: ${errorText.substring(0, 100)}`;
          }
        } catch (parseError) {
          // If JSON parsing fails, use the default error message
        }
        return { success: false, error: errorMessage };
      }

      // Then test the connection
      const response = await fetch(`${proxyUrl}/api/umbrel/status`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        let errorMessage = `SSH proxy connection failed: ${response.status} ${response.statusText}`;
        try {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const errorData = await response.json();
            errorMessage = errorData.error || errorData.message || errorMessage;
          } else {
            const errorText = await response.text();
            errorMessage = `SSH proxy connection failed: ${errorMessage}. Server returned: ${errorText.substring(0, 100)}`;
          }
        } catch (parseError) {
          // If JSON parsing fails, use the default error message
        }
        return { success: false, error: errorMessage };
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        return { success: false, error: 'Server returned non-JSON response. Ensure the Umbrel proxy server is running.' };
      }

      const data = await response.json();
      
      if (data.status !== 'connected') {
        return { success: false, error: 'SSH proxy cannot connect to Umbrel. Please check if Umbrel is running and accessible.' };
      }

      // For SSH proxy, we don't need a JWT token - just return success
      // The proxy handles authentication via SSH
      return { 
        success: true, 
        token: 'ssh-proxy-token', // Placeholder token for compatibility
        expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
      };
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        const proxyUrl = this.getProxyUrl();
        return { 
          success: false, 
          error: `Cannot connect to SSH proxy server. Please ensure the proxy is running on ${proxyUrl}.` 
        };
      }
      throw error;
    }
  }

  /**
   * Check if we have a valid JWT
   */
  private isJwtValid(): boolean {
    return !!this.jwt && this.jwtExpiresAt > Date.now();
  }

  /**
   * Get authentication headers
   */
  private getAuthHeaders(): HeadersInit {
    if (!this.isJwtValid()) {
      throw new Error('No valid authentication token');
    }
    return {
      'Authorization': `Bearer ${this.jwt}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * List files from all Template Docs folders using SSH proxy
   */
  async listFiles(path: string = '/Home/Documents'): Promise<UmbrelFileListResponse> {
    try {
      const proxyUrl = this.getProxyUrl();
      
      // Use SSH proxy to list files from all Template Docs folders
      const response = await fetch(`${proxyUrl}/api/umbrel/files`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          command: 'list',
          path: '~/umbrel/home/Documents/Template Docs'
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to list files: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Transform the response to our format
      const files: UmbrelFile[] = data.files?.map((item: any) => ({
        name: item.name,
        path: item.path,
        size: item.size || 0,
        modified: item.modified || new Date().toISOString(),
        type: item.type || 'file',
        isDirectory: item.type === 'directory',
        folder: item.folder || 'Unknown' // Add folder information
      })) || [];

      // Generate breadcrumbs
      const breadcrumbs = this.generateBreadcrumbs(path);

      return {
        files,
        currentPath: path,
        breadcrumbs
      };
    } catch (error) {
      console.error('Error listing Umbrel files:', error);
      throw error;
    }
  }

  /**
   * Download a file from Umbrel using SSH proxy
   */
  async downloadFile(filePath: string): Promise<Blob> {
    try {
      const proxyUrl = this.getProxyUrl();
      
      // Use SSH proxy to download files
      const response = await fetch(`${proxyUrl}/api/umbrel/download`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          command: 'download',
          path: filePath
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
      }

      return await response.blob();
    } catch (error) {
      console.error('Error downloading Umbrel file:', error);
      throw error;
    }
  }

  /**
   * Generate breadcrumbs for a path
   */
  private generateBreadcrumbs(path: string): Array<{ name: string; path: string }> {
    const parts = path.split('/').filter(part => part.length > 0);
    const breadcrumbs = [{ name: 'Home', path: '/Home' }];
    
    let currentPath = '/Home';
    for (const part of parts) {
      if (part !== 'Home') {
        currentPath += `/${part}`;
        breadcrumbs.push({ name: part, path: currentPath });
      }
    }
    
    return breadcrumbs;
  }

  /**
   * Check if we should attempt auto-reconnection
   */
  shouldAutoReconnect(): boolean {
    return Boolean(this.rememberDevice) && Boolean(this.baseUrl) && Boolean(this.username);
  }

  /**
   * Attempt to auto-reconnect using stored credentials
   * This will only work if the SSH proxy is already connected
   */
  async attemptAutoReconnect(): Promise<{ success: boolean; error?: string }> {
    if (!this.shouldAutoReconnect()) {
      return { success: false, error: 'Auto-reconnect not available' };
    }

    try {
      const proxyUrl = this.getProxyUrl();
      
      // Test if SSH proxy is already connected
      const response = await fetch(`${proxyUrl}/api/umbrel/status`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        return { success: false, error: 'SSH proxy not connected' };
      }

      const data = await response.json();
      
      if (data.status !== 'connected') {
        return { success: false, error: 'SSH proxy cannot connect to Umbrel' };
      }

      // If we get here, the connection is working
      this.isConnected = true;
      this.jwt = 'ssh-proxy-token'; // Placeholder token for compatibility
      this.jwtExpiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours

      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Auto-reconnect failed' 
      };
    }
  }

  /**
   * Store credentials securely
   */
  private async storeCredentials(credentials: UmbrelCredentials): Promise<void> {
    try {
      const data = {
        baseUrl: credentials.baseUrl,
        username: credentials.username,
        rememberDevice: credentials.rememberDevice,
        // Note: We don't store the password for security
        // Instead, we'll prompt for it when needed
      };

      localStorage.setItem('umbrel_credentials', JSON.stringify(data));
    } catch (error) {
      console.error('Failed to store Umbrel credentials:', error);
    }
  }

  /**
   * Load stored credentials
   */
  private loadStoredCredentials(): void {
    try {
      const stored = localStorage.getItem('umbrel_credentials');
      if (stored) {
        const data = JSON.parse(stored);
        this.baseUrl = data.baseUrl || '';
        this.username = data.username || '';
        this.rememberDevice = data.rememberDevice || false;
      }
    } catch (error) {
      console.error('Failed to load stored Umbrel credentials:', error);
    }
  }

  /**
   * Get stored credentials
   */
  private async getStoredCredentials(): Promise<{ baseUrl: string; username: string; rememberDevice: boolean } | null> {
    try {
      const stored = localStorage.getItem('umbrel_credentials');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to get stored Umbrel credentials:', error);
    }
    return null;
  }

  /**
   * Clear stored credentials
   */
  async clearStoredCredentials(): Promise<void> {
    try {
      localStorage.removeItem('umbrel_credentials');
      this.baseUrl = '';
      this.username = '';
      this.rememberDevice = false;
      this.jwt = '';
      this.jwtExpiresAt = 0;
      this.isConnected = false;
    } catch (error) {
      console.error('Failed to clear Umbrel credentials:', error);
    }
  }

  /**
   * Disconnect from Umbrel
   */
  async disconnect(): Promise<void> {
    this.jwt = '';
    this.jwtExpiresAt = 0;
    this.isConnected = false;
    
    if (!this.rememberDevice) {
      await this.clearStoredCredentials();
    }
  }

  /**
   * Get connection status
   */
  getConnectionStatus(): { connected: boolean; baseUrl: string; username: string; rememberDevice: boolean } {
    return {
      connected: this.isConnected && this.isJwtValid(),
      baseUrl: this.baseUrl,
      username: this.username,
      rememberDevice: this.rememberDevice
    };
  }

  /**
   * Search files by name
   */
  async searchFiles(query: string, path: string = '/Home/Documents'): Promise<UmbrelFile[]> {
    try {
      const response = await this.listFiles(path);
      const searchQuery = query.toLowerCase();
      
      return response.files.filter(file => 
        file.name.toLowerCase().includes(searchQuery)
      );
    } catch (error) {
      console.error('Error searching Umbrel files:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const umbrelService = new UmbrelService();
