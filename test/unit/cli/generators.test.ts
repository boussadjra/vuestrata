import fs from 'node:fs'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'

// @ts-expect-error - the CLI is plain ESM JavaScript with no type declarations.
import { planComponent } from '../../../packages/cli/src/generators/component.mjs'
// @ts-expect-error - see above.
import { planModule } from '../../../packages/cli/src/generators/module.mjs'
// @ts-expect-error - see above.
import * as lockfile from '../../../packages/cli/src/lib/lockfile.mjs'
// @ts-expect-error - see above.
import { PROJECT_REGISTRIES, SEEDED_FILES } from '../../../packages/cli/src/lib/managed.mjs'
// @ts-expect-error - see above.
import * as manifests from '../../../packages/cli/src/lib/manifest.mjs'
// @ts-expect-error - see above.
import { deriveModuleNames } from '../../../packages/cli/src/lib/naming.mjs'
// @ts-expect-error - see above.
import { Plan } from '../../../packages/cli/src/lib/plan.mjs'
// @ts-expect-error - see above.
import * as registry from '../../../packages/cli/src/lib/registry.mjs'
import { createFixture, type Fixture } from './fixture'

const { driftedFiles, emptyLock, hashFor, readLock, recordProvenance, writeLock } = lockfile
const { DEFAULT_SLOTS, loadManifest, missingSlots, SEEDED_SLOTS } = manifests
const { ANCHORED_REGISTRIES, hasSentinel, readRegion } = registry

/**
 * What a generator may and may not touch.
 *
 * Generators write to the project's own files and to the `app:` regions of the
 * merged barrels — never to a file Vuestrata owns. The first `vuestrata add`
 * would otherwise cost `core/lib/rbac/` and the `Ui*` barrel their upgrades.
 */

const TYPES = 'src/modules/core/lib/rbac/types.ts'
const INHERITANCE = 'src/modules/core/lib/rbac/inheritance.ts'
const OVERRIDES = 'src/modules/app/config/rbac.overrides.ts'
const UI_BARREL = 'src/modules/app/components/ui/index.ts'
const FORMS_BARREL = 'src/modules/app/composables/forms/index.ts'
const REGISTRY = 'src/modules/setup.ts'

const real = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8')

const SETUP = `import customersModule from './customers'
import usersModule from './users'

export const appModules = [
  // vuestrata:modules-start
  customersModule,
  usersModule,
  // vuestrata:modules-end
  // app:modules-start
  // app:modules-end
]
`

let fixture: Fixture

beforeEach(() => {
  fixture = createFixture()
  for (const rel of [TYPES, INHERITANCE, OVERRIDES, UI_BARREL, FORMS_BARREL]) {
    fixture.write(rel, real(rel))
  }
  fixture.write(REGISTRY, SETUP)

  const lock = emptyLock('1.0.0')
  for (const rel of [TYPES, UI_BARREL, FORMS_BARREL]) {
    lock.files[rel] = { class: 'merged', hash: hashFor(rel, real(rel), 'merged'), since: '1.0.0' }
  }
  lock.files[INHERITANCE] = {
    class: 'managed',
    hash: hashFor(INHERITANCE, real(INHERITANCE), 'managed'),
    since: '1.0.0',
  }
  lock.files[OVERRIDES] = { class: 'seeded', since: '1.0.0' }
  writeLock(fixture.project, lock)
})

afterEach(() => {
  fixture.cleanup()
})

/** Plan, validate, apply and record — what `vuestrata add` does, minus the formatter. */
function generate(plan: { validate: () => string[]; apply: () => { provenance: unknown[] } }) {
  expect(plan.validate()).toEqual([])
  const result = plan.apply()
  const lock = readLock(fixture.project)
  recordProvenance(lock, result.provenance, '1.0.0')
  writeLock(fixture.project, lock)
  return result
}

function planFor(kind: 'module' | 'component', name: string, options: object = {}) {
  const plan = new Plan(fixture.project)
  const args = {
    plan,
    positional: [name],
    options,
    names: kind === 'module' ? deriveModuleNames(name) : undefined,
  }
  if (kind === 'module') planModule(args)
  else planComponent(args)
  return plan
}

describe('add module', () => {
  it('leaves core/lib/rbac byte-identical', () => {
    generate(planFor('module', 'invoices'))

    expect(fixture.read(TYPES)).toBe(real(TYPES))
    expect(fixture.read(INHERITANCE)).toBe(real(INHERITANCE))
  })

  it('declares the permissions in the app:permissions region of rbac.overrides.ts', () => {
    generate(planFor('module', 'invoices'))

    expect(readRegion(fixture.read(OVERRIDES), 'app:permissions')).toEqual([
      "'invoices:read': true",
      "'invoices:manage': true",
    ])
    // Neither of the other two regions is written: granting is not the generator's call.
    expect(readRegion(fixture.read(OVERRIDES), 'app:grants')).toEqual([])
    expect(readRegion(fixture.read(OVERRIDES), 'app:withdrawn')).toEqual([])
  })

  it('reports no managed or merged file as edited, so upgrades keep flowing', () => {
    generate(planFor('module', 'invoices'))
    generate(planFor('module', 'payments'))

    expect(driftedFiles(fixture.project, readLock(fixture.project))).toEqual([])
  })

  it('plans, in --dry-run and --json, exactly the edits it makes', () => {
    const plan = planFor('module', 'invoices')
    const edited = plan.toJSON().edits.map((edit: { file: string }) => edit.file)

    expect(edited).toEqual([REGISTRY, REGISTRY, OVERRIDES])
    expect(edited).not.toContain(TYPES)
    expect(edited).not.toContain(INHERITANCE)
    expect(plan.validate()).toEqual([])
    // Planning wrote nothing.
    expect(fixture.read(OVERRIDES)).toBe(real(OVERRIDES))
  })

  it('tells the user to grant in rbac.overrides.ts, not in inheritance.ts', () => {
    const notes = planFor('module', 'invoices').toJSON().notes.join('\n')

    expect(notes).toContain(OVERRIDES)
    expect(notes).not.toContain('inheritance.ts')
  })

  it('is idempotent about what it declares', () => {
    const plan = planFor('module', 'invoices')
    generate(plan)

    expect(readRegion(fixture.read(OVERRIDES), 'app:permissions')).toHaveLength(2)
    // A second run finds the module already there rather than declaring twice.
    expect(planFor('module', 'invoices').validate().length).toBeGreaterThan(0)
  })

  it('names the fix when a project has no rbac.overrides.ts yet', () => {
    fixture.remove(OVERRIDES)

    expect(() => planFor('module', 'invoices')).toThrow(
      /rbac\.overrides\.ts does not exist.*upgrade/s,
    )
  })
})

describe('add component', () => {
  it('edits only the app: regions of the two merged barrels', () => {
    const before = { ui: fixture.read(UI_BARREL), forms: fixture.read(FORMS_BARREL) }

    generate(planFor('component', 'Tag', { field: true }))

    expect(fixture.read(UI_BARREL)).not.toBe(before.ui)
    expect(readRegion(fixture.read(UI_BARREL), 'app:ui-components')).toEqual([
      "export { default as UiTag } from './UiTag.vue'",
    ])
    expect(readRegion(fixture.read(FORMS_BARREL), 'app:form-composables')).toHaveLength(1)
    expect(driftedFiles(fixture.project, readLock(fixture.project))).toEqual([])
  })

  it('points at the demo registry only while the project still has one', () => {
    const demoNote = (plan: { notes: string[] }) =>
      plan.notes.some((note) => note.includes('COMPONENT_DEMO_DOCS'))

    expect(demoNote(planFor('component', 'Tag'))).toBe(false)

    fixture.write('src/modules/app/config/component-docs.ts', 'export {}\n')
    expect(demoNote(planFor('component', 'Tag'))).toBe(true)
  })
})

describe('the rbac.overrides.ts seam', () => {
  it('is a seeded file, and a slot a project may lack until it upgrades', () => {
    expect(SEEDED_FILES).toContain(DEFAULT_SLOTS.rbacOverrides)
    for (const name of SEEDED_SLOTS) expect(SEEDED_FILES).toContain(DEFAULT_SLOTS[name])

    fixture.remove(OVERRIDES)
    const missing = missingSlots(loadManifest(fixture.project)).map(
      (entry: { slot: string }) => entry.slot,
    )
    expect(missing).not.toContain('rbacOverrides')
  })

  it('carries the app: regions its registries anchor on, and no vuestrata: ones', () => {
    const source = real(OVERRIDES)
    const entries = ANCHORED_REGISTRIES.filter(
      (registry: { slot: string }) => registry.slot === 'rbacOverrides',
    )

    expect(entries.map((entry: { region: string }) => entry.region)).toEqual([
      'permissions',
      'grants',
      'withdrawn',
      // A project's own roles: see rbac-roles-regions.test.ts.
      'roles',
      'role-definitions',
    ])
    for (const entry of entries) {
      expect(hasSentinel(source, `app:${entry.region}`, { comment: entry.comment })).toBe(true)
      expect(source).not.toContain(`vuestrata:${entry.region}`)
    }
  })

  it('is never synced by an upgrade: the project owns all of it', () => {
    expect(
      PROJECT_REGISTRIES.some((registry: { slot: string }) => registry.slot === 'rbacOverrides'),
    ).toBe(false)
  })
})

describe('the auth.config.ts seam', () => {
  const AUTH_CONFIG = 'src/modules/app/config/auth.config.ts'

  it('is a seeded file, and a slot a project may lack until it upgrades', () => {
    expect(DEFAULT_SLOTS.authConfig).toBe(AUTH_CONFIG)
    expect(SEEDED_FILES).toContain(AUTH_CONFIG)
    expect(SEEDED_SLOTS).toContain('authConfig')

    // The fixture never had the file: that is a project from before the seam,
    // and it must not read as a broken layout to a generator or to doctor.
    expect(fixture.exists(AUTH_CONFIG)).toBe(false)
    const missing = missingSlots(loadManifest(fixture.project)).map(
      (entry: { slot: string }) => entry.slot,
    )
    expect(missing).not.toContain('authConfig')
  })

  it('has no regions: no generator and no upgrade ever appends to it', () => {
    const slots = ANCHORED_REGISTRIES.map((registry: { slot: string }) => registry.slot)
    expect(slots).not.toContain('authConfig')
    expect(real(AUTH_CONFIG)).not.toMatch(/(?:vuestrata|app):[a-z-]+-(?:start|end)/)
  })

  it('ships empty, and takes everything it uses from core/lib', () => {
    const source = real(AUTH_CONFIG)

    // Data only: its types and helpers are Vuestrata's, so a release can add
    // an optional member without this file having to change. And from
    // `core/lib` specifically: a module barrel is the project's file, so a
    // helper exported only there would be missing in a project that upgrades.
    const imports = [...source.matchAll(/^import .* from '([^']+)'$/gm)].map((match) => match[1])
    expect(imports).toEqual(['~/lib/auth'])
    expect(source).toMatch(/export default defineAuthConfig\(\{\}\)\n$/)
  })
})
