import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vite-plus/test'

import arShell from '@/locales/ar.json'
import enShell from '@/locales/en.json'
import frShell from '@/locales/fr.json'
import { NAV_GROUPS } from '@/modules/nav-groups'
import { appModules } from '@/modules/setup'

/**
 * Registries that live apart from the thing they register.
 *
 * Writing a module is the easy half. The half that gets forgotten is the line
 * in `src/modules/setup.ts` that puts it into `appModules` — and forgetting it
 * produces no error of any kind. The module compiles, its tests pass, its files
 * all exist, and the app simply behaves as though it were never written: no
 * routes, no nav entry, no permissions, no mock handlers.
 *
 * That is the single most likely way a scaffolded module fails, so it gets its
 * own test rather than being one assertion among many.
 */

const ROOT = process.cwd()
const MODULES_DIR = path.join(ROOT, 'src/modules')
const LAYOUTS_DIR = path.join(ROOT, 'src/modules/app/layouts')
const ROUTER_FILE = path.join(ROOT, 'src/modules/app/plugins/router.ts')

/**
 * A directory is a module when it has an `index.ts` with a default export —
 * that default IS the `ModuleDefinition`. `app` and `core` have no `index.ts`
 * at all, which is precisely what marks them as infrastructure rather than
 * modules, so no hand-maintained exclusion list is needed here.
 */
function discoverModuleDirs(): string[] {
  return fs
    .readdirSync(MODULES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => {
      const indexPath = path.join(MODULES_DIR, name, 'index.ts')
      if (!fs.existsSync(indexPath)) return false
      return /^export default /m.test(fs.readFileSync(indexPath, 'utf8'))
    })
    .sort()
}

describe('registry drift', () => {
  it('registers every module directory in appModules', () => {
    const onDisk = discoverModuleDirs()
    const registered = appModules.map((mod) => mod.config.id).sort()
    const unregistered = onDisk.filter((name) => !registered.includes(name))

    expect(
      unregistered,
      `These modules exist on disk but are missing from \`appModules\` in src/modules/setup.ts:\n` +
        unregistered.map((name) => `  - ${name}`).join('\n') +
        '\n\nUntil they are imported and added there they contribute no routes, no navigation, ' +
        'no permissions and no mocks — silently.',
    ).toEqual([])
  })

  it('registers no module that has no directory', () => {
    const onDisk = discoverModuleDirs()
    const orphaned = appModules.map((mod) => mod.config.id).filter((id) => !onDisk.includes(id))
    expect(orphaned, 'appModules entries with no matching src/modules/<id>/index.ts').toEqual([])
  })

  it('backs every layoutMap entry with a layout file', () => {
    const source = fs.readFileSync(ROUTER_FILE, 'utf8')
    const start = source.indexOf('export const layoutMap')
    expect(start, 'could not find layoutMap in plugins/router.ts').toBeGreaterThan(-1)

    const open = source.indexOf('{', start)
    const block = source.slice(open, source.indexOf('\n}', open))
    const names = [...block.matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:/gm)].map((m) => m[1])

    expect(names.length, 'parsed no layout names — has layoutMap changed shape?').toBeGreaterThan(0)

    const missing = names.filter((name) => !fs.existsSync(path.join(LAYOUTS_DIR, `${name}.vue`)))
    expect(missing, 'layoutMap names with no src/modules/app/layouts/<name>.vue').toEqual([])
  })

  it('translates every nav group label in every shell locale', () => {
    // A group heading is rendered through `t()`, so a missing key shows the raw
    // `nav_group_*` string as a sidebar section title.
    // Through `unknown`: the imported JSON has a precise literal-key type, so
    // TypeScript refuses the direct widening to an index signature.
    const catalogs = { en: enShell, fr: frShell, ar: arShell } as unknown as Record<
      string,
      Record<string, string>
    >

    const problems: string[] = []
    for (const group of NAV_GROUPS) {
      for (const [locale, catalog] of Object.entries(catalogs)) {
        if (!(group.label in catalog)) {
          problems.push(`${locale}: missing "${group.label}" (group "${group.id}")`)
        }
      }
    }

    expect(problems, 'nav group labels missing from shell locale files').toEqual([])
  })

  it('gives every nav group a unique id and order', () => {
    const ids = NAV_GROUPS.map((group) => group.id)
    expect(new Set(ids).size, 'duplicate nav group ids').toBe(ids.length)

    const orders = NAV_GROUPS.map((group) => group.order)
    expect(
      new Set(orders).size,
      'duplicate nav group order values make sidebar order ambiguous',
    ).toBe(orders.length)
  })
})
