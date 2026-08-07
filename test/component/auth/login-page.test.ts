import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { createMemoryHistory, createRouter } from 'vue-router'

import LoginPage from '@/modules/auth/pages/login.vue'

/** Every capability on, matching the `mock` adapter these tests stand in for. */
const ALL_CAPABILITIES = {
  register: true,
  social: true,
  magicLink: true,
  mfa: true,
  refresh: true,
  codeExchange: true,
}

const authRefs = vi.hoisted(() => ({
  mfaRequired: { __v_isRef: true, value: false },
  isLoading: { __v_isRef: true, value: false },
  error: { __v_isRef: true, value: null as string | null },
  capabilities: {
    __v_isRef: true,
    value: {
      register: true,
      social: true,
      magicLink: true,
      mfa: true,
      refresh: true,
      codeExchange: true,
    },
  },
}))

const authMocks = vi.hoisted(() => ({
  login: vi.fn(),
  socialLogin: vi.fn(),
  sendMagicLink: vi.fn(),
  verifyMfaCode: vi.fn(),
}))

vi.mock('~/modules/auth', () => {
  return {
    useAuth: () => ({
      login: authMocks.login,
      socialLogin: authMocks.socialLogin,
      sendMagicLink: authMocks.sendMagicLink,
      verifyMfaCode: authMocks.verifyMfaCode,
      mfaRequired: authRefs.mfaRequired,
      isLoading: authRefs.isLoading,
      error: authRefs.error,
      // The page renders social buttons and the magic-link toggle only when
      // the configured adapter supports them. Defaults to every capability on;
      // the "adapter capabilities" block below varies it.
      capabilities: authRefs.capabilities,
    }),
  }
})

function mountLoginPage() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/auth/login', component: LoginPage },
      { path: '/auth/register', component: { template: '<div />' } },
    ],
  })
  const pinia = createPinia()
  setActivePinia(pinia)

  return mount(LoginPage, {
    global: {
      plugins: [pinia, router],
      stubs: { Logo: true },
    },
  })
}

function buttonByText(wrapper: ReturnType<typeof mount>, text: string) {
  const button = wrapper
    .findAll('button')
    .find((candidate) => candidate.text().replace(/\s+/g, ' ').trim().includes(text))
  if (!button) throw new Error(`Button not found: ${text}`)
  return button
}

beforeEach(() => {
  authRefs.mfaRequired.value = false
  authRefs.isLoading.value = false
  authRefs.error.value = null
  authRefs.capabilities.value = { ...ALL_CAPABILITIES }
  authMocks.login.mockReset()
  authMocks.socialLogin.mockReset()
  authMocks.sendMagicLink.mockReset()
  authMocks.verifyMfaCode.mockReset()
})

describe('login page — credentials', () => {
  it('submits entered credentials to useAuth.login', async () => {
    authMocks.login.mockResolvedValue(undefined)
    const wrapper = mountLoginPage()

    await wrapper.find('#email').setValue('demo@vuestrata.dev')
    await wrapper.find('#password').setValue('password')
    await wrapper.find('form').trigger('submit.prevent')

    expect(authMocks.login).toHaveBeenCalledWith({
      email: 'demo@vuestrata.dev',
      password: 'password',
    })
  })

  it('clears the password field when login reports an error', async () => {
    authMocks.login.mockImplementation(async () => {
      authRefs.error.value = 'Invalid credentials'
    })
    const wrapper = mountLoginPage()

    await wrapper.find('#email').setValue('bad@example.test')
    await wrapper.find('#password').setValue('secret')
    await wrapper.find('form').trigger('submit.prevent')

    expect(wrapper.find<HTMLInputElement>('#password').element.value).toBe('')
  })

  it('starts social login for each displayed provider', async () => {
    const wrapper = mountLoginPage()

    await buttonByText(wrapper, 'Continue with Google').trigger('click')
    await buttonByText(wrapper, 'Continue with GitHub').trigger('click')
    await buttonByText(wrapper, 'Continue with Microsoft').trigger('click')

    expect(authMocks.socialLogin).toHaveBeenNthCalledWith(1, 'google')
    expect(authMocks.socialLogin).toHaveBeenNthCalledWith(2, 'github')
    expect(authMocks.socialLogin).toHaveBeenNthCalledWith(3, 'microsoft')
  })
})

describe('login page — magic link', () => {
  it('switches to magic link mode and shows the success message after send', async () => {
    authMocks.sendMagicLink.mockResolvedValue({ message: 'sent' })
    const wrapper = mountLoginPage()

    await buttonByText(wrapper, 'Magic Link').trigger('click')
    await wrapper.find('#magic-email').setValue('magic@example.test')
    await wrapper.find('form').trigger('submit.prevent')

    expect(authMocks.sendMagicLink).toHaveBeenCalledWith('magic@example.test')
    expect(wrapper.text()).toContain('Check your inbox')
    expect(wrapper.text()).toContain('magic@example.test')
  })
})

describe('login page — MFA', () => {
  it('renders the MFA challenge and verifies the code when required', async () => {
    authRefs.mfaRequired.value = true
    authMocks.verifyMfaCode.mockResolvedValue(undefined)
    const wrapper = mountLoginPage()

    expect(wrapper.text()).toContain('Multi-factor authentication is required')
    await wrapper.find('#mfa-code').setValue('000000')
    await wrapper.find('form').trigger('submit.prevent')

    expect(authMocks.verifyMfaCode).toHaveBeenCalledWith('000000')
  })
})

describe('login page — adapter capabilities', () => {
  /**
   * The page must offer only what the configured adapter can actually do.
   * Rendering a magic-link toggle for the `jwt` adapter, or social buttons for
   * an adapter with no social redirect, hands the user a control that fails on
   * click — which is what the old always-required 11-method interface allowed.
   */
  it('hides social sign-in when the adapter does not support it', () => {
    authRefs.capabilities.value = { ...ALL_CAPABILITIES, social: false }
    const wrapper = mountLoginPage()

    expect(wrapper.find('#google').exists()).toBe(false)
    expect(wrapper.find('#github').exists()).toBe(false)
    // The "or continue with" divider only separates two present things.
    expect(wrapper.text()).not.toContain('Or continue with')
  })

  it('hides the magic-link toggle when the adapter does not support it', () => {
    authRefs.capabilities.value = { ...ALL_CAPABILITIES, magicLink: false }
    const wrapper = mountLoginPage()

    expect(wrapper.text()).not.toContain('Magic Link')
    // Credentials login must still be fully usable.
    expect(wrapper.find('#email').exists()).toBe(true)
    expect(wrapper.find('#password').exists()).toBe(true)
  })

  it('renders both when the adapter supports everything', () => {
    const wrapper = mountLoginPage()

    expect(wrapper.find('#google').exists()).toBe(true)
    expect(wrapper.text()).toContain('Magic Link')
  })
})
