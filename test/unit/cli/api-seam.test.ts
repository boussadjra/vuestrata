import fs from 'node:fs'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'

import { CLI_PRESENT, loadCli } from './cli'
import { createFixture, hash, writePayload, type Fixture } from './fixture'

// Loaded rather than imported, so a project without `packages/cli` skips this
// file instead of failing to collect it.
const { diagnose } = await loadCli('src/commands/doctor.mjs')
const { runUpgrade } = await loadCli('src/commands/upgrade.mjs')
const { API_WIRING_STEPS, isApiWired, stripComments } = await loadCli('src/lib/api-wiring.mjs')
const { emptyLock, readLock, writeLock } = await loadCli('src/lib/lockfile.mjs')
const { classify, SEEDED_FILES } = await loadCli('src/lib/managed.mjs')
const { DEFAULT_SLOTS, loadManifest, missingSlots, SEEDED_SLOTS } =
  await loadCli('src/lib/manifest.mjs')
const { ANCHORED_REGISTRIES } = await loadCli('src/lib/registry.mjs')

/**
 * `app/config/api.overrides.ts` as the CLI sees it: a seeded file with a slot,
 * written once by an upgrade, and installed by `bootstrap/seams.ts`.
 *
 * The last part is the one that can go wrong without a sound. A project that
 * edited `seams.ts` keeps its copy across the upgrade that introduces the seam,
 * and then the backend conventions it describes do nothing: the API client
 * quietly uses its defaults. `doctor` is what says so.
 */

const OVERRIDES = 'src/modules/app/config/api.overrides.ts'
const SEAMS = 'src/modules/app/bootstrap/seams.ts'

const real = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8')

let fixture: Fixture

beforeEach(() => {
  fixture = createFixture()
})

afterEach(() => {
  fixture.cleanup()
})

describe.skipIf(!CLI_PRESENT)('the api.overrides.ts seam', () => {
  it('is a seeded file, and a slot a project may lack until it upgrades', () => {
    expect(DEFAULT_SLOTS.apiOverrides).toBe(OVERRIDES)
    expect(SEEDED_FILES).toContain(OVERRIDES)
    expect(SEEDED_SLOTS).toContain('apiOverrides')
    expect(classify(OVERRIDES)).toBe('seeded')

    const missing = missingSlots(loadManifest(fixture.project)).map(
      (entry: { slot: string }) => entry.slot,
    )
    expect(missing).not.toContain('apiOverrides')
  })

  it('can be moved with the manifest', () => {
    fixture.write(
      'vuestrata.config.json',
      JSON.stringify({ slots: { apiOverrides: 'src/config/api.ts' } }),
    )

    expect(loadManifest(fixture.project).slots.apiOverrides).toBe('src/config/api.ts')
  })

  it('ships empty, importing only from managed core/lib', () => {
    const source = real(OVERRIDES)

    expect(source).toMatch(/^export default defineApiOverrides\(\{\}\)$/m)
    // The seam holds data; its types come from a file Vuestrata keeps current,
    // so a release can add an option without breaking a project's copy.
    const imports = source.split('\n').filter((line) => line.startsWith('import '))
    expect(imports).toEqual(["import { defineApiOverrides } from '~/lib/api/integration'"])
    expect(classify('src/modules/core/lib/api/integration.ts')).toBe('managed')
  })

  it('carries no registry regions: nothing appends to it', () => {
    expect(
      ANCHORED_REGISTRIES.some((registry: { slot: string }) => registry.slot === 'apiOverrides'),
    ).toBe(false)
    expect(real(OVERRIDES)).not.toMatch(/(?:app|vuestrata):[a-z-]+-start/)
  })

  it('is installed by the seams file this release ships', () => {
    expect(classify(SEAMS)).toBe('managed')
    expect(isApiWired(real(SEAMS))).toBe(true)
  })

  it('is written by an upgrade to a project that lacks it, and never rewritten', () => {
    writeLock(fixture.project, emptyLock('1.1.0'))
    const upgradeTo = (version: string, contents: string) =>
      runUpgrade({
        root: fixture.project,
        version,
        flags: { 'allow-dirty': true, 'no-format': true },
        apply: true,
        source: writePayload(fixture.payload, { version, seeded: { [OVERRIDES]: contents } }),
        migrations: [],
      })

    upgradeTo('1.2.0', 'export default defineApiOverrides({})\n')
    expect(fixture.read(OVERRIDES)).toBe('export default defineApiOverrides({})\n')
    expect(readLock(fixture.project).files[OVERRIDES]).toEqual({ class: 'seeded', since: '1.2.0' })

    fixture.write(OVERRIDES, 'export default defineApiOverrides({ timeoutMs: 5_000 })\n')
    upgradeTo('1.3.0', 'export default defineApiOverrides({ tracing: false })\n')

    expect(fixture.read(OVERRIDES)).toBe(
      'export default defineApiOverrides({ timeoutMs: 5_000 })\n',
    )
  })
})

describe.skipIf(!CLI_PRESENT)('isApiWired', () => {
  it('recognises the call that installs the integration', () => {
    expect(isApiWired('  installApiIntegration(resolveApiIntegration(apiOverrides))\n')).toBe(true)
    expect(isApiWired('installApiIntegration (\n  resolved,\n)')).toBe(true)
  })

  it('is not fooled by an import, a comment about it, or a longer name', () => {
    expect(isApiWired("import { installApiIntegration } from '~/lib/runtime'\n")).toBe(false)
    expect(isApiWired('// TODO: installApiIntegration here\n')).toBe(false)
    expect(isApiWired('reinstallApiIntegration(x)\n')).toBe(false)
  })

  it('does not count a call that was commented out', () => {
    const call = 'installApiIntegration(resolveApiIntegration(apiOverrides))'

    expect(isApiWired(`  // ${call}\n`)).toBe(false)
    expect(isApiWired(`  doSomething() // ${call}\n`)).toBe(false)
    expect(isApiWired(`/*\n  ${call}\n*/\n`)).toBe(false)
    expect(isApiWired(`/** Was: ${call} */\nexport function installSeams() {}\n`)).toBe(false)
    // A comment that is never closed hides everything after it.
    expect(isApiWired(`/* ${call}`)).toBe(false)
  })

  it('still counts a call that only has comments around it', () => {
    const call = 'installApiIntegration(resolveApiIntegration(apiOverrides))'

    expect(isApiWired(`// the API seam\n${call} // installs it\n`)).toBe(true)
    expect(isApiWired(`/* before */ ${call} /* after */`)).toBe(true)
    expect(isApiWired('installApiIntegration/* why */(resolved)')).toBe(true)
  })

  it('does not take a // inside a string for the start of a comment', () => {
    const call = 'installApiIntegration(resolveApiIntegration(apiOverrides))'

    expect(isApiWired(`const docs = 'https://vuestrata.dev'; ${call}\n`)).toBe(true)
    expect(isApiWired(`const a = "//"; const b = \`/* \${x}\`; ${call}\n`)).toBe(true)
    expect(isApiWired(`const quote = 'it\\'s // fine'; ${call}\n`)).toBe(true)
  })

  it('does not count a call that only exists as text', () => {
    const call = 'installApiIntegration(resolveApiIntegration(apiOverrides))'

    expect(isApiWired(`const hint = '${call}'\n`)).toBe(false)
    expect(isApiWired(`const hint = "// ${call}"\n`)).toBe(false)
    expect(isApiWired(`logger.warn(\`add ${call} to installSeams()\`)\n`)).toBe(false)
  })

  it('strips comments, and string contents only when asked', () => {
    expect(stripComments('a // b\nc /* d */ e\n')).toBe('a \nc   e\n')
    expect(stripComments("'// kept' // dropped")).toBe("'// kept' ")
    expect(stripComments("f('a\\'b', \"c\") // dropped", { strings: false })).toBe('f(\'\', "") ')
  })
})

describe.skipIf(!CLI_PRESENT)('doctor and an api.overrides.ts that nothing installs', () => {
  // The file as it was before the seam existed, and with the line that installs it.
  const UNWIRED = 'export function installSeams(): void {\n  // Intentionally empty.\n}\n'
  const WIRED = UNWIRED.replace(
    '// Intentionally empty.',
    'installApiIntegration(resolveApiIntegration(apiOverrides))',
  )
  const UNINSTALLED = /api\.overrides\.ts exists, but .*bootstrap\/seams\.ts does not install it/

  const warningsOf = (options: { source?: unknown; migrations?: unknown[] } = {}) =>
    diagnose({ root: fixture.project, version: '1.2.0', migrations: [], ...options }).warnings.join(
      '\n',
    )

  beforeEach(() => {
    fixture.write(OVERRIDES, 'export default defineApiOverrides({ timeoutMs: 5_000 })\n')
  })

  it('warns when the project edited seams.ts before the seam existed', () => {
    fixture.write(SEAMS, `${UNWIRED}// ours\n`)
    writeLock(fixture.project, emptyLock('1.2.0'))

    const text = warningsOf()
    expect(text).toMatch(UNINSTALLED)
    // The change itself, so the warning can be acted on without the docs.
    expect(text).toContain(API_WIRING_STEPS)
    expect(text).toContain('installApiIntegration(resolveApiIntegration(apiOverrides')
    expect(text).toContain("import apiOverrides from '~/config/api.overrides'")
  })

  it('warns in a project that is not tracked yet', () => {
    fixture.write(SEAMS, UNWIRED)

    expect(warningsOf()).toMatch(UNINSTALLED)
  })

  it('says nothing once the file installs the overrides', () => {
    fixture.write(SEAMS, `${WIRED}// ours\n`)
    writeLock(fixture.project, emptyLock('1.2.0'))

    expect(warningsOf()).not.toMatch(UNINSTALLED)
  })

  it('says nothing when the file is tracked and untouched: the next upgrade replaces it', () => {
    fixture.write(SEAMS, UNWIRED)
    const lock = emptyLock('1.1.0')
    lock.files[SEAMS] = { class: 'managed', hash: hash(UNWIRED), since: '1.1.0' }
    writeLock(fixture.project, lock)

    const source = writePayload(fixture.payload, { version: '1.2.0', files: { [SEAMS]: WIRED } })

    expect(warningsOf({ source })).not.toMatch(UNINSTALLED)
  })

  it('still warns when the tracked file was edited, so the upgrade will hold it back', () => {
    fixture.write(SEAMS, `${UNWIRED}// ours\n`)
    const lock = emptyLock('1.1.0')
    lock.files[SEAMS] = { class: 'managed', hash: hash(UNWIRED), since: '1.1.0' }
    writeLock(fixture.project, lock)

    const source = writePayload(fixture.payload, { version: '1.2.0', files: { [SEAMS]: WIRED } })

    expect(warningsOf({ source })).toMatch(UNINSTALLED)
  })

  it('says nothing without an api.overrides.ts to install', () => {
    fixture.remove(OVERRIDES)
    fixture.write(SEAMS, UNWIRED)
    writeLock(fixture.project, emptyLock('1.2.0'))

    expect(warningsOf()).not.toMatch(UNINSTALLED)
  })

  it('says nothing in a project that has no seams file yet', () => {
    writeLock(fixture.project, emptyLock('1.2.0'))

    expect(warningsOf()).not.toMatch(UNINSTALLED)
  })

  it('finds a seams file under a moved app directory', () => {
    fixture.write('vuestrata.config.json', JSON.stringify({ slots: { appDir: 'src/shell' } }))
    fixture.write('src/shell/bootstrap/seams.ts', UNWIRED)
    writeLock(fixture.project, emptyLock('1.2.0'))

    expect(warningsOf()).toMatch(
      /api\.overrides\.ts exists, but src\/shell\/bootstrap\/seams\.ts does not install it/,
    )
  })
})
