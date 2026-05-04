<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { z } from 'zod'

import Logo from '@/components/Logo.vue'
import { useAuth } from '~/modules/auth'

const { t } = useI18n()
const { register, isLoading, error } = useAuth()

const registerInitialValues = {
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
}

type RegisterFormValues = typeof registerInitialValues

const registerSchema = computed(() => {
  const required = (field: string) => t('validation.required', { field })

  return z
    .object({
      name: z
        .string()
        .trim()
        .min(1, required(t('auth_name'))),
      email: z
        .string()
        .trim()
        .min(1, required(t('auth_email')))
        .email(t('validation.email')),
      password: z.string().min(8, t('validation.min_length', { min: 8 })),
      confirmPassword: z.string().min(1, required(t('auth_confirm_password'))),
    })
    .refine((data) => data.password === data.confirmPassword, {
      path: ['confirmPassword'],
      message: t('auth_passwords_mismatch'),
    })
})

function formString(values: Record<string, unknown>, key: keyof RegisterFormValues): string {
  const value = values[key]
  return typeof value === 'string' ? value : ''
}

function isPasswordMismatch(values: Record<string, unknown>): boolean {
  const password = formString(values, 'password')
  const confirmPassword = formString(values, 'confirmPassword')
  return confirmPassword.length > 0 && password !== confirmPassword
}

function isSubmitDisabled(values: Record<string, unknown>, isSubmitting: boolean): boolean {
  return isLoading.value || isSubmitting || isPasswordMismatch(values)
}

async function onSubmit(values: Record<string, unknown>) {
  if (isPasswordMismatch(values)) return
  await register({
    email: formString(values, 'email').trim(),
    password: formString(values, 'password'),
    name: formString(values, 'name').trim(),
  })
}
</script>

<template>
  <div class="w-full">
    <div class="mb-8 text-center">
      <div class="mb-4 flex justify-center">
        <Logo class="h-16 w-auto" />
      </div>
      <p class="text-surface-400 mb-2 text-xs font-semibold tracking-[0.28em] uppercase">
        Vuestrata
      </p>
      <h1 class="text-2xl font-bold">{{ t('auth_register') }}</h1>
      <p class="text-surface-500 mt-1 text-sm">{{ t('auth_register_subtitle') }}</p>
    </div>

    <UiForm
      class="space-y-4"
      :schema="registerSchema"
      :initial-values="registerInitialValues"
      @submit="onSubmit"
    >
      <template #default="{ values, isSubmitting }">
        <UiAlert v-if="error" variant="error" :title="t('auth_register_fail')">
          {{ error }}
        </UiAlert>

        <UiTextField
          id="name"
          name="name"
          :label="t('auth_name')"
          :placeholder="t('auth_name_placeholder')"
          autocomplete="name"
          required
        />

        <UiTextField
          id="email"
          name="email"
          type="email"
          :label="t('auth_email')"
          :placeholder="t('auth_email_placeholder')"
          autocomplete="email"
          required
        />

        <UiTextField
          id="password"
          name="password"
          type="password"
          :label="t('auth_password')"
          :placeholder="t('auth_password_placeholder')"
          autocomplete="new-password"
          :min-length="8"
          required
        />

        <UiTextField
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          :label="t('auth_confirm_password')"
          :placeholder="t('auth_confirm_password_placeholder')"
          :error="isPasswordMismatch(values) ? t('auth_passwords_mismatch') : undefined"
          autocomplete="new-password"
          :min-length="8"
          required
        />

        <UiButton
          type="submit"
          block
          :loading="isLoading || isSubmitting"
          :disabled="isSubmitDisabled(values, isSubmitting)"
        >
          {{ t('auth_register') }}
        </UiButton>
      </template>
    </UiForm>

    <p class="text-surface-500 mt-6 text-center text-sm">
      {{ t('auth_has_account') }}
      <RouterLink to="/auth/login" class="text-primary-500 hover:text-primary-600 font-medium">
        {{ t('auth_login') }}
      </RouterLink>
    </p>
  </div>
</template>

<route lang="yaml">
meta:
  layout: auth
</route>
