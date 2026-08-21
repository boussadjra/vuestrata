import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vite-plus/test'

import { readDirectorySurface } from '../../utils/component-surface'

/**
 * The surface a project depends on, written down.
 *
 * Vuestrata is copied rather than resolved, so a project's code calls these
 * names directly and only a migration can rewrite it. This makes the rule in
 * RELEASE.md enforceable: renaming a prop or retiring an `IconName` shows up in
 * review with the question already asked — where is the migration?
 *
 * Updating the snapshot is normal. Updating it without the migration is not.
 */

const ROOT = process.cwd()

/** Sorted, so an unrelated reordering never shows up as a surface change. */
function sorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b))
}

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

describe('public surface', () => {
  it('exposes a stable set of Ui* components', () => {
    const dir = path.join(ROOT, 'src/modules/app/components/ui')
    const names = fs
      .readdirSync(dir)
      .filter((file) => file.endsWith('.vue'))
      .map((file) => file.replace(/\.vue$/, ''))

    expect(sorted(names)).toMatchSnapshot()
  })

  it('exposes stable props and emits on every Ui* component', () => {
    const surface = readDirectorySurface(path.join(ROOT, 'src/modules/app/components/ui'))

    // An empty surface means the reader failed, not that the component takes
    // nothing — every wrapper declares props. Without this the snapshot records
    // "no props" and then lets them be renamed.
    const empty = Object.entries(surface)
      .filter(([, entry]) => entry.props.length === 0)
      .map(([name]) => name)
    expect(empty).toEqual([])

    expect(surface).toMatchSnapshot()
    // Compiling sixty-nine SFCs runs past the 5s default under parallel load.
  }, 60_000)

  it('exposes a stable IconName union', () => {
    // Every icon provider must implement each of these — retiring one is a
    // breaking change for any project that named it.
    const source = read('src/modules/app/types/index.ts')
    const union = /export type IconName =([\s\S]*?)(?:\n\n|\nexport )/.exec(source)?.[1] ?? ''
    const names = [...union.matchAll(/\|\s*'([^']+)'/g)].map(([, name]) => name!)

    expect(names.length).toBeGreaterThan(0)
    expect(sorted(names)).toMatchSnapshot()
  })

  it('exposes a stable set of environment variables', () => {
    const source = read('src/modules/core/lib/config/env.schema.ts')
    const names = [...source.matchAll(/'(VUESTRATA_[A-Z_]+)'/g)].map(([, name]) => name!)

    expect(names.length).toBeGreaterThan(0)
    expect(sorted(names)).toMatchSnapshot()
  })

  it('exposes a stable set of semantic design tokens', () => {
    // Renaming one silently un-styles every call site, in every theme, with no
    // error anywhere — CSS resolves an undefined custom property to nothing.
    const source = read('src/modules/app/styles/semantic.css')
    const names = [...source.matchAll(/^\s*(--[a-z][a-z0-9-]*):/gm)].map(([, name]) => name!)

    expect(names.length).toBeGreaterThan(0)
    expect(sorted(names)).toMatchSnapshot()
  })

  it('exposes a stable set of built-in permissions', () => {
    const source = read('src/modules/core/lib/rbac/types.ts')
    const union = /export type BuiltinPermission =([\s\S]*?)\n\n/.exec(source)?.[1] ?? ''
    const names = [...union.matchAll(/\|\s*'([^']+)'/g)].map(([, name]) => name!)

    expect(names.length).toBeGreaterThan(0)
    expect(sorted(names)).toMatchSnapshot()
  })

  it('exposes a stable set of module barrels', () => {
    const dir = path.join(ROOT, 'src/modules')
    const modules = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter(
        (entry) => entry.isDirectory() && fs.existsSync(path.join(dir, entry.name, 'index.ts')),
      )
      .map((entry) => entry.name)

    expect(sorted(modules)).toMatchSnapshot()
  })
})
