import { PlaceholderField } from '../types.js';

export class PlaceholderList {
  private container: HTMLElement;
  private placeholders: PlaceholderField[];

  constructor(container: HTMLElement, placeholders: PlaceholderField[]) {
    this.container = container;
    this.placeholders = placeholders;
    this.render();
  }

  private render(): void {
    const requiredCount = this.placeholders.filter(p => !p.isOptional).length;
    const optionalCount = this.placeholders.filter(p => p.isOptional).length;

    this.container.innerHTML = `
      <div class="placeholder-list">
        <div class="placeholder-header">
          <h3>Detected Placeholders</h3>
          <div class="placeholder-stats">
            <span class="stat-item">
              <strong>${this.placeholders.length}</strong> total
            </span>
            <span class="stat-item">
              <strong>${requiredCount}</strong> required
            </span>
            <span class="stat-item">
              <strong>${optionalCount}</strong> optional
            </span>
          </div>
        </div>
        <div class="placeholder-items">
          ${this.placeholders.map(placeholder => this.renderPlaceholder(placeholder)).join('')}
        </div>
      </div>
    `;
  }

  private renderPlaceholder(placeholder: PlaceholderField): string {
    const typeIcon = this.getTypeIcon(placeholder.type);
    const requiredBadge = placeholder.isOptional ? '' : '<span class="required-badge">Required</span>';
    const defaultBadge = placeholder.defaultValue ? `<span class="default-badge">Default: ${placeholder.defaultValue}</span>` : '';

    return `
      <div class="placeholder-item">
        <div class="placeholder-info">
          <div class="placeholder-name">
            <span class="type-icon">${typeIcon}</span>
            <code>{{${placeholder.originalKey}}}</code>
            ${requiredBadge}
            ${defaultBadge}
          </div>
          <div class="placeholder-details">
            <span class="placeholder-type">Type: ${placeholder.type}</span>
            ${placeholder.isOptional ? '<span class="optional-indicator">Optional</span>' : ''}
          </div>
        </div>
      </div>
    `;
  }

  private getTypeIcon(type: string): string {
    switch (type) {
      case 'number':
        return '🔢';
      case 'date':
        return '📅';
      case 'multiline':
        return '📝';
      default:
        return '📄';
    }
  }

  public updatePlaceholders(placeholders: PlaceholderField[]): void {
    this.placeholders = placeholders;
    this.render();
  }
}
