import { getIconCollections, iconsPlugin } from '@egoist/tailwindcss-icons'

/**
 * Icon collections exposed as `i-<prefix>-<name>` utilities.
 *
 * Why this file exists: `@plugin '@egoist/tailwindcss-icons'` with no options
 * only auto-discovers packs whose name appears in the plugin's own hardcoded
 * `collectionNames` allowlist. `griddy-icons` is not on that list, so it was
 * silently skipped and every `i-griddy-icons-*` class resolved to nothing.
 * Naming the packs explicitly bypasses the allowlist and makes an uninstalled
 * pack a loud build error instead of silently missing icons.
 *
 * Keep in sync with the `@iconify-json/*` devDependencies in package.json.
 */
const collections = [
  'griddy-icons',
  'iconamoon',
  'iconoir',
  'logos',
  'lucide',
  'mingcute',
  'ph',
  'ri',
  'simple-icons',
  'solar',
  'tabler',
]

export default iconsPlugin({ collections: getIconCollections(collections) })
