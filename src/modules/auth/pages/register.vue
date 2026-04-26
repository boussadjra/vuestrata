<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import Logo from '@/components/Logo.vue'
import { resolveIcon } from '~/config/icon-provider'
import { useAuth } from '~/modules/auth'

const { t } = useI18n()
const { register, isLoading, error } = useAuth()

const form = ref({
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
})

const passwordMismatch = computed(
  () => form.value.confirmPassword.length > 0 && form.value.password !== form.value.confirmPassword,
)

async function onSubmit() {
  if (passwordMismatch.value) return
  await register({
    email: form.value.email,
    password: form.value.password,
    name: form.value.name,
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

    <form class="space-y-4" @submit.prevent="onSubmit">
      <div
        v-if="error"
        class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400"
      >
        {{ error }}
      </div>

      <div class="flex flex-col gap-1">
        <label for="name" class="text-sm font-medium">{{ t('auth_name') }}</label>
        <input
          id="name"
          v-model="form.name"
          type="text"
          required
          autocomplete="name"
          :placeholder="t('auth_name_placeholder')"
          class="border-surface-300 dark:border-surface-600 dark:bg-surface-800 focus:ring-primary-300 w-full rounded-lg border bg-white px-3 py-2 text-sm focus:ring-2 focus:outline-none"
        />
      </div>

      <div class="flex flex-col gap-1">
        <label for="email" class="text-sm font-medium">{{ t('auth_email') }}</label>
        <input
          id="email"
          v-model="form.email"
          type="email"
          required
          autocomplete="email"
          :placeholder="t('auth_email_placeholder')"
          class="border-surface-300 dark:border-surface-600 dark:bg-surface-800 focus:ring-primary-300 w-full rounded-lg border bg-white px-3 py-2 text-sm focus:ring-2 focus:outline-none"
        />
      </div>

      <div class="flex flex-col gap-1">
        <label for="password" class="text-sm font-medium">{{ t('auth_password') }}</label>
        <input
          id="password"
          v-model="form.password"
          type="password"
          required
          autocomplete="new-password"
          minlength="8"
          :placeholder="t('auth_password_placeholder')"
          class="border-surface-300 dark:border-surface-600 dark:bg-surface-800 focus:ring-primary-300 w-full rounded-lg border bg-white px-3 py-2 text-sm focus:ring-2 focus:outline-none"
        />
      </div>

      <div class="flex flex-col gap-1">
        <label for="confirmPassword" class="text-sm font-medium">{{
          t('auth_confirm_password')
        }}</label>
        <input
          id="confirmPassword"
          v-model="form.confirmPassword"
          type="password"
          required
          autocomplete="new-password"
          minlength="8"
          :placeholder="t('auth_confirm_password_placeholder')"
          :class="[
            'dark:bg-surface-800 w-full rounded-lg border bg-white px-3 py-2 text-sm focus:ring-2 focus:outline-none',
            passwordMismatch
              ? 'border-red-400 focus:ring-red-300'
              : 'border-surface-300 dark:border-surface-600 focus:ring-primary-300',
          ]"
        />
        <p v-if="passwordMismatch" class="mt-1 text-xs text-red-500">
          {{ t('auth_passwords_mismatch') }}
        </p>
      </div>

      <button
        type="submit"
        :disabled="isLoading || passwordMismatch"
        class="bg-primary-500 hover:bg-primary-600 w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span
          v-if="isLoading"
          :class="[resolveIcon('spinner'), 'mr-2 inline-block h-4 w-4 animate-spin']"
        />
        {{ t('auth_register') }}
      </button>
    </form>

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
