<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import Logo from '@/components/Logo.vue'
import { UiButton, UiTextField, UiToggleGroup } from '@/components/ui'
import { useNotificationStore } from '@/stores/notification'
import { resolveIcon } from '~/config/icon-provider'
import { useAuth } from '~/modules/auth'

const { t } = useI18n()
const { login, socialLogin, sendMagicLink, verifyMfaCode, mfaRequired, isLoading, error } =
  useAuth()
const notifications = useNotificationStore()
const isDev = import.meta.env.DEV

type LoginMode = 'credentials' | 'magic-link'
const mode = ref<LoginMode>('credentials')
const magicLinkSent = ref(false)

function setMode(newMode: string | string[]) {
  if (typeof newMode === 'string' && (newMode === 'credentials' || newMode === 'magic-link')) {
    mode.value = newMode
    magicLinkSent.value = false
  }
}

const form = ref({
  email: '',
  password: '',
})
const mfaCode = ref('')

function readInputValue(event: Event | undefined, selector: string, fallback = ''): string {
  const formElement = event?.currentTarget
  if (!(formElement instanceof HTMLFormElement)) return fallback
  const input = formElement.querySelector<HTMLInputElement>(selector)
  return input?.value ?? fallback
}

async function onSubmit(event: Event) {
  const email = readInputValue(event, '#email', form.value.email)
  const password = readInputValue(event, '#password', form.value.password)

  form.value.email = email
  form.value.password = password

  await login({ email, password })
  // Always wipe the password field after the attempt so a failed login does
  // not leave the credential lingering in the DOM (and out of the autocomplete
  // history) for the next user on a shared device.
  if (error.value) form.value.password = ''
}

async function onMagicLink(event: Event) {
  magicLinkSent.value = false
  const email = readInputValue(event, '#magic-email', form.value.email)
  form.value.email = email
  await sendMagicLink(email)
  if (!error.value) magicLinkSent.value = true
}

async function onMfaSubmit(event: Event) {
  const code = readInputValue(event, '#mfa-code', mfaCode.value)
  mfaCode.value = code
  await verifyMfaCode(code)
}

function onForgotPassword() {
  notifications.add({
    type: 'info',
    title: t('common_coming_soon'),
    message: t('auth_forgot_password_soon'),
  })
}

const socialProviders = computed(() => [
  {
    id: 'google' as const,
    label: t('auth_provider_google'),
    icon: 'i-logos-google-icon',
    bg: 'hover:bg-red-50 dark:hover:bg-red-950/20',
  },
  {
    id: 'github' as const,
    label: t('auth_provider_github'),
    icon: 'i-logos-github-icon',
    bg: 'hover:bg-surface-100 dark:hover:bg-surface-800',
  },
  {
    id: 'microsoft' as const,
    label: t('auth_provider_microsoft'),
    icon: 'i-logos-microsoft-icon',
    bg: 'hover:bg-blue-50 dark:hover:bg-blue-950/20',
  },
])
</script>

<template>
  <div class="mx-auto w-full max-w-xl">
    <div
      class="border-surface-200/80 bg-surface-50/86 dark:border-surface-800 dark:bg-surface-900/78 rounded-[calc(var(--shape-radius)+0.375rem)] border p-6 shadow-(--shadow-card) sm:p-8"
    >
      <div class="mb-8 flex items-start justify-between gap-4">
        <div class="min-w-0">
          <p
            class="text-surface-400 dark:text-surface-500 mb-2 text-xs font-semibold tracking-[0.28em] uppercase"
          >
            Vuestrata
          </p>
          <h1 class="text-surface-950 dark:text-surface-50 text-3xl font-bold tracking-tight">
            {{ t('auth_login') }}
          </h1>
          <p class="text-surface-600 dark:text-surface-300 mt-2 text-sm leading-6">
            {{ t('auth_login_subtitle') }}
          </p>
        </div>

        <span class="flex h-14 w-14 shrink-0 items-center">
          <Logo class="h-9 w-auto" />
        </span>
      </div>

      <div class="mb-6 space-y-2">
        <UiButton
          v-for="provider in socialProviders"
          :key="provider.id"
          :id="provider.id"
          variant="ghost"
          block
          class="border-surface-200 bg-surface-50 text-surface-700 hover:text-surface-900 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-200 dark:hover:text-surface-50 justify-start border shadow-none"
          :disabled="isLoading"
          @click="socialLogin(provider.id)"
        >
          <span :class="[provider.icon, 'h-5 w-5']" />
          {{ t('auth_continue_with_provider', { provider: provider.label }) }}
        </UiButton>
      </div>

      <div class="relative mb-6">
        <div class="absolute inset-0 flex items-center">
          <div class="border-surface-200 dark:border-surface-700 w-full border-t" />
        </div>
        <div class="relative flex justify-center text-xs">
          <span class="text-surface-400 bg-surface-50/95 dark:bg-surface-900/95 px-3">
            {{ t('auth_or_continue_with') }}
          </span>
        </div>
      </div>

      <UiToggleGroup
        :model-value="mode"
        :options="[
          { label: t('auth_mode_credentials'), value: 'credentials' },
          { label: t('auth_mode_magic_link'), value: 'magic-link' },
        ]"
        size="md"
        class="mb-6"
        @update:model-value="setMode"
      />

      <div
        v-if="error"
        class="mb-4 rounded-[var(--shape-radius-sm)] border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400"
      >
        {{ error }}
      </div>

      <div
        v-if="magicLinkSent"
        class="mb-4 rounded-[var(--shape-radius-sm)] border border-green-200 bg-green-50 p-4 text-sm text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400"
      >
        <div class="mb-1 flex items-center gap-2 font-medium">
          <span :class="[resolveIcon('letter'), 'h-4 w-4']" />
          {{ t('auth_magic_link_sent_title') }}
        </div>
        <p class="text-green-600 dark:text-green-400/80">
          {{ t('auth_magic_link_sent_body', { email: form.email }) }}
        </p>
      </div>

      <form
        v-if="mode === 'credentials' && mfaRequired"
        class="space-y-5"
        @submit.prevent="onMfaSubmit"
      >
        <div
          class="rounded-[var(--shape-radius-sm)] border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400"
        >
          {{ t('auth_mfa_required') }}
        </div>

        <UiTextField
          id="mfa-code"
          v-model="mfaCode"
          type="text"
          :label="t('auth_mfa_code_label')"
          placeholder="000000"
          inputmode="numeric"
          pattern="[0-9]*"
          autocomplete="one-time-code"
          maxlength="6"
          required
        />

        <UiButton type="submit" variant="primary" block :disabled="isLoading">
          <span
            v-if="isLoading"
            :class="[resolveIcon('spinner'), 'mr-2 inline-block h-4 w-4 animate-spin']"
          />
          {{ t('auth_mfa_verify_button') }}
        </UiButton>
      </form>

      <form v-else-if="mode === 'credentials'" class="space-y-5" @submit.prevent="onSubmit">
        <UiTextField
          id="email"
          v-model="form.email"
          type="email"
          :label="t('auth_email')"
          :placeholder="t('auth_email_placeholder')"
          required
          autocomplete="email"
        />

        <div class="flex flex-col gap-1.5">
          <div class="flex items-center justify-between">
            <label for="password" class="text-sm font-medium">{{ t('auth_password') }}</label>
            <a
              href="#"
              class="text-primary-500 hover:text-primary-600 text-xs"
              @click.prevent="onForgotPassword"
              >{{ t('auth_forgot') }}</a
            >
          </div>
          <UiTextField
            id="password"
            v-model="form.password"
            type="password"
            :placeholder="t('auth_password_placeholder')"
            required
            autocomplete="current-password"
          />
        </div>

        <UiButton type="submit" variant="primary" block :disabled="isLoading">
          <span
            v-if="isLoading"
            :class="[resolveIcon('spinner'), 'mr-2 inline-block h-4 w-4 animate-spin']"
          />
          {{ t('auth_login') }}
        </UiButton>
      </form>

      <form v-else class="space-y-5" @submit.prevent="onMagicLink">
        <UiTextField
          id="magic-email"
          v-model="form.email"
          type="email"
          :label="t('auth_email')"
          :placeholder="t('auth_email_placeholder')"
          required
          autocomplete="email"
        />

        <UiButton type="submit" variant="primary" block :disabled="isLoading">
          <span v-if="isLoading" :class="[resolveIcon('spinner'), 'h-4 w-4 animate-spin']" />
          <span v-else :class="[resolveIcon('letter'), 'h-4 w-4']" />
          {{ t('auth_magic_link_send_button') }}
        </UiButton>
      </form>

      <div
        v-if="isDev"
        class="border-surface-200/80 bg-surface-50/90 text-surface-500 dark:border-surface-700 dark:bg-surface-950/80 dark:text-surface-400 mt-6 rounded-[var(--shape-radius-sm)] border p-4 text-sm"
      >
        <p class="text-surface-800 dark:text-surface-100 font-medium">{{ t('auth_demo_title') }}</p>
        <p class="mt-1">demo@vuestrata.dev / password</p>
        <p class="mt-2 text-xs leading-5">
          {{ t('auth_demo_body') }}
        </p>
      </div>
    </div>

    <p class="text-surface-500 mt-6 text-center text-sm">
      {{ t('auth_no_account') }}
      <RouterLink to="/auth/register" class="text-primary-500 hover:text-primary-600 font-medium">
        {{ t('auth_register') }}
      </RouterLink>
    </p>
  </div>
</template>

<route lang="yaml">
meta:
  layout: auth
</route>
