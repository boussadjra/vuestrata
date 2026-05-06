import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import LoginPage from '@/modules/auth/pages/login.vue'

const authRefs = vi.hoisted(() => ({
  mfaRequired: { __v_isRef: true, value: false },
  isLoading: { __v_isRef: true, value: false },
  error: { __v_isRef: true, value: null as string | null },
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
    }),
  }
})

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      auth_login: 'Sign in',
      auth_login_subtitle: 'Welcome back',
      auth_email: 'Email',
      auth_email_placeholder: 'email address',
      auth_password: 'Password',
      auth_password_placeholder: 'password',
      auth_no_account: 'No account?',
      auth_register: 'Register',
      common_coming_soon: 'Coming soon',
      auth_forgot_password_soon: 'Forgot password is coming soon',
    },
  },
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
      plugins: [pinia, router, i18n],
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
