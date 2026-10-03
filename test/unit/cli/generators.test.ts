import fs from 'node:fs'
import path from 'node:path'

import { compileTemplate, parse as parseSfc } from '@vue/compiler-sfc'
import ts from 'typescript'
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
const { ANCHORED_REGISTRIES, blankRegions, hasSentinel, readRegion } = registry

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

/**
 * A file as the template ships it: its `app:` regions empty.
 *
 * Read from this checkout, which may be one a generator has already run in:
 * the CLI round trip in CI runs `add module payments` and then this suite.
 * Seeding the fixture with what that left behind made "declares exactly these
 * two permissions" fail on a generator that had done its job.
 */
const real = (rel: string): string =>
  blankRegions(fs.readFileSync(path.join(process.cwd(), rel), 'utf8')) as string

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

describe('the form `add module` writes', () => {
  const MODULE = 'src/modules/invoices'

  /** Syntax errors in a generated TypeScript file. Types are the real generation's to check. */
  function syntaxErrors(source: string): string[] {
    const { diagnostics = [] } = ts.transpileModule(source, {
      reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
    })
    return diagnostics.map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    )
  }

  beforeEach(() => {
    generate(planFor('module', 'invoices'))
  })

  it('is a UiForm with the draft schema, an action, the error alert and the leave guard', () => {
    const page = fixture.read(`${MODULE}/pages/form.vue`)
    const { descriptor, errors } = parseSfc(page, { filename: 'form.vue' })

    expect(errors).toEqual([])
    expect(syntaxErrors(descriptor.scriptSetup!.content)).toEqual([])
    const compiled = compileTemplate({
      source: descriptor.template!.content,
      filename: 'form.vue',
      id: 'generated-form',
    })
    expect(compiled.errors).toEqual([])

    const template = descriptor.template!.content
    expect(template).toContain('<UiForm')
    expect(template).toContain(':schema="schema"')
    expect(template).toContain(':action="save"')
    expect(template).toContain('show-errors="touched"')
    expect(template).toContain('confirm-leave')
    expect(template).toContain('@success="onSaved"')
    // The form-level messages, already localized by UiForm.
    expect(template).toMatch(/<UiAlert v-if="formErrors\.length > 0"[^>]*variant="error"/)
    // A submit button that is pending for the whole save.
    expect(template).toMatch(/type="submit"[\s\S]*:loading="isSubmitting"/)
    // Fields are bound by name. A server message for `name` lands under it
    // because UiForm knows the field, which a v-model'd one outside a form
    // context never told anyone.
    expect(template).toContain('<UiTextField name="name"')
    expect(template).toContain('<UiSelect name="status"')
    expect(template).not.toMatch(/<form[\s>]/)
    expect(template).not.toContain('v-model')
  })

  it('keeps the page thin: the mutation is in the module composable', () => {
    const page = fixture.read(`${MODULE}/pages/form.vue`)
    const composable = fixture.read(`${MODULE}/composables/useInvoiceForm.ts`)

    expect(page).toContain("import { useInvoiceForm } from '../composables/useInvoiceForm'")
    expect(page).not.toContain('mutateAsync')
    expect(page).not.toContain('@tanstack/vue-query')
    expect(page).not.toContain('useNotificationStore')

    expect(syntaxErrors(composable)).toEqual([])
    expect(composable).toContain('export function useInvoiceForm(id: Ref<string | undefined>)')
    expect(composable).toContain('invoiceDraftSchema.parse(values)')
    expect(composable).toContain('updateMutation.mutateAsync({ id: editing, patch: draft })')
    expect(composable).toContain('createMutation.mutateAsync(draft)')
    expect(composable).toContain("t('invoices_saved')")
    expect(composable).toContain("t('invoices_created')")
    // It lets a failure reject: UiForm is what catches it.
    expect(composable).not.toMatch(/\bcatch\b/)
  })

  it('validates: the draft schema has real rules, and the mock uses the same schema', () => {
    const types = fixture.read(`${MODULE}/types.ts`)
    const handlers = fixture.read(`${MODULE}/mocks/invoices.handlers.ts`)

    expect(syntaxErrors(types)).toEqual([])
    expect(types).toContain('name: z.string().trim().min(1).max(120)')
    expect(types).toContain('notes: z.string().max(2000)')
    expect(types).toContain('export type InvoiceDraft = z.infer<typeof invoiceDraftSchema>')
    expect(handlers).toContain('invoiceDraftSchema.safeParse(body)')
    expect(handlers).toContain('invoiceDraftSchema.partial().safeParse(body)')
  })

  it('ships every key the form uses, in all three locales', () => {
    const keys = (locale: string) =>
      Object.keys(JSON.parse(fixture.read(`${MODULE}/i18n/${locale}.json`)) as object)

    expect(keys('en')).toEqual(expect.arrayContaining(['invoices_created', 'invoices_saved']))
    expect(keys('fr')).toEqual(keys('en'))
    expect(keys('ar')).toEqual(keys('en'))

    // Every module key the generated files translate exists in the catalog;
    // the rest (`common_*`) are the shell's.
    const used = new Set<string>()
    for (const file of ['pages/form.vue', 'composables/useInvoiceForm.ts']) {
      for (const [, key] of fixture.read(`${MODULE}/${file}`).matchAll(/t\('(invoices_\w+)'\)/g)) {
        used.add(key!)
      }
    }
    expect(used.size).toBeGreaterThan(0)
    expect(keys('en')).toEqual(expect.arrayContaining([...used]))
  })

  it('names itself after the entity, whatever the module is called', () => {
    generate(planFor('module', 'purchase-orders'))

    const composable = fixture.read(
      'src/modules/purchase-orders/composables/usePurchaseOrderForm.ts',
    )
    expect(syntaxErrors(composable)).toEqual([])
    expect(composable).toContain('export function usePurchaseOrderForm(')
    expect(composable).toContain('const NEW_PURCHASE_ORDER: PurchaseOrderDraft')
    expect(fixture.read('src/modules/purchase-orders/pages/form.vue')).toContain(
      "router.push('/dashboard/purchase-orders')",
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

  it('carries the three app: regions its registries anchor on, and no vuestrata: ones', () => {
    const source = real(OVERRIDES)
    const entries = ANCHORED_REGISTRIES.filter(
      (registry: { slot: string }) => registry.slot === 'rbacOverrides',
    )

    expect(entries.map((entry: { region: string }) => entry.region)).toEqual([
      'permissions',
      'grants',
      'withdrawn',
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
