export interface UmbrelFile {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: string;
  folder?: string; // Add folder information for organization
}

export interface UmbrelApiResponse {
  files: UmbrelFile[];
  path: string;
}

export class UmbrelApi {
  private baseUrl: string;
  private apiKey?: string;

  constructor(baseUrl?: string, apiKey?: string) {
    // Automatically determine the proxy URL based on current location
    if (!baseUrl) {
      if (typeof window !== 'undefined') {
        const hostname = window.location.hostname;
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
          this.baseUrl = 'http://localhost:3002';
        } else {
          this.baseUrl = `http://${hostname}:3002`;
        }
      } else {
        this.baseUrl = 'http://localhost:3002';
      }
    } else {
      this.baseUrl = baseUrl;
    }
    this.apiKey = apiKey;
  }

  /**
   * List files in all Template Docs folders on Umbrel
   */
  async listFiles(path: string = '~/umbrel/home/Documents/Template Docs'): Promise<UmbrelFile[]> {
    try {
      // Use the proxy server to access Umbrel files from all folders
      const url = `${this.baseUrl}/api/umbrel/files`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` })
        },
        body: JSON.stringify({ 
          command: 'list',
          path: path || '~/umbrel/home/Documents/Template Docs'
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: UmbrelApiResponse = await response.json();
      return data.files || [];
    } catch (error) {
      console.error('Error fetching files from Umbrel:', error);
      throw new Error(`Failed to fetch files from Umbrel: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Download a file from Umbrel using the full path from file listing
   */
  async downloadFile(filePath: string): Promise<Blob> {
    try {
      const url = `${this.baseUrl}/api/umbrel/download`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` })
        },
        body: JSON.stringify({ 
          command: 'download',
          path: filePath // Use the full path directly from file listing
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.blob();
    } catch (error) {
      console.error('Error downloading file from Umbrel:', error);
      throw new Error(`Failed to download file from Umbrel: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get file info from Umbrel
   */
  async getFileInfo(filePath: string): Promise<UmbrelFile> {
    try {
      const url = `${this.baseUrl}/api/files/info`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` })
        },
        body: JSON.stringify({ path: filePath })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting file info from Umbrel:', error);
      throw new Error(`Failed to get file info from Umbrel: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Test connection to Umbrel
   */
  async testConnection(): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/api/umbrel/status`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` })
        }
      });

      return response.ok;
    } catch (error) {
      console.error('Error testing Umbrel connection:', error);
      return false;
    }
  }
}

// Default instance
export const umbrelApi = new UmbrelApi();


