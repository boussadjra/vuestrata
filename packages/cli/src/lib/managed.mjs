import fs from 'node:fs'
import path from 'node:path'

import { DEFAULT_SLOTS } from './manifest.mjs'
import { ANCHORED_REGISTRIES } from './registry.mjs'

/**
 * What Vuestrata owns, defined once — `init` baselines these and
 * `build-payload.mjs` ships them, so the two lists must agree.
 *
 * Narrow on purpose: a path belongs here only when Vuestrata keeps improving it
 * *and* a project has an alternative to editing it. Hence the component layer,
 * the framework-agnostic core and the themes, but not `pages/`.
 *
 * Each list is the whole of its class. Promoting a file to managed, or shipping
 * a new seam, is one line here; the payload, `init`, `upgrade` and `doctor` all
 * read these lists rather than keeping their own.
 */

/** Directories whose every file is managed. */
export const MANAGED_DIRS = [
  'src/modules/app/components/ui',
  'src/modules/app/composables/forms',
  'src/modules/app/styles/themes',
  'src/modules/core/lib',
  // `boot()` and the steps it runs. `src/main.ts` and `src/App.vue` are thin
  // shells the project owns; everything they used to do is here.
  'src/modules/app/bootstrap',
  // The auth adapters and their helpers: what a token or a cookie session
  // means is not something a project should have to carry a fix for.
  'src/modules/auth/adapters',
  'src/modules/auth/lib',
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
  'src/modules/app/components/layout/AppRoot.vue',
  'src/modules/app/components/layout/AppErrorBoundary.vue',

  // Promoted from the project's files in 1.1.0 (same paths; `migrations/1.1.0/
  // promotions.mjs` adopts an unedited copy). Each one is plumbing that every
  // correctness fix in this release lands in, and each has a seam a project can
  // use instead of editing it.
  'src/modules/app/stores/auth.ts',
  'src/modules/app/stores/api-runtime.ts',
  'src/modules/app/state/runtime-backends.ts',
  'src/modules/app/state/build-info.ts',
  'src/modules/app/plugins/route-guard.ts',
  'src/modules/app/plugins/session-restore.ts',
  // Re-exports the query options from the bootstrap, which is where they live.
  'src/modules/app/plugins/vue-query.ts',
  'src/modules/app/composables/useRbac.ts',
  // Binds core/lib's describeError() to vue-i18n; nothing in it is a project's to change.
  'src/modules/app/composables/useErrorMessage.ts',
  'src/modules/auth/composables/useAuth.ts',
  // Generated modules import these three.
  'src/modules/app/mocks/collection.ts',
  'src/modules/app/mocks/utils.ts',
  'src/modules/app/mocks/seed.ts',
  // Managed code reads these types, and a type a managed file reads must itself
  // be managed, or a new prop would fail type-checking in every project.
  'src/modules/app/types/forms.ts',
  'src/modules/app/types/button-group.ts',
  // <locale>.overrides.json is the seam; the catalogs are Vuestrata's.
  'src/modules/app/locales/en.json',
  'src/modules/app/locales/fr.json',
  'src/modules/app/locales/ar.json',
  // Deployment tooling.
  'scripts/security/headers.mjs',
  'scripts/security/sync-headers.mjs',
  'scripts/build/verify-bundle.mjs',
  'scripts/build/write-version.mjs',
  'scripts/vite/vuestrata-plugin.mjs',
  'scripts/vite/vuestrata-plugin.d.mts',
]

/**
 * Vuestrata's files except for their `app:` regions — the registries that sit
 * inside a managed directory. A generator appends to the `app:` region, so a
 * whole-file hash would call the first `vuestrata add` an edit and stop the
 * file updating. These are hashed with those region bodies removed, and an
 * upgrade carries the project's entries into the new version.
 *
 * Every file listed must carry at least one `app:` region; `build-payload.mjs`
 * refuses to ship one that does not.
 */
export const MERGED_FILES = [
  'src/modules/app/components/ui/index.ts',
  'src/modules/app/composables/forms/index.ts',
  'src/modules/core/lib/rbac/types.ts',
]

/** The seams: written once, then the project's, so the files above stay pristine. */
export const SEEDED_FILES = [
  'src/modules/app/styles/brand.css',
  'src/modules/app/config/app.overrides.ts',
  'src/modules/app/config/rbac.overrides.ts',
  'src/modules/app/config/api.overrides.ts',
  'src/modules/app/components/Logo.vue',
  'src/modules/app/locales/en.overrides.json',
  'src/modules/app/locales/fr.overrides.json',
  'src/modules/app/locales/ar.overrides.json',
]

/**
 * Registries the project owns outright, except for their `vuestrata:` region,
 * which an upgrade appends to and never rewrites. Every anchored registry that
 * is not a merged file: a merged file's upstream region travels with the rest
 * of the file. A seeded file's registries carry no `vuestrata:` region
 * (`upstream: false`), so there is nothing to append to.
 */
export const PROJECT_REGISTRIES = ANCHORED_REGISTRIES.filter(
  (registry) => registry.upstream !== false && !MERGED_FILES.includes(DEFAULT_SLOTS[registry.slot]),
)

/** Never shipped or tracked, whatever directory it sits in. */
export const EXCLUDE = [/\.test\.ts$/, /__tests__/, /\.snap$/]

/**
 * The class Vuestrata gives a path, or `null` for a path it does not ship.
 *
 * Merged is checked before managed because every merged file sits inside a
 * managed directory. This describes the template, not a project: a file a
 * generator wrote into `components/ui/` is `managed` here and `seeded` in that
 * project's lock, and the lock wins.
 *
 * @returns {'managed' | 'seeded' | 'merged' | null}
 */
export function classify(rel) {
  const normalized = rel.replaceAll('\\', '/')

  if (EXCLUDE.some((pattern) => pattern.test(normalized))) return null
  if (MERGED_FILES.includes(normalized)) return 'merged'
  if (SEEDED_FILES.includes(normalized)) return 'seeded'
  if (MANAGED_FILES.includes(normalized)) return 'managed'
  if (MANAGED_DIRS.some((dir) => normalized.startsWith(`${dir}/`))) return 'managed'
  return null
}

/** Every managed or merged path that exists under `root`, sorted. */
export function collectManaged(root) {
  const found = []

  for (const dir of MANAGED_DIRS) found.push(...walk(root, dir))
  for (const rel of [...MANAGED_FILES, ...MERGED_FILES]) {
    if (fs.existsSync(path.join(root, rel))) found.push(rel)
  }

  return [...new Set(found)]
    .filter((rel) => !EXCLUDE.some((pattern) => pattern.test(rel)))
    .sort((a, b) => a.localeCompare(b))
}

/** Every seeded path that exists under `root`, sorted. */
export function collectSeeded(root) {
  return SEEDED_FILES.filter((rel) => fs.existsSync(path.join(root, rel))).sort((a, b) =>
    a.localeCompare(b),
  )
}

/**
 * The template's documentation. Not managed: no upgrade installs or compares a
 * page. But the lockfile and the payload list the pages a release ships, so
 * `eject` can tell them from the ones a project wrote beside them.
 */
export const DOCS_DIR = 'docs'

/** Every file under `docs/` in `root`, sorted. */
export function collectDocs(root) {
  return walk(root, DOCS_DIR).sort((a, b) => a.localeCompare(b))
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
