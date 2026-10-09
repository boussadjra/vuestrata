import { writeFileSync } from 'node:fs'

import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { defineComponent, h, onErrorCaptured, ref, type Component, type VNode } from 'vue'
import { z } from 'zod'

import {
  UiCheckbox,
  UiColorPicker,
  UiComboBox,
  UiDateField,
  UiEditable,
  UiForm,
  UiFormGroup,
  UiFormRepeater,
  UiMentionsField,
  UiNumberField,
  UiOTPField,
  UiRadioGroup,
  UiRatingField,
  UiSelect,
  UiSlider,
  UiSwitch,
  UiTagsField,
  UiTextarea,
  UiTextField,
  UiToggle,
  UiTreeSelect,
} from '@/components/ui'

import { MEASURED_AT_A22D396, type MeasuredCell } from './ui-form-field-matrix.base'

/**
 * Which value a field inside a `UiForm` opens on, for every field type the
 * template ships, against the real Formwerk.
 *
 * One rule decides it (see `composables/forms/useOwnDefault.ts`):
 *
 *   1. the developer passed a model value, an empty one included: it wins;
 *   2. the developer passed none and the form's `initialValues` holds a value
 *      for the field: the form's value is shown;
 *   3. the developer passed none and the form holds nothing, `undefined` or
 *      `null`: the field's own empty default applies.
 *
 * Rows `none`, `null`, `empty` and `value` below are pinned to what the
 * components did at a22d396, the commit before `UiForm` was reworked. They
 * were MEASURED there, by running this very file against that commit with
 * `FIELD_MATRIX_RECORD=<file>` (which records instead of asserting), and are
 * kept in `ui-form-field-matrix.base.ts`. Row `initial` is the one deliberate
 * change: a field with a built-in default used to open on that default over
 * the record's value.
 */

const RECORD = process.env.FIELD_MATRIX_RECORD
const NATIVE_DATE = Date

const options = [
  { label: 'Alpha', value: 'a' },
  { label: 'Beta', value: 'b' },
  { label: 'Gamma', value: 'c' },
]

const NOT_APPLICABLE = Symbol('not applicable')

interface FieldCase {
  id: string
  component: Component
  props?: Record<string, unknown>
  /** What the field's value must satisfy. */
  schema: z.ZodType
  /** The record's value. */
  initial: unknown
  /** An empty value the developer passes on purpose. */
  explicitEmpty: unknown
  /** A value the developer passes; never equal to `initial`. */
  explicitValue: unknown
  /** The record's value in the `value` row, when `initial` cannot differ from `explicitValue`. */
  initialAgainstValue?: unknown
  inside?: 'group' | 'repeater'
  /**
   * A type left at its a22d396 behaviour in the `initial` row, and why. The
   * row is then pinned to the base like the others.
   */
  keptAtBase?: string
  /**
   * A correction to what was measured, for a defect of the base that had to go
   * for the field to run under a real Formwerk at all. Says what, and why.
   */
  sinceBase?: (measured: MeasuredCell) => MeasuredCell
}

/**
 * At a22d396 `UiSwitch` spread Formwerk's element ref onto Reka's
 * `SwitchRoot`, a component: Formwerk held a component where it expected the
 * button, threw from a watcher on every mount (which is why no test mounted a
 * switch in a form), and took the switch for a native checkbox. Handed the
 * button, it now says `aria-checked` for the value it holds, and Reka no
 * longer adds its hidden form input. The value, the fill, dirty and valid are
 * as measured.
 */
function switchSinceBase(measured: MeasuredCell): MeasuredCell {
  return {
    ...measured,
    shown: {
      ...measured.shown,
      inputs: [],
      state: measured.shown.state.map((entry) =>
        entry.startsWith('switch ')
          ? entry.replace(/aria-checked=\w+/, `aria-checked=${measured.value === true}`)
          : entry,
      ),
    },
  }
}

const cases: FieldCase[] = [
  {
    id: 'text',
    component: UiTextField,
    schema: z.string(),
    initial: 'from-form',
    explicitEmpty: '',
    explicitValue: 'explicit',
  },
  {
    id: 'textarea',
    component: UiTextarea,
    schema: z.string(),
    initial: 'from-form',
    explicitEmpty: '',
    explicitValue: 'explicit',
  },
  {
    id: 'number',
    component: UiNumberField,
    schema: z.number(),
    initial: 7,
    explicitEmpty: 0,
    explicitValue: 3,
  },
  {
    id: 'select',
    component: UiSelect,
    props: { options },
    schema: z.string(),
    initial: 'b',
    explicitEmpty: '',
    explicitValue: 'c',
  },
  {
    id: 'select-multiple',
    component: UiSelect,
    props: { options, multiple: true },
    schema: z.array(z.string()),
    initial: ['b'],
    explicitEmpty: [],
    explicitValue: ['c'],
  },
  {
    id: 'combobox',
    component: UiComboBox,
    props: { options },
    schema: z.string(),
    initial: 'b',
    explicitEmpty: '',
    explicitValue: 'c',
  },
  {
    id: 'checkbox',
    component: UiCheckbox,
    schema: z.boolean(),
    initial: true,
    explicitEmpty: false,
    explicitValue: true,
    initialAgainstValue: false,
  },
  {
    id: 'radio-group',
    component: UiRadioGroup,
    props: { options },
    schema: z.string(),
    initial: 'b',
    explicitEmpty: '',
    explicitValue: 'c',
  },
  {
    id: 'switch',
    component: UiSwitch,
    sinceBase: switchSinceBase,
    schema: z.boolean(),
    initial: true,
    explicitEmpty: false,
    explicitValue: true,
    initialAgainstValue: false,
  },
  {
    id: 'toggle',
    component: UiToggle,
    schema: z.boolean(),
    initial: true,
    explicitEmpty: false,
    explicitValue: true,
    initialAgainstValue: false,
  },
  {
    id: 'slider',
    component: UiSlider,
    schema: z.number(),
    initial: 30,
    explicitEmpty: 0,
    explicitValue: 80,
  },
  {
    id: 'date',
    component: UiDateField,
    schema: z.date(),
    initial: new Date(2024, 0, 15),
    // A date field has no empty value to pass: `undefined` is "not passed".
    explicitEmpty: NOT_APPLICABLE,
    explicitValue: new Date(2025, 5, 20),
  },
  {
    id: 'otp',
    component: UiOTPField,
    schema: z.string(),
    initial: '123456',
    explicitEmpty: '',
    explicitValue: '654321',
    keptAtBase:
      'UiOTPField draws its cells from the model-value prop alone and never writes a typed code to the form, so it neither shows nor edits a form value without v-model',
  },
  {
    id: 'tags',
    component: UiTagsField,
    schema: z.array(z.string()),
    initial: ['x'],
    explicitEmpty: [],
    explicitValue: ['y'],
  },
  {
    id: 'rating',
    component: UiRatingField,
    schema: z.number(),
    initial: 4,
    explicitEmpty: 0,
    explicitValue: 2,
  },
  {
    id: 'color-picker',
    component: UiColorPicker,
    schema: z.string(),
    initial: '#ff0000',
    explicitEmpty: '',
    explicitValue: '#00ff00',
  },
  {
    id: 'tree-select',
    component: UiTreeSelect,
    props: { nodes: options },
    schema: z.string(),
    initial: 'b',
    explicitEmpty: '',
    explicitValue: 'c',
  },
  {
    id: 'mentions',
    component: UiMentionsField,
    schema: z.string(),
    initial: 'from-form',
    explicitEmpty: '',
    explicitValue: 'explicit',
  },
  {
    id: 'editable',
    component: UiEditable,
    schema: z.string(),
    initial: 'from-form',
    explicitEmpty: '',
    explicitValue: 'explicit',
  },
  {
    id: 'group/text',
    component: UiTextField,
    inside: 'group',
    schema: z.string(),
    initial: 'from-form',
    explicitEmpty: '',
    explicitValue: 'explicit',
  },
  {
    id: 'group/select',
    component: UiSelect,
    props: { options },
    inside: 'group',
    schema: z.string(),
    initial: 'b',
    explicitEmpty: '',
    explicitValue: 'c',
  },
  {
    id: 'group/switch',
    component: UiSwitch,
    sinceBase: switchSinceBase,
    inside: 'group',
    schema: z.boolean(),
    initial: true,
    explicitEmpty: false,
    explicitValue: true,
    initialAgainstValue: false,
  },
  {
    id: 'repeater/text',
    component: UiTextField,
    inside: 'repeater',
    schema: z.string(),
    initial: 'from-form',
    explicitEmpty: '',
    explicitValue: 'explicit',
  },
  {
    id: 'repeater/select',
    component: UiSelect,
    props: { options },
    inside: 'repeater',
    schema: z.string(),
    initial: 'b',
    explicitEmpty: '',
    explicitValue: 'c',
  },
  {
    id: 'repeater/checkbox',
    component: UiCheckbox,
    inside: 'repeater',
    schema: z.boolean(),
    initial: true,
    explicitEmpty: false,
    explicitValue: true,
    initialAgainstValue: false,
  },
]

type RowId = 'none' | 'initial' | 'null' | 'empty' | 'value'

const NO_INITIAL = Symbol('no initial')
const NOT_PASSED = Symbol('not passed')

interface Row {
  id: RowId
  title: string
  initial: (field: FieldCase) => unknown
  passed: (field: FieldCase) => unknown
}

const rows: Row[] = [
  {
    id: 'none',
    title: 'no value passed, nothing in the form',
    initial: () => NO_INITIAL,
    passed: () => NOT_PASSED,
  },
  {
    id: 'initial',
    title: 'no value passed, a value in the form',
    initial: (field) => field.initial,
    passed: () => NOT_PASSED,
  },
  {
    id: 'null',
    title: 'no value passed, null in the form',
    initial: () => null,
    passed: () => NOT_PASSED,
  },
  {
    id: 'empty',
    title: 'an empty value passed, a value in the form',
    initial: (field) => field.initial,
    passed: (field) => field.explicitEmpty,
  },
  {
    id: 'value',
    title: 'a value passed, another value in the form',
    initial: (field) =>
      field.initialAgainstValue === undefined ? field.initial : field.initialAgainstValue,
    passed: (field) => field.explicitValue,
  },
]

// ─── What one cell of the matrix is ──────────────────────────────────────────

interface Shown {
  /** The field's text, label and error message included. */
  text: string
  /** The value of every input the field draws. */
  inputs: string[]
  /** The ARIA and Reka state of every element that carries one. */
  state: string[]
}

interface Cell {
  /** The form's value at the field's path. */
  value: unknown
  shown: Shown
  dirty: boolean
  valid: boolean
  /** The bound ref, when a value was passed. */
  model?: unknown
}

/** JSON drops `undefined` and flattens dates; the pinned table must not. */
function encode(value: unknown): unknown {
  if (value === undefined) return '<undefined>'
  if (value instanceof NATIVE_DATE) return `<Date ${value.toISOString()}>`
  if (Array.isArray(value)) return value.map(encode)
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)]))
  }
  return value
}

const STATE_ATTRIBUTES = ['aria-checked', 'aria-pressed', 'aria-valuenow', 'data-state']

function readShown(root: Element): Shown {
  const state: string[] = []
  for (const element of root.querySelectorAll(STATE_ATTRIBUTES.map((a) => `[${a}]`).join(','))) {
    const parts = STATE_ATTRIBUTES.flatMap((attribute) => {
      const value = element.getAttribute(attribute)
      return value === null ? [] : [`${attribute}=${value}`]
    })
    state.push(
      `${element.getAttribute('role') ?? element.tagName.toLowerCase()} ${parts.join(' ')}`,
    )
  }
  // The switch and the toggle paint "on" with their fill; Reka's own state
  // attributes on them are not driven by the field's value.
  for (const control of root.querySelectorAll('[data-ui="switch"], [data-ui="toggle"]')) {
    state.push(`fill ${control.className.includes('bg-primary-700') ? 'on' : 'off'}`)
  }
  // The rating's stars say what is selected with a colour and nothing else.
  for (const star of root.querySelectorAll('[data-ui="rating"] button')) {
    state.push(`star ${star.className.includes('text-warning-400') ? 'lit' : 'unlit'}`)
  }
  return {
    text: (root.textContent ?? '').replace(/\s+/g, ' ').trim(),
    inputs: [...root.querySelectorAll('input, textarea')].map(
      (element) => (element as HTMLInputElement).value,
    ),
    state,
  }
}

// ─── Mounting ────────────────────────────────────────────────────────────────

interface FormExposed {
  context: { getValue: (path: string) => unknown }
  isDirty: () => boolean
  isValid: () => boolean
  reset?: () => Promise<void>
}

function pathOf(field: FieldCase): string {
  if (field.inside === 'group') return 'group.field'
  if (field.inside === 'repeater') return 'items.0.field'
  return 'field'
}

function formSchema(field: FieldCase): z.ZodType {
  const leaf = z.object({ field: field.schema })
  if (field.inside === 'group') return z.object({ group: leaf })
  if (field.inside === 'repeater') return z.object({ items: z.array(leaf) })
  return leaf
}

function initialValues(field: FieldCase, initial: unknown): Record<string, unknown> {
  const leaf = initial === NO_INITIAL ? {} : { field: initial }
  if (field.inside === 'group') return initial === NO_INITIAL ? {} : { group: leaf }
  // A repeater draws one row per item, so the row exists even with no value.
  if (field.inside === 'repeater') return { items: [leaf] }
  return leaf
}

/** Formwerk commits field registrations and validates a tick or two later. */
async function settle() {
  await flushPromises()
  await new Promise((resolve) => setTimeout(resolve, 120))
  await flushPromises()
}

interface Mounted {
  wrapper: VueWrapper
  form: () => FormExposed
  read: () => Cell
}

const mounted: VueWrapper[] = []

async function mountCell(field: FieldCase, initial: unknown, passed: unknown): Promise<Mounted> {
  const formRef = ref<unknown>(null)
  const model = ref<unknown>(passed === NOT_PASSED ? undefined : passed)

  function fieldNode(): VNode {
    const binding =
      passed === NOT_PASSED
        ? {}
        : {
            modelValue: model.value,
            'onUpdate:modelValue': (next: unknown) => {
              model.value = next
            },
          }
    return h('div', { 'data-test': 'field' }, [
      h(field.component, { ...field.props, name: 'field', label: 'Field', ...binding }),
    ])
  }

  function body(): VNode {
    if (field.inside === 'group') return h(UiFormGroup, { name: 'group' }, { default: fieldNode })
    if (field.inside === 'repeater') {
      return h(UiFormRepeater, { name: 'items' }, { default: fieldNode })
    }
    return fieldNode()
  }

  const Host = defineComponent({
    setup() {
      // Recording only. At a22d396 `UiSwitch` handed Formwerk a component where
      // it expected an element, and a watcher threw. A browser carries on past
      // that (Vue hands it to the app's error handler and the switch still
      // paints), so the measurement does too. An assertion run captures
      // nothing: an error fails it.
      if (RECORD) onErrorCaptured(() => false)
      return () =>
        h(
          UiForm,
          { ref: formRef, schema: formSchema(field), initialValues: initialValues(field, initial) },
          { default: body },
        )
    },
  })

  const wrapper = mount(Host, { attachTo: document.body })
  mounted.push(wrapper)
  await settle()

  const form = () => formRef.value as FormExposed
  const path = pathOf(field)

  return {
    wrapper,
    form,
    read() {
      const cell: Cell = {
        value: encode(form().context.getValue(path)),
        shown: readShown(wrapper.get('[data-test="field"]').element),
        dirty: form().isDirty(),
        valid: form().isValid(),
      }
      if (passed !== NOT_PASSED) cell.model = encode(model.value)
      return cell
    },
  }
}

beforeEach(() => {
  // Empty date fields expose today's segments. The recorded baseline was
  // measured on this date; mock only Date so real settling timers still run.
  vi.setSystemTime(new Date('2026-10-08T12:00:00.000Z'))
})

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  document.body.innerHTML = ''
  vi.useRealTimers()
})

// ─── The matrix ──────────────────────────────────────────────────────────────

const recorded: Record<string, Partial<Record<RowId, Cell>>> = {}

afterAll(() => {
  if (RECORD) writeFileSync(RECORD, `${JSON.stringify(recorded, null, 2)}\n`)
})

describe.each(cases)('a $id field inside UiForm', (field) => {
  for (const row of rows) {
    const passed = row.passed(field)
    if (passed === NOT_APPLICABLE) continue

    it(`${row.id}: ${row.title}`, async () => {
      const { form, read } = await mountCell(field, row.initial(field), passed)
      const cell = read()

      if (RECORD) {
        ;(recorded[field.id] ??= {})[row.id] = cell
        return
      }

      const measured = MEASURED_AT_A22D396[field.id]?.[row.id]
      if (!measured) throw new Error('this cell was never measured at a22d396')
      const base = field.sinceBase ? field.sinceBase(measured) : measured

      if (row.id !== 'initial' || field.keptAtBase) {
        expect(cell).toEqual(base)
      } else {
        // The one deliberate change: the field opens on the record's value,
        // and shows what it shows when handed that value outright.
        const reference = await mountCell(field, NO_INITIAL, field.initial)
        expect(cell.value).toEqual(encode(field.initial))
        expect(cell.shown).toEqual(reference.read().shown)
      }

      // Every row: nothing was edited, so nothing is dirty.
      expect(cell.dirty).toBe(false)

      // A bound ref never disagrees with the form about a value it passed.
      if (passed !== NOT_PASSED && !field.keptAtBase) expect(cell.model).toEqual(cell.value)

      // `reset()` returns to the state the form opened in.
      await form().reset?.()
      await settle()
      expect(read()).toEqual(cell)
    })
  }
})

describe('the rule, where it shows', () => {
  it('opens every field of an edit form on the record, valid and clean', async () => {
    for (const field of cases.filter((candidate) => !candidate.keptAtBase)) {
      const { read } = await mountCell(field, field.initial, NOT_PASSED)
      expect(read(), field.id).toMatchObject({
        value: encode(field.initial),
        dirty: false,
        valid: true,
      })
    }
  })

  /** The types with an empty value of their own, and that value. */
  const withDefault: Array<[id: string, empty: unknown]> = [
    ['select', ''],
    ['select-multiple', []],
    ['combobox', ''],
    ['tags', []],
    ['otp', ''],
    ['checkbox', false],
    ['switch', false],
    ['toggle', false],
    ['rating', 0],
    ['color-picker', '#000000'],
    ['tree-select', ''],
    ['mentions', ''],
    ['editable', ''],
  ]

  it('never keeps a null the record holds for a field with an empty default', async () => {
    for (const [id, empty] of withDefault) {
      const field = cases.find((candidate) => candidate.id === id)!
      const { read } = await mountCell(field, null, NOT_PASSED)
      expect(read(), id).toMatchObject({ value: empty, dirty: false, valid: true })
    }
  })

  it('submits a form whose record holds nulls, as the values the fields show', async () => {
    const submitted: unknown[] = []
    const schema = z.object({
      category: z.string(),
      owner: z.string(),
      tags: z.array(z.string()),
      active: z.boolean(),
    })
    const wrapper = mount(
      defineComponent({
        setup() {
          return () =>
            h(
              UiForm,
              {
                schema,
                initialValues: { category: null, owner: null, tags: null, active: null },
                onSubmit: (values: unknown) => submitted.push(values),
              },
              {
                default: () => [
                  h(UiSelect, { name: 'category', label: 'Category', options }),
                  h(UiComboBox, { name: 'owner', label: 'Owner', options }),
                  h(UiTagsField, { name: 'tags', label: 'Tags' }),
                  h(UiSwitch, { name: 'active', label: 'Active' }),
                ],
              },
            )
        },
      }),
      { attachTo: document.body },
    )
    mounted.push(wrapper)
    await settle()

    expect(wrapper.findAll('[role="alert"]')).toHaveLength(0)
    await wrapper.get('form').trigger('submit')
    await settle()

    expect(submitted).toEqual([{ category: '', owner: '', tags: [], active: false }])
  })

  // Outside a form there is nothing for a default to yield to. A field handed
  // no value must be the field handed its empty value, not one that shows or
  // holds the marker a default travels under inside a form.
  it('leaves a field outside a form, or one with no name, as it was', async () => {
    async function shownBy(field: FieldCase, props: Record<string, unknown>, inForm: boolean) {
      const node = () =>
        h('div', { 'data-test': 'field' }, [
          h(field.component, { ...field.props, label: 'Field', ...props }),
        ])
      const wrapper = mount(
        defineComponent({
          setup: () => () => (inForm ? h(UiForm, {}, { default: node }) : node()),
        }),
        { attachTo: document.body },
      )
      mounted.push(wrapper)
      await settle()
      return readShown(wrapper.get('[data-test="field"]').element)
    }

    for (const [id, empty] of withDefault) {
      const field = cases.find((candidate) => candidate.id === id)!
      // The OTP field never took its value from the prop it is handed.
      if (field.keptAtBase) continue

      const standalone = await shownBy(field, { name: 'field' }, false)
      expect(standalone, `${id}, standalone`).toEqual(
        await shownBy(field, { name: 'field', modelValue: empty }, false),
      )
      expect(JSON.stringify(standalone), id).not.toContain('object Object')

      expect(await shownBy(field, {}, true), `${id}, unnamed in a form`).toEqual(
        await shownBy(field, { modelValue: empty }, true),
      )
    }
  })
})
