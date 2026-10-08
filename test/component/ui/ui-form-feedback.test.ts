import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { defineComponent, h, ref } from 'vue'
import { z } from 'zod'

import { installValidationMessages } from '@/bootstrap/validation-messages'
import { UiButton, UiForm, UiTextField } from '@/components/ui'
import { mapServerErrors } from '@/composables/forms'
import { getI18n } from '@/plugins/i18n'
import {
  httpError,
  installErrorReporter,
  resetErrorReporter,
  transportError,
  type AppError,
} from '~/lib/errors'

/**
 * What a form tells its user after a submit, against the real Formwerk: where
 * focus goes, what language the messages are in, what is reported as a defect
 * and what a hostile response can cost.
 */

const i18n = getI18n()
const t = (key: string, locale: 'en' | 'fr' | 'ar') => i18n.global.t(key, {}, { locale })

const schema = z.object({
  name: z.string().min(3),
  email: z.email(),
  city: z.string().min(1),
})

const valid = { name: 'Ada Lovelace', email: 'ada@example.test', city: 'London' }

async function settle() {
  await flushPromises()
  await new Promise((resolve) => setTimeout(resolve, 60))
  await flushPromises()
}

const mounted: VueWrapper[] = []
const reported = vi.fn()
let removeMessages: (() => void) | undefined

interface FormExposed {
  formErrors: string[]
  submitError: AppError | null
  isTouched: () => boolean
}

async function open(props: Record<string, unknown> = {}) {
  const formRef = ref<unknown>(null)
  const wrapper = mount(
    defineComponent({
      setup() {
        return () =>
          h(
            UiForm,
            { ref: formRef, schema, initialValues: valid, ...props },
            {
              default: (slot: { formErrors: string[]; isSubmitting: boolean }) => [
                slot.formErrors.length > 0
                  ? h(
                      'div',
                      { role: 'alert', 'data-test': 'form-alert' },
                      slot.formErrors.join(' / '),
                    )
                  : null,
                h(UiTextField, { name: 'name', label: 'Name' }),
                h(UiTextField, { name: 'email', label: 'Email' }),
                h(UiTextField, { name: 'city', label: 'City' }),
                h(UiButton, { type: 'submit', loading: slot.isSubmitting }, () => 'Save'),
              ],
            },
          )
      },
    }),
    { attachTo: document.body },
  )
  mounted.push(wrapper)
  await settle()

  const input = (name: string) => wrapper.get<HTMLInputElement>(`input[name="${name}"]`)
  return {
    wrapper,
    form: () => formRef.value as FormExposed,
    input,
    submit: async () => {
      await wrapper.get('form').trigger('submit')
      await settle()
    },
    type: async (name: string, value: string) => {
      await input(name).setValue(value)
      await settle()
    },
    fieldError: (name: string) =>
      input(name).element.parentElement?.querySelector('[role="alert"]')?.textContent?.trim(),
    formAlert: () => wrapper.find('[data-test="form-alert"]'),
  }
}

beforeEach(() => {
  i18n.global.locale.value = 'en'
  reported.mockClear()
  installErrorReporter({ name: 'test', captureException: reported, setUser: () => {} })
})

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  document.body.innerHTML = ''
  removeMessages?.()
  removeMessages = undefined
  resetErrorReporter()
  i18n.global.locale.value = 'en'
  vi.restoreAllMocks()
})

describe('after the server refuses a submit', () => {
  it('focuses the first field it refused, in document order, and scrolls to it', async () => {
    const scrolled = vi.spyOn(Element.prototype, 'scrollIntoView')
    const { submit, input } = await open({
      // The server names the later field first.
      action: () =>
        Promise.reject(httpError(422, { details: { city: ['Unknown'], email: ['Taken'] } })),
    })

    await submit()

    expect(document.activeElement).toBe(input('email').element)
    expect(scrolled.mock.contexts.at(-1)).toBe(input('email').element)
    expect(scrolled).toHaveBeenLastCalledWith({ behavior: 'smooth', block: 'center' })
  })

  it('does not animate the scroll for a reader who asked for less motion', async () => {
    const scrolled = vi.spyOn(Element.prototype, 'scrollIntoView')
    vi.mocked(window.matchMedia).mockImplementation(
      (query: string) =>
        ({ matches: query.includes('prefers-reduced-motion'), media: query }) as MediaQueryList,
    )
    const { submit } = await open({
      action: () => Promise.reject(httpError(422, { details: { email: ['Taken'] } })),
    })

    await submit()

    expect(scrolled).toHaveBeenLastCalledWith({ behavior: 'auto', block: 'center' })
  })

  it('goes to the form’s alert when the refusal is about no field', async () => {
    const { submit, formAlert } = await open({
      action: () => Promise.reject(httpError(409, { message: 'Already exists' })),
    })

    await submit()

    expect(formAlert().exists()).toBe(true)
    expect(document.activeElement).toBe(formAlert().element)
  })

  it('leaves the submit button focusable while the save is in flight', async () => {
    let finish!: () => void
    const { wrapper } = await open({
      action: () => new Promise<void>((resolve) => (finish = resolve)),
    })
    const button = wrapper.get<HTMLButtonElement>('button[type="submit"]')
    button.element.focus()

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(button.attributes('aria-busy')).toBe('true')
    expect(button.element.disabled).toBe(false)
    expect(document.activeElement).toBe(button.element)

    finish()
    await settle()
  })
})

describe('what counts as a defect', () => {
  it.each(['network', 'timeout'] as const)(
    'shows a %s failure in the reader’s language and does not report it',
    async (kind) => {
      i18n.global.locale.value = 'fr'
      const { submit, form } = await open({
        action: () => Promise.reject(transportError(kind)),
      })

      await submit()
      await submit()

      expect(form().formErrors).toEqual([t(`errors.${kind}`, 'fr')])
      expect(form().formErrors[0]).not.toBe(t(`errors.${kind}`, 'en'))
      expect(reported).not.toHaveBeenCalled()
    },
  )

  it('still reports a server error', async () => {
    const { submit } = await open({ action: () => Promise.reject(httpError(503)) })

    await submit()

    expect(reported).toHaveBeenCalledTimes(1)
  })
})

describe('the previous attempt’s messages', () => {
  it('are gone as soon as the next submit starts, even one the schema stops', async () => {
    const action = vi.fn(() =>
      Promise.reject(
        httpError(422, { details: { email: ['Taken'] }, formErrors: ['Try again later'] }),
      ),
    )
    const { submit, type, fieldError, form } = await open({ action })

    await submit()
    expect(fieldError('email')).toBe('Taken')
    expect(form().formErrors).toEqual(['Try again later'])

    // Another field is emptied: the schema stops the next submit.
    await type('city', '')
    await submit()

    expect(action).toHaveBeenCalledTimes(1)
    expect(fieldError('email')).toBeUndefined()
    expect(form().formErrors).toEqual([])
    expect(form().submitError).toBeNull()
  })
})

describe('a message on screen when the language changes', () => {
  beforeEach(() => {
    removeMessages = installValidationMessages()
  })

  it('follows the reader from English to French to Arabic', async () => {
    const { type, fieldError } = await open()
    await type('name', 'Al')
    expect(fieldError('name')).toBe('Must be at least 3 characters')

    for (const locale of ['fr', 'ar'] as const) {
      i18n.global.locale.value = locale
      await settle()

      const message = fieldError('name')
      expect(message, locale).toBe(i18n.global.t('validation.string_min', { min: 3 }, 3))
      expect(message, locale).not.toBe('Must be at least 3 characters')
    }
  })

  it('does not show a field the reader has not reached yet', async () => {
    const { fieldError, form } = await open({
      showErrors: 'touched',
      initialValues: { ...valid, name: 'Al' },
    })
    expect(fieldError('name')).toBeUndefined()

    i18n.global.locale.value = 'fr'
    await settle()

    expect(fieldError('name')).toBeUndefined()
    expect(form().isTouched()).toBe(false)
  })

  it('leaves what the server said in the server’s words', async () => {
    const { submit, fieldError } = await open({
      action: () => Promise.reject(httpError(422, { details: { email: ['Already registered'] } })),
    })
    await submit()

    i18n.global.locale.value = 'fr'
    await settle()

    expect(fieldError('email')).toBe('Already registered')
  })
})

describe('a hostile validation response', () => {
  const refusal = (details: Record<string, string[]>, formErrors?: string[]) =>
    httpError(422, { details, formErrors })

  it.each([
    ['opening brackets', '['.repeat(200_000)],
    ['opening quoted brackets', "['".repeat(100_000)],
    ['double-quoted brackets', '["'.repeat(100_000)],
    ['dots', '.'.repeat(200_000)],
    ['brackets and letters', '[a'.repeat(100_000)],
  ])('reads a key of 200,000 %s in well under 50 ms', (_, key) => {
    const error = refusal({ [key]: ['Invalid'] })
    // Once to warm the code path, so the measurement is of the work.
    mapServerErrors(refusal({ a: ['x'] }))

    const started = performance.now()
    const mapping = mapServerErrors(error, { hasField: () => false })
    const elapsed = performance.now() - started

    expect(elapsed).toBeLessThan(50)
    // Shown at the top of the form, and never the whole key.
    expect(mapping.fields).toEqual({})
    expect(mapping.form).toHaveLength(1)
    expect(mapping.form[0]!.length).toBeLessThan(80)
    expect(mapping.form[0]).toMatch(/…: Invalid$/)
  })

  it('still reads the bracket spellings a backend really sends', () => {
    const fields = mapServerErrors(
      refusal({
        'Items[0].Name': ['a'],
        "$['address']['city']": ['b'],
        'lines["sku"]': ['c'],
      }),
    ).fields

    expect(Object.keys(fields)).toEqual(['Items.0.Name', 'address.city', 'lines.sku'])
  })

  it('reads no more than a hundred keys, ten messages a key, fifty for the form', () => {
    const details: Record<string, string[]> = {}
    for (let index = 0; index < 5_000; index++) {
      details[`field${index}`] = Array.from({ length: 500 }, (_unused, at) => `m${at}`)
    }

    const fields = mapServerErrors(refusal(details)).fields
    expect(Object.keys(fields)).toHaveLength(100)
    expect(fields.field0).toHaveLength(10)

    const unmatched = mapServerErrors(refusal(details), { hasField: () => false })
    expect(unmatched.form).toHaveLength(50)

    const formLevel = mapServerErrors(
      refusal(
        {},
        Array.from({ length: 10_000 }, (_unused, at) => `e${at}`),
      ),
    )
    expect(formLevel.form).toHaveLength(50)
  })
})
