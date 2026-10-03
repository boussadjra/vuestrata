import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { CLI_PRESENT, loadCli, MAINTAINER } from './cli'
import { createFixture, type Fixture, hash, writePayload } from './fixture'
import { atTag, FROM, hasTags, inRepo, lf, REPO, TAG, TAGS } from './release-tags'

// Loaded rather than imported, so a project without `packages/cli` skips this
// file instead of failing to collect it.
const { runUpgrade } = await loadCli('src/commands/upgrade.mjs')
const { emptyLock, fileStatus, readLock, writeLock } = await loadCli('src/lib/lockfile.mjs')
const { collectMigrationsAsync } = await loadCli('src/lib/migrations.mjs')
const { createPayloadSource } = await loadCli('src/lib/payload.mjs')
const { readRegion, SENTINELS } = await loadCli('src/lib/registry.mjs')
const { PERMISSIONS_PRISTINE } = await loadCli('migrations/1.1.0/rbac-eject.mjs')
const { buildPayload } = await loadCli('scripts/build-payload.mjs')

/**
 * A project that ran `vuestrata eject` on 1.0, upgraded.
 *
 * The 1.0 `eject` struck the removed modules' permissions from the union in
 * core/lib/rbac/types.ts and their grants from inheritance.ts. Both files are
 * Vuestrata's, so the upgrade used to keep them as edited, and this release
 * does not compile beside a 1.0 types.ts. The migration takes the two files
 * back when they differ from 1.0 by exactly what that `eject` removes, and
 * withdraws the permissions in rbac.overrides.ts instead (rbac-eject.mjs).
 *
 * Most cases here build the ejected files by hand from the 1.0 copies the
 * migration carries, so they run anywhere. The last suite does it for real: the
 * 1.0.1-alpha.6 tree, ejected by its own CLI, upgraded by this one.
 */

vi.setConfig({ testTimeout: 60_000 })

const FLAGS = { 'allow-dirty': true, 'no-format': true }
const TO = '1.1.0-alpha.0'

const UNION = 'src/modules/core/lib/rbac/types.ts'
const GRANTS = 'src/modules/core/lib/rbac/inheritance.ts'
const OVERRIDES = 'src/modules/app/config/rbac.overrides.ts'
const INHERITANCE_PRISTINE =
  'sha256-1af539fb21e7ec6c871a4f199bde7f1f5d9fee1f39a1626a21a6d0e2e60747df'

/** The 1.0 files, as the migration carries them. */
const released10 = (name: string) =>
  lf(inRepo(`packages/cli/migrations/1.1.0/released-1.0/${name}.txt`))

/** What a full `eject` withdrew on 1.0: the permissions of the seven demo modules. */
const EJECTED = [
  'calendar:manage',
  'calendar:read',
  'catalog:manage',
  'catalog:read',
  'customers:manage',
  'customers:read',
  'messages:read',
  'orders:manage',
  'orders:read',
  'projects:manage',
  'projects:read',
  'reports:export',
  'reports:read',
  'team:read',
]

/** The union as the 1.0 `eject` leaves it: the members gone, the rest untouched. */
function ejectedUnion(literals = EJECTED, source = released10('rbac-types.ts')) {
  return source
    .split('\n')
    .filter((line) => !literals.some((literal) => line.trim() === `| '${literal}'`))
    .join('\n')
}

/**
 * The grants as the 1.0 `eject` leaves them, before any formatter: whole lines
 * gone, an emptied array over two lines, and a comma left behind in the one
 * array that is written on a single line.
 */
function ejectedGrants(literals = EJECTED, source = released10('rbac-inheritance.ts')) {
  return source
    .split('\n')
    .filter((line) => !literals.some((literal) => line.trim() === `'${literal}',`))
    .map((line) =>
      line.includes('delta:')
        ? line.replace(/'([^']+)',?\s*/g, (whole, literal) =>
            literals.includes(literal) ? '' : whole,
          )
        : line,
    )
    .join('\n')
}

/** What the formatter makes of those two files on the first commit after `eject`. */
const formattedUnion = (source: string) =>
  source.replace('\n  // ─── Domain modules', '\n// ─── Domain modules')
const formattedGrants = (source: string) =>
  source
    .replace('    delta: [\n    ],', '    delta: [],')
    .replace("delta: ['users:read', 'settings:read', ],", "delta: ['users:read', 'settings:read'],")

interface Note {
  rel?: string
  text: string
}

interface Report {
  notes: Note[]
  incoming: Array<{ rel: string; incoming: string }>
  adopted: Array<{ rel: string; class: string; reason: string }>
  written: Array<{ rel: string; reason: string }>
  migrations: Array<{ description: string; changed: string[] }>
}

const withdrawnIn = (source: string): string[] =>
  readRegion(source, SENTINELS.withdrawn).map((line: string) => line.replace(/^'|',$/g, ''))

const texts = (report: Report) => report.notes.map((note) => note.text)
const changedBy = (report: Report) =>
  report.migrations.find((entry) => entry.description.includes('1.0 eject'))?.changed ?? []

describe.skipIf(!CLI_PRESENT)('the 1.0 files the migration carries', () => {
  it('hash to what 1.0.1-alpha.5 and 1.0.1-alpha.6 shipped', () => {
    expect(PERMISSIONS_PRISTINE).toEqual([hash(released10('rbac-types.ts'))])
    expect(hash(released10('rbac-inheritance.ts'))).toBe(INHERITANCE_PRISTINE)
  })

  it.skipIf(!hasTags)('are the files at both tags', () => {
    for (const tag of TAGS) {
      expect(lf(atTag(tag, UNION)!)).toBe(released10('rbac-types.ts'))
      expect(lf(atTag(tag, GRANTS)!)).toBe(released10('rbac-inheritance.ts'))
    }
  })

  it('still hold every built-in permission this release ships', () => {
    // What the step restores is replaced by this release's union. If a release
    // dropped a built-in, a project that had kept it would lose it silently.
    const members = (source: string) =>
      [...source.matchAll(/^\s*\|\s*'([^']+)'\s*$/gm)].map((match) => match[1])

    expect(members(lf(inRepo(UNION)))).toEqual(
      expect.arrayContaining(members(released10('rbac-types.ts'))),
    )
  })
})

describe.skipIf(!CLI_PRESENT)('upgrading a project that ran eject on 1.0', () => {
  let fixture: Fixture

  beforeEach(() => {
    fixture = createFixture()
  })

  afterEach(() => {
    fixture.cleanup()
  })

  /** A 1.0 project holding the two files as given, tracked as 1.0 wrote them. */
  function seed({ union, grants }: { union: string; grants: string }) {
    fixture.write(UNION, union)
    fixture.write(GRANTS, grants)
    writeLock(fixture.project, {
      ...emptyLock(FROM),
      files: {
        [UNION]: { class: 'managed', hash: PERMISSIONS_PRISTINE[0], since: FROM },
        [GRANTS]: { class: 'managed', hash: INHERITANCE_PRISTINE, since: FROM },
      },
    })
  }

  async function upgrade({ seeded = true } = {}): Promise<Report> {
    return runUpgrade({
      root: fixture.project,
      version: TO,
      flags: FLAGS,
      apply: true,
      source: writePayload(fixture.payload, {
        version: TO,
        files: { [GRANTS]: inRepo(GRANTS) },
        merged: { [UNION]: inRepo(UNION) },
        seeded: seeded ? { [OVERRIDES]: inRepo(OVERRIDES) } : {},
      }),
      migrations: await collectMigrationsAsync(FROM, TO),
    })
  }

  const isClean = (rel: string) => {
    const lock = readLock(fixture.project)
    return fileStatus(rel, lock.files[rel], fixture.read(rel)) === 'clean'
  }

  it.each([
    ['as eject wrote them', (source: string) => source, (source: string) => source],
    ['after the formatter', formattedUnion, formattedGrants],
  ])('takes the two files back, %s, and withdraws what eject removed', async (_, union, grants) => {
    seed({ union: union(ejectedUnion()), grants: grants(ejectedGrants()) })

    const report = await upgrade()

    // This release's files, tracked as clean: the next release updates them.
    expect(lf(fixture.read(UNION))).toBe(lf(inRepo(UNION)))
    expect(lf(fixture.read(GRANTS))).toBe(lf(inRepo(GRANTS)))
    expect(isClean(UNION)).toBe(true)
    expect(isClean(GRANTS)).toBe(true)
    expect(readLock(fixture.project).files[UNION].class).toBe('merged')

    // The project keeps exactly the permission set it had.
    expect(withdrawnIn(fixture.read(OVERRIDES))).toEqual(EJECTED)
    expect(readLock(fixture.project).files[OVERRIDES]).toEqual({ class: 'seeded', since: TO })

    expect(report.incoming).toEqual([])
    expect(texts(report).join('\n')).not.toMatch(/TYPE-CHECK|merged file/)
    expect(changedBy(report).toSorted()).toEqual([OVERRIDES, GRANTS, UNION].toSorted())
  })

  it('is a formatted shape the formatter really produces', () => {
    // The two helpers above must change something, or the case proves nothing.
    expect(formattedUnion(ejectedUnion())).not.toBe(ejectedUnion())
    expect(formattedGrants(ejectedGrants())).not.toBe(ejectedGrants())
    expect(ejectedGrants()).toContain("delta: ['users:read', 'settings:read', ],")
  })

  it('does nothing the second time', async () => {
    seed({ union: ejectedUnion(), grants: ejectedGrants() })
    await upgrade()
    const overrides = fixture.read(OVERRIDES)

    const again = await upgrade()

    expect(changedBy(again)).toEqual([])
    expect(again.written).toEqual([])
    expect(again.incoming).toEqual([])
    expect(fixture.read(OVERRIDES)).toBe(overrides)
  })

  it('takes back a partial eject (--keep) with only what it removed', async () => {
    const removed = ['customers:manage', 'customers:read']
    seed({ union: ejectedUnion(removed), grants: ejectedGrants(removed) })

    await upgrade()

    expect(withdrawnIn(fixture.read(OVERRIDES))).toEqual(removed)
    expect(lf(fixture.read(GRANTS))).toBe(lf(inRepo(GRANTS)))
  })

  it("keeps the permissions the project's own modules added to the app: region", async () => {
    // What `add module invoices` wrote on 1.0, and the formatter then indented.
    const withModule = (source: string) =>
      source.replace(
        '// app:permissions-start\n',
        "  // app:permissions-start\n  | 'invoices:read'\n  | 'invoices:manage'\n",
      )
    seed({ union: withModule(ejectedUnion()), grants: ejectedGrants() })

    const report = await upgrade()

    expect(report.incoming).toEqual([])
    expect(fixture.read(UNION)).toContain("| 'invoices:read'\n  | 'invoices:manage'\n")
    expect(fixture.read(UNION)).toContain('export interface AppPermissions')
    expect(isClean(UNION)).toBe(true)
    expect(withdrawnIn(fixture.read(OVERRIDES))).toEqual(EJECTED)
  })

  it('adds to an rbac.overrides.ts the project already has, once', async () => {
    seed({ union: ejectedUnion(), grants: ejectedGrants() })
    fixture.write(
      OVERRIDES,
      inRepo(OVERRIDES).replace(
        '// app:withdrawn-start\n',
        "// app:withdrawn-start\n    'billing:manage',\n    'team:read',\n",
      ),
    )

    await upgrade()

    const withdrawn = withdrawnIn(fixture.read(OVERRIDES))
    expect(withdrawn.toSorted()).toEqual([...EJECTED, 'billing:manage'].toSorted())
    expect(withdrawn.filter((literal) => literal === 'team:read')).toHaveLength(1)
  })

  it('keeps the line endings of a CRLF checkout', async () => {
    seed({
      union: ejectedUnion().replaceAll('\n', '\r\n'),
      grants: ejectedGrants().replaceAll('\n', '\r\n'),
    })

    const report = await upgrade()

    expect(report.incoming).toEqual([])
    expect(withdrawnIn(lf(fixture.read(OVERRIDES)))).toEqual(EJECTED)
    expect(isClean(GRANTS)).toBe(true)
  })

  it('leaves an untouched 1.0 project to the ordinary upgrade', async () => {
    seed({ union: released10('rbac-types.ts'), grants: released10('rbac-inheritance.ts') })

    const report = await upgrade()

    expect(changedBy(report)).toEqual([])
    expect(withdrawnIn(fixture.read(OVERRIDES))).toEqual([])
    expect(lf(fixture.read(UNION))).toBe(lf(inRepo(UNION)))
    expect(texts(report).join('\n')).not.toMatch(/TYPE-CHECK/)
  })

  describe('when the files differ in some other way too', () => {
    /** One note, about the union, and the two files as they were, with copies to merge. */
    function expectHeldBack(report: Report, before: { union: string; grants: string }) {
      expect(fixture.read(UNION)).toBe(before.union)
      expect(fixture.read(GRANTS)).toBe(before.grants)
      expect(report.incoming.map((entry) => entry.rel).toSorted()).toEqual([GRANTS, UNION])
      expect(lf(fixture.read(`.vuestrata/incoming/${UNION}`))).toContain('AppPermissions')

      const notes = report.notes.filter((note) => note.rel === UNION)
      expect(notes).toHaveLength(1)
      expect(notes[0]!.text).toMatch(/^THE PROJECT WILL NOT TYPE-CHECK UNTIL THIS IS DONE/)
      expect(notes[0]!.text).toContain(`vuestrata adopt ${UNION} ${GRANTS}`)
      expect(notes[0]!.text).toContain('If you ran eject on 1.0')
      // Not the generic note as well: one file, one note.
      expect(texts(report).join('\n')).not.toMatch(/becomes a merged file/)
      return notes[0]!.text
    }

    it('says so when the project also added a permission to the union by hand', async () => {
      const before = {
        union: ejectedUnion().replace(
          "  | 'audit:read'\n",
          "  | 'audit:read'\n  | 'invoices:read'\n",
        ),
        grants: ejectedGrants().replace(
          "delta: ['dashboard:read'],",
          "delta: ['dashboard:read', 'invoices:read'],",
        ),
      }
      seed(before)

      const note = expectHeldBack(await upgrade(), before)

      // What eject removed, to list under `withdrawn`; what was added, to declare.
      expect(note).toContain("'customers:read'")
      expect(note).toContain('under `withdrawn`')
      expect(note).toMatch(/under `permissions`[^;]*'invoices:read'/)
      // Nothing was written for it: the project decides.
      expect(withdrawnIn(fixture.read(OVERRIDES))).toEqual([])
    })

    it('says so when the grants were edited beyond what eject removes', async () => {
      const before = {
        union: ejectedUnion(),
        grants: ejectedGrants().replace(
          "delta: ['users:delete'],",
          "delta: ['users:delete', 'audit:read'],",
        ),
      }
      seed(before)

      const note = expectHeldBack(await upgrade(), before)

      expect(note).toContain("'team:read'")
      expect(note).not.toContain('under `permissions`')
    })

    it('says so when the lock does not hold the files as 1.0 wrote them', async () => {
      const before = { union: ejectedUnion(), grants: ejectedGrants() }
      seed(before)
      // A lock from some other release of the grants: putting the 1.0 text back
      // would read as an edit, and it would be the upgrade's own.
      const lock = readLock(fixture.project)
      lock.files[GRANTS].hash = `sha256-${'0'.repeat(64)}`
      writeLock(fixture.project, lock)

      expectHeldBack(await upgrade(), before)
      expect(withdrawnIn(fixture.read(OVERRIDES))).toEqual([])
    })

    it('says so when rbac.overrides.ts has lost its withdrawn region', async () => {
      const before = { union: ejectedUnion(), grants: ejectedGrants() }
      seed(before)
      fixture.write(OVERRIDES, 'export default {}\n')

      const note = expectHeldBack(await upgrade(), before)

      expect(note).toContain("'customers:read'")
      expect(fixture.read(OVERRIDES)).toBe('export default {}\n')
    })

    it('says so for a union edited by hand in a project that never ejected', async () => {
      const before = {
        union: released10('rbac-types.ts').replace(
          "  | 'audit:read'\n",
          "  | 'audit:read'\n  | 'invoices:read'\n",
        ),
        grants: released10('rbac-inheritance.ts'),
      }
      seed(before)

      const report = await upgrade()

      // The grants were untouched, so they are simply updated.
      expect(fixture.read(UNION)).toBe(before.union)
      expect(lf(fixture.read(GRANTS))).toBe(lf(inRepo(GRANTS)))
      const notes = report.notes.filter((note) => note.rel === UNION)
      expect(notes).toHaveLength(1)
      expect(notes[0]!.text).toMatch(/WILL NOT TYPE-CHECK/)
      expect(notes[0]!.text).toMatch(/under `permissions`[^;]*'invoices:read'/)
      expect(notes[0]!.text).not.toContain('under `withdrawn`')
    })

    it('is silent about grants edited alone: the release compiles beside them', async () => {
      const before = {
        union: released10('rbac-types.ts'),
        grants: released10('rbac-inheritance.ts').replace(
          "delta: ['users:delete'],",
          "delta: ['users:delete', 'audit:read'],",
        ),
      }
      seed(before)

      const report = await upgrade()

      expect(fixture.read(GRANTS)).toBe(before.grants)
      expect(report.incoming.map((entry) => entry.rel)).toEqual([GRANTS])
      expect(texts(report).join('\n')).not.toMatch(/TYPE-CHECK/)
    })
  })
})

// The real thing: the 1.0.1-alpha.6 tree, ejected by the CLI that release
// shipped, upgraded by this one from the payload this repository builds. For
// maintainers, where the tags and a pristine checkout are.
describe.skipIf(!CLI_PRESENT || !hasTags || !MAINTAINER)(
  'the 1.0.1-alpha.6 tree, ejected by its own CLI and upgraded by this one',
  () => {
    vi.setConfig({ testTimeout: 300_000, hookTimeout: 300_000 })

    let fixture: Fixture

    beforeEach(() => {
      fixture = createFixture()
    })

    afterEach(() => {
      fixture.cleanup()
    })

    const run = (command: string, args: string[], options: object = {}) => {
      const result = spawnSync(command, args, {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        ...options,
      })
      if (result.status !== 0) {
        throw new Error(`${command} ${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`)
      }
      return result.stdout
    }

    /** The release's whole tree in the fixture, through an index of its own. */
    function checkOutRelease() {
      const env = { ...process.env, GIT_INDEX_FILE: path.join(fixture.project, '..', 'index') }
      run('git', ['read-tree', TAG], { cwd: REPO, env })
      run('git', ['checkout-index', '-a', `--prefix=${fixture.project.replaceAll('\\', '/')}/`], {
        cwd: REPO,
        env,
      })
      // The one package the 1.0 CLI imports. It has no dependencies of its own.
      fs.cpSync(
        fs.realpathSync(path.join(REPO, 'node_modules/consola')),
        path.join(fixture.project, 'node_modules/consola'),
        { recursive: true },
      )
    }

    /** The CLI that 1.0.1-alpha.6 shipped, run in the project it shipped with. */
    const cli10 = (...args: string[]) =>
      run(process.execPath, ['packages/cli/src/index.mjs', ...args], { cwd: fixture.project })

    it('ends with the release’s rbac files, clean, and the permissions withdrawn', async () => {
      checkOutRelease()
      cli10('init', '--force', '--pristine', '--no-format')
      const before = lf(fixture.read(UNION))

      cli10('eject', '--allow-dirty')

      const members = (source: string) =>
        [...source.matchAll(/^\s*\|\s*'([^']+)'\s*$/gm)].map((match) => match[1]!)
      const ejected = lf(fixture.read(UNION))
      const removed = members(before).filter((literal) => !members(ejected).includes(literal))
      expect(removed.toSorted()).toEqual(EJECTED)
      // The shape this file's hand-built cases stand on is the one eject writes.
      expect(ejected).toBe(ejectedUnion())
      expect(lf(fixture.read(GRANTS))).toBe(ejectedGrants())

      buildPayload({ repoRoot: REPO, payloadRoot: fixture.payload })
      const report: Report = runUpgrade({
        root: fixture.project,
        version: TO,
        flags: FLAGS,
        apply: true,
        source: createPayloadSource(fixture.payload),
        migrations: await collectMigrationsAsync(FROM, TO),
      })

      expect(lf(fixture.read(UNION))).toBe(lf(inRepo(UNION)))
      expect(lf(fixture.read(GRANTS))).toBe(lf(inRepo(GRANTS)))
      expect(withdrawnIn(lf(fixture.read(OVERRIDES)))).toEqual(EJECTED)

      const lock = readLock(fixture.project)
      for (const rel of [UNION, GRANTS]) {
        expect(fileStatus(rel, lock.files[rel], fixture.read(rel))).toBe('clean')
      }
      expect(report.incoming.filter((entry) => entry.rel.includes('/rbac/'))).toEqual([])
      expect(texts(report).join('\n')).not.toMatch(/TYPE-CHECK/)
    })
  },
)
