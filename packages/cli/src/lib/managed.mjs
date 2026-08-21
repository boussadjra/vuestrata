import fs from 'node:fs'
import path from 'node:path'

/**
 * What Vuestrata owns, defined once — `init` baselines these and
 * `build-payload.mjs` ships them, so the two lists must agree.
 *
 * Narrow on purpose: a path belongs here only when Vuestrata keeps improving it
 * *and* a project has an alternative to editing it. Hence the component layer,
 * the framework-agnostic core and the themes, but not `pages/`.
 */

/** Directories whose every file is managed. */
export const MANAGED_DIRS = [
  'src/modules/app/components/ui',
  'src/modules/app/composables/forms',
  'src/modules/app/styles/themes',
  'src/modules/core/lib',
]

/** Managed files that do not sit under a managed directory. */
export const MANAGED_FILES = [
  'src/modules/app/styles/semantic.css',
  'src/modules/app/styles/motion.css',
  'src/modules/app/components/layout/AppFooter.vue',
  'src/modules/app/components/layout/AppHeader.vue',
  'src/modules/app/components/layout/AppSidebar.vue',
  'src/modules/app/components/layout/AppBreadcrumb.vue',
  'src/modules/app/components/layout/SkipLink.vue',
]

/** The seams: written once, then the project's, so the files above stay pristine. */
export const SEEDED_FILES = [
  'src/modules/app/styles/brand.css',
  'src/modules/app/config/app.overrides.ts',
  'src/modules/app/components/Logo.vue',
  'src/modules/app/locales/en.overrides.json',
  'src/modules/app/locales/fr.overrides.json',
  'src/modules/app/locales/ar.overrides.json',
]

/** Never shipped or tracked, whatever directory it sits in. */
export const EXCLUDE = [/\.test\.ts$/, /__tests__/, /\.snap$/]

/** Every managed path that exists under `root`, sorted. */
export function collectManaged(root) {
  const found = []

  for (const dir of MANAGED_DIRS) found.push(...walk(root, dir))
  for (const rel of MANAGED_FILES) {
    if (fs.existsSync(path.join(root, rel))) found.push(rel)
  }

  return found
    .filter((rel) => !EXCLUDE.some((pattern) => pattern.test(rel)))
    .sort((a, b) => a.localeCompare(b))
}

/** Every file under `dir`, as root-relative forward-slash paths. */
export function walk(root, dir) {
  const full = path.join(root, dir)
  if (!fs.existsSync(full)) return []

  const found = []
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) found.push(...walk(root, rel))
    else if (entry.isFile()) found.push(rel)
  }
  return found
}
