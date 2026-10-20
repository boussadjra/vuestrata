import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { stripComments } from '../../src/lib/api-wiring.mjs'
import { findClose } from '../../src/lib/eject/source.mjs'
import { hashFor } from '../../src/lib/lockfile.mjs'
import { hashContents } from '../../src/lib/plan.mjs'
import { incomingPath } from '../../src/lib/workspace.mjs'
import { COMPANIONS, isShipped, PROJECT_FILES, shippedCopy } from './shipped.mjs'

const PRISTINE = JSON.parse(
  fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'pristine.json'), 'utf8'),
)
const HELPERS = ['useDataTable.ts', 'useServerTable.ts', 'table-columns.ts']

export const TABLE_DEPENDENCIES = {
  '@vueye-table/core': '3.0.0-beta.3',
  '@vueye-table/vue': '3.0.0-beta.3',
  '@vueye-table/headless': '3.0.0-beta.3',
  '@queryweave/core': '0.1.0-beta.5',
  '@queryweave/vue': '0.1.0-beta.5',
  '@queryweave/vue-router': '0.1.0-beta.5',
}

/** Preserve every unrelated dependency and the project's own version and scripts. */
export function migrateDependencies(source) {
  const pkg = JSON.parse(source)
  const before = JSON.stringify(pkg)
  pkg.dependencies ??= {}
  pkg.devDependencies ??= {}
  for (const name of ['@tanstack/vue-table', '@tanstack/table-core']) {
    delete pkg.dependencies[name]
    delete pkg.devDependencies[name]
  }
  for (const [name, version] of Object.entries(TABLE_DEPENDENCIES)) {
    pkg.dependencies[name] = version
    delete pkg.devDependencies[name]
  }
  delete pkg.dependencies['@queryweave/testing']
  pkg.devDependencies['@queryweave/testing'] = '0.1.0-beta.5'
  if (before === JSON.stringify(pkg)) return source
  const next = `${JSON.stringify(pkg, null, 2)}\n`
  return source.includes('\r\n') ? next.replaceAll('\n', '\r\n') : next
}

function projectPath(rel, manifest) {
  if (rel === 'src/modules/app/components/ui/index.ts') return manifest.slots.uiBarrel
  if (rel.startsWith('src/modules/app/components/ui/')) {
    return `${manifest.slots.uiComponents}/${rel.slice('src/modules/app/components/ui/'.length)}`
  }
  if (rel.startsWith('src/modules/app/')) {
    return `${manifest.slots.appDir}/${rel.slice('src/modules/app/'.length)}`
  }
  if (rel.startsWith('src/modules/')) {
    return `${manifest.slots.modulesDir}/${rel.slice('src/modules/'.length)}`
  }
  return rel
}

function exampleStep(rel) {
  return {
    file: (manifest) => projectPath(rel, manifest),
    pending: (current) => !isShipped(rel, current),
    apply: (current, manifest, ws) => {
      if (!PRISTINE[rel].includes(hashContents(current))) return current
      // Moved modules belong to the project. A replacement with canonical alias
      // assumptions must be merged by the person who chose their new location.
      if (projectPath(rel, manifest) !== rel) return current
      const companions = COMPANIONS[rel] ?? []
      if (companions.some((file) => ws.exists(file) && !isShipped(file, ws.read(file))))
        return current
      for (const file of companions) ws.write(file, shippedCopy(file))
      return shippedCopy(rel)
    },
    incoming: () => shippedCopy(rel),
    note:
      rel === 'vite.config.ts'
        ? 'Merge the Vueye and QueryWeave chunk rules from the incoming Vite config so tables stay on demand. ' +
          'Your aliases, plugins and other build settings were preserved. See UPGRADING.md#200.'
        : `Merge the 2.0 Vueye columns, native binding and QueryWeave route state into ${rel}. ` +
          'The original file and its domain customizations were preserved. See UPGRADING.md#200.',
  }
}

const examples = PROJECT_FILES.map(exampleStep)

/** Split only outside brackets: nested functions never count as an executed hook. */
function topLevelParts(code, separators) {
  const parts = []
  let start = 0
  for (let index = 0; index < code.length; index++) {
    if ('([{'.includes(code[index])) {
      const close = findClose(code, index)
      if (close === -1) return []
      index = close - 1
    } else if (separators.includes(code[index])) {
      parts.push(code.slice(start, index).trim())
      start = index + 1
    }
  }
  parts.push(code.slice(start).trim())
  return parts.filter(Boolean)
}

/** Recognize the actual inline boot hook; uncertain custom wiring needs a person. */
function installsQueryState(source) {
  for (const code of topLevelParts(stripComments(source, { strings: false }), ';\n')) {
    const boot = /^(?:void\s+|await\s+)?boot\s*\(/.exec(code)
    if (!boot) continue
    const open = boot[0].length - 1
    const close = findClose(code, open)
    if (close === -1) continue
    const args = topLevelParts(code.slice(open + 1, close - 1), ',')
    const options = args[1]
    if (!options?.startsWith('{') || findClose(options, 0) !== options.length) continue
    const hook = topLevelParts(options.slice(1, -1), ',')
      .find((entry) => /^beforeMount\s*:/.test(entry))
      ?.replace(/^beforeMount\s*:\s*/, '')
    if (!hook) continue
    if (/^installQueryState$/.test(hook)) return true
    const arrow = /^(?:async\s+)?(?:\([^)]*\)|[\w$]+)\s*=>\s*/.exec(hook)
    if (!arrow) continue
    const body = hook.slice(arrow[0].length).trim()
    if (/^(?:await\s+)?installQueryState\s*\(/.test(body)) return true
    if (!body.startsWith('{') || findClose(body, 0) !== body.length) continue
    const first = topLevelParts(body.slice(1, -1), ';\n')[0] ?? ''
    if (/^(?:(?:await|void|return)\s+)*installQueryState\s*\(/.test(first)) return true
  }
  return false
}

/** Infrastructure must be coherent before any part of the release is applied. */
export function tableUpgradeBlockers({ ws, source, report, manifest }) {
  const protectedFiles = [
    ...HELPERS.map((name) => `src/modules/app/composables/${name}`),
    'src/modules/app/composables/useListRouteState.ts',
    'src/modules/app/plugins/query-state.ts',
    'src/modules/app/components/ui/UiDataTable.vue',
    'src/modules/app/components/ui/UiDataGrid.vue',
    'src/modules/app/components/ui/index.ts',
    ...Object.keys(source.files).filter((rel) =>
      rel.startsWith('src/modules/app/components/ui/table/'),
    ),
    'src/modules/core/lib/table-query.ts',
  ]
  const blockers = []
  for (const shipped of protectedFiles) {
    if (!source.has(shipped)) continue
    const rel = projectPath(shipped, manifest)
    const current = ws.tryRead(rel)
    const conflicts = report.incoming.some((entry) => entry.rel === rel || entry.rel === shipped)
    if (
      rel === shipped &&
      current !== undefined &&
      !conflicts &&
      hashFor(rel, current, source.classOf(shipped)) ===
        hashFor(shipped, source.read(shipped), source.classOf(shipped))
    )
      continue
    const incoming = incomingPath(rel)
    if (!ws.exists(incoming)) ws.write(incoming, source.read(shipped))
    if (!report.incoming.some((entry) => entry.rel === rel)) {
      report.incoming.push({ rel, incoming, reason: 'protected table infrastructure' })
    }
    blockers.push({
      rel,
      text:
        `The native table infrastructure cannot be partially installed. Compare ${incoming}; ` +
        'merge the whole table unit, restore canonical paths if moved, then run ' +
        '`vuestrata adopt <merged-paths>` and retry. No dependency or template version was changed.',
    })
  }
  const main = ws.tryRead('src/main.ts')
  const installed = main !== undefined && installsQueryState(main)
  if ((main !== undefined || source.has('src/modules/app/plugins/query-state.ts')) && !installed) {
    const rel = 'src/main.ts'
    const incoming = incomingPath(rel)
    if (!ws.exists(incoming)) ws.write(incoming, shippedCopy(rel))
    blockers.push({
      rel: 'src/main.ts',
      text:
        "Import installQueryState from '@/plugins/query-state' and compose it into boot(App)'s " +
        'beforeMount hook, preserving your existing hook. Compare .vuestrata/incoming/src/main.ts.',
    })
  }
  for (const rel of ws.written()) {
    if (!rel.startsWith('.vuestrata/incoming/')) continue
    const original = rel.slice('.vuestrata/incoming/'.length)
    if (!report.incoming.some((entry) => entry.rel === original)) {
      report.incoming.push({ rel: original, incoming: rel, reason: '2.0 companion' })
    }
  }
  return blockers
}

export default [
  {
    description: 'replace TanStack Table dependencies with Vueye and QueryWeave',
    steps: [{ file: 'package.json', apply: migrateDependencies }],
  },
  {
    description: 'promote the native table helpers as one managed unit',
    steps: HELPERS.map((name) => ({
      kind: 'promote',
      file: (manifest) => `${manifest.slots.appDir}/composables/${name}`,
      pristine: PRISTINE[`src/modules/app/composables/${name}`],
      unit: 'native-table',
      note:
        'The three table helpers must be migrated together. Merge the incoming Vueye versions ' +
        'and adopt all three canonical paths before retrying. See UPGRADING.md#200.',
    })),
  },
  {
    description: 'migrate pristine examples to native table bindings and shared list URLs',
    steps: [
      ...examples,
      {
        kind: 'note',
        note: (_current, manifest, ws) => {
          const pending = PROJECT_FILES.some((rel) => {
            const actual = projectPath(rel, manifest)
            return ws.exists(actual) && !isShipped(rel, ws.read(actual))
          })
          for (const [owner, companions] of Object.entries(COMPANIONS)) {
            const actual = projectPath(owner, manifest)
            if (!ws.exists(actual) || isShipped(owner, ws.read(actual))) continue
            for (const rel of companions) {
              ws.write(incomingPath(projectPath(rel, manifest)), shippedCopy(rel))
            }
          }
          if (!pending && !ws.written().includes('package.json')) return undefined
          return (
            'Run vp install to refresh the dependency lock, then vp check and vpr test --run. ' +
            'Project-owned custom tables must migrate their column, slot and state contracts; ' +
            'see UPGRADING.md#200 and docs/9.recipes/12.upgrade-to-2.md.'
          )
        },
      },
      { kind: 'guard', check: tableUpgradeBlockers },
    ],
  },
]
