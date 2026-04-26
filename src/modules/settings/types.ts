/** State shape for the settings module Pinia store. */
export interface SettingsState {
  /** Feature flags for toggling optional capabilities at runtime. */
  featureFlags: Record<string, boolean>
  /** Display density preference (controls table/list row height). */
  displayDensity: 'compact' | 'comfortable' | 'spacious'
  /** Default page size for paginated lists. */
  defaultPageSize: 10 | 20 | 50 | 100
}
