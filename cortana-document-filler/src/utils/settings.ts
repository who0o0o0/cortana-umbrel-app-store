/**
 * Settings management for Cortana
 */
export interface CortanaSettings {
  embedAnchorTokens: boolean;
}

const DEFAULT_SETTINGS: CortanaSettings = {
  embedAnchorTokens: true
};

const SETTINGS_KEY = 'cortana-settings';

/**
 * Get current settings
 */
export function getSettings(): CortanaSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (error) {
    console.warn('Error loading settings:', error);
  }
  
  return { ...DEFAULT_SETTINGS };
}

/**
 * Update settings
 */
export function updateSettings(updates: Partial<CortanaSettings>): void {
  try {
    const current = getSettings();
    const updated = { ...current, ...updates };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    console.log('Settings updated:', updated);
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

/**
 * Reset settings to defaults
 */
export function resetSettings(): void {
  try {
    localStorage.removeItem(SETTINGS_KEY);
    console.log('Settings reset to defaults');
  } catch (error) {
    console.error('Error resetting settings:', error);
  }
}
