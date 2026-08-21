import fs from 'node:fs'
import path from 'node:path'

/**
 * Where things are.
 *
 * Paths are named rather than written: a generator asks for the
 * `moduleRegistry` slot and this decides which file that is, so the tooling
 * still works in a project that moved a directory. The defaults describe an
 * untouched Vuestrata; `vuestrata.config.json` overrides any subset.
 */

/** Slot → path in an untouched template. Every path is repo-root-relative. */
export const DEFAULT_SLOTS = {
  // ── Module system ────────────────────────────────────────────────────────
  modulesDir: 'src/modules',
  moduleRegistry: 'src/modules/setup.ts',
  navGroups: 'src/modules/nav-groups.ts',
  moduleTypes: 'src/modules/types.ts',

  // ── App shell ────────────────────────────────────────────────────────────
  appDir: 'src/modules/app',
  appTypes: 'src/modules/app/types/index.ts',
  appLocales: 'src/modules/app/locales',

  // ── Styling ──────────────────────────────────────────────────────────────
  styleEntry: 'src/modules/app/styles/app.css',
  semanticTokens: 'src/modules/app/styles/semantic.css',
  brandTokens: 'src/modules/app/styles/brand.css',
  themeStyles: 'src/modules/app/styles/themes',
  themeRegistry: 'src/modules/app/config/theme.config.ts',
  iconsPlugin: 'src/modules/app/styles/icons-plugin.mjs',

  // ── Component surface ────────────────────────────────────────────────────
  uiComponents: 'src/modules/app/components/ui',
  uiBarrel: 'src/modules/app/components/ui/index.ts',
  formComposables: 'src/modules/app/composables/forms',
  formComposablesBarrel: 'src/modules/app/composables/forms/index.ts',

  // ── Icons ────────────────────────────────────────────────────────────────
  iconMaps: 'src/modules/app/icons/maps',
  iconBarrel: 'src/modules/app/icons/index.ts',
  iconProvider: 'src/modules/app/config/icon-provider.ts',

  // ── Core ─────────────────────────────────────────────────────────────────
  permissions: 'src/modules/core/lib/rbac/types.ts',
  rbacInheritance: 'src/modules/core/lib/rbac/inheritance.ts',
  envSchema: 'src/modules/core/lib/config/env.schema.ts',

  // ── Project root ─────────────────────────────────────────────────────────
  envExample: '.env.example',
  e2eAccessibility: 'e2e/accessibility.spec.ts',
}

export const DEFAULT_CONVENTIONS = {
  /** Locale codes every module must provide. Order is not significant. */
  locales: ['en', 'fr', 'ar'],
  /** Import alias for the app module. */
  appAlias: '~',
  /** Second alias for the same directory. */
  appAliasAlt: '@',
}

export const MANIFEST_FILENAME = 'vuestrata.config.json'

/**
 * @typedef {object} Manifest
 * @property {string} root Absolute path to the project root.
 * @property {boolean} present Whether the project declares its own manifest.
 * @property {Record<string, string>} slots Slot name → repo-root-relative path.
 * @property {{ locales: string[], appAlias: string, appAliasAlt: string }} conventions
 */

/**
 * Read `vuestrata.config.json`, falling back to the defaults for anything it
 * does not mention. A missing file is not an error: an untouched template needs
 * no manifest, and requiring one would make the first run fail for no reason.
 */
export function loadManifest(root) {
  const file = path.join(root, MANIFEST_FILENAME)
  let user = {}

  if (fs.existsSync(file)) {
    try {
      user = JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch (error) {
      throw new Error(`${MANIFEST_FILENAME} is not valid JSON: ${error.message}`)
    }
  }

  const unknown = Object.keys(user.slots ?? {}).filter((slot) => !(slot in DEFAULT_SLOTS))
  if (unknown.length > 0) {
    throw new Error(
      `${MANIFEST_FILENAME} declares unknown slot(s): ${unknown.join(', ')}. ` +
        `Known slots: ${Object.keys(DEFAULT_SLOTS).join(', ')}`,
    )
  }

  return {
    root,
    present: fs.existsSync(file),
    slots: { ...DEFAULT_SLOTS, ...user.slots },
    conventions: { ...DEFAULT_CONVENTIONS, ...user.conventions },
  }
}

/** Resolve a slot to a repo-root-relative path. */
export function slot(manifest, name) {
  const value = manifest.slots[name]
  if (value === undefined) {
    // A bug in a caller, not a misconfiguration.
    throw new Error(`unknown slot "${name}". Add it to DEFAULT_SLOTS in lib/manifest.mjs.`)
  }
  return value
}

/** Resolve a slot to an absolute path. */
export function slotPath(manifest, name) {
  return path.join(manifest.root, slot(manifest, name))
}

/** Join a path onto a directory slot, keeping forward slashes. */
export function inSlot(manifest, name, ...segments) {
  return [slot(manifest, name), ...segments].join('/')
}

/** Slots whose target is missing on disk. */
export function missingSlots(manifest, names = Object.keys(manifest.slots)) {
  return names
    .filter((name) => !fs.existsSync(slotPath(manifest, name)))
    .map((name) => ({ slot: name, path: slot(manifest, name) }))
}

/** Names the override to set, because "file not found" is not actionable. */
export function describeMissingSlot({ slot: name, path: rel }) {
  return (
    `slot "${name}" points at ${rel}, which does not exist. ` +
    `If you moved it, set slots.${name} in ${MANIFEST_FILENAME}.`
  )
}
