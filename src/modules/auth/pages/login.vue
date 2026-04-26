<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import Logo from '@/components/Logo.vue'
import { useNotificationStore } from '@/stores/notification'
import { resolveIcon } from '~/config/icon-provider'
import { useAuth } from '~/modules/auth'

const { t } = useI18n()
const { login, socialLogin, sendMagicLink, isLoading, error } = useAuth()
const notifications = useNotificationStore()
const isDev = import.meta.env.DEV

type LoginMode = 'credentials' | 'magic-link'
const mode = ref<LoginMode>('credentials')
const magicLinkSent = ref(false)

function setMode(newMode: LoginMode) {
  mode.value = newMode
  magicLinkSent.value = false
}

const form = ref({
  email: '',
  password: '',
})

async function onSubmit() {
  await login({ email: form.value.email, password: form.value.password })
  // Always wipe the password field after the attempt so a failed login does
  // not leave the credential lingering in the DOM (and out of the autocomplete
  // history) for the next user on a shared device.
  if (error.value) form.value.password = ''
}

async function onMagicLink() {
  magicLinkSent.value = false
  await sendMagicLink(form.value.email)
  if (!error.value) magicLinkSent.value = true
}

function onForgotPassword() {
  notifications.add({
    type: 'info',
    title: t('common_coming_soon'),
    message: t('auth_forgot_password_soon'),
  })
}

const socialProviders = [
  {
    id: 'google' as const,
    label: 'Google',
    icon: 'i-logos-google-icon',
    bg: 'hover:bg-red-50 dark:hover:bg-red-950/20',
  },
  {
    id: 'github' as const,
    label: 'GitHub',
    icon: 'i-logos-github-icon',
    bg: 'hover:bg-surface-100 dark:hover:bg-surface-800',
  },
  {
    id: 'microsoft' as const,
    label: 'Microsoft',
    icon: 'i-logos-microsoft-icon',
    bg: 'hover:bg-blue-50 dark:hover:bg-blue-950/20',
  },
]
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
      <h1 class="text-2xl font-bold">{{ t('auth_login') }}</h1>
      <p class="text-surface-500 mt-1 text-sm">{{ t('auth_login_subtitle') }}</p>
    </div>

    <!-- Social login buttons -->
    <div class="mb-6 space-y-2">
      <button
        v-for="provider in socialProviders"
        :key="provider.id"
        :disabled="isLoading"
        :class="[
          provider.bg,
          'border-surface-200 dark:border-surface-700 flex w-full items-center justify-center gap-3 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50',
        ]"
        @click="socialLogin(provider.id)"
      >
        <span :class="[provider.icon, 'h-5 w-5']" />
        Continue with {{ provider.label }}
      </button>
    </div>

    <!-- Divider -->
    <div class="relative mb-6">
      <div class="absolute inset-0 flex items-center">
        <div class="border-surface-200 dark:border-surface-700 w-full border-t" />
      </div>
      <div class="relative flex justify-center text-xs">
        <span class="dark:bg-surface-900 text-surface-400 bg-white px-3">or continue with</span>
      </div>
    </div>

    <!-- Mode toggle -->
    <div class="bg-surface-100 dark:bg-surface-800 mb-5 flex rounded-lg p-0.5">
      <button
        :class="[
          mode === 'credentials' ? 'dark:bg-surface-700 bg-white shadow-sm' : '',
          'flex-1 rounded-md py-2 text-center text-sm font-medium transition-all',
        ]"
        @click="setMode('credentials')"
      >
        Email & Password
      </button>
      <button
        :class="[
          mode === 'magic-link' ? 'dark:bg-surface-700 bg-white shadow-sm' : '',
          'flex-1 rounded-md py-2 text-center text-sm font-medium transition-all',
        ]"
        @click="setMode('magic-link')"
      >
        Magic Link
      </button>
    </div>

    <div
      v-if="error"
      class="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400"
    >
      {{ error }}
    </div>

    <!-- Magic link sent success -->
    <div
      v-if="magicLinkSent"
      class="mb-4 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400"
    >
      <div class="mb-1 flex items-center gap-2 font-medium">
        <span :class="[resolveIcon('letter'), 'h-4 w-4']" />
        Check your inbox
      </div>
      <p class="text-green-600 dark:text-green-400/80">
        We sent a magic link to <strong>{{ form.email }}</strong
        >. Click the link to sign in.
      </p>
    </div>

    <!-- Credentials form -->
    <form v-if="mode === 'credentials'" class="space-y-4" @submit.prevent="onSubmit">
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
        <div class="flex items-center justify-between">
          <label for="password" class="text-sm font-medium">{{ t('auth_password') }}</label>
          <a
            href="#"
            class="text-primary-500 hover:text-primary-600 text-xs"
            @click.prevent="onForgotPassword"
            >Forgot password?</a
          >
        </div>
        <input
          id="password"
          v-model="form.password"
          type="password"
          required
          autocomplete="current-password"
          :placeholder="t('auth_password_placeholder')"
          class="border-surface-300 dark:border-surface-600 dark:bg-surface-800 focus:ring-primary-300 w-full rounded-lg border bg-white px-3 py-2 text-sm focus:ring-2 focus:outline-none"
        />
      </div>

      <button
        type="submit"
        :disabled="isLoading"
        class="bg-primary-500 hover:bg-primary-600 w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span
          v-if="isLoading"
          :class="[resolveIcon('spinner'), 'mr-2 inline-block h-4 w-4 animate-spin']"
        />
        {{ t('auth_login') }}
      </button>
    </form>

    <!-- Magic link form -->
    <form v-else class="space-y-4" @submit.prevent="onMagicLink">
      <div class="flex flex-col gap-1">
        <label for="magic-email" class="text-sm font-medium">{{ t('auth_email') }}</label>
        <input
          id="magic-email"
          v-model="form.email"
          type="email"
          required
          autocomplete="email"
          :placeholder="t('auth_email_placeholder')"
          class="border-surface-300 dark:border-surface-600 dark:bg-surface-800 focus:ring-primary-300 w-full rounded-lg border bg-white px-3 py-2 text-sm focus:ring-2 focus:outline-none"
        />
      </div>

      <button
        type="submit"
        :disabled="isLoading"
        class="bg-primary-500 hover:bg-primary-600 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span v-if="isLoading" :class="[resolveIcon('spinner'), 'h-4 w-4 animate-spin']" />
        <span v-else :class="[resolveIcon('letter'), 'h-4 w-4']" />
        Send Magic Link
      </button>
    </form>

    <p class="text-surface-500 mt-6 text-center text-sm">
      {{ t('auth_no_account') }}
      <RouterLink to="/auth/register" class="text-primary-500 hover:text-primary-600 font-medium">
        {{ t('auth_register') }}
      </RouterLink>
    </p>

    <p v-if="isDev" class="text-surface-400 mt-4 text-center text-xs">
      Demo: demo@vuestrata.dev / password
    </p>

    <p v-if="isDev" class="text-surface-400 mt-2 text-center text-xs">
      Mock auth fully supports credentials, social entry points, and magic links. JWT and OAuth
      adapters are contract stubs.
    </p>
  </div>
</template>

<route lang="yaml">
meta:
  layout: auth
</route>
