import { VueQueryPlugin } from '@tanstack/vue-query'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter, RouterView, type Router } from 'vue-router'

import { installValidationMessages } from '@/bootstrap/validation-messages'
import { installApiAuth } from '@/lib/api/client'
import { installErrorReporter, resetErrorReporter } from '@/lib/errors'
import { createMockJwt } from '@/mocks/utils'
import { customersHandlers, resetCustomersMock } from '@/modules/customers/mocks/customers.handlers'
import { customerFixtures } from '@/modules/customers/mocks/fixtures'
import CustomerForm from '@/modules/customers/pages/form.vue'
import { getI18n } from '@/plugins/i18n'
import { useNotificationStore } from '@/stores/notification'

import { createTestQueryClient } from '../../utils/query-client'

/**
 * The reference form, end to end: the page, `UiForm`, the mutation, the API
 * client and the demo's mock backend, over the wire (msw/node).
 *
 * This is the submit lifecycle a team gets from `vuestrata add module`, so
 * what is asserted is what a user sees: where they end up, what is written
 * under which field, and whether they are asked before losing their work.
 */

const server = setupServer(...customersHandlers)
const token = createMockJwt({ sub: '1', expiresInSeconds: 3600 })
const i18n = getI18n()
const reported = vi.fn()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())

let uninstallMessages: () => void
const mounted: VueWrapper[] = []

beforeEach(() => {
  resetCustomersMock()
  i18n.global.locale.value = 'en'
  uninstallMessages = installValidationMessages()
  installApiAuth({
    getToken: () => token,
    getRefreshToken: () => null,
    setAuth: () => {},
    clearAuth: () => {},
  })
  reported.mockClear()
  installErrorReporter({ name: 'test', captureException: reported, setUser: () => {} })
})

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  server.resetHandlers()
  uninstallMessages()
  resetErrorReporter()
  i18n.global.locale.value = 'en'
  document.body.innerHTML = ''
})

/** Formwerk validates and the mock answers a few ticks later. */
async function settle(ms = 40) {
  await flushPromises()
  await new Promise((resolve) => setTimeout(resolve, ms))
  await flushPromises()
}

/** Wait for something the mock backend (180 ms latency) has to answer first. */
async function waitFor(condition: () => boolean, what: string) {
  const deadline = Date.now() + 4000
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`)
    await settle(20)
  }
}

const Stub = (text: string) => defineComponent({ render: () => h('p', text) })

async function openForm(path: string): Promise<{ wrapper: VueWrapper; router: Router }> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/dashboard/customers', component: Stub('list') },
      { path: '/dashboard/customers/new', component: CustomerForm },
      { path: '/dashboard/customers/:id/edit', component: CustomerForm },
      { path: '/dashboard/customers/:id', component: Stub('detail') },
    ],
  })
  await router.push(path)
  await router.isReady()

  const wrapper = mount(defineComponent({ render: () => h(RouterView) }), {
    attachTo: document.body,
    global: { plugins: [router, [VueQueryPlugin, { queryClient: createTestQueryClient() }]] },
  })
  mounted.push(wrapper)
  await waitFor(() => wrapper.find('form').exists(), 'the form')
  await settle()
  return { wrapper, router }
}

const input = (wrapper: VueWrapper, name: string) =>
  wrapper.find<HTMLInputElement>(`input[name="${name}"]`)

async function type(wrapper: VueWrapper, name: string, value: string) {
  await input(wrapper, name).setValue(value)
  await settle()
}

function fieldError(wrapper: VueWrapper, name: string): string | undefined {
  return input(wrapper, name)
    .element.parentElement?.querySelector('[role="alert"]')
    ?.textContent?.trim()
}

async function fillValidCustomer(wrapper: VueWrapper, email = 'grace@hopper.example') {
  await type(wrapper, 'company', 'Hopper Systems')
  await type(wrapper, 'contactName', 'Grace Hopper')
  await type(wrapper, 'email', email)
  await type(wrapper, 'phone', '+1 555 0100')
  await type(wrapper, 'city', 'Arlington')
}

async function submit(wrapper: VueWrapper) {
  await wrapper.find('form').trigger('submit')
  await settle()
}

const dialogButton = (which: 'stay' | 'leave') =>
  document.querySelector<HTMLElement>(`[data-testid="unsaved-changes-${which}"]`)

describe('creating a customer', () => {
  it('opens clean: the selects hold their defaults and nothing is marked wrong', async () => {
    const { wrapper } = await openForm('/dashboard/customers/new')

    expect(wrapper.findAll('form [role="alert"]')).toHaveLength(0)
    const selects = wrapper.findAll('[data-ui="select"]').map((select) => select.text())
    expect(selects[0]).toContain('Prospect')
    expect(selects[1]).toContain('Starter')
  })

  it('saves, confirms and goes to the new record', async () => {
    const { wrapper, router } = await openForm('/dashboard/customers/new')
    const posted: unknown[] = []
    server.use(
      http.post('*/api/customers', async ({ request }) => {
        posted.push(await request.clone().json())
        // Returning nothing falls through to the collection mock.
      }),
    )

    await fillValidCustomer(wrapper)
    await submit(wrapper)

    // Pending for the whole save, not just for validation.
    const button = wrapper.find('button[type="submit"]')
    expect(button.attributes('aria-busy')).toBe('true')
    expect(button.attributes('disabled')).toBeDefined()

    await waitFor(
      () => /^\/dashboard\/customers\/CUS-\d+$/.test(router.currentRoute.value.path),
      'the redirect to the new customer',
    )

    expect(posted).toEqual([
      {
        company: 'Hopper Systems',
        contactName: 'Grace Hopper',
        email: 'grace@hopper.example',
        phone: '+1 555 0100',
        status: 'prospect',
        plan: 'starter',
        city: 'Arlington',
        country: 'US',
        notes: '',
      },
    ])
    expect(useNotificationStore().notifications.map((n) => n.message)).toEqual([
      'Customer created.',
    ])
    // The form was dirty, and saving it is not "leaving with unsaved changes".
    expect(dialogButton('leave')).toBeNull()
    expect(reported).not.toHaveBeenCalled()
  })

  it('says what is missing, in the reader’s language, without calling the server', async () => {
    const { wrapper } = await openForm('/dashboard/customers/new')
    const posted = vi.fn()
    server.use(http.post('*/api/customers', () => void posted()))

    await type(wrapper, 'email', 'not-an-address')
    await submit(wrapper)

    expect(posted).not.toHaveBeenCalled()
    expect(fieldError(wrapper, 'company')).toBe('This field is required')
    expect(fieldError(wrapper, 'email')).toBe('Please enter a valid email address')

    i18n.global.locale.value = 'fr'
    await type(wrapper, 'email', 'toujours-pas')
    expect(fieldError(wrapper, 'company')).toBe('Ce champ est requis')
    expect(fieldError(wrapper, 'email')).toBe(
      i18n.global.t('validation.email', {}, { locale: 'fr' }),
    )
  })

  it('puts the server’s refusal under the field it is about', async () => {
    const { wrapper, router } = await openForm('/dashboard/customers/new')
    const existing = customerFixtures[0]!

    await fillValidCustomer(wrapper, existing.email)
    await submit(wrapper)
    await waitFor(() => fieldError(wrapper, 'email') !== undefined, 'the server’s answer')

    expect(fieldError(wrapper, 'email')).toBe('A customer with this email already exists.')
    expect(input(wrapper, 'email').attributes('aria-invalid')).toBe('true')
    // The form-level line is the backend's own summary.
    const alert = wrapper.find('[data-ui="alert"]')
    expect(alert.text()).toContain('The customer could not be saved.')
    // Still on the form, still editable, and a refusal is not a crash.
    expect(router.currentRoute.value.path).toBe('/dashboard/customers/new')
    expect(wrapper.find('button[type="submit"]').attributes('aria-busy')).toBeUndefined()
    expect(reported).not.toHaveBeenCalled()

    // Fixing the field answers the message.
    await type(wrapper, 'email', 'grace@hopper.example')
    expect(fieldError(wrapper, 'email')).toBeUndefined()

    await submit(wrapper)
    await waitFor(
      () => router.currentRoute.value.path !== '/dashboard/customers/new',
      'the redirect after the corrected save',
    )
  })

  it('maps another backend’s field names onto the same fields', async () => {
    const { wrapper } = await openForm('/dashboard/customers/new')
    // What Laravel sends: snake_case keys under `errors`... which the API seam
    // has already turned into `details`, keys verbatim.
    server.use(
      http.post('*/api/customers', () =>
        HttpResponse.json(
          {
            message: 'The given data was invalid.',
            details: {
              contact_name: ['The contact name has already been taken.'],
              vat_number: ['The VAT number is required.'],
            },
          },
          { status: 422 },
        ),
      ),
    )

    await fillValidCustomer(wrapper)
    await submit(wrapper)
    await waitFor(() => fieldError(wrapper, 'contactName') !== undefined, 'the server’s answer')

    expect(fieldError(wrapper, 'contactName')).toBe('The contact name has already been taken.')
    // The form has no VAT field: the message is shown, not lost.
    expect(wrapper.find('[data-ui="alert"]').text()).toContain(
      'vat_number: The VAT number is required.',
    )
  })

  it('reports a server error once and shows the generic message', async () => {
    const { wrapper, router } = await openForm('/dashboard/customers/new')
    server.use(
      http.post('*/api/customers', () =>
        HttpResponse.json({ message: 'ECONNREFUSED 10.0.0.4:5432' }, { status: 500 }),
      ),
    )

    await fillValidCustomer(wrapper)
    await submit(wrapper)
    await waitFor(() => wrapper.find('[data-ui="alert"]').exists(), 'the failure')

    const alert = wrapper.find('[data-ui="alert"]').text()
    expect(alert).toContain(i18n.global.t('errors.status_500'))
    expect(alert).not.toContain('ECONNREFUSED')
    expect(reported).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.path).toBe('/dashboard/customers/new')
  })
})

describe('leaving with unsaved changes', () => {
  it('lets a clean form go without asking', async () => {
    const { router } = await openForm('/dashboard/customers/new')

    await router.push('/dashboard/customers')

    expect(router.currentRoute.value.path).toBe('/dashboard/customers')
    expect(dialogButton('stay')).toBeNull()
  })

  it('asks, and stays when told to', async () => {
    const { wrapper, router } = await openForm('/dashboard/customers/new')
    await type(wrapper, 'company', 'Hopper Systems')

    const navigation = router.push('/dashboard/customers')
    await settle()

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.textContent).toContain('Discard unsaved changes?')
    expect(router.currentRoute.value.path).toBe('/dashboard/customers/new')

    dialogButton('stay')!.click()
    await navigation
    await settle()

    expect(router.currentRoute.value.path).toBe('/dashboard/customers/new')
    expect(dialogButton('stay')).toBeNull()
    // What was typed is still there.
    expect(input(wrapper, 'company').element.value).toBe('Hopper Systems')
  })

  it('leaves when the user chooses to discard', async () => {
    const { wrapper, router } = await openForm('/dashboard/customers/new')
    await type(wrapper, 'company', 'Hopper Systems')

    const navigation = router.push('/dashboard/customers')
    await settle()
    dialogButton('leave')!.click()
    await navigation

    expect(router.currentRoute.value.path).toBe('/dashboard/customers')
  })

  it('asks in the reader’s language', async () => {
    i18n.global.locale.value = 'ar'
    const { wrapper, router } = await openForm('/dashboard/customers/new')
    await type(wrapper, 'company', 'Hopper Systems')

    const navigation = router.push('/dashboard/customers')
    await settle()

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.textContent).toContain(i18n.global.t('form_unsaved_title'))
    expect(dialogButton('stay')?.textContent).toContain(i18n.global.t('form_unsaved_stay'))

    dialogButton('stay')!.click()
    await navigation
  })
})

describe('editing a customer', () => {
  const existing = customerFixtures[0]!

  it('opens on the record, selects included, and is clean', async () => {
    const { wrapper, router } = await openForm(`/dashboard/customers/${existing.id}/edit`)

    expect(input(wrapper, 'company').element.value).toBe(existing.company)
    const selects = wrapper.findAll('[data-ui="select"]').map((select) => select.text())
    expect(selects[0]).toContain(i18n.global.t(`customers_status_${existing.status}`))
    expect(selects[1]).toContain(i18n.global.t(`customers_plan_${existing.plan}`))
    expect(wrapper.findAll('form [role="alert"]')).toHaveLength(0)

    await router.push('/dashboard/customers')
    expect(router.currentRoute.value.path).toBe('/dashboard/customers')
  })

  it('saves a change and goes back to the record', async () => {
    const { wrapper, router } = await openForm(`/dashboard/customers/${existing.id}/edit`)
    const patched: unknown[] = []
    server.use(
      http.patch('*/api/customers/:id', async ({ request }) => {
        patched.push(await request.clone().json())
      }),
    )

    await type(wrapper, 'city', 'Reykjavik')
    await submit(wrapper)
    await waitFor(
      () => router.currentRoute.value.path === `/dashboard/customers/${existing.id}`,
      'the redirect to the record',
    )

    expect(patched).toHaveLength(1)
    expect(patched[0]).toMatchObject({ city: 'Reykjavik', status: existing.status })
    expect(useNotificationStore().notifications.map((n) => n.message)).toEqual(['Customer saved.'])
  })

  it('does not mistake the record’s own email for one that is taken', async () => {
    const { wrapper, router } = await openForm(`/dashboard/customers/${existing.id}/edit`)

    await type(wrapper, 'city', 'Reykjavik')
    await submit(wrapper)
    await waitFor(
      () => router.currentRoute.value.path === `/dashboard/customers/${existing.id}`,
      'the redirect to the record',
    )
  })
})
