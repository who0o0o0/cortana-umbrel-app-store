export class UserMenu {
  private container: HTMLElement;
  private dropdownOpen: boolean = false;
  private onLogout: () => void;
  private onHelp: () => void;

  constructor(
    container: HTMLElement,
    onLogout: () => void,
    onHelp: () => void
  ) {
    this.container = container;
    this.onLogout = onLogout;
    this.onHelp = onHelp;
    this.render();
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="user-menu-container" style="position: relative;">
        <button 
          id="user-menu-button" 
          class="user-menu-button"
          style="
            background: var(--accent-blue);
            border: 1px solid var(--accent-blue);
            border-radius: 8px;
            padding: 0.5rem 0.75rem;
            color: white;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            font-size: 0.875rem;
            font-weight: 500;
            transition: all 0.2s ease;
            box-shadow: 0 2px 8px rgba(0, 122, 255, 0.3);
          "
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 1v6m0 6v6M5.64 5.64l4.24 4.24m4.24 4.24l4.24 4.24M1 12h6m6 0h6M5.64 18.36l4.24-4.24m4.24-4.24l4.24-4.24"/>
          </svg>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="transition: transform 0.2s ease; ${this.dropdownOpen ? 'transform: rotate(180deg);' : ''}">
            <polyline points="6,9 12,15 18,9"/>
          </svg>
        </button>
        
        <div 
          id="user-menu-dropdown" 
          class="user-menu-dropdown"
          style="
            display: ${this.dropdownOpen ? 'block' : 'none'};
            position: absolute;
            top: calc(100% + 0.5rem);
            left: 0;
            background: white;
            border: 1px solid var(--border-color);
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            min-width: 180px;
            z-index: 1000;
            overflow: hidden;
          "
        >
          <button 
            id="user-menu-help" 
            class="user-menu-item"
            style="
              width: 100%;
              padding: 0.75rem 1rem;
              background: none;
              border: none;
              text-align: left;
              cursor: pointer;
              color: var(--text-primary);
              font-size: 0.875rem;
              display: flex;
              align-items: center;
              gap: 0.75rem;
              transition: background 0.2s ease;
            "
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span>Help</span>
          </button>
          
          <button 
            id="user-menu-logout" 
            class="user-menu-item"
            style="
              width: 100%;
              padding: 0.75rem 1rem;
              background: none;
              border: none;
              text-align: left;
              cursor: pointer;
              color: var(--error);
              font-size: 0.875rem;
              display: flex;
              align-items: center;
              gap: 0.75rem;
              transition: background 0.2s ease;
              border-top: 1px solid var(--border-color);
            "
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16,17 21,12 16,7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            <span>Log Out</span>
          </button>
        </div>
      </div>
    `;

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    const button = this.container.querySelector('#user-menu-button') as HTMLButtonElement;
    const helpBtn = this.container.querySelector('#user-menu-help') as HTMLButtonElement;
    const logoutBtn = this.container.querySelector('#user-menu-logout') as HTMLButtonElement;
    const dropdown = this.container.querySelector('#user-menu-dropdown') as HTMLElement;

    // Toggle dropdown
    button?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDropdown();
    });

    // Add hover effects to button
    button?.addEventListener('mouseenter', () => {
      button.style.background = '#0051d5';
      button.style.boxShadow = '0 4px 12px rgba(0, 122, 255, 0.4)';
    });
    button?.addEventListener('mouseleave', () => {
      button.style.background = 'var(--accent-blue)';
      button.style.boxShadow = '0 2px 8px rgba(0, 122, 255, 0.3)';
    });

    // Help button
    helpBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeDropdown();
      this.onHelp();
    });

    // Logout button
    logoutBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeDropdown();
      this.onLogout();
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!this.container.contains(e.target as Node)) {
        this.closeDropdown();
      }
    });

    // Add hover effects
    const items = this.container.querySelectorAll('.user-menu-item');
    items.forEach((item) => {
      item.addEventListener('mouseenter', () => {
        (item as HTMLElement).style.background = 'var(--apple-gray)';
      });
      item.addEventListener('mouseleave', () => {
        (item as HTMLElement).style.background = 'none';
      });
    });
  }

  private toggleDropdown(): void {
    this.dropdownOpen = !this.dropdownOpen;
    const dropdown = this.container.querySelector('#user-menu-dropdown') as HTMLElement;
    const button = this.container.querySelector('#user-menu-button') as HTMLButtonElement;
    const arrow = button?.querySelector('svg:last-child') as HTMLElement;
    
    if (dropdown) {
      dropdown.style.display = this.dropdownOpen ? 'block' : 'none';
    }
    if (arrow) {
      arrow.style.transform = this.dropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)';
    }
  }

  private closeDropdown(): void {
    this.dropdownOpen = false;
    const dropdown = this.container.querySelector('#user-menu-dropdown') as HTMLElement;
    const button = this.container.querySelector('#user-menu-button') as HTMLButtonElement;
    const arrow = button?.querySelector('svg:last-child') as HTMLElement;
    
    if (dropdown) {
      dropdown.style.display = 'none';
    }
    if (arrow) {
      arrow.style.transform = 'rotate(0deg)';
    }
  }
}

