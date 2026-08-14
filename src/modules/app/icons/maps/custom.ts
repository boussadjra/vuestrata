import type { IconMap, IconName } from '~/types'

/**
 * Template for a custom icon map.
 *
 * To create your own icon set:
 * 1. Copy this file to a new file (e.g., `my-icons.ts`)
 * 2. Fill in all values with your icon CSS classes
 * 3. Register it via `registerIconMap('my-icons', myIconMap)` in your app setup
 *
 * Each key is a semantic icon name used across the app.
 * Each value is the CSS class that renders that icon (e.g., Iconify class or custom font icon).
 */

const ICON_NAMES: IconName[] = [
  'bolt',
  'shield-check',
  'palette',
  'lock',
  'widget',
  'chart',
  'rocket',
  'menu',
  'sun',
  'moon',
  'login',
  'logout',
  'users',
  'card',
  'document',
  'database',
  'graph',
  'settings',
  'sidebar',
  'search',
  'close',
  'close-circle',
  'check',
  'checks',
  'check-circle',
  'info-circle',
  'danger-triangle',
  'arrow-left',
  'arrow-right',
  'arrow-up',
  'arrow-down',
  'chevron-down',
  'chevron-right',
  'refresh',
  'spinner',
  'download',
  'tuning',
  'star',
  'file',
  'home',
  'user-plus',
  'shield-user',
  'code',
  'monitor',
  'letter',
  'bell',
  'minus-circle',
  'trend-up',
  'dots-menu',
  'folder',
  'dollar',
  'emoji',
  'shield-warning',
  'zoom-in',
  'document-add',
  'palette-round',
]

export function createCustomIconMap(entries: Partial<IconMap>): IconMap {
  const map = {} as Record<string, string>
  for (const name of ICON_NAMES) {
    map[name] = entries[name] ?? ''
  }
  return map as IconMap
}
