import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { defineComponent, h, ref, type PropType } from 'vue'
import { z } from 'zod'

import { installValidationMessages } from '@/bootstrap/validation-messages'
import { UiForm, UiFormGroup, UiFormRepeater, UiSelect, UiTextField } from '@/components/ui'
import { getI18n } from '@/plugins/i18n'
import { AppError, httpError, installErrorReporter, resetErrorReporter } from '~/lib/errors'
import type { FormProps } from '~/types/forms'

/**
 * `UiForm`'s submit lifecycle, against the real Formwerk.
 *
 * Nothing here is mocked except the save itself: what is under test is how
 * `UiForm` drives Formwerk, and a mock of Formwerk would only prove the test
 * agrees with itself.
 */

const i18n = getI18n()

type Values = Record<string, unknown>

/** What `UiForm` exposes through a template ref. */
interface FormExposed {
  values: Values
  context: { getValues: () => Values }
  isSubmitting: boolean
  wasSubmitted: boolean
  isDirty: () => boolean
  isTouched: () => boolean
  isValid: () => boolean
  formErrors: string[]
  submitError: AppError | null
  setErrors: (errors: Record<string, string | string[]>) => void
  clearErrors: () => void
  setValues: (values: Values) => void
  reset: (values?: Values) => Promise<void>
}

const schema = z.object({
  company: z.string().min(1),
  contactName: z.string().min(1),
  email: z.email(),
  city: z.string().optional(),
  status: z.enum(['prospect', 'active']),
  items: z.array(z.object({ name: z.string(), qty: z.string() })).optional(),
})

const valid: Values = {
  company: 'Acme',
  contactName: 'Ada',
  email: 'ada@acme.test',
  city: 'Paris',
  status: 'active',
  items: [
    { name: 'Widget', qty: '1' },
    { name: 'Gadget', qty: '2' },
  ],
}

const statusOptions = [
  { label: 'Prospect', value: 'prospect' },
  { label: 'Active', value: 'active' },
]

interface Harness {
  wrapper: VueWrapper
  form: () => FormExposed
  events: { submit: Values[]; success: unknown[][]; error: unknown[][] }
  submit: () => Promise<void>
  type: (name: string, value: string) => Promise<void>
  fieldError: (name: string) => string | undefined
  formErrors: () => string[]
  slot: () => { isDirty: boolean; isSubmitting: boolean; isValid: boolean }
}

/** Formwerk validates and commits field registrations a tick or two later. */
async function settle() {
  await flushPromises()
  await new Promise((resolve) => setTimeout(resolve, 30))
  await flushPromises()
}

async function mountForm(
  props: Partial<FormProps> & { initialValues?: Values } = {},
  options: { withCityField?: boolean } = {},
): Promise<Harness> {
  const formRef = ref<unknown>(null)
  const events: Harness['events'] = { submit: [], success: [], error: [] }

  const Host = defineComponent({
    props: { withCity: { type: Boolean as PropType<boolean>, default: true } },
    setup(hostProps) {
      return () =>
        h(
          UiForm,
          {
            ref: formRef,
            schema,
            initialValues: valid,
            ...props,
            onSubmit: (values: Values) => events.submit.push(values),
            onSuccess: (...args: unknown[]) => events.success.push(args),
            onError: (...args: unknown[]) => events.error.push(args),
          },
          {
            default: (slot: Record<string, unknown>) => [
              h(
                'ul',
                { 'data-test': 'form-errors' },
                (slot.formErrors as string[]).map((message) => h('li', message)),
              ),
              h(UiTextField, { name: 'company', label: 'Company' }),
              h(UiTextField, { name: 'contactName', label: 'Contact' }),
              h(UiTextField, { name: 'email', label: 'Email' }),
              hostProps.withCity ? h(UiTextField, { name: 'city', label: 'City' }) : null,
              h(UiSelect, { name: 'status', label: 'Status', options: statusOptions }),
              h(UiTextField, { name: 'items.0.name', label: 'First item' }),
              h(UiTextField, { name: 'items.0.qty', label: 'First quantity' }),
              h(UiTextField, { name: 'items.1.name', label: 'Second item' }),
              h(UiTextField, { name: 'items.1.qty', label: 'Second quantity' }),
              h(
                'output',
                { 'data-test': 'slot' },
                JSON.stringify({
                  isDirty: slot.isDirty,
                  isSubmitting: slot.isSubmitting,
                  isValid: slot.isValid,
                }),
              ),
              h('button', { type: 'submit' }, 'Save'),
            ],
          },
        )
    },
  })

  const wrapper = mount(Host, {
    attachTo: document.body,
    props: { withCity: options.withCityField ?? true },
  })
  await settle()

  const input = (name: string) => wrapper.find<HTMLInputElement>(`input[name="${name}"]`)

  return {
    wrapper,
    form: () => formRef.value as FormExposed,
    events,
    submit: async () => {
      await wrapper.find('form').trigger('submit')
      await settle()
    },
    type: async (name, value) => {
      await input(name).setValue(value)
      await settle()
    },
    fieldError: (name) =>
      input(name).element.parentElement?.querySelector('[role="alert"]')?.textContent?.trim(),
    formErrors: () => wrapper.findAll('[data-test="form-errors"] li').map((item) => item.text()),
    slot: () => JSON.parse(wrapper.find('[data-test="slot"]').text()),
  }
}

/** A promise settled from outside, standing in for a request in flight. */
function deferred<T = unknown>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** What the API client raises for a 422 whose body carried these field errors. */
function validationError(details: Record<string, string[]>, formErrors?: string[]): AppError {
  return httpError(422, { details, formErrors })
}

const reported = vi.fn()
const mounted: VueWrapper[] = []

async function open(...args: Parameters<typeof mountForm>): Promise<Harness> {
  const harness = await mountForm(...args)
  mounted.push(harness.wrapper)
  return harness
}

beforeEach(() => {
  i18n.global.locale.value = 'en'
  reported.mockClear()
  installErrorReporter({ name: 'test', captureException: reported, setUser: () => {} })
})

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  resetErrorReporter()
  i18n.global.locale.value = 'en'
})

describe('a form with no action', () => {
  it('emits submit with the validated values, and nothing else', async () => {
    const { submit, events } = await open()

    await submit()

    expect(events.submit).toEqual([valid])
    expect(events.success).toEqual([])
    expect(events.error).toEqual([])
  })

  it('does not emit when the schema rejects the values', async () => {
    const { submit, events, fieldError } = await open({
      initialValues: { ...valid, email: 'nope' },
    })

    await submit()

    expect(events.submit).toEqual([])
    expect(fieldError('email')).toBeTruthy()
  })

  it('does not wait for whoever listens, as it never did', async () => {
    const { submit, slot, events } = await open()

    await submit()

    expect(events.submit).toHaveLength(1)
    expect(slot().isSubmitting).toBe(false)
    // Nothing was saved as far as the form knows, so nothing was re-baselined.
    expect(slot().isDirty).toBe(false)
  })

  it('shows what the schema says from the moment it opens, as it always did', async () => {
    const { fieldError } = await open({ initialValues: { ...valid, company: '' } })

    expect(fieldError('company')).toBeTruthy()
  })
})

describe('a form with an action', () => {
  it('awaits it, with isSubmitting true for the whole save', async () => {
    const save = deferred()
    const action = vi.fn(() => save.promise)
    const { submit, slot, form, events } = await open({ action })

    await submit()

    expect(action).toHaveBeenCalledExactlyOnceWith(valid)
    expect(slot().isSubmitting).toBe(true)
    expect(form().isSubmitting).toBe(true)
    expect(events.success).toEqual([])

    save.resolve({ id: 'CUS-1' })
    await settle()

    expect(slot().isSubmitting).toBe(false)
    expect(events.success).toEqual([[{ id: 'CUS-1' }, valid]])
    // The action replaces the event; a page that listened to both would save twice.
    expect(events.submit).toEqual([])
  })

  it('ignores a second submit while the first is saving', async () => {
    const save = deferred()
    const action = vi.fn(() => save.promise)
    const { submit, events } = await open({ action })

    await submit()
    await submit()
    await submit()

    expect(action).toHaveBeenCalledTimes(1)

    save.resolve('saved')
    await settle()
    expect(events.success).toHaveLength(1)

    // Once it has finished, the form can be submitted again.
    await submit()
    expect(action).toHaveBeenCalledTimes(2)
  })

  it('does not call it when the schema rejects the values', async () => {
    const action = vi.fn()
    const { submit, slot } = await open({ action, initialValues: { ...valid, email: 'nope' } })

    await submit()

    expect(action).not.toHaveBeenCalled()
    expect(slot().isSubmitting).toBe(false)
  })

  it('accepts an action that is not async', async () => {
    const { submit, events } = await open({ action: (values: Values) => values.company })

    await submit()

    expect(events.success).toEqual([['Acme', valid]])
  })

  it('makes the saved values the new baseline', async () => {
    const { submit, type, slot, form } = await open({ action: () => Promise.resolve() })

    await type('company', 'Acme Ltd')
    expect(slot().isDirty).toBe(true)

    await submit()

    expect(slot().isDirty).toBe(false)
    expect(form().values.company).toBe('Acme Ltd')

    // Clean means clean against what was saved, not against what was loaded.
    await type('company', 'Acme')
    expect(slot().isDirty).toBe(true)
    await type('company', 'Acme Ltd')
    expect(slot().isDirty).toBe(false)
  })

  it('keeps a field dirty that was edited while the save was in flight', async () => {
    const save = deferred()
    const { submit, type, slot } = await open({ action: () => save.promise })

    await type('company', 'Acme Ltd')
    await submit()
    await type('city', 'Lyon')

    save.resolve(null)
    await settle()

    // `company` was saved; `city` changed after the request left.
    expect(slot().isDirty).toBe(true)
    await type('city', 'Paris')
    expect(slot().isDirty).toBe(false)
  })

  it('goes back to the initial values with resetOnSuccess', async () => {
    const { submit, type, slot, form } = await open({
      action: () => Promise.resolve(),
      resetOnSuccess: true,
    })

    await type('company', 'Acme Ltd')
    await submit()

    expect(form().values.company).toBe('Acme')
    expect(slot().isDirty).toBe(false)
  })
})

describe('a rejected action', () => {
  it('is caught, emitted as error, and leaves the form ready to submit again', async () => {
    const failure = httpError(409, { message: 'That company already exists.' })
    const action = vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce('saved')
    const { submit, slot, events, formErrors } = await open({ action })

    await submit()

    expect(slot().isSubmitting).toBe(false)
    expect(events.error).toEqual([[failure, valid]])
    expect(events.success).toEqual([])
    expect(formErrors()).toEqual(['That company already exists.'])

    await submit()

    expect(events.success).toEqual([['saved', valid]])
    expect(formErrors()).toEqual([])
  })

  it('does not report a request the server refused', async () => {
    for (const status of [400, 401, 403, 404, 409, 422, 429]) {
      const { submit } = await open({ action: () => Promise.reject(httpError(status)) })
      await submit()
    }

    expect(reported).not.toHaveBeenCalled()
  })

  it('reports a server error once, and shows the generic message in the reader’s language', async () => {
    const failure = httpError(500, { message: 'pq: connection refused at 10.0.0.4' })
    const { submit, formErrors, events, form } = await open({
      action: () => Promise.reject(failure),
    })

    await submit()

    expect(reported).toHaveBeenCalledTimes(1)
    expect(reported.mock.calls[0]![0]).toBe(failure)
    expect(reported.mock.calls[0]![1]).toMatchObject({ source: 'form:action' })
    expect(formErrors()).toEqual([i18n.global.t('errors.status_500')])
    expect(formErrors()[0]).not.toContain('pq:')
    expect(events.error).toHaveLength(1)
    expect(form().submitError).toBe(failure)

    i18n.global.locale.value = 'fr'
    await settle()
    expect(formErrors()).toEqual([i18n.global.t('errors.status_500', {}, { locale: 'fr' })])
    expect(formErrors()[0]).not.toBe(i18n.global.t('errors.status_500', {}, { locale: 'en' }))
  })

  it('reports a bug in the action, and says something went wrong', async () => {
    const bug = new TypeError("Cannot read properties of undefined (reading 'id')")
    const { submit, formErrors, slot } = await open({ action: () => Promise.reject(bug) })

    await submit()

    expect(reported).toHaveBeenCalledTimes(1)
    expect(reported.mock.calls[0]![0]).toBe(bug)
    expect(formErrors()).toEqual([i18n.global.t('errors.unknown')])
    expect(slot().isSubmitting).toBe(false)
  })

  it('survives an action that throws before it returns a promise', async () => {
    const { submit, slot, events } = await open({
      action: () => {
        throw new Error('boom')
      },
    })

    await submit()

    expect(slot().isSubmitting).toBe(false)
    expect(events.error).toHaveLength(1)
    expect(reported).toHaveBeenCalledTimes(1)
  })

  it('neither shows nor reports a request the app cancelled itself', async () => {
    const aborted = new AppError({
      message: 'cancelled',
      code: 'ABORTED',
      status: 0,
      kind: 'aborted',
    })
    const { submit, formErrors, events } = await open({ action: () => Promise.reject(aborted) })

    await submit()

    expect(formErrors()).toEqual([])
    expect(reported).not.toHaveBeenCalled()
    expect(events.error).toEqual([[aborted, valid]])
  })

  it('does not hand the rejection to Vue’s error handler', async () => {
    const onVueError = vi.fn()
    const harness = await open({ action: () => Promise.reject(httpError(422)) })
    harness.wrapper.vm.$.appContext.config.errorHandler = onVueError

    await harness.submit()

    expect(onVueError).not.toHaveBeenCalled()
  })
})

describe('the server’s messages for fields', () => {
  it('puts an ASP.NET key on the field it names', async () => {
    const { submit, fieldError, formErrors } = await open({
      action: () =>
        Promise.reject(
          validationError({
            Email: ['The Email field is not a valid e-mail address.'],
            'Items[0].Name': ['The Name field is required.'],
            'Items[1].Qty': ['Quantity must be positive.'],
          }),
        ),
    })

    await submit()

    expect(fieldError('email')).toBe('The Email field is not a valid e-mail address.')
    expect(fieldError('items.0.name')).toBe('The Name field is required.')
    expect(fieldError('items.1.qty')).toBe('Quantity must be positive.')
    expect(fieldError('items.0.qty')).toBeUndefined()
    // Every key found its field, so the form says only that the save failed.
    expect(formErrors()).toEqual([i18n.global.t('errors.status_422')])
  })

  it('puts a Laravel snake_case key on the camelCase field', async () => {
    const { submit, fieldError } = await open({
      action: () =>
        Promise.reject(
          httpError(422, {
            message: 'The given data was invalid.',
            details: { contact_name: ['The contact name has already been taken.'] },
          }),
        ),
    })

    await submit()

    expect(fieldError('contactName')).toBe('The contact name has already been taken.')
  })

  it('puts a nested Django REST Framework path on the nested field', async () => {
    const { submit, fieldError, formErrors } = await open({
      action: () =>
        Promise.reject(
          validationError({ 'items.1.qty': ['A valid integer is required.'] }, [
            'The order total does not match its lines.',
          ]),
        ),
    })

    await submit()

    expect(fieldError('items.1.qty')).toBe('A valid integer is required.')
    // DRF's `non_field_errors` belong to the form.
    expect(formErrors()).toEqual(['The order total does not match its lines.'])
  })

  it('follows the fieldMap where the names do not line up', async () => {
    const { submit, fieldError, formErrors } = await open({
      fieldMap: { 'Address.City': 'city', primary_contact: 'contactName' },
      action: () =>
        Promise.reject(
          validationError({
            'Address.City': ['City is not served.'],
            primary_contact: ['Contact is required.'],
          }),
        ),
    })

    await submit()

    expect(fieldError('city')).toBe('City is not served.')
    expect(fieldError('contactName')).toBe('Contact is required.')
    expect(formErrors()).toEqual([i18n.global.t('errors.status_422')])
  })

  it('uses the form’s own strategy instead of the default when it is given one', async () => {
    const { submit, fieldError } = await open({
      fieldPath: (key: string) => (key === 'mail' ? 'email' : key),
      action: () => Promise.reject(validationError({ mail: ['Already registered.'] })),
    })

    await submit()

    expect(fieldError('email')).toBe('Already registered.')
  })

  it('shows a key that matches no field at the top of the form, never nowhere', async () => {
    const { submit, formErrors, fieldError } = await open({
      action: () =>
        Promise.reject(
          validationError({
            vat_number: ['The VAT number is not valid.'],
            email: ['Already registered.'],
          }),
        ),
    })

    await submit()

    expect(formErrors()).toEqual(['vat_number: The VAT number is not valid.'])
    expect(fieldError('email')).toBe('Already registered.')
  })

  it('treats a field the form is not showing as no field', async () => {
    const { submit, formErrors } = await open(
      { action: () => Promise.reject(validationError({ city: ['City is not served.'] })) },
      { withCityField: false },
    )

    await submit()

    // `city` is in the initial values, but nothing renders it.
    expect(formErrors()).toEqual(['city: City is not served.'])
  })

  it('follows a field that is mounted and unmounted', async () => {
    const action = vi.fn(() => Promise.reject(validationError({ city: ['City is not served.'] })))
    const { submit, formErrors, fieldError, wrapper } = await open({ action })

    await submit()
    expect(fieldError('city')).toBe('City is not served.')

    await wrapper.setProps({ withCity: false })
    await settle()
    await submit()
    expect(formErrors()).toEqual(['city: City is not served.'])

    await wrapper.setProps({ withCity: true })
    await settle()
    await submit()
    expect(fieldError('city')).toBe('City is not served.')
  })

  it('reads a key named constructor or __proto__ as a key', async () => {
    const details = JSON.parse(
      '{"constructor":["Bad constructor."],"__proto__":["Bad proto."],"toString":["Bad string."]}',
    ) as Record<string, string[]>
    const { submit, formErrors, fieldError } = await open({
      action: () => Promise.reject(validationError(details)),
    })

    await submit()

    expect(formErrors()).toEqual([
      'constructor: Bad constructor.',
      '__proto__: Bad proto.',
      'toString: Bad string.',
    ])
    expect(fieldError('company')).toBeUndefined()
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('shows a message as text, whatever is in it', async () => {
    const { submit, wrapper, fieldError } = await open({
      action: () =>
        Promise.reject(
          validationError({
            email: ['<img src=x onerror="window.__pwned = 1"> is taken'],
            unknown: ['<script>window.__pwned = 1</script>'],
          }),
        ),
    })

    await submit()

    expect(fieldError('email')).toBe('<img src=x onerror="window.__pwned = 1"> is taken')
    expect(wrapper.find('form img').exists()).toBe(false)
    expect(wrapper.find('form script').exists()).toBe(false)
  })

  it('ignores details that are not messages', async () => {
    const details = { email: [42, null, { nested: 'x' }, ''], company: 'Taken.' } as never
    const { submit, fieldError } = await open({
      action: () => Promise.reject(validationError(details)),
    })

    await submit()

    expect(fieldError('email')).toBeUndefined()
    expect(fieldError('company')).toBe('Taken.')
  })

  it('does not map the response paths of a contract mismatch onto fields', async () => {
    const mismatch = new AppError({
      message: 'The server sent a response this app could not read.',
      code: 'CONTRACT_MISMATCH',
      kind: 'contract',
      messageKey: 'errors.contract',
      details: { email: ['Expected string, received number'] },
    })
    const { submit, fieldError, formErrors } = await open({
      action: () => Promise.reject(mismatch),
    })

    await submit()

    expect(fieldError('email')).toBeUndefined()
    expect(formErrors()).toEqual([i18n.global.t('errors.contract')])
    expect(reported).toHaveBeenCalledTimes(1)
  })

  it('clears a field’s message when that field is edited, and only that one', async () => {
    const { submit, type, fieldError, formErrors } = await open({
      action: () =>
        Promise.reject(
          validationError({ email: ['Already registered.'], company: ['Already exists.'] }),
        ),
    })

    await submit()
    expect(fieldError('email')).toBe('Already registered.')
    expect(fieldError('company')).toBe('Already exists.')

    // Editing another field revalidates the whole schema. The server's
    // messages are not the schema's to clear.
    await type('city', 'Lyon')
    expect(fieldError('email')).toBe('Already registered.')
    expect(fieldError('company')).toBe('Already exists.')

    await type('email', 'ada@acme.example')
    expect(fieldError('email')).toBeUndefined()
    expect(fieldError('company')).toBe('Already exists.')
    expect(formErrors()).toHaveLength(1)

    // The last one gone, the summary that only said "check the fields" goes too.
    await type('company', 'Acme Ltd')
    expect(fieldError('company')).toBeUndefined()
    expect(formErrors()).toEqual([])
  })

  it('does not stop the form being submitted again', async () => {
    const action = vi
      .fn()
      .mockRejectedValueOnce(validationError({ email: ['Already registered.'] }))
      .mockResolvedValueOnce('saved')
    const { submit, fieldError, events, slot } = await open({ action })

    await submit()
    expect(fieldError('email')).toBe('Already registered.')
    // What the server said is not the schema's verdict.
    expect(slot().isValid).toBe(true)

    await submit()

    expect(action).toHaveBeenCalledTimes(2)
    expect(events.success).toHaveLength(1)
    expect(fieldError('email')).toBeUndefined()
  })
})

describe('fields inside a group and a repeater', () => {
  it('are found by their full path, which is where the server’s message goes', async () => {
    const action = vi.fn((_values: Values) =>
      Promise.reject(
        validationError({
          'Address.City': ['City is not served.'],
          'contacts[1].email': ['Already registered.'],
        }),
      ),
    )
    const wrapper = mount(
      defineComponent({
        setup: () => () =>
          h(
            UiForm,
            {
              initialValues: {
                address: { city: 'Paris' },
                contacts: [{ email: 'a@acme.test' }, { email: 'b@acme.test' }],
              },
              action,
            },
            {
              default: (slot: Record<string, unknown>) => [
                h(
                  'output',
                  { 'data-test': 'form-errors' },
                  (slot.formErrors as string[]).join('|'),
                ),
                h(UiFormGroup, { name: 'address', label: 'Address' }, () => [
                  h(UiTextField, { name: 'city', label: 'City' }),
                ]),
                h(UiFormRepeater, { name: 'contacts' }, () => [
                  h(UiTextField, { name: 'email', label: 'Email' }),
                ]),
              ],
            },
          ),
      }),
      { attachTo: document.body },
    )
    mounted.push(wrapper)
    await settle()

    const inputs = wrapper.findAll<HTMLInputElement>('input')
    const errorUnder = (index: number) =>
      inputs[index]!.element.parentElement?.querySelector('[role="alert"]')?.textContent?.trim()
    expect(inputs.map((field) => field.element.value)).toEqual([
      'Paris',
      'a@acme.test',
      'b@acme.test',
    ])

    await wrapper.find('form').trigger('submit')
    await settle()

    // Named relative to the group and the repeater, held at the full path.
    expect(action.mock.calls[0]![0]).toEqual({
      address: { city: 'Paris' },
      contacts: [{ email: 'a@acme.test' }, { email: 'b@acme.test' }],
    })
    expect(errorUnder(0)).toBe('City is not served.')
    expect(errorUnder(1)).toBeUndefined()
    expect(errorUnder(2)).toBe('Already registered.')
    expect(wrapper.find('[data-test="form-errors"]').text()).toBe(
      i18n.global.t('errors.status_422'),
    )

    await inputs[2]!.setValue('c@acme.test')
    await settle()
    expect(errorUnder(2)).toBeUndefined()
    expect(errorUnder(0)).toBe('City is not served.')
  })
})

describe('a field named with brackets', () => {
  it('gets the server’s message whichever way the two sides spell the index', async () => {
    const formRef = ref<unknown>(null)
    const action = vi.fn(() =>
      Promise.reject(validationError({ 'Lines[0].Sku': ['Unknown SKU.'] })),
    )
    const wrapper = mount(
      defineComponent({
        setup: () => () =>
          h(
            UiForm,
            { ref: formRef, initialValues: { lines: [{ sku: 'A-1' }] }, action },
            {
              default: (slot: Record<string, unknown>) => [
                h(
                  'output',
                  { 'data-test': 'form-errors' },
                  (slot.formErrors as string[]).join('|'),
                ),
                h(UiTextField, { name: 'lines[0].sku', label: 'SKU' }),
              ],
            },
          ),
      }),
      { attachTo: document.body },
    )
    mounted.push(wrapper)
    await settle()
    const sku = wrapper.find<HTMLInputElement>('input')
    const skuError = () =>
      sku.element.parentElement?.querySelector('[role="alert"]')?.textContent?.trim()

    await wrapper.find('form').trigger('submit')
    await settle()

    expect(action).toHaveBeenCalledTimes(1)
    expect(skuError()).toBe('Unknown SKU.')
    expect(wrapper.find('[data-test="form-errors"]').text()).toBe(
      i18n.global.t('errors.status_422'),
    )

    await sku.setValue('B-2')
    await settle()
    expect(skuError()).toBeUndefined()

    ;(formRef.value as FormExposed).setErrors({ 'lines[0].sku': 'Discontinued.' })
    await settle()
    expect(skuError()).toBe('Discontinued.')
  })
})

describe('the exposed methods', () => {
  it('setErrors puts messages on fields and on the form', async () => {
    const { form, fieldError, formErrors, type } = await open()

    form().setErrors({
      email: 'Already registered.',
      'items.0.name': ['Out of stock.', 'Discontinued.'],
      '': 'Could not save.',
      nowhere: 'Has no field.',
    })
    await settle()

    expect(fieldError('email')).toBe('Already registered.')
    expect(fieldError('items.0.name')).toBe('Out of stock.')
    expect(formErrors()).toEqual(['Could not save.', 'nowhere: Has no field.'])
    expect(form().formErrors).toEqual(['Could not save.', 'nowhere: Has no field.'])

    await type('email', 'ada@acme.example')
    expect(fieldError('email')).toBeUndefined()
  })

  it('clearErrors removes them', async () => {
    const { form, fieldError, formErrors } = await open()
    form().setErrors({ email: 'Already registered.', '': 'Could not save.' })
    await settle()

    form().clearErrors()
    await settle()

    expect(fieldError('email')).toBeUndefined()
    expect(formErrors()).toEqual([])
  })

  it('setValues changes the values and leaves the baseline alone', async () => {
    const { form, slot, wrapper } = await open()

    form().setValues({ company: 'Globex', items: [{ name: 'Sprocket', qty: '9' }] })
    await settle()

    expect(wrapper.find<HTMLInputElement>('input[name="company"]').element.value).toBe('Globex')
    expect(wrapper.find<HTMLInputElement>('input[name="items.0.name"]').element.value).toBe(
      'Sprocket',
    )
    expect(form().values.email).toBe('ada@acme.test')
    expect(slot().isDirty).toBe(true)

    form().setValues({ company: 'Acme', items: valid.items })
    await settle()
    expect(slot().isDirty).toBe(false)
  })

  it('reset() goes back to the baseline and clears the server’s messages', async () => {
    const { form, slot, type, fieldError, wrapper } = await open()
    await type('company', 'Globex')
    form().setErrors({ email: 'Already registered.' })
    await settle()

    await form().reset()
    await settle()

    expect(wrapper.find<HTMLInputElement>('input[name="company"]').element.value).toBe('Acme')
    expect(slot().isDirty).toBe(false)
    expect(fieldError('email')).toBeUndefined()
  })

  it('reset(values) makes those values the baseline', async () => {
    const { form, slot, type, wrapper } = await open()
    const next = { ...valid, company: 'Initech', email: 'bill@initech.test' }

    await form().reset(next)
    await settle()

    expect(wrapper.find<HTMLInputElement>('input[name="company"]').element.value).toBe('Initech')
    expect(slot().isDirty).toBe(false)

    await type('company', 'Acme')
    expect(slot().isDirty).toBe(true)
    await type('company', 'Initech')
    expect(slot().isDirty).toBe(false)
  })

  it('still exposes what it always did', async () => {
    const { form } = await open()
    const exposed = form()

    expect(exposed.values.company).toBe('Acme')
    expect(exposed.context.getValues()).toEqual(valid)
    expect(exposed.isDirty()).toBe(false)
    expect(exposed.isTouched()).toBe(false)
    expect(exposed.isValid()).toBe(true)
    expect(exposed.isSubmitting).toBe(false)
    expect(exposed.wasSubmitted).toBe(false)
  })
})

describe('showErrors="touched"', () => {
  const empty = { ...valid, company: '', email: '' }

  // The boot step that makes zod speak the catalog's language, which is what
  // these messages are in the app.
  let uninstall: () => void
  beforeEach(() => {
    uninstall = installValidationMessages()
  })
  afterEach(() => uninstall())

  it('holds the schema’s messages back until the field has been left', async () => {
    const { fieldError, wrapper, type, slot } = await open({
      showErrors: 'touched',
      initialValues: empty,
    })

    expect(fieldError('company')).toBeUndefined()
    expect(fieldError('email')).toBeUndefined()
    // Hidden, not absent: the form still knows it is invalid.
    expect(slot().isValid).toBe(false)

    // Typing is not leaving.
    await type('email', 'nope')
    expect(fieldError('email')).toBeUndefined()

    await wrapper.find('input[name="email"]').trigger('blur')
    await settle()
    expect(fieldError('email')).toBe('Please enter a valid email address')
    expect(fieldError('company')).toBeUndefined()
  })

  it('shows all of them once the user tries to submit', async () => {
    const action = vi.fn()
    const { fieldError, submit } = await open({
      showErrors: 'touched',
      initialValues: empty,
      action,
    })

    await submit()

    expect(action).not.toHaveBeenCalled()
    expect(fieldError('company')).toBe('This field is required')
    expect(fieldError('email')).toBe('Please enter a valid email address')
  })

  it('shows what the server said regardless', async () => {
    const { fieldError, submit } = await open({
      showErrors: 'touched',
      action: () => Promise.reject(validationError({ email: ['Already registered.'] })),
    })

    await submit()

    expect(fieldError('email')).toBe('Already registered.')
  })

  it('hides them again after a reset', async () => {
    const { fieldError, submit, form } = await open({ showErrors: 'touched', initialValues: empty })
    await submit()
    expect(fieldError('company')).toBeTruthy()

    await form().reset()
    await settle()

    expect(fieldError('company')).toBeUndefined()
  })
})

describe('a select inside the form', () => {
  it('starts from the form’s initial value, not from its own empty default', async () => {
    const { form, wrapper, slot, submit, events } = await open()

    expect(form().values.status).toBe('active')
    expect(wrapper.find('[data-ui="select"]').text()).toContain('Active')
    expect(slot().isValid).toBe(true)
    expect(slot().isDirty).toBe(false)

    await submit()
    expect(events.submit[0]).toMatchObject({ status: 'active' })
  })

  it('is still empty when the form has no value for it', async () => {
    const { status: _status, ...withoutStatus } = valid
    const { form, slot } = await open({ initialValues: withoutStatus })

    expect(form().values.status).toBe('')
    expect(slot().isValid).toBe(false)
  })
})
