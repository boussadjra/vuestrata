import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { defineComponent, h, inject, provide, reactive } from 'vue'
import type { PropType } from 'vue'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import RegisterPage from '@/modules/auth/pages/register.vue'

const authRefs = vi.hoisted(() => ({
  isLoading: { __v_isRef: true, value: false },
  error: { __v_isRef: true, value: null as string | null },
}))

const authMocks = vi.hoisted(() => ({
  register: vi.fn(),
}))

vi.mock('~/modules/auth', () => {
  return {
    useAuth: () => ({
      register: authMocks.register,
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
      auth_register: 'Create account',
      auth_register_subtitle: 'Create your account to get started',
      auth_register_fail: 'Registration failed',
      auth_has_account: 'Already have an account?',
      auth_login: 'Sign in',
      auth_name: 'Full name',
      auth_name_placeholder: 'Enter your full name',
      auth_email: 'Email',
      auth_email_placeholder: 'Email address',
      auth_password: 'Password',
      auth_password_placeholder: 'Enter your password',
      auth_confirm_password: 'Confirm password',
      auth_confirm_password_placeholder: 'Re-enter your password',
      auth_passwords_mismatch: 'Passwords do not match',
      validation: {
        required: '{field} is required',
        email: 'Please enter a valid email address',
        min_length: 'Must be at least {min} characters',
      },
    },
  },
})

const REGISTER_FORM_VALUES_KEY = 'registerFormValues'
type RegisterFormValues = Record<string, string>

const UiFormStub = defineComponent({
  name: 'UiForm',
  props: {
    initialValues: {
      type: Object as PropType<RegisterFormValues>,
      default: () => ({}),
    },
  },
  emits: ['submit'],
  setup(props, { emit, slots }) {
    const values = reactive<RegisterFormValues>({ ...props.initialValues })
    provide(REGISTER_FORM_VALUES_KEY, values)

    return () =>
      h(
        'form',
        {
          onSubmit: (event: Event) => {
            event.preventDefault()
            emit('submit', values)
          },
        },
        slots.default?.({ values, isSubmitting: false }),
      )
  },
})

const UiTextFieldStub = defineComponent({
  name: 'UiTextField',
  props: {
    id: String,
    name: {
      type: String,
      required: true,
    },
    type: String,
    label: String,
    placeholder: String,
    error: String,
    required: Boolean,
  },
  setup(props) {
    const values = inject<RegisterFormValues>(REGISTER_FORM_VALUES_KEY)
    if (!values) throw new Error('UiTextFieldStub must be rendered inside UiFormStub.')

    return () =>
      h('div', [
        props.label ? h('label', { for: props.id }, props.label) : null,
        h('input', {
          id: props.id,
          name: props.name,
          placeholder: props.placeholder,
          required: props.required,
          type: props.type ?? 'text',
          value: values[props.name] ?? '',
          onInput: (event: Event) => {
            values[props.name] = (event.target as HTMLInputElement).value
          },
        }),
        props.error ? h('p', { role: 'alert' }, props.error) : null,
      ])
  },
})

const UiAlertStub = defineComponent({
  name: 'UiAlert',
  props: {
    title: String,
    variant: String,
  },
  setup(props, { slots }) {
    return () =>
      h('div', { role: 'alert' }, [
        props.title ? h('strong', props.title) : null,
        slots.default?.(),
      ])
  },
})

const UiButtonStub = defineComponent({
  name: 'UiButton',
  props: {
    disabled: Boolean,
    loading: Boolean,
    type: String,
  },
  setup(props, { slots }) {
    return () =>
      h(
        'button',
        {
          disabled: props.disabled || props.loading,
          type: props.type ?? 'button',
        },
        slots.default?.(),
      )
  },
})

function mountRegisterPage() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/auth/register', component: RegisterPage },
      { path: '/auth/login', component: { template: '<div />' } },
      { path: '/dashboard', component: { template: '<div />' } },
    ],
  })
  const pinia = createPinia()
  setActivePinia(pinia)

  return mount(RegisterPage, {
    global: {
      plugins: [pinia, router, i18n],
      stubs: {
        Logo: true,
        UiAlert: UiAlertStub,
        UiButton: UiButtonStub,
        UiForm: UiFormStub,
        UiTextField: UiTextFieldStub,
      },
    },
  })
}

beforeEach(() => {
  authRefs.isLoading.value = false
  authRefs.error.value = null
  authMocks.register.mockReset()
})

describe('register page', () => {
  it('submits Formwerk values to useAuth.register', async () => {
    authMocks.register.mockResolvedValue(undefined)
    const wrapper = mountRegisterPage()
    await flushPromises()

    await wrapper.find('#name').setValue('Registered User')
    await wrapper.find('#email').setValue('registered@example.test')
    await wrapper.find('#password').setValue('password123')
    await wrapper.find('#confirmPassword').setValue('password123')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(authMocks.register).toHaveBeenCalledWith({
      name: 'Registered User',
      email: 'registered@example.test',
      password: 'password123',
    })
  })

  it('shows localized password mismatch feedback', async () => {
    const wrapper = mountRegisterPage()
    await flushPromises()

    await wrapper.find('#password').setValue('password123')
    await wrapper.find('#confirmPassword').setValue('different123')

    expect(wrapper.text()).toContain('Passwords do not match')
    expect(wrapper.text()).not.toContain('auth_confirm_password')
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
  })
})
