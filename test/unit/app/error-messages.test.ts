import fs from 'node:fs'
import path from 'node:path'

import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import { defineComponent, h } from 'vue'

import { useErrorMessage } from '@/composables/useErrorMessage'
import { AppError, httpError, listErrorMessageKeys, transportError } from '@/lib/errors'
import { getI18n } from '@/plugins/i18n'

/**
 * The error messages a user reads, in the language they read.
 *
 * `AppError.messageKey` is only as good as the catalog behind it: a key the
 * code produces and no locale defines renders as the key itself, on the one
 * screen where the user is already having a bad time.
 */

/**
 * Read from disk, not imported: the i18n plugin compiles an imported catalog,
 * and what is compared here is the text a translator wrote.
 */
function catalog(locale: string): Record<string, string> {
  const file = path.join(process.cwd(), 'src/modules/app/locales', `${locale}.json`)
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, string>
}

const en = catalog('en')
const fr = catalog('fr')
const ar = catalog('ar')
const catalogs: Record<string, Record<string, string>> = { en, fr, ar }

afterEach(() => {
  getI18n().global.locale.value = 'en'
})

/** Mount a component that renders `errorMessage(error)`, as a page would. */
function render(error: unknown) {
  const Probe = defineComponent({
    setup() {
      const { errorMessage } = useErrorMessage()
      return () => h('p', errorMessage(error))
    },
  })
  return mount(Probe)
}

describe('the error catalog', () => {
  it.each(Object.keys(catalogs))('%s defines every message key the code can produce', (locale) => {
    const missing = listErrorMessageKeys().filter((key) => !catalogs[locale]![key])

    expect(missing).toEqual([])
  })

  it('lists the keys of every status that has a message, and the named ones', () => {
    expect(new Set(listErrorMessageKeys())).toEqual(
      new Set([
        'errors.aborted',
        'errors.contract',
        'errors.csrf',
        'errors.network',
        'errors.request',
        'errors.server',
        'errors.session_expired',
        'errors.status_400',
        'errors.status_401',
        'errors.status_403',
        'errors.status_404',
        'errors.status_409',
        'errors.status_422',
        'errors.status_429',
        'errors.status_500',
        'errors.status_502',
        'errors.status_503',
        'errors.timeout',
        'errors.unexpected_response',
        'errors.unknown',
      ]),
    )
    expect(listErrorMessageKeys()).toHaveLength(20)
  })

  it('holds no errors.* key the code cannot produce', () => {
    const known = new Set(listErrorMessageKeys())
    const stray = Object.keys(en).filter((key) => key.startsWith('errors.') && !known.has(key))

    expect(stray).toEqual([])
  })

  it('resolves the dotted keys through vue-i18n, in each locale', () => {
    const { t, locale } = getI18n().global

    for (const code of ['en', 'fr', 'ar'] as const) {
      locale.value = code
      for (const key of listErrorMessageKeys()) {
        expect(t(key), `${code}: ${key}`).toBe(catalogs[code]![key])
      }
    }
  })
})

describe('useErrorMessage', () => {
  it('translates a failure with no server message, in English', () => {
    expect(render(transportError('network')).text()).toBe(en['errors.network'])
    expect(render(httpError(404)).text()).toBe(en['errors.status_404'])
  })

  it('translates it in Arabic', () => {
    getI18n().global.locale.value = 'ar'

    expect(render(transportError('network')).text()).toBe(ar['errors.network'])
    expect(render(transportError('timeout')).text()).toBe(ar['errors.timeout'])
    expect(render(httpError(403)).text()).toBe(ar['errors.status_403'])
    expect(render(httpError(503, { message: 'pool exhausted' })).text()).toBe(
      ar['errors.status_503'],
    )
  })

  it('follows a language switch without remounting', async () => {
    const wrapper = render(httpError(409))
    expect(wrapper.text()).toBe(en['errors.status_409'])

    getI18n().global.locale.value = 'fr'
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toBe(fr['errors.status_409'])
  })

  it('shows what the backend said about a request it refused, in any locale', () => {
    getI18n().global.locale.value = 'ar'
    const refused = httpError(422, { message: 'هذا البريد الإلكتروني مسجل بالفعل.' })

    expect(render(refused).text()).toBe('هذا البريد الإلكتروني مسجل بالفعل.')
  })

  it('translates an error nothing classified, instead of showing what was thrown', () => {
    getI18n().global.locale.value = 'ar'

    // A ZodError's message is a JSON dump of its issues.
    expect(render(new Error('[{"code":"invalid_type","path":["email"]}]')).text()).toBe(
      ar['errors.unknown'],
    )
  })

  it('falls back to the English message for a key no catalog has', () => {
    const custom = new AppError({ message: 'Quota exceeded.', messageKey: 'errors.quota' })

    expect(render(custom).text()).toBe('Quota exceeded.')
  })

  it('renders nothing when there is no error', () => {
    expect(render(null).text()).toBe('')
    expect(render(undefined).text()).toBe('')
  })
})
