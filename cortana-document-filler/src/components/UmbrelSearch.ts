import { umbrelService, UmbrelFile } from '../utils/umbrelService.js';

export class UmbrelSearch {
  private container: HTMLElement;
  private isEnabled: boolean;
  private onFileSelect: (file: UmbrelFile) => void;
  private onError: (error: string) => void;
  private currentPath: string = '/Home/Documents';
  private files: UmbrelFile[] = [];
  private breadcrumbs: Array<{ name: string; path: string }> = [];
  private isLoading: boolean = false;
  private searchQuery: string = '';
  private showResults: boolean = false;

  constructor(
    container: HTMLElement,
    isEnabled: boolean,
    onFileSelect: (file: UmbrelFile) => void,
    onError: (error: string) => void
  ) {
    this.container = container;
    this.isEnabled = isEnabled;
    this.onFileSelect = onFileSelect;
    this.onError = onError;
    this.render();
  }

  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    this.render();
  }

  private async loadFiles(path: string): Promise<void> {
    try {
      this.isLoading = true;
      this.render();
      
      // Always load from Template Docs to get all folders
      const response = await umbrelService.listFiles('/Home/Documents/Template Docs');
      this.files = response.files;
      this.breadcrumbs = response.breadcrumbs;
    } catch (error) {
      console.error('Error loading Umbrel files:', error);
      this.onError(error instanceof Error ? error.message : 'Failed to load files');
    } finally {
      this.isLoading = false;
      this.render();
    }
  }

  private async handleSearch(query: string): Promise<void> {
    this.searchQuery = query;
    
    if (!query.trim()) {
      this.showResults = false;
      this.render();
      return;
    }

    try {
      this.isLoading = true;
      this.render();
      
      // Search across all Template Docs folders instead of current path
      const searchResults = await umbrelService.searchFiles(query, '/Home/Documents/Template Docs');
      this.files = searchResults;
      this.showResults = true;
      this.render();
    } catch (error) {
      console.error('Error searching Umbrel files:', error);
      this.onError(error instanceof Error ? error.message : 'Search failed');
    } finally {
      this.isLoading = false;
      this.render();
    }
  }

  private async handleFileClick(file: UmbrelFile): Promise<void> {
    if (file.isDirectory) {
      this.currentPath = file.path;
      this.searchQuery = '';
      this.showResults = false;
      await this.loadFiles(this.currentPath);
    } else {
      try {
        // Download the file and convert to File object
        const blob = await umbrelService.downloadFile(file.path);
        const fileObj = new File([blob], file.name, { 
          type: blob.type || 'application/octet-stream',
          lastModified: new Date(file.modified).getTime()
        });
        
        // Add Umbrel metadata
        (fileObj as any).isUmbrel = true;
        (fileObj as any).umbrelPath = file.path;
        
        this.onFileSelect(file);
        this.showResults = false;
        this.searchQuery = '';
        this.render();
      } catch (error) {
        console.error('Error downloading Umbrel file:', error);
        this.onError(error instanceof Error ? error.message : 'Failed to download file');
      }
    }
  }

  private handleBreadcrumbClick(path: string): void {
    this.currentPath = path;
    this.searchQuery = '';
    this.showResults = false;
    this.loadFiles(this.currentPath);
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  private formatDate(dateString: string): string {
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return 'Unknown';
    }
  }

  private render(): void {
    if (!this.isEnabled) {
      this.container.innerHTML = '';
      return;
    }

    this.container.innerHTML = `
      <div class="relative w-full">
        <!-- Search Input -->
        <div class="relative">
          <input
            type="text"
            id="umbrel-search-input"
            value="${this.searchQuery}"
            placeholder="Search all template files..."
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          ${this.isLoading ? `
            <div class="absolute right-3 top-1/2 transform -translate-y-1/2">
              <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
            </div>
          ` : ''}
        </div>

        <!-- Breadcrumbs -->
        ${this.breadcrumbs.length > 0 ? `
          <div class="flex items-center space-x-1 mt-2 text-sm text-gray-600">
            ${this.breadcrumbs.map((crumb, index) => `
              <span>
                <button
                  data-path="${crumb.path}"
                  class="hover:text-blue-600 hover:underline"
                >
                  ${crumb.name}
                </button>
                ${index < this.breadcrumbs.length - 1 ? '<span>/</span>' : ''}
              </span>
            `).join('')}
          </div>
        ` : ''}

        <!-- Search Results -->
        ${this.showResults ? `
          <div class="absolute top-full left-0 right-0 bg-white border border-gray-300 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
            ${this.files.length === 0 ? `
              <div class="p-4 text-gray-500 text-center">
                ${this.isLoading ? 'Loading...' : 'No files found'}
              </div>
            ` : `
              <div class="py-2">
                ${this.files.map((file, index) => `
                  <div
                    data-file-path="${file.path}"
                    data-file-name="${file.name}"
                    data-is-directory="${file.isDirectory}"
                    class="flex items-center justify-between px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                  >
                    <div class="flex items-center space-x-3">
                      <div class="text-lg">
                        ${file.isDirectory ? '📁' : '📄'}
                      </div>
                      <div>
                        <div class="font-medium text-gray-900">
                          ${file.name}
                        </div>
                        <div class="text-sm text-gray-500">
                          ${file.isDirectory ? 'Folder' : `${this.formatFileSize(file.size)} • ${this.formatDate(file.modified)}`}
                          ${file.folder ? ` • ${file.folder}` : ''}
                        </div>
                      </div>
                    </div>
                    ${!file.isDirectory ? `
                      <div class="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                        Import
                      </div>
                    ` : ''}
                  </div>
                `).join('')}
              </div>
            `}
          </div>
        ` : ''}
      </div>
    `;

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    const searchInput = this.container.querySelector('#umbrel-search-input') as HTMLInputElement;
    const breadcrumbButtons = this.container.querySelectorAll('[data-path]');
    const fileItems = this.container.querySelectorAll('[data-file-path]');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.handleSearch((e.target as HTMLInputElement).value);
      });

      searchInput.addEventListener('focus', () => {
        this.showResults = true;
        this.render();
      });
    }

    breadcrumbButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        const path = (e.target as HTMLElement).getAttribute('data-path');
        if (path) {
          this.handleBreadcrumbClick(path);
        }
      });
    });

    fileItems.forEach(item => {
      item.addEventListener('click', (e) => {
        const path = (e.currentTarget as HTMLElement).getAttribute('data-file-path');
        const name = (e.currentTarget as HTMLElement).getAttribute('data-file-name');
        const isDirectory = (e.currentTarget as HTMLElement).getAttribute('data-is-directory') === 'true';
        
        if (path && name) {
          const file: UmbrelFile = {
            name,
            path,
            size: 0,
            modified: new Date().toISOString(),
            type: isDirectory ? 'directory' : 'file',
            isDirectory
          };
          this.handleFileClick(file);
        }
      });
    });

    // Hide results when clicking outside
    document.addEventListener('mousedown', (e) => {
      if (!this.container.contains(e.target as Node)) {
        this.showResults = false;
        this.render();
      }
    });
  }
}