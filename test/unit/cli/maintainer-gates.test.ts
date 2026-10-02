import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { describe, expect, it, vi } from 'vite-plus/test'

import { CLI_PRESENT, loadCli } from './cli'

/**
 * The maintainer gates: the lockfile check, and the runner that reports them.
 *
 * Both live in `scripts/release/`, which `eject` removes together with
 * `packages/cli`, so they are loaded the way the CLI is: a project without them
 * skips this file instead of failing to collect it.
 *
 * The lockfile cases never ask whether the committed lockfile is current. That
 * is the gate's job, and in a project it is not current and should not be. They
 * ask what ONE change to it adds to the report, so they hold in any checkout.
 */

const SCRIPTS = path.resolve(process.cwd(), 'scripts/release')
const PRESENT =
  CLI_PRESENT &&
  ['check-template-lock.mjs', 'maintainer-gates.mjs'].every((name) =>
    fs.existsSync(path.join(SCRIPTS, name)),
  )

// The scripts are plain ESM JavaScript with no type declarations, hence `any`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadScript(name: string): Promise<any> {
  if (!PRESENT) return {}
  return import(/* @vite-ignore */ pathToFileURL(path.join(SCRIPTS, name)).href)
}

const { templateLockProblems } = await loadScript('check-template-lock.mjs')
const { runGates, selectGates } = await loadScript('maintainer-gates.mjs')
const { readLock } = await loadCli('src/lib/lockfile.mjs')

interface LockRecord {
  class: string
  hash?: string
  since: string
}

interface Lock {
  template: string
  files: Record<string, LockRecord>
  regions: Record<string, Record<string, string>>
  ejected: string[]
  docs?: string[]
}

// Reading the tree and hashing every managed file takes a moment beside the
// rest of the suite.
vi.setConfig({ testTimeout: 30_000 })

describe.skipIf(!PRESENT)('check-template-lock', () => {
  const ROOT = process.cwd()
  const committed = (): Lock => structuredClone(readLock(ROOT))
  const problemsOf = (lock: Lock): string[] => templateLockProblems({ root: ROOT, lock }).problems

  /** What changing the lock adds to the report, and what it takes away. */
  function effectOf(change: (lock: Lock) => void) {
    const before = problemsOf(committed())
    const lock = committed()
    change(lock)
    const after = problemsOf(lock)
    return {
      added: after.filter((problem) => !before.includes(problem)),
      removed: before.filter((problem) => !after.includes(problem)),
    }
  }

  const BUTTON = 'src/modules/app/components/ui/UiButton.vue'
  const GENERATED = 'src/modules/invoices/index.ts'

  it('ignores a seeded record for a file a generator wrote outside what Vuestrata ships', () => {
    const effect = effectOf((lock) => {
      lock.files[GENERATED] = { class: 'seeded', since: '1.1.0' }
    })

    expect(effect).toEqual({ added: [], removed: [] })
  })

  it('still reports a tracked file that is neither shipped nor seeded', () => {
    const effect = effectOf((lock) => {
      lock.files[GENERATED] = { class: 'managed', hash: 'sha256-0', since: '1.1.0' }
    })

    expect(effect.added).toEqual([`${GENERATED} is tracked but no longer managed`])
  })

  it('fails a seeded record for a file under a managed directory, which the payload ships', () => {
    const effect = effectOf((lock) => {
      lock.files[BUTTON] = { class: 'seeded', since: '1.1.0' }
    })

    expect(effect.added).toEqual([
      expect.stringContaining(`${BUTTON} is recorded as seeded, but it is managed`),
    ])
  })

  it('fails a record whose class is not the one the file has', () => {
    const effect = effectOf((lock) => {
      const record = lock.files[BUTTON]
      if (record) record.class = 'merged'
    })

    expect(effect.added).toEqual([`${BUTTON} is recorded as merged, but it is managed`])
  })

  it('fails a registry region whose baseline is stale, or missing', () => {
    const [rel, regions] = Object.entries(committed().regions)[0] ?? []
    const name = Object.keys(regions ?? {})[0]
    expect(rel && name, 'the lockfile records no registry region').toBeTruthy()

    const stale = effectOf((lock) => {
      lock.regions[rel!]![name!] = 'sha256-stale'
    })
    expect(stale.added).toEqual([`${name} in ${rel} has changed since it was recorded`])

    const missing = effectOf((lock) => {
      delete lock.regions[rel!]![name!]
    })
    expect(missing.added).toEqual([`${name} in ${rel} is not recorded`])
  })

  it('fails a lockfile without the docs list, and one that names a page that is not there', () => {
    const unlisted = effectOf((lock) => {
      delete lock.docs
    })
    expect(unlisted.added).toEqual(['the docs/ pages are not listed'])

    const gone = effectOf((lock) => {
      lock.docs = [...(lock.docs ?? []), 'docs/99.never-written.md']
    })
    expect(gone.added).toEqual([
      'docs/99.never-written.md is listed as a docs page but does not exist',
    ])
  })

  it('fails a lockfile recorded at another version', () => {
    const lock = committed()
    const { problems } = templateLockProblems({ root: ROOT, lock, version: '99.0.0' })

    expect(problems).toContain(`records template ${lock.template}, but this repository is 99.0.0`)
  })
})

describe.skipIf(!PRESENT)('maintainer-gates', () => {
  it('runs every gate, including the ones after a failure, and reports each', () => {
    const second = vi.fn(() => 0)

    const { ok, results } = runGates([
      { name: 'first', run: () => 1 },
      { name: 'second', run: second },
    ])

    expect(second).toHaveBeenCalledOnce()
    expect(ok).toBe(false)
    expect(results).toEqual([
      { name: 'first', ok: false },
      { name: 'second', ok: true },
    ])
  })

  it('passes only when every gate exits 0', () => {
    expect(runGates([{ name: 'a', run: () => 0 }]).ok).toBe(true)
    expect(runGates([]).ok).toBe(true)
    // A process killed by a signal has no status.
    expect(runGates([{ name: 'a', run: () => null }]).ok).toBe(false)
  })

  it('counts a gate that throws as failed, and still runs the rest', () => {
    const { ok, results } = runGates([
      {
        name: 'throws',
        run: () => {
          throw new Error('spawn failed')
        },
      },
      { name: 'after', run: () => 0 },
    ])

    expect(ok).toBe(false)
    expect(results).toEqual([
      { name: 'throws', ok: false },
      { name: 'after', ok: true },
    ])
  })

  it('adds the maintainer-only tests when asked, and never to a plain run', () => {
    const names = (gates: Array<{ name: string }>) => gates.map((gate) => gate.name)

    expect(names(selectGates())).toEqual(['template-lock', 'payload', 'migration-files'])
    expect(names(selectGates({ withTests: true }))).toEqual([
      'template-lock',
      'payload',
      'migration-files',
      'maintainer-tests',
    ])
  })
})
