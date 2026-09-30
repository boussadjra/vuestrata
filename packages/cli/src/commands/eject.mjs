import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { isGitClean, logger } from '../lib/cli.mjs'
import { pruneSpec, removedRoutePrefixes } from '../lib/eject/e2e.mjs'
import {
  dropCliRoundtrip,
  dropNotFoundDocsLink,
  dropVendorCopy,
  packageOf,
  rewriteDocLinks,
  rewritePackageJson,
} from '../lib/eject/project.mjs'
import { filesUnder, importSpecifiers, isAt, resolveSpecifier } from '../lib/eject/source.mjs'
import { driftedFiles, LOCKFILE_NAME, readLock, writeLock } from '../lib/lockfile.mjs'
import { collectManaged } from '../lib/managed.mjs'
import { inSlot, loadManifest, slot, slotPath } from '../lib/manifest.mjs'
import { insertBeforeSentinel, SENTINELS } from '../lib/registry.mjs'

/**
 * Remove the worked examples and keep the machinery.
 *
 * The demo modules, marketing home, showcase and docs site all exist to be
 * read, and every real project deletes them — usually by hand, discovering the
 * registry entries one broken build at a time.
 *
 * It never edits a file Vuestrata owns. The permissions of the modules it
 * removes are withdrawn in `app/config/rbac.overrides.ts`, which is the
 * project's, rather than struck from the permission union and the role grants —
 * an edit there would cost `core/lib/rbac/` its upgrades on the first run.
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
]

/**
 * What only the template's maintainers use: the CLI itself, the release gates
 * that guard its lockfile and payload, the tests of both, and the workflows that
 * publish it and deploy its demo. A project that keeps them has a lint step
 * that fails when it bumps its own version, and a CI job that runs a CLI it
 * does not have.
 *
 * `maintainer-gates.mjs` is the release gate a later release adds; listing it
 * here costs nothing where it does not exist.
 */
const MAINTAINER_PATHS = [
  { path: 'packages/cli', reason: 'the CLI source (the installed `vuestrata` bin replaces it)' },
  { path: 'scripts/release', reason: 'the template release scripts' },
  { path: 'test/unit/cli', reason: 'CLI tests' },
  {
    path: 'test/unit/architecture/public-surface.test.ts',
    reason: 'snapshot of the template public surface',
  },
  {
    path: 'test/unit/architecture/__snapshots__/public-surface.test.ts.snap',
    reason: 'baseline for the public-surface test',
  },
  { path: '.github/workflows/deploy-demo.yml', reason: 'deploys the template demo site' },
  { path: '.github/workflows/release.yml', reason: 'publishes the template' },
]

/** Removed only when `--keep-docs` is absent. */
const DOCS_PATHS = [{ path: 'docs', reason: 'markdown documentation' }]

/** Kept unless `--no-keep-customers` is passed: the reference implementation. */
const REFERENCE_MODULE = 'customers'

const HOME_PAGE = 'src/modules/app/pages/index.vue'
const ROUTER_FILE = 'src/modules/app/plugins/router.ts'
const NOT_FOUND_PAGE = 'src/modules/app/pages/[...notfound].vue'
const CI_WORKFLOW = '.github/workflows/ci.yml'
const DOC_LINK_FILES = ['README.md', 'CONTRIBUTING.md', 'SECURITY.md']

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

  let plan
  try {
    plan = planEject({ root, manifest, flags })
  } catch (error) {
    logger.error(error.message)
    process.exit(1)
  }

  if (flags['dry-run']) {
    logger.info('Dry run — nothing removed.\n')
    for (const entry of plan.removals) logger.log(`  remove  ${entry.path}  (${entry.reason})`)
    for (const entry of plan.edits) logger.log(`  edit    ${entry.path}  (${entry.reason})`)
    for (const id of plan.unwired) logger.log(`  unwire  ${id} from the module registry`)
    for (const literal of plan.withdrawn) logger.log(`  revoke  ${literal}`)
    logger.log('')
    logger.info(`${plan.kept.length} module(s) would remain.`)
    for (const note of plan.notes) logger.log(`  next    ${note}`)
    logger.log('')
    return
  }

  applyPlan({ root, manifest, plan, format: !flags['no-format'] })
}

/**
 * Everything `eject` will do, decided before anything is done. Nothing is
 * written until the whole plan exists, so a problem found late — a missing
 * `rbac.overrides.ts`, a registry that lost its markers — stops the run with the
 * tree untouched.
 */
export function planEject({ root, manifest, flags }) {
  const modules = readModuleOrigins(root, manifest)
  if (modules.length === 0) {
    throw new Error(
      `Could not read module origins from ${slot(manifest, 'moduleRegistry')}. ` +
        'Run `vuestrata doctor` first.',
    )
  }

  const keep = new Set(toList(flags.keep))
  if (!flags['no-keep-customers']) keep.add(REFERENCE_MODULE)

  const demoModules = modules.filter((entry) => entry.origin === 'demo' && !keep.has(entry.id))
  const remaining = modules.filter((entry) => !demoModules.includes(entry))

  const removals = []
  const edits = new Map()
  const notes = []

  for (const entry of demoModules) {
    removals.push({ path: inSlot(manifest, 'modulesDir', entry.id), reason: `${entry.id} module` })
  }
  for (const entry of [
    ...DEMO_PATHS,
    ...(flags['keep-docs'] ? [] : DOCS_PATHS),
    ...MAINTAINER_PATHS,
  ]) {
    if (fs.existsSync(path.join(root, entry.path))) removals.push(entry)
  }

  const isRemoved = (rel) => removals.some((entry) => isAt(rel, entry.path))
  const docsRemoved = removals.some((entry) => entry.path === 'docs')

  // ── Tests and specs tied to what is going ────────────────────────────────
  const targets = removals.map((entry) => entry.path.replace(/\.(?:ts|vue)$/, ''))
  const prefixes = removedRoutePrefixes({
    removedRoutes: demoModules.flatMap((entry) => [`/dashboard/${entry.id}`, ...entry.routes]),
    keptRoutes: remaining.flatMap((entry) => entry.routes),
    shell: [
      ...(isRemoved('src/modules/app/pages/docs') ? ['/docs'] : []),
      ...(isRemoved('src/modules/app/pages/components') ? ['/components'] : []),
    ],
  })

  const orphans = []
  const pruned = []

  for (const dir of ['test', 'e2e', 'src']) {
    for (const file of filesUnder(root, dir)) {
      if (!/\.(?:test|spec)\.(?:ts|mts)$/.test(file) || isRemoved(file)) continue

      const source = fs.readFileSync(path.join(root, file), 'utf8')

      const gone = importSpecifiers(source)
        .map((specifier) => resolveSpecifier(file, specifier, manifest))
        .find((resolved) => resolved && targets.some((target) => isAt(resolved, target)))
      if (gone) {
        orphans.push({ path: file, reason: `imports ${gone}, which is removed` })
        continue
      }

      if (!file.startsWith('e2e/') || prefixes.length === 0) continue

      const result = pruneSpec(source, prefixes)
      if (result.contents === null) {
        orphans.push({ path: file, reason: 'visits only routes that are removed' })
      } else if (result.changed) {
        edits.set(file, {
          path: file,
          reason:
            result.dropped > 0
              ? `drop ${result.dropped} test(s) and the routes in lists that visit removed routes`
              : 'drop removed routes from its route lists',
          contents: result.contents,
        })
        pruned.push(file)
      }
    }
  }
  removals.push(...orphans)

  // ── Registries ───────────────────────────────────────────────────────────
  const registryFile = slot(manifest, 'moduleRegistry')
  const unwired = demoModules.map((entry) => entry.id)
  if (unwired.length > 0) {
    edits.set(registryFile, {
      path: registryFile,
      reason: 'unwire the removed modules',
      contents: unwireRegistry(readOf(root, registryFile), unwired),
    })
  }

  if (
    isRemoved('src/modules/app/config/component-docs.ts') &&
    fs.existsSync(path.join(root, ROUTER_FILE))
  ) {
    const contents = unwireRouter(readOf(root, ROUTER_FILE))
    if (contents !== readOf(root, ROUTER_FILE)) {
      edits.set(ROUTER_FILE, {
        path: ROUTER_FILE,
        reason: 'drop the docs redirects and layouts',
        contents,
      })
    }
  }

  edits.set(HOME_PAGE, {
    path: HOME_PAGE,
    reason: 'placeholder redirect to /dashboard',
    contents: HOME_PLACEHOLDER,
  })

  if (isRemoved('src/modules/app/pages/docs') && fs.existsSync(path.join(root, NOT_FOUND_PAGE))) {
    const contents = dropNotFoundDocsLink(readOf(root, NOT_FOUND_PAGE))
    if (contents !== undefined) {
      edits.set(NOT_FOUND_PAGE, {
        path: NOT_FOUND_PAGE,
        reason: 'drop the link to the removed docs',
        contents,
      })
    }
  }

  // ── Permissions: withdrawn, never struck from the union ──────────────────
  // Taken from each module's `config.permissions` rather than its id, because
  // the two disagree: `reports:create` belongs to the template, not to the
  // `reports` module, and stripping by prefix would take it too. A permission a
  // surviving module still declares stays.
  const stillDeclared = new Set(remaining.flatMap((entry) => entry.permissions))
  const withdrawn = [
    ...new Set(
      demoModules.flatMap((entry) => entry.permissions).filter((p) => !stillDeclared.has(p)),
    ),
  ].sort((a, b) => a.localeCompare(b))

  if (withdrawn.length > 0) {
    const overrides = slot(manifest, 'rbacOverrides')
    if (!fs.existsSync(path.join(root, overrides))) {
      throw new Error(
        `${overrides} does not exist. Eject withdraws the removed modules' permissions there ` +
          'rather than editing core/lib/rbac/, which would stop that folder receiving updates. ' +
          'Run `vuestrata upgrade` to write it, or set slots.rbacOverrides in ' +
          'vuestrata.config.json if you moved it.',
      )
    }
    edits.set(overrides, {
      path: overrides,
      reason: `withdraw ${withdrawn.length} permission(s)`,
      contents: withdrawn.reduce(
        (source, literal) => insertBeforeSentinel(source, SENTINELS.withdrawn, `'${literal}',`),
        readOf(root, overrides),
      ),
    })
  }

  // ── Documentation links ──────────────────────────────────────────────────
  if (docsRemoved) {
    const lock = readLock(root)
    const ref = lock.template ? `v${lock.template}` : 'main'
    for (const file of DOC_LINK_FILES) {
      if (!fs.existsSync(path.join(root, file))) continue
      const before = readOf(root, file)
      const contents = rewriteDocLinks(before, ref)
      if (contents !== before) {
        edits.set(file, { path: file, reason: `point docs/ links at upstream ${ref}`, contents })
      }
    }
  }

  // ── package.json, Dockerfile, CI ─────────────────────────────────────────
  const imported = importedPackages(root, isRemoved, edits)
  const pkgFile = 'package.json'
  const pkg = rewritePackageJson(readOf(root, pkgFile), { removed: isRemoved, imported })
  if (pkg.changes.length > 0) {
    const scripts = pkg.changes.filter((change) => change.includes('script')).length
    edits.set(pkgFile, {
      path: pkgFile,
      reason: `${scripts} script(s) rewritten or removed, ${pkg.changes.length - scripts} dependency(ies) pruned`,
      contents: pkg.contents,
    })
  }
  notes.push(...pkg.notes)

  if (pkg.vendorUnused && fs.existsSync(path.join(root, 'vendor'))) {
    const files = filesUnder(root, 'vendor')
    if (files.every((file) => /^vendor\/(?:README\.md|comark-[^/]+\.tgz)$/.test(file))) {
      removals.push({
        path: 'vendor',
        reason: 'the vendored comark tarball, used only by the docs',
      })
    }
  }
  if (pkg.vendorUnused && fs.existsSync(path.join(root, 'Dockerfile'))) {
    const contents = dropVendorCopy(readOf(root, 'Dockerfile'))
    if (contents !== undefined) {
      edits.set('Dockerfile', { path: 'Dockerfile', reason: 'drop the COPY of vendor/', contents })
    }
  }

  if (isRemoved('packages/cli') && fs.existsSync(path.join(root, CI_WORKFLOW))) {
    const contents = dropCliRoundtrip(readOf(root, CI_WORKFLOW))
    if (contents !== undefined) {
      edits.set(CI_WORKFLOW, {
        path: CI_WORKFLOW,
        reason: 'drop the cli-roundtrip job, which runs the removed CLI',
        contents,
      })
    }
  }

  if (pruned.length + orphans.filter((entry) => entry.path.startsWith('e2e/')).length > 0) {
    notes.push(
      'End-to-end specs that visited removed routes were pruned or deleted. Write specs for your own ' +
        'routes; `e2e/helpers/` and the specs that remain show the conventions.',
    )
  }

  return {
    removals,
    edits: [...edits.values()],
    unwired,
    withdrawn,
    kept: remaining,
    demoModules,
    notes,
  }
}

function applyPlan({ root, manifest, plan, format }) {
  const managedBefore = new Set(driftedFiles(root, readLock(root)).map((entry) => entry.rel))

  // ── Remove ───────────────────────────────────────────────────────────────
  const removed = []
  for (const entry of plan.removals) {
    const full = path.join(root, entry.path)
    if (!fs.existsSync(full)) continue
    removed.push(...filesUnder(root, entry.path))
    fs.rmSync(full, { recursive: true, force: true })
  }
  removeEmptyDirectories(root, plan.removals)

  // ── Rewrite what stays ───────────────────────────────────────────────────
  for (const entry of plan.edits) {
    fs.writeFileSync(path.join(root, entry.path), entry.contents)
  }
  if (format) {
    formatFiles(
      plan.edits.map((entry) => entry.path),
      root,
    )
  }

  // ── Record, so an upgrade never puts any of it back ──────────────────────
  const lock = readLock(root)
  const managedNow = new Set(collectManaged(root))

  for (const rel of removed) {
    // The CLI's own files were never Vuestrata's to restore.
    if (rel.startsWith('packages/')) continue
    if (!lock.ejected.includes(rel)) lock.ejected.push(rel)
    delete lock.files[rel]
  }

  // Recomputed rather than trusted, so a path that was already gone still ends
  // up recorded. Only managed files are considered: eject deletes those and
  // never edits one, so a merged file is not touched here.
  for (const rel of Object.keys(lock.files)) {
    if (lock.files[rel].class !== 'managed') continue
    if (managedNow.has(rel)) continue
    if (fs.existsSync(path.join(root, rel))) continue
    if (!lock.ejected.includes(rel)) lock.ejected.push(rel)
    delete lock.files[rel]
  }

  writeLock(root, lock)

  const introduced = driftedFiles(root, readLock(root)).filter(
    (entry) => !managedBefore.has(entry.rel),
  )
  if (introduced.length > 0) {
    logger.warn(
      `${introduced.length} managed file(s) now differ from the lockfile — eject should never edit one:`,
    )
    for (const entry of introduced) logger.log(`  drift   ${entry.rel}`)
    logger.log('')
  }

  logger.success(
    `Ejected ${plan.demoModules.length} module(s) and ` +
      `${plan.removals.length - plan.demoModules.length} other path(s).`,
  )
  logger.log('')
  for (const entry of plan.removals) logger.log(`  removed  ${entry.path}`)
  for (const entry of plan.edits) logger.log(`  edited   ${entry.path}  (${entry.reason})`)
  logger.log('')
  if (plan.withdrawn.length > 0) {
    logger.info(
      `${plan.withdrawn.length} permission(s) withdrawn in ${slot(manifest, 'rbacOverrides')}.`,
    )
  }
  logger.info(
    `${removed.length} path(s) recorded in ${LOCKFILE_NAME} so an upgrade will not restore them.`,
  )
  logger.log('')

  // A dangling import fails the build with an error nobody would connect back
  // to this command, so the scan runs here, where the removals are on screen.
  const dangling = findDanglingReferences(root, manifest, plan.removals)

  if (dangling.length > 0) {
    logger.warn(`${dangling.length} file(s) still reference something that was removed:`)
    for (const entry of dangling) logger.log(`  check   ${entry.file}  →  ${entry.target}`)
    logger.log('')
    logger.warn('Fix those before building; nothing here can guess what should replace them.')
  } else {
    logger.success('Nothing left referencing what was removed.')
  }

  logger.log('')
  for (const note of plan.notes) logger.info(note)
  logger.info('Verify with:  vpr lint && vp check && vpr test --run && vpr build')
  logger.log('')
}

/**
 * Read `{ id, origin, permissions, routes }` from each module barrel. Parsed
 * rather than imported: this runs in Node against TypeScript, aliases and SFCs
 * it cannot resolve, for the sake of a few string literals.
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
    const routes = [...source.matchAll(/^\s*path:\s*'(\/[^']*)'/gm)].map(([, route]) => route)

    found.push({ id: entry.name, origin: origin ?? 'app', permissions, routes })
  }
  return found
}

/**
 * Every package the files that remain import: source, tests, specs, scripts and
 * the tool configs at the root. What a docs-only dependency may not be is one of
 * them.
 */
function importedPackages(root, isRemoved, edits) {
  const files = ['src', 'test', 'e2e', 'scripts']
    .flatMap((dir) => filesUnder(root, dir))
    .concat(
      fs
        .readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isFile() && /\.(?:ts|mts|mjs|js|cjs)$/.test(entry.name))
        .map((entry) => entry.name),
    )
    .filter((file) => /\.(?:ts|mts|vue|mjs|js|cjs)$/.test(file) && !isRemoved(file))

  const imported = new Set()
  for (const file of files) {
    const source = edits.get(file)?.contents ?? readOf(root, file)
    for (const specifier of importSpecifiers(source)) {
      const name = packageOf(specifier)
      if (name) imported.add(name)
    }
  }
  return imported
}

/** Drop a module's import and registry line from the module registry. */
function unwireRegistry(source, ids) {
  let next = source

  for (const id of ids) {
    const camel = id.replace(/-([a-z])/g, (_, char) => char.toUpperCase())
    next = next
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

  return next
}

/**
 * Take the documentation site out of the router: the legacy-redirect import,
 * the two redirect routes built from it, and two `layoutMap` entries. They fail
 * differently — a missing import breaks the build, an unresolvable layout only
 * warns and renders the page with no shell — so all three go together.
 */
function unwireRouter(source) {
  return source
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
}

/**
 * Source files that still *import* something that no longer exists.
 *
 * Import specifiers only, never the file body. Each is resolved the way the
 * compiler would, so `@/config/comark` is compared with
 * `src/modules/app/config/comark.ts` — and a removed directory matches every
 * file that was in it.
 */
function findDanglingReferences(root, manifest, removals) {
  const targets = removals
    .map((entry) => entry.path)
    .filter((rel) => rel.startsWith('src/'))
    .map((rel) => ({ rel, key: rel.replace(/\.(?:ts|vue)$/, '') }))

  const found = []

  for (const dir of ['src', 'test', 'e2e']) {
    for (const file of filesUnder(root, dir)) {
      if (!/\.(?:ts|vue|mts)$/.test(file)) continue

      const source = fs.readFileSync(path.join(root, file), 'utf8')

      for (const specifier of importSpecifiers(source)) {
        const resolved = resolveSpecifier(file, specifier, manifest)
        const hit = resolved && targets.find((target) => isAt(resolved, target.key))
        if (!hit) continue

        found.push({ file, target: hit.rel })
        break
      }
    }
  }

  return found
}

/** Directories a removal leaves empty are not worth keeping, or committing. */
function removeEmptyDirectories(root, removals) {
  for (const entry of removals) {
    let dir = path.posix.dirname(entry.path)
    while (dir !== '.' && dir !== '') {
      const full = path.join(root, dir)
      if (!fs.existsSync(full) || fs.readdirSync(full).length > 0) break
      fs.rmdirSync(full)
      dir = path.posix.dirname(dir)
    }
  }
}

/**
 * Format what was rewritten. Non-fatal: an unformatted file is a nuisance, and
 * `vp fmt` fixes it on the next run.
 */
function formatFiles(files, cwd) {
  const targets = files.filter((file) => /\.(?:ts|vue|json|css|md|yml)$/.test(file))
  if (targets.length === 0) return

  const result = spawnSync('vp', ['fmt', ...targets], {
    cwd,
    stdio: 'ignore',
    shell: process.platform === 'win32',
  })

  if (result.status !== 0) {
    logger.warn(
      'Could not run `vp fmt` on the rewritten files — run it yourself before committing.',
    )
  }
}

const readOf = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8')

function toList(value) {
  if (typeof value !== 'string') return []
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}
