import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { isGitClean, logger } from '../lib/cli.mjs'
import { LOCKFILE_NAME, readLock, writeLock } from '../lib/lockfile.mjs'
import { collectManaged } from '../lib/managed.mjs'
import { inSlot, loadManifest, slot, slotPath } from '../lib/manifest.mjs'

/**
 * Remove the worked examples and keep the machinery.
 *
 * The demo modules, marketing home, showcase and docs site all exist to be
 * read, and every real project deletes them — usually by hand, discovering the
 * registry entries one broken build at a time.
 *
 * Every removed path is recorded in the lockfile's `ejected` list, or the next
 * release would restore all of it, and the one after that would do it again.
 */

/**
 * Shell paths that exist only to demonstrate the template. The docs site is
 * seven of them — routes, layout, components, three markdown plugins and the
 * demo registry — and removing four leaves a tree that fails to build.
 */
const DEMO_PATHS = [
  { path: 'src/modules/app/pages/components', reason: 'component showcase pages' },
  { path: 'src/modules/app/pages/docs', reason: 'in-app documentation routes' },
  { path: 'src/modules/app/pages/docs.vue', reason: 'documentation layout route' },
  { path: 'src/modules/app/pages/components.vue', reason: 'showcase layout route' },
  { path: 'src/modules/app/components/docs', reason: 'documentation components' },
  { path: 'src/modules/app/components/layout/home', reason: 'marketing home sections' },
  { path: 'src/modules/app/layouts/docs.vue', reason: 'documentation layout' },
  { path: 'src/modules/app/layouts/components.vue', reason: 'showcase layout' },
  { path: 'src/modules/app/config/comark.ts', reason: 'markdown pipeline config' },
  { path: 'src/modules/app/config/comark-mermaid.ts', reason: 'markdown mermaid plugin' },
  { path: 'src/modules/app/config/comark-json-render.ts', reason: 'markdown render plugin' },
  { path: 'src/modules/app/config/component-docs.ts', reason: 'component demo registry' },
  { path: 'test/unit/architecture/docs-registry.test.ts', reason: 'docs registry test' },
  // Records the permission union and the module list, both of which this
  // command changes on purpose. Deleted so the next run re-baselines.
  {
    path: 'test/unit/architecture/__snapshots__/public-surface.test.ts.snap',
    reason: 'public-surface baseline, to be regenerated',
  },
]

/** Removed only when `--keep-docs` is absent. */
const DOCS_PATHS = [{ path: 'docs', reason: 'markdown documentation' }]

const HOME_PAGE = 'src/modules/app/pages/index.vue'
const ROUTER_FILE = 'src/modules/app/plugins/router.ts'

/**
 * Replaced rather than removed: `/` has to resolve to something, and the file
 * as it stands imports four sections that are about to be deleted.
 */
const HOME_PLACEHOLDER = `<script setup lang="ts">
/**
 * Placeholder home route, written by \`vuestrata eject\`.
 *
 * The marketing page that was here is gone along with the rest of the demo.
 * Replace this with your own landing page, or leave the redirect if every
 * visitor should start inside the app.
 */
import { useRouter } from 'vue-router'

const router = useRouter()

router.replace('/dashboard')
</script>

<template>
  <div />
</template>
`

export function runEject({ root, flags }) {
  if (!flags['dry-run'] && !flags['allow-dirty'] && !isGitClean(root)) {
    logger.error(
      'The working tree has uncommitted changes. Eject deletes a lot at once, and `git checkout .` ' +
        'is the whole undo — commit or stash first. Pass --allow-dirty to override.',
    )
    process.exit(1)
  }

  const manifest = loadManifest(root)
  const keep = new Set(toList(flags.keep))

  const modules = readModuleOrigins(root, manifest)
  const demoModules = modules.filter((entry) => entry.origin === 'demo' && !keep.has(entry.id))

  if (modules.length === 0) {
    logger.error(
      `Could not read module origins from ${slot(manifest, 'moduleRegistry')}. ` +
        'Run `vuestrata doctor` first.',
    )
    process.exit(1)
  }

  const removals = []

  for (const entry of demoModules) {
    removals.push({ path: inSlot(manifest, 'modulesDir', entry.id), reason: `${entry.id} module` })
  }
  for (const entry of [...DEMO_PATHS, ...(flags['keep-docs'] ? [] : DOCS_PATHS)]) {
    if (fs.existsSync(path.join(root, entry.path))) removals.push(entry)
  }

  const registryEdits = demoModules.map((entry) => entry.id)
  const withdrawn = demoModules.flatMap((entry) => entry.permissions)

  for (const entry of findOrphanedTests(root, registryEdits)) removals.push(entry)

  if (flags['dry-run']) {
    logger.info('Dry run — nothing removed.\n')
    for (const entry of removals) logger.log(`  remove  ${entry.path}  (${entry.reason})`)
    for (const id of registryEdits) logger.log(`  unwire  ${id} from the module registry`)
    for (const literal of withdrawn) logger.log(`  revoke  ${literal}`)
    logger.log('')
    logger.info(`${kept(modules, keep)} module(s) would remain.`)
    logger.log('')
    return
  }

  // ── Remove ───────────────────────────────────────────────────────────────
  const removed = []
  for (const entry of removals) {
    const full = path.join(root, entry.path)
    if (!fs.existsSync(full)) continue
    removed.push(...filesUnder(root, entry.path))
    fs.rmSync(full, { recursive: true, force: true })
  }

  // ── Unwire ───────────────────────────────────────────────────────────────
  unwireRegistry(root, manifest, registryEdits)
  unwirePermissions(root, manifest, withdrawn)
  unwireRouter(root, manifest)

  fs.writeFileSync(path.join(root, HOME_PAGE), HOME_PLACEHOLDER)

  // ── Record, so an upgrade never puts any of it back ──────────────────────
  const lock = readLock(root)
  const managedNow = new Set(collectManaged(root))

  for (const rel of removed) {
    if (!lock.ejected.includes(rel)) lock.ejected.push(rel)
    delete lock.files[rel]
  }

  // Recomputed rather than trusted, so a path that was already gone still ends
  // up recorded.
  for (const rel of Object.keys(lock.files)) {
    if (lock.files[rel].class !== 'managed') continue
    if (managedNow.has(rel)) continue
    if (fs.existsSync(path.join(root, rel))) continue
    if (!lock.ejected.includes(rel)) lock.ejected.push(rel)
    delete lock.files[rel]
  }

  writeLock(root, lock)

  logger.success(
    `Ejected ${demoModules.length} module(s) and ${removals.length - demoModules.length} shell path(s).`,
  )
  logger.log('')
  for (const entry of removals) logger.log(`  removed  ${entry.path}`)
  logger.log('')
  logger.info(
    `${removed.length} path(s) recorded in ${LOCKFILE_NAME} so an upgrade will not restore them.`,
  )
  logger.log(`  wrote    ${HOME_PAGE}  (placeholder redirect to /dashboard)`)
  logger.log('')

  // A dangling import fails the build with an error nobody would connect back
  // to this command, so the scan runs here, where the removals are on screen.
  const dangling = findDanglingReferences(root, removals)

  if (dangling.length > 0) {
    logger.warn(`${dangling.length} file(s) still reference something that was removed:`)
    for (const entry of dangling) logger.log(`  check   ${entry.file}  →  ${entry.target}`)
    logger.log('')
    logger.warn('Fix those before building; nothing here can guess what should replace them.')
  } else {
    logger.success('Nothing left referencing what was removed.')
  }

  logger.log('')
  logger.info('Verify with:  vp check && vpr build && vpr test --run')
  logger.info(
    'The first test run rewrites the public-surface snapshot to describe your app rather ' +
      'than the demo. Commit it — from then on it guards your surface the way it guarded ours.',
  )
  logger.log('')
}

/**
 * Read `{ id, origin, permissions }` from each module barrel. Parsed rather than
 * imported: this runs in Node against TypeScript, aliases and SFCs it cannot
 * resolve, for the sake of three string literals.
 */
function readModuleOrigins(root, manifest) {
  const modulesDir = slotPath(manifest, 'modulesDir')
  if (!fs.existsSync(modulesDir)) return []

  const found = []
  for (const entry of fs.readdirSync(modulesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue

    const barrel = path.join(modulesDir, entry.name, 'index.ts')
    if (!fs.existsSync(barrel)) continue

    const source = fs.readFileSync(barrel, 'utf8')
    const origin = /^\s*origin:\s*'(demo|template|app)'/m.exec(source)?.[1]

    // Read while the module still exists — after the directory is gone there is
    // no way to know which permissions were its to withdraw.
    const declared = /^\s*permissions:\s*\[([^\]]*)\]/m.exec(source)?.[1] ?? ''
    const permissions = [...declared.matchAll(/'([^']+)'/g)].map(([, literal]) => literal)

    found.push({ id: entry.name, origin: origin ?? 'app', permissions })
  }
  return found
}

/**
 * Tests importing a module being removed. They can only fail, and a red suite
 * nobody wrote is a poor first impression of a fresh project.
 */
function findOrphanedTests(root, ids) {
  if (ids.length === 0) return []

  const orphaned = []

  for (const dir of ['test', 'e2e', 'src']) {
    for (const file of filesUnder(root, dir)) {
      if (!/\.(test|spec)\.(ts|mts)$/.test(file)) continue

      const source = fs.readFileSync(path.join(root, file), 'utf8')

      for (const [, specifier] of source.matchAll(IMPORT_SPECIFIER)) {
        const module = /(?:^|\/)modules\/([a-z][a-z0-9-]*)\//.exec(specifier)?.[1]
        if (!module || !ids.includes(module)) continue
        orphaned.push({ path: file, reason: `test for the ${module} module` })
        break
      }
    }
  }

  return orphaned
}

/**
 * Take the documentation site out of the router: the legacy-redirect import,
 * the two redirect routes built from it, and two `layoutMap` entries. They fail
 * differently — a missing import breaks the build, an unresolvable layout only
 * warns and renders the page with no shell — so all three go together.
 */
function unwireRouter(root, manifest) {
  const file = path.join(root, ROUTER_FILE)
  if (!fs.existsSync(file)) return
  void manifest

  let source = fs.readFileSync(file, 'utf8')

  source = source
    .replace(
      /import \{\s*LEGACY_COMPONENT_DOC_ROUTE_ENTRIES,\s*resolveLegacyComponentsDocsPath,\s*\} from '@\/config\/component-docs'\n/,
      '',
    )
    .replace(
      /\s*\.\.\.LEGACY_COMPONENT_DOC_ROUTE_ENTRIES\.map\(\(\{ path, target \}\) => \(\{ path, redirect: target \}\)\),/,
      '',
    )
    .replace(
      /\s*\{\s*path: '\/components\/:slug\(\.\*\)\*',\s*redirect: \(to\) => resolveLegacyComponentsDocsPath\(to\.path\) \?\? '\/docs\/components\/overview',\s*\},/,
      '',
    )
    .replace(/\s*components: \(\) => import\('@\/layouts\/components\.vue'\),/, '')
    .replace(/\s*docs: \(\) => import\('@\/layouts\/docs\.vue'\),/, '')

  fs.writeFileSync(file, source)
}

/** Drop a module's import and registry line from the module registry. */
function unwireRegistry(root, manifest, ids) {
  const file = slotPath(manifest, 'moduleRegistry')
  if (!fs.existsSync(file)) return

  let source = fs.readFileSync(file, 'utf8')

  for (const id of ids) {
    const camel = id.replace(/-([a-z])/g, (_, char) => char.toUpperCase())
    source = source
      .split('\n')
      .filter((line) => {
        const trimmed = line.trim()
        if (trimmed === `import ${camel}Module from './${id}'`) return false
        if (trimmed === `${camel}Module,`) return false
        // The role comments above each entry describe a module that is leaving.
        if (trimmed.startsWith(`// ${id}:`)) return false
        return true
      })
      .join('\n')
  }

  fs.writeFileSync(file, source)
}

/**
 * Drop the removed modules' permissions from the union and from every role
 * granted them. `BuiltinPermission` is closed, so a role holding a withdrawn
 * permission is a type error.
 *
 * Taken from each module's `config.permissions` rather than its id, because the
 * two disagree: `reports:create` belongs to the template, not to the `reports`
 * module, and stripping by prefix would take it too.
 */
function unwirePermissions(root, manifest, permissions) {
  if (permissions.length === 0) return

  const literals = new Set(permissions)

  const union = slotPath(manifest, 'permissions')
  if (fs.existsSync(union)) {
    const source = fs.readFileSync(union, 'utf8')
    fs.writeFileSync(
      union,
      source
        .split('\n')
        .filter((line) => {
          const match = /^\s*\|\s*'([^']+)'\s*$/.exec(line)
          return !match || !literals.has(match[1])
        })
        .join('\n'),
    )
  }

  const inheritance = slotPath(manifest, 'rbacInheritance')
  if (fs.existsSync(inheritance)) {
    const source = fs.readFileSync(inheritance, 'utf8')
    fs.writeFileSync(
      inheritance,
      source
        .split('\n')
        // Grants appear one-per-line in a multi-line `delta` array, and inline
        // in a single-line one. Both forms are handled: whole lines go, inline
        // entries are spliced out of the array literal.
        .filter((line) => {
          const match = /^\s*'([^']+)',?\s*$/.exec(line)
          return !match || !literals.has(match[1])
        })
        .map((line) =>
          line.includes('delta:')
            ? line.replace(/'([^']+)',?\s*/g, (whole, literal) =>
                literals.has(literal) ? '' : whole,
              )
            : line,
        )
        .join('\n'),
    )
  }
}

/**
 * Source files that still *import* something that no longer exists.
 *
 * Import specifiers only, never the file body — the comments here are full of
 * paths, and reporting documentation as breakage trains people to ignore the
 * report. Compared by suffix rather than resolved, since `@/config/comark` has
 * to match `src/modules/app/config/comark.ts` without a resolver.
 */
const IMPORT_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g

function findDanglingReferences(root, removals) {
  const targets = removals
    .map((entry) => entry.path)
    .filter((rel) => rel.startsWith('src/'))
    .map((rel) => ({ rel, key: rel.replace(/\.(ts|vue)$/, '') }))

  const found = []

  for (const dir of ['src', 'test', 'e2e']) {
    for (const file of filesUnder(root, dir)) {
      if (!/\.(ts|vue|mts)$/.test(file)) continue

      const source = fs.readFileSync(path.join(root, file), 'utf8')

      for (const [, specifier] of source.matchAll(IMPORT_SPECIFIER)) {
        // Strip the alias or relative prefix; what remains is a path tail that
        // a removed file's path either ends with or does not.
        const tail = specifier
          .replace(/^[@~]\/(?:lib\/)?/, '')
          .replace(/^\.{1,2}\//, '')
          .replace(/\.(ts|vue)$/, '')

        if (tail.length < 4) continue

        const hit = targets.find((target) => target.key === tail || target.key.endsWith(`/${tail}`))
        if (!hit) continue

        found.push({ file, target: hit.rel })
        break
      }
    }
  }

  return found
}

function filesUnder(root, rel) {
  const full = path.join(root, rel)
  if (!fs.existsSync(full)) return []
  if (fs.statSync(full).isFile()) return [rel]

  const found = []
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    found.push(...filesUnder(root, `${rel}/${entry.name}`))
  }
  return found
}

function kept(modules, keep) {
  return modules.filter((entry) => entry.origin !== 'demo' || keep.has(entry.id)).length
}

function toList(value) {
  if (typeof value !== 'string') return []
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}
