import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'

import { CLI_PRESENT, loadCli } from './cli'
import { writePayload } from './fixture'

// Loaded rather than imported, so a project without `packages/cli` skips this
// file instead of failing to collect it.
const { diagnose } = await loadCli('src/commands/doctor.mjs')
const { runUpgrade } = await loadCli('src/commands/upgrade.mjs')
const { emptyLock, readLock, writeLock } = await loadCli('src/lib/lockfile.mjs')
const managed = await loadCli('src/lib/managed.mjs')
const manifests = await loadCli('src/lib/manifest.mjs')
const { ANCHORED_REGISTRIES } = await loadCli('src/lib/registry.mjs')
const wiring = await loadCli('src/lib/deploy-wiring.mjs')

/**
 * `deploy.config.ts`, as the CLI sees it: a seam an upgrade writes once and
 * then never touches, read by three of Vuestrata's own scripts.
 *
 * The second half is the part that can go wrong quietly. A project that edited
 * its copy of the Vite plugin, of the header generator or of the bundle check
 * keeps that copy, and a copy from before the file existed does not read it.
 * The project then has a config that looks effective and does nothing, and
 * only `doctor` says so.
 */

const SEAM = 'src/modules/app/config/deploy.config.ts'
const PLUGIN = 'scripts/vite/vuestrata-plugin.mjs'
const GENERATOR = 'scripts/security/sync-headers.mjs'
const BUNDLE_CHECK = 'scripts/build/verify-bundle.mjs'

const FLAGS = { 'allow-dirty': true, 'no-format': true }

const real = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8')

function hash(contents: string) {
  return `sha256-${crypto.createHash('sha256').update(contents.replaceAll('\r\n', '\n')).digest('hex')}`
}

let project: string
let payload: string

function write(rel: string, contents: string) {
  const full = path.join(project, rel)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, contents)
}

const read = (rel: string) => fs.readFileSync(path.join(project, rel), 'utf8')
const exists = (rel: string) => fs.existsSync(path.join(project, rel))

beforeEach(() => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'vuestrata-deploy-config-'))
  project = path.join(base, 'project')
  payload = path.join(base, 'payload')
  fs.mkdirSync(project, { recursive: true })
})

afterEach(() => {
  fs.rmSync(path.dirname(project), { recursive: true, force: true })
})

describe.skipIf(!CLI_PRESENT)('the deploy.config.ts seam', () => {
  it('is a seeded file behind the deployConfig slot', () => {
    expect(manifests.DEFAULT_SLOTS.deployConfig).toBe(SEAM)
    expect(manifests.SEEDED_SLOTS).toContain('deployConfig')
    expect(managed.SEEDED_FILES).toContain(SEAM)
    expect(managed.classify(SEAM)).toBe('seeded')
  })

  it('is a slot a project may lack until it upgrades', () => {
    // The project has nothing at all, so every other slot is missing.
    const missing = manifests
      .missingSlots(manifests.loadManifest(project))
      .map((entry: { slot: string }) => entry.slot)

    expect(missing).toContain('envSchema')
    expect(missing).not.toContain('deployConfig')
  })

  it('can be moved through vuestrata.config.json like any slot', () => {
    write('vuestrata.config.json', JSON.stringify({ slots: { deployConfig: 'config/deploy.ts' } }))

    expect(manifests.slot(manifests.loadManifest(project), 'deployConfig')).toBe('config/deploy.ts')
  })

  it('has no registry regions: nothing appends to it, upstream or generator', () => {
    expect(
      ANCHORED_REGISTRIES.some((registry: { slot: string }) => registry.slot === 'deployConfig'),
    ).toBe(false)
    expect(real(SEAM)).not.toMatch(/(?:app|vuestrata):[\w-]+-start/)
  })

  it('ships empty, and holds data only', () => {
    const source = real(SEAM)
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '')

    // The app behaves exactly as it did before the file existed.
    expect(code).toMatch(/export default defineDeployConfig\(\{\}\)/)
    // Its types come from a managed module, so a release can add a field
    // without breaking a copy the project has since made its own. zod is the
    // only other value it may import: the header generator loads this file in
    // Node, where nothing of the app exists.
    const imports = [...code.matchAll(/^import\s+(type\s+)?[\s\S]*?from\s+'([^']+)'/gm)]
    expect(imports.length).toBeGreaterThan(0)
    for (const [statement, typeOnly, specifier] of imports) {
      expect(
        typeOnly !== undefined || specifier === 'zod' || specifier === '~/lib/config/deploy',
        statement,
      ).toBe(true)
    }
  })

  it('names files Vuestrata keeps, so a project never has to edit them', () => {
    for (const rel of [
      'public/runtime-config.js',
      'docker/entrypoint.d/40-vuestrata-runtime.sh',
      'scripts/security/deploy-config.mjs',
      'scripts/security/headers.mjs',
      'scripts/security/sync-headers.mjs',
      'scripts/vite/vuestrata-plugin.mjs',
      'src/modules/core/lib/config/runtime-overlay.ts',
      'src/modules/core/lib/config/deploy.ts',
      'src/modules/app/bootstrap/app-env.ts',
    ]) {
      expect(managed.classify(rel), rel).toBe('managed')
      expect(fs.existsSync(path.join(process.cwd(), rel)), rel).toBe(true)
    }
    expect(managed.collectManaged(process.cwd())).toEqual(
      expect.arrayContaining([
        'public/runtime-config.js',
        'docker/entrypoint.d/40-vuestrata-runtime.sh',
        'scripts/security/deploy-config.mjs',
      ]),
    )
  })

  it('leaves what the generator writes to the project', () => {
    // Generated from the project's own deploy.config.ts: shipping Vuestrata's
    // copy would overwrite a policy the project widened.
    for (const rel of [
      'docker/nginx.conf',
      'docker/runtime/keys',
      'docker/runtime/security-headers.conf.template',
      'docker/runtime/api-location.conf.template',
      'public/_headers',
      'Dockerfile',
    ]) {
      expect(managed.classify(rel), rel).toBeNull()
    }
  })
})

describe.skipIf(!CLI_PRESENT)('upgrade and deploy.config.ts', () => {
  const SHIPPED = 'export default defineDeployConfig({})\n'

  const upgradeTo = (version: string) =>
    runUpgrade({
      root: project,
      version,
      flags: FLAGS,
      apply: true,
      source: writePayload(payload, { version, files: {}, seeded: { [SEAM]: SHIPPED } }),
      migrations: [],
    })

  beforeEach(() => {
    writeLock(project, emptyLock('1.1.0'))
  })

  it('writes the file once, for a project that predates it', () => {
    const report = upgradeTo('1.2.0')

    expect(report.written.map((entry: { rel: string }) => entry.rel)).toEqual([SEAM])
    expect(read(SEAM)).toBe(SHIPPED)
    expect(readLock(project).files[SEAM]).toEqual({ class: 'seeded', since: '1.2.0' })
  })

  it('never rewrites what the project then declared in it', () => {
    upgradeTo('1.2.0')
    const mine =
      "export default defineDeployConfig({ headers: { connectSrc: ['https://a.test'] } })\n"
    write(SEAM, mine)

    const report = upgradeTo('1.3.0')

    expect(read(SEAM)).toBe(mine)
    expect(report.written).toEqual([])
    expect(report.incoming).toEqual([])
  })

  it('does not bring it back once the project deleted it', () => {
    upgradeTo('1.2.0')
    fs.rmSync(path.join(project, SEAM))

    upgradeTo('1.3.0')

    expect(exists(SEAM)).toBe(false)
  })
})

describe.skipIf(!CLI_PRESENT)('doctor and a deploy.config.ts that nothing reads', () => {
  // The two scripts before the file existed, and with the call that reads it.
  const OLD_PLUGIN = 'export function vuestrataEnv() {\n  return { name: "vuestrata:env" }\n}\n'
  const NEW_PLUGIN = OLD_PLUGIN.replace('return {', 'loadDeployConfig({ root })\n  return {')
  const OLD_GENERATOR = 'function run(args) {\n  targetsFor(parseApiUrl(args))\n}\n'
  const NEW_GENERATOR = OLD_GENERATOR.replace(
    'targetsFor(',
    'await loadDeployConfig()\n  targetsFor(',
  )

  const UNREAD_BY_PLUGIN =
    /deploy\.config\.ts exists, but scripts\/vite\/vuestrata-plugin\.mjs does not read it/
  const UNREAD_BY_GENERATOR =
    /deploy\.config\.ts exists, but scripts\/security\/sync-headers\.mjs does not read it/

  const warningsOf = (options: { source?: unknown; migrations?: unknown[] } = {}) =>
    diagnose({ root: project, version: '1.2.0', migrations: [], ...options }).warnings.join('\n')

  beforeEach(() => {
    write(SEAM, 'export default defineDeployConfig({})\n')
  })

  it('recognises the copies this release ships', () => {
    expect(wiring.readsDeployConfig(real(PLUGIN))).toBe(true)
    expect(wiring.readsDeployConfig(real(GENERATOR))).toBe(true)
    expect(wiring.readsDeployConfig(real(BUNDLE_CHECK))).toBe(true)
    expect(wiring.DEPLOY_CONFIG_READERS.map((reader: { file: string }) => reader.file)).toEqual([
      PLUGIN,
      GENERATOR,
      BUNDLE_CHECK,
    ])
  })

  // Until 1.1.0 a budget was raised by editing the script, so this is the copy
  // a project is most likely to have kept. Its `bundle` key then does nothing.
  it('warns about a bundle check the project kept from before it read the file', () => {
    write(BUNDLE_CHECK, 'const INITIAL_PAYLOAD_BUDGET_GZIP = 900 * 1024\n')
    writeLock(project, emptyLock('1.2.0'))

    const text = warningsOf()

    expect(text).toMatch(
      /deploy\.config\.ts exists, but scripts\/build\/verify-bundle\.mjs does not read it/,
    )
    expect(text).toContain('A budget you changed in the script belongs under `bundle` now')
    expect(text).toContain(`vuestrata adopt ${BUNDLE_CHECK}`)
  })

  it('says nothing about a bundle check that reads the file', () => {
    write(BUNDLE_CHECK, real(BUNDLE_CHECK))
    writeLock(project, emptyLock('1.2.0'))

    expect(warningsOf()).not.toMatch(/verify-bundle\.mjs does not read it/)
  })

  it('warns, per script, when the project edited a copy from before the file existed', () => {
    write(PLUGIN, `${OLD_PLUGIN}// ours\n`)
    write(GENERATOR, `${OLD_GENERATOR}// ours\n`)
    writeLock(project, emptyLock('1.2.0'))

    const text = warningsOf()

    expect(text).toMatch(UNREAD_BY_PLUGIN)
    expect(text).toMatch(UNREAD_BY_GENERATOR)
    // What is lost, and what to do, so the warning can be acted on as it is.
    expect(text).toContain('no page loads runtime-config.js')
    expect(text).toContain('reach neither the generated security headers nor docker/runtime/keys')
    expect(text).toContain(`vuestrata adopt ${PLUGIN}`)
    expect(text).toContain(`vuestrata adopt ${GENERATOR}`)
  })

  it('warns in a project that is not tracked yet', () => {
    write(PLUGIN, OLD_PLUGIN)
    write(GENERATOR, NEW_GENERATOR)

    const text = warningsOf()

    expect(text).toMatch(UNREAD_BY_PLUGIN)
    expect(text).not.toMatch(UNREAD_BY_GENERATOR)
  })

  it('says nothing once both scripts read the file', () => {
    write(PLUGIN, `${NEW_PLUGIN}// ours\n`)
    write(GENERATOR, `${NEW_GENERATOR}// ours\n`)
    writeLock(project, emptyLock('1.2.0'))

    const text = warningsOf()

    expect(text).not.toMatch(UNREAD_BY_PLUGIN)
    expect(text).not.toMatch(UNREAD_BY_GENERATOR)
  })

  it('says nothing about a script the next upgrade replaces with the copy that reads it', () => {
    // Tracked and untouched: the upgrade installs the new one.
    write(PLUGIN, OLD_PLUGIN)
    write(GENERATOR, OLD_GENERATOR)
    const lock = emptyLock('1.1.0')
    lock.files[PLUGIN] = { class: 'managed', hash: hash(OLD_PLUGIN), since: '1.1.0' }
    lock.files[GENERATOR] = { class: 'managed', hash: hash(OLD_GENERATOR), since: '1.1.0' }
    writeLock(project, lock)

    const source = writePayload(payload, {
      version: '1.2.0',
      files: { [PLUGIN]: NEW_PLUGIN, [GENERATOR]: NEW_GENERATOR },
    })
    const text = warningsOf({ source })

    expect(text).not.toMatch(UNREAD_BY_PLUGIN)
    expect(text).not.toMatch(UNREAD_BY_GENERATOR)
  })

  it('still warns about a tracked script the project has edited, which the upgrade holds back', () => {
    write(PLUGIN, `${OLD_PLUGIN}// ours\n`)
    write(GENERATOR, OLD_GENERATOR)
    const lock = emptyLock('1.1.0')
    lock.files[PLUGIN] = { class: 'managed', hash: hash(OLD_PLUGIN), since: '1.1.0' }
    lock.files[GENERATOR] = { class: 'managed', hash: hash(OLD_GENERATOR), since: '1.1.0' }
    writeLock(project, lock)

    const source = writePayload(payload, {
      version: '1.2.0',
      files: { [PLUGIN]: NEW_PLUGIN, [GENERATOR]: NEW_GENERATOR },
    })
    const text = warningsOf({ source })

    expect(text).toMatch(UNREAD_BY_PLUGIN)
    expect(text).not.toMatch(UNREAD_BY_GENERATOR)
  })

  it('says nothing without a deploy.config.ts to read', () => {
    fs.rmSync(path.join(project, SEAM))
    write(PLUGIN, OLD_PLUGIN)
    write(GENERATOR, OLD_GENERATOR)
    writeLock(project, emptyLock('1.2.0'))

    const text = warningsOf()

    expect(text).not.toMatch(UNREAD_BY_PLUGIN)
    expect(text).not.toMatch(UNREAD_BY_GENERATOR)
  })

  it('says nothing about a script the project does not have', () => {
    writeLock(project, emptyLock('1.2.0'))

    expect(warningsOf()).not.toMatch(/does not read it/)
  })
})

describe.skipIf(!CLI_PRESENT)(
  'doctor and a Dockerfile that builds the image for one API origin',
  () => {
    // The Dockerfile is the project's file, so an upgrade cannot change it. One
    // that copies the entrypoint builds an image whose API URL is read at start,
    // and the generator has to be told, or the page's own CSP tag blocks the
    // origin a container is given. Nothing fails until one is.
    const WITHOUT_FLAG =
      /Dockerfile runs scripts\/security\/sync-headers\.mjs without --runtime-config/
    const COPIES_ENTRYPOINT = 'COPY --from=build /app/docker/entrypoint.d/ /docker-entrypoint.d/\n'

    const warningsOf = () =>
      diagnose({ root: project, version: '1.2.0', migrations: [] }).warnings.join('\n')

    it('says nothing about the Dockerfile this release ships', () => {
      expect(wiring.dockerfileWithoutRuntimeConfig(real('Dockerfile'))).toBeUndefined()

      write('Dockerfile', real('Dockerfile'))
      expect(warningsOf()).not.toMatch(WITHOUT_FLAG)
    })

    it.each([
      ['tracked', true],
      ['not tracked yet', false],
    ])('warns when the generator step lacks the flag, in a project that is %s', (_, tracked) => {
      write('Dockerfile', `RUN node scripts/security/sync-headers.mjs\n${COPIES_ENTRYPOINT}`)
      if (tracked) writeLock(project, emptyLock('1.2.0'))

      const text = warningsOf()

      expect(text).toMatch(WITHOUT_FLAG)
      // The line to write, so the warning can be acted on as it is.
      expect(text).toContain(
        'RUN node scripts/security/sync-headers.mjs --runtime-config --api-url="$VUESTRATA_API_URL"',
      )
    })

    it('warns about the step this work package first shipped', () => {
      const before = real('Dockerfile').replace(
        / --runtime-config --api-url="\$VUESTRATA_API_URL"/,
        '',
      )
      expect(before).not.toBe(real('Dockerfile'))

      expect(wiring.dockerfileWithoutRuntimeConfig(before)).toMatch(WITHOUT_FLAG)
    })

    it.each([
      [
        'a Dockerfile from before the entrypoint, which bakes one API origin on purpose',
        'RUN node scripts/security/sync-headers.mjs --api-url="$VUESTRATA_API_URL"\n',
      ],
      ['a Dockerfile that never runs the generator', COPIES_ENTRYPOINT],
      [
        'a step that is only mentioned in a comment',
        `# RUN node scripts/security/sync-headers.mjs\nRUN node scripts/security/sync-headers.mjs --runtime-config\n${COPIES_ENTRYPOINT}`,
      ],
    ])('says nothing about %s', (_, dockerfile) => {
      write('Dockerfile', dockerfile)

      expect(warningsOf()).not.toMatch(WITHOUT_FLAG)
    })

    it('says nothing in a project with no Dockerfile', () => {
      expect(warningsOf()).not.toMatch(WITHOUT_FLAG)
    })
  },
)
