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
  <div class="mx-auto w-full max-w-xl">
    <div
      class="border-surface-200/80 bg-surface-50/86 dark:border-surface-800 dark:bg-surface-900/78 rounded-[calc(var(--shape-radius)+0.375rem)] border p-6 shadow-(--shadow-card) sm:p-8"
    >
      <div class="mb-8 flex items-start justify-between gap-4">
        <div class="min-w-0">
          <p class="text-muted-foreground mb-2 text-xs font-semibold tracking-[0.28em] uppercase">
            Vuestrata
          </p>
          <h1 class="text-foreground text-3xl font-bold tracking-tight">
            {{ t('auth_register') }}
          </h1>
          <p class="text-muted-foreground mt-2 text-sm leading-6">
            {{ t('auth_register_subtitle') }}
          </p>
        </div>

        <span class="flex h-14 w-14 shrink-0 items-center justify-center">
          <Logo variant="icon" class="h-9 w-9" />
        </span>
      </div>

      <UiForm
        class="space-y-5"
        :schema="registerSchema"
        disableHtmlValidation
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
    </div>

    <p class="text-surface-500 mt-6 text-center text-sm">
      {{ t('auth_has_account') }}
      <RouterLink to="/auth/login" class="text-link hover:text-link-hover font-medium">
        {{ t('auth_login') }}
      </RouterLink>
    </p>
  </div>
</template>

<route lang="yaml">
meta:
  layout: auth
</route>
