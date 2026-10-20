import fs from 'node:fs'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { CLI_PRESENT, loadCli, MAINTAINER } from './cli'
import { createFixture, type Fixture, writePayload } from './fixture'
import { atTag, hasTags, TAGS } from './release-tags'

const {
  default: migration = [],
  migrateDependencies,
  TABLE_DEPENDENCIES,
} = await loadCli('migrations/2.0.0/index.mjs')
const { runUpgrade } = await loadCli('src/commands/upgrade.mjs')
const { emptyLock, hashFor, readLock, writeLock } = await loadCli('src/lib/lockfile.mjs')
const { createPayloadSource } = await loadCli('src/lib/payload.mjs')
const { shippedCopy, SHIPPED_FILES } = await loadCli('migrations/2.0.0/shipped.mjs')

const VERSION = '2.0.0-alpha.0'
const HELPERS = ['useDataTable.ts', 'useServerTable.ts', 'table-columns.ts'].map(
  (name) => `src/modules/app/composables/${name}`,
)
const UI = 'src/modules/app/components/ui/UiDataTable.vue'
const FLAGS = { 'allow-dirty': true, 'no-format': true, json: true }
// Exercise the actual dependency, promotion and final guard steps with a tiny
// payload. Project example replacements have their own repository-backed proof.
const migrations = (
  CLI_PRESENT
    ? [
        ...migration.slice(0, 2),
        {
          ...migration[2],
          steps: migration[2].steps.filter((step: { kind?: string }) => step.kind === 'guard'),
        },
      ]
    : []
).map((group) => ({ ...group, version: '2.0.0' }))

let fixture: Fixture
let previousExitCode: typeof process.exitCode
let stdoutWrites: string[]

function previous(rel: string) {
  return fs.readFileSync(
    path.join(process.cwd(), 'test/fixtures/cli/table-1.1', `${path.basename(rel)}.txt`),
    'utf8',
  )
}

function prepare({ moved = false }: { moved?: boolean } = {}) {
  const lock = emptyLock('1.1.0-alpha.0')
  const packageSource =
    JSON.stringify(
      {
        name: 'my-project',
        version: '7.2.1',
        dependencies: {
          '@tanstack/vue-table': '^8.21.0',
          '@tanstack/vue-query': '^5.0.0',
          mylib: '^4.0.0',
        },
        devDependencies: { eslint: '^9.0.0' },
      },
      null,
      2,
    ) + '\n'
  fixture.write('package.json', packageSource)
  for (const rel of HELPERS) {
    const actual = moved ? rel.replace('src/modules/app', 'src/custom-app') : rel
    fixture.write(actual, previous(rel))
  }
  if (moved)
    fixture.write('vuestrata.config.json', JSON.stringify({ slots: { appDir: 'src/custom-app' } }))
  fixture.write(UI, 'old managed UI\n')
  lock.files[UI] = {
    class: 'managed',
    hash: hashFor(UI, 'old managed UI\n', 'managed'),
    since: '1.0.0',
  }
  writeLock(fixture.project, lock)
  const files = Object.fromEntries([...HELPERS, UI].map((rel) => [rel, `new native ${rel}\n`]))
  writePayload(fixture.payload, { version: VERSION, files })
  return { packageSource, lockSource: fixture.read('vuestrata.lock.json'), files }
}

function upgrade(apply = true, allSteps = false) {
  return runUpgrade({
    root: fixture.project,
    version: VERSION,
    flags: FLAGS,
    apply,
    migrations: allSteps
      ? migration.map((group: object) => ({ ...group, version: '2.0.0' }))
      : migrations,
    source: createPayloadSource(fixture.payload),
  })
}

beforeEach(() => {
  fixture = createFixture()
  previousExitCode = process.exitCode
  process.exitCode = undefined
  stdoutWrites = []
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    stdoutWrites.push(String(chunk))
    return true
  })
})

afterEach(() => {
  process.exitCode = previousExitCode
  vi.restoreAllMocks()
  fixture.cleanup()
})

describe.skipIf(!CLI_PRESENT)('2.0 native-table dependency migration', () => {
  it.runIf(MAINTAINER)(
    'ships current 2.0 project examples, including the QueryWeave bootstrap',
    () => {
      for (const rel of SHIPPED_FILES as string[]) {
        expect(shippedCopy(rel), rel).toBe(
          fs.readFileSync(path.join(process.cwd(), rel), 'utf8').replaceAll('\r\n', '\n'),
        )
      }
    },
  )
  it('pins runtime libraries, removes both old table packages and preserves unrelated settings', () => {
    const source = JSON.stringify({
      version: '9.0.0',
      scripts: { custom: 'ours' },
      dependencies: {
        '@tanstack/vue-query': '^5.0.0',
        '@tanstack/table-core': '^8.0.0',
        '@queryweave/testing': 'old',
      },
      devDependencies: {
        '@tanstack/vue-table': 'old',
        '@vueye-table/vue': 'old',
        custom: 'file:ours',
      },
    })
    const result = JSON.parse(migrateDependencies(source))
    expect(result.version).toBe('9.0.0')
    expect(result.scripts).toEqual({ custom: 'ours' })
    expect(result.dependencies).toEqual({ '@tanstack/vue-query': '^5.0.0', ...TABLE_DEPENDENCIES })
    expect(result.devDependencies).toEqual({
      custom: 'file:ours',
      '@queryweave/testing': '0.1.0-beta.5',
    })
    expect(migrateDependencies(JSON.stringify(result))).toBe(JSON.stringify(result))
  })

  it('retains CRLF when updating a Windows package file', () => {
    expect(migrateDependencies('{\r\n  "name": "ours"\r\n}\r\n')).toContain('\r\n')
    expect(
      migrateDependencies('{\r\n  "name": "ours"\r\n}\r\n').replaceAll('\r\n', ''),
    ).not.toContain('\n')
  })
})

describe.skipIf(!CLI_PRESENT)('2.0 native-table atomic upgrades', () => {
  it.skipIf(!hasTags).each(TAGS)('recognizes the pristine helper unit shipped by %s', (tag) => {
    prepare()
    for (const rel of HELPERS) {
      const released = atTag(tag, rel)
      expect(released).not.toBeNull()
      fixture.write(rel, released!)
    }
    const report = upgrade()
    expect(report.blockers).toEqual([])
    expect(
      report.adopted.filter((entry: { reason: string }) => entry.reason === 'promoted'),
    ).toHaveLength(3)
    expect(readLock(fixture.project).template).toBe(VERSION)
  })

  it('adopts the released helper unit and upgrades its files and dependencies together', () => {
    const { files } = prepare()
    const report = upgrade()
    expect(report.blockers).toEqual([])
    for (const rel of HELPERS) {
      expect(fixture.read(rel)).toBe(files[rel])
      expect(readLock(fixture.project).files[rel].class).toBe('managed')
    }
    expect(readLock(fixture.project).template).toBe(VERSION)
    expect(JSON.parse(fixture.read('package.json')).dependencies).toMatchObject(TABLE_DEPENDENCIES)
    const before = fixture.read('vuestrata.lock.json')
    expect(upgrade().blockers).toEqual([])
    expect(fixture.read('vuestrata.lock.json')).toBe(before)
  })

  it('blocks the whole release when one helper is edited, offering all three incoming copies', () => {
    const { packageSource, lockSource, files } = prepare()
    const edited = `${previous(HELPERS[0]!)}\n// application changes\n`
    fixture.write(HELPERS[0]!, edited)
    const report = upgrade()
    expect(report.blockers.map((entry: { rel: string }) => entry.rel)).toEqual(HELPERS)
    expect(process.exitCode).toBe(1)
    expect(fixture.read('package.json')).toBe(packageSource)
    expect(fixture.read('vuestrata.lock.json')).toBe(lockSource)
    expect(fixture.read(UI)).toBe('old managed UI\n')
    expect(fixture.read(HELPERS[0]!)).toBe(edited)
    for (const rel of HELPERS) expect(fixture.read(`.vuestrata/incoming/${rel}`)).toBe(files[rel])
    expect(stdoutWrites.join('')).toContain('"ok": false')
    expect(stdoutWrites.join('')).toContain('"apply": false')
  })

  it('keeps a partially merged incoming copy intact on a repeated blocked attempt', () => {
    prepare()
    fixture.write(HELPERS[1]!, `${previous(HELPERS[1]!)}\n// ours\n`)
    const incoming = `.vuestrata/incoming/${HELPERS[0]}`
    fixture.write(incoming, 'in-progress manual merge\n')
    upgrade()
    expect(fixture.read(incoming)).toBe('in-progress manual merge\n')
  })

  it('blocks edited managed table UI even when all helpers could be promoted', () => {
    const { packageSource, lockSource } = prepare()
    fixture.write(UI, 'old managed UI\n// restyled\n')
    expect(upgrade().blockers).toEqual([expect.objectContaining({ rel: UI })])
    expect(fixture.read('package.json')).toBe(packageSource)
    expect(fixture.read('vuestrata.lock.json')).toBe(lockSource)
    expect(fixture.read(HELPERS[0]!)).toBe(previous(HELPERS[0]!))
  })

  it.each(['deleted', 'ejected'])(
    'blocks %s protected UI without restoring or replacing it',
    (state) => {
      const { packageSource } = prepare()
      if (state === 'deleted') fixture.remove(UI)
      else {
        const lock = readLock(fixture.project)
        lock.ejected.push(UI)
        writeLock(fixture.project, lock)
      }
      const lockSource = fixture.read('vuestrata.lock.json')
      expect(upgrade().blockers).toEqual([expect.objectContaining({ rel: UI })])
      expect(fixture.read('package.json')).toBe(packageSource)
      expect(fixture.read('vuestrata.lock.json')).toBe(lockSource)
      expect(fixture.exists(UI)).toBe(state !== 'deleted')
      if (state === 'ejected') expect(fixture.read(UI)).toBe('old managed UI\n')
      expect(fixture.read(`.vuestrata/incoming/${UI}`)).toContain('new native')
    },
  )

  it('carries app exports through the protected merged UI barrel without blocking', () => {
    const { files } = prepare()
    const barrel = 'src/modules/app/components/ui/index.ts'
    const shipped =
      "export { default as UiDataTable } from './UiDataTable.vue'\n// app:ui-components-start\n// app:ui-components-end\n"
    const custom = shipped.replace(
      '// app:ui-components-end',
      "export { default as UiOwnTableCell } from './UiOwnTableCell.vue'\n// app:ui-components-end",
    )
    fixture.write(barrel, custom)
    const lock = readLock(fixture.project)
    lock.files[barrel] = {
      class: 'merged',
      hash: hashFor(barrel, shipped, 'merged'),
      since: '1.1.0',
    }
    writeLock(fixture.project, lock)
    writePayload(fixture.payload, { version: VERSION, files, merged: { [barrel]: shipped } })
    expect(upgrade().blockers).toEqual([])
    expect(fixture.read(barrel)).toContain('UiOwnTableCell')
  })

  it('keeps moved helpers in place and blocks canonical duplicates', () => {
    const { lockSource } = prepare({ moved: true })
    const report = upgrade()
    expect(report.blockers.map((entry: { rel: string }) => entry.rel)).toEqual(
      HELPERS.map((rel) => rel.replace('src/modules/app', 'src/custom-app')),
    )
    expect(fixture.read('vuestrata.lock.json')).toBe(lockSource)
    for (const rel of HELPERS) {
      expect(fs.existsSync(path.join(fixture.project, rel))).toBe(false)
      expect(fixture.read(rel.replace('src/modules/app', 'src/custom-app'))).toBe(previous(rel))
    }
  })

  it('resolves a moved UI component slot and blocks replacing the actual custom renderer', () => {
    const { packageSource } = prepare()
    const moved = 'src/project-ui/UiDataTable.vue'
    fixture.write(moved, 'our moved legacy table\n')
    fixture.remove(UI)
    fixture.write(
      'vuestrata.config.json',
      JSON.stringify({ slots: { uiComponents: 'src/project-ui' } }),
    )
    expect(upgrade().blockers).toEqual([expect.objectContaining({ rel: moved })])
    expect(fixture.read(moved)).toBe('our moved legacy table\n')
    expect(fixture.exists(UI)).toBe(false)
    expect(fixture.read('package.json')).toBe(packageSource)
    expect(fixture.read(`.vuestrata/incoming/${moved}`)).toContain('new native')
  })

  it('protects a project file that collides with a new private native renderer', () => {
    const { packageSource, files } = prepare()
    const renderer = 'src/modules/app/components/ui/table/NativeDataGrid.vue'
    fixture.write(renderer, '<template>Our existing table</template>\n')
    writePayload(fixture.payload, {
      version: VERSION,
      files: { ...files, [renderer]: 'new native grid\n' },
    })
    expect(upgrade().blockers).toEqual([expect.objectContaining({ rel: renderer })])
    expect(fixture.read(renderer)).toBe('<template>Our existing table</template>\n')
    expect(fixture.read('package.json')).toBe(packageSource)
    expect(fixture.read(`.vuestrata/incoming/${renderer}`)).toBe('new native grid\n')
  })

  it('previews blockers without writing even incoming review files', () => {
    const { lockSource } = prepare()
    fixture.write(UI, 'custom old UI\n')
    expect(upgrade(false).blockers).toHaveLength(1)
    expect(process.exitCode).toBeUndefined()
    expect(fs.existsSync(path.join(fixture.project, '.vuestrata/incoming'))).toBe(false)
    expect(fixture.read('vuestrata.lock.json')).toBe(lockSource)
  })

  it('migrates the pristine bootstrap and customer route with its feature and query model', () => {
    prepare()
    const route = 'src/modules/customers/pages/index.vue'
    fixture.write('src/main.ts', previous('main.ts'))
    fixture.write('vite.config.ts', previous('vite.config.ts'))
    fixture.write(route, previous('customers-index.vue'))
    const report = upgrade(true, true)
    expect(report.blockers).toEqual([])
    expect(fixture.read('src/main.ts')).toContain('beforeMount: installQueryState')
    expect(fixture.read('vite.config.ts')).toContain('@vueye-table')
    expect(fixture.read(route)).toContain('useListRouteState(customersListQueryModel)')
    expect(fixture.read(route)).not.toContain('useServerTable')
    expect(fixture.read('src/modules/customers/components/CustomersScreen.vue')).toContain(
      'useServerTable',
    )
    expect(fixture.read('src/modules/customers/query-model.ts')).toContain('defineListQueryModel')
    expect(report.incoming).toEqual([])
    const lockSource = fixture.read('vuestrata.lock.json')
    const repeated = upgrade(true, true)
    expect(repeated.incoming).toEqual([])
    expect(repeated.notes).toEqual([])
    expect(fixture.read('vuestrata.lock.json')).toBe(lockSource)
  })

  it('preserves an edited route and offers both its feature and model for a manual merge', () => {
    prepare()
    const route = 'src/modules/customers/pages/index.vue'
    const edited = `${previous('customers-index.vue')}\n<!-- project custom actions -->\n`
    fixture.write(route, edited)
    const report = upgrade(true, true)
    expect(report.blockers).toEqual([])
    expect(fixture.read(route)).toBe(edited)
    expect(fixture.exists('src/modules/customers/components/CustomersScreen.vue')).toBe(false)
    expect(report.incoming.map((entry: { rel: string }) => entry.rel)).toEqual([
      route,
      'src/modules/customers/components/CustomersScreen.vue',
      'src/modules/customers/query-model.ts',
    ])
    expect(fixture.read(`.vuestrata/incoming/${route}`)).toContain('useListRouteState')
    expect(fixture.read('.vuestrata/incoming/src/modules/customers/query-model.ts')).toContain(
      'defineListQueryModel',
    )
  })

  it('preserves a colliding application-owned feature and holds back its pristine route', () => {
    prepare()
    const route = 'src/modules/customers/pages/index.vue'
    const feature = 'src/modules/customers/components/CustomersScreen.vue'
    fixture.write(route, previous('customers-index.vue'))
    fixture.write(feature, '<template>Our customer feature</template>\n')
    const report = upgrade(true, true)
    expect(report.blockers).toEqual([])
    expect(fixture.read(route)).toBe(previous('customers-index.vue'))
    expect(fixture.read(feature)).toBe('<template>Our customer feature</template>\n')
    expect(fixture.read(`.vuestrata/incoming/${feature}`)).toContain('useServerTable')
  })

  it('blocks a custom bootstrap without the QueryWeave installer and never changes dependencies', () => {
    const { packageSource, lockSource } = prepare()
    const main = `${previous('main.ts')}\n// beforeMount: installQueryState\nconst example = 'installQueryState(app)'\n`
    fixture.write('src/main.ts', main)
    const report = upgrade(true, true)
    expect(report.blockers).toEqual([expect.objectContaining({ rel: 'src/main.ts' })])
    expect(fixture.read('src/main.ts')).toBe(main)
    expect(fixture.read('package.json')).toBe(packageSource)
    expect(fixture.read('vuestrata.lock.json')).toBe(lockSource)
    expect(fixture.read('.vuestrata/incoming/src/main.ts')).toContain(
      'beforeMount: installQueryState',
    )
  })

  it('accepts an installer composed with an existing hook and preserves URL strings', () => {
    prepare()
    const main = previous('main.ts').replace(
      'void boot(App)',
      "const origin = 'https://example.com'\nvoid boot(App, { beforeMount: (app) => { installQueryState(app); setupOwnPlugin(app, origin) } })",
    )
    fixture.write('src/main.ts', main)
    expect(upgrade(true, true).blockers).toEqual([])
    expect(fixture.read('src/main.ts')).toBe(main)
  })

  it.each([
    'function unused(app) { installQueryState(app) }\nvoid boot(App, { beforeMount: setupOwnPlugin })',
    'void boot(App, { beforeMount: (app) => { const unused = () => installQueryState(app); setupOwnPlugin(app) } })',
    'function unused() { void boot(App, { beforeMount: installQueryState }) }\nvoid boot(App, { beforeMount: setupOwnPlugin })',
    'void boot(App, { beforeMount: (app) => { return setupOwnPlugin(app); installQueryState(app) } })',
    'void boot(App, { beforeMount: (app) => { if (true) return; installQueryState(app) } })',
  ])('blocks installer references outside the executed boot hook: %s', (boot) => {
    const { packageSource, lockSource } = prepare()
    const main = previous('main.ts').replace('void boot(App)', boot)
    fixture.write('src/main.ts', main)
    expect(upgrade(true, true).blockers).toEqual([expect.objectContaining({ rel: 'src/main.ts' })])
    expect(fixture.read('package.json')).toBe(packageSource)
    expect(fixture.read('vuestrata.lock.json')).toBe(lockSource)
  })
})
