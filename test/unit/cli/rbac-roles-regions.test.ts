import fs from 'node:fs'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'

import { CLI_PRESENT, loadCli, MAINTAINER } from './cli'
import { createFixture, type Fixture, writePayload } from './fixture'

const { diagnose } = await loadCli('src/commands/doctor.mjs')
const { runUpgrade } = await loadCli('src/commands/upgrade.mjs')
const { planModule } = await loadCli('src/generators/module.mjs')
const { driftedFiles, emptyLock, hashFor, readLock, recordProvenance, writeLock } =
  await loadCli('src/lib/lockfile.mjs')
const { deriveModuleNames } = await loadCli('src/lib/naming.mjs')
const { Plan } = await loadCli('src/lib/plan.mjs')
const { ANCHORED_REGISTRIES, blankRegions, hasSentinel, readRegion, REGIONS, regionNames } =
  await loadCli('src/lib/registry.mjs')

/**
 * The two regions of `rbac.overrides.ts` that hold a project's own roles.
 *
 * `app:roles` is where a role is declared (the members of `AppRoles`) and
 * `app:role-definitions` where it is defined (the entries of `roles`). They are
 * registered like the permission regions beside them, so `doctor` notices one
 * that went missing, and nothing the tools do to the file's other regions
 * disturbs them: `add module` writes permissions, `eject` writes withdrawals
 * (eject.test.ts has that case, with the project eject needs), and an upgrade
 * never rewrites a seeded file at all.
 */

const FLAGS = { 'allow-dirty': true, 'no-format': true }

const TYPES = 'src/modules/core/lib/rbac/types.ts'
const INHERITANCE = 'src/modules/core/lib/rbac/inheritance.ts'
const OVERRIDES = 'src/modules/app/config/rbac.overrides.ts'
const BACKENDS = 'src/modules/app/state/runtime-backends.ts'
const REGISTRY = 'src/modules/setup.ts'

const real = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8')

/**
 * The seam before anything was written into it: this checkout's file with its
 * `app:` regions emptied. The template's own file is that already; a project's
 * holds what the project declared, which is not what these cases start from.
 */
const seam = (): string => blankRegions(real(OVERRIDES))

/** The seeded file with a role declared, defined and granted by hand, as the recipe says. */
function withRoles(source: string) {
  const edited = source
    .replace('    // app:roles-start\n', '    // app:roles-start\n    auditor: true\n')
    .replace(
      '    // app:role-definitions-start\n',
      "    // app:role-definitions-start\n    auditor: { inherits: ['viewer'], label: 'Auditor' },\n",
    )
    .replace('    // app:grants-start\n', "    // app:grants-start\n    auditor: ['audit:read'],\n")
  expect(edited.split('auditor').length).toBe(source.split('auditor').length + 3)
  return edited
}

const barrel = (id: string, origin: string, permissions: string[]) => `
const ${id}Module = {
  config: {
    id: '${id}',
    origin: '${origin}',
    permissions: [${permissions.map((permission) => `'${permission}'`).join(', ')}],
  },
  routes: [],
}

export default ${id}Module
`

const SETUP = `import customersModule from './customers'
import ordersModule from './orders'

export const appModules = [
  // vuestrata:modules-start
  customersModule,
  ordersModule,
  // vuestrata:modules-end
  // app:modules-start
  // app:modules-end
]
`

let fixture: Fixture

beforeEach(() => {
  fixture = createFixture()
  for (const rel of [TYPES, INHERITANCE, BACKENDS]) fixture.write(rel, real(rel))
  fixture.write(OVERRIDES, withRoles(seam()))
  fixture.write(REGISTRY, SETUP)
  fixture.write(
    'src/modules/customers/index.ts',
    barrel('customers', 'project', ['customers:read']),
  )
  fixture.write('src/modules/orders/index.ts', barrel('orders', 'template', ['orders:read']))

  const lock = emptyLock('1.1.0')
  lock.files[TYPES] = {
    class: 'merged',
    hash: hashFor(TYPES, real(TYPES), 'merged'),
    since: '1.1.0',
  }
  for (const rel of [INHERITANCE, BACKENDS]) {
    lock.files[rel] = { class: 'managed', hash: hashFor(rel, real(rel), 'managed'), since: '1.1.0' }
  }
  lock.files[OVERRIDES] = { class: 'seeded', since: '1.1.0' }
  writeLock(fixture.project, lock)
})

afterEach(() => {
  fixture.cleanup()
})

const roleRegions = () => ({
  declared: readRegion(fixture.read(OVERRIDES), 'app:roles'),
  defined: readRegion(fixture.read(OVERRIDES), 'app:role-definitions'),
  granted: readRegion(fixture.read(OVERRIDES), 'app:grants'),
})

const HAND_WRITTEN = {
  declared: ['auditor: true'],
  defined: ["auditor: { inherits: ['viewer'], label: 'Auditor' },"],
  granted: ["auditor: ['audit:read'],"],
}

describe.skipIf(!CLI_PRESENT)('the role regions of rbac.overrides.ts', () => {
  it('are registered beside the permission regions, app: only', () => {
    const entries = ANCHORED_REGISTRIES.filter(
      (registry: { slot: string }) => registry.slot === 'rbacOverrides',
    )

    expect(REGIONS.roles).toBe('roles')
    expect(REGIONS.roleDefinitions).toBe('role-definitions')
    expect(entries.map((entry: { region: string }) => entry.region)).toEqual([
      'permissions',
      'grants',
      'withdrawn',
      'roles',
      'role-definitions',
    ])
    for (const entry of entries) expect(entry.upstream).toBe(false)
  })

  it('are in the seeded file, each a region of its own', () => {
    const shipped = seam()

    expect(regionNames(shipped)).toEqual([
      'permissions',
      'roles',
      'role-definitions',
      'grants',
      'withdrawn',
    ])
    expect(regionNames(shipped, { scope: 'vuestrata' })).toEqual([])
    // One name is not read as the other: `app:roles` is not a prefix match.
    expect(hasSentinel(shipped.replace(/.*app:roles-(start|end)\n/g, ''), 'app:roles')).toBe(false)
  })

  // What a project puts in its regions is its own business; the template
  // ships every one of them empty.
  it.runIf(MAINTAINER)('ship empty', () => {
    const shipped = real(OVERRIDES)
    for (const name of regionNames(shipped)) expect(readRegion(shipped, `app:${name}`)).toEqual([])
  })

  it('leave doctor with nothing to say about a project that declared a role', () => {
    const findings = diagnose({ root: fixture.project, version: '1.1.0', migrations: [] })

    // The fixture is the RBAC files alone, so the other slots are reported
    // missing: what is asked is that nothing is said about this one.
    const said = [...findings.errors, ...findings.warnings, ...findings.notes]
    expect(said.filter((text: string) => /rbac/i.test(text))).toEqual([])
  })

  it('are missed by doctor when a project deleted one', () => {
    fixture.write(
      OVERRIDES,
      fixture.read(OVERRIDES).replace(/.*app:role-definitions-(start|end)\n/g, ''),
    )

    const findings = diagnose({ root: fixture.project, version: '1.1.0', migrations: [] })

    expect(findings.warnings.join('\n')).toContain(
      `${OVERRIDES} has no "app:role-definitions" region. Generators cannot add entries here.`,
    )
    expect(findings.warnings.join('\n')).not.toContain('"app:roles" region')
  })
})

describe.skipIf(!CLI_PRESENT)('a project that declared a role', () => {
  it('keeps it through an upgrade that ships a different seeded file', () => {
    const before = fixture.read(OVERRIDES)

    const report = runUpgrade({
      root: fixture.project,
      version: '1.2.0',
      flags: FLAGS,
      apply: true,
      source: writePayload(fixture.payload, {
        version: '1.2.0',
        seeded: { [OVERRIDES]: `${seam()}// a later release's copy\n` },
      }),
      migrations: [],
    })

    expect(fixture.read(OVERRIDES)).toBe(before)
    expect(roleRegions()).toEqual(HAND_WRITTEN)
    expect(report.written.map((entry: { rel: string }) => entry.rel)).not.toContain(OVERRIDES)
    expect(readLock(fixture.project).files[OVERRIDES]).toEqual({ class: 'seeded', since: '1.1.0' })
  })

  it('keeps it through add module, which leaves Vuestrata’s files byte-identical', () => {
    const plan = new Plan(fixture.project)
    planModule({
      plan,
      positional: ['invoices'],
      options: {},
      names: deriveModuleNames('invoices'),
    })
    expect(plan.validate()).toEqual([])
    const lock = readLock(fixture.project)
    recordProvenance(lock, plan.apply().provenance, '1.1.0')
    writeLock(fixture.project, lock)

    expect(roleRegions()).toEqual(HAND_WRITTEN)
    expect(readRegion(fixture.read(OVERRIDES), 'app:permissions')).toEqual([
      "'invoices:read': true",
      "'invoices:manage': true",
    ])
    expect(fixture.read(TYPES)).toBe(real(TYPES))
    expect(fixture.read(INHERITANCE)).toBe(real(INHERITANCE))
    expect(driftedFiles(fixture.project, readLock(fixture.project))).toEqual([])
    const findings = diagnose({ root: fixture.project, version: '1.1.0', migrations: [] })
    const said = [...findings.errors, ...findings.warnings, ...findings.notes]
    expect(said.filter((text: string) => /rbac/i.test(text))).toEqual([])
  })
})
