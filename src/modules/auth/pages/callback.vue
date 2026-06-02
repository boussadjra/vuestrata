<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { createScopedLogger } from '~/lib/logger'
import { exchangeOAuthCode } from '~/modules/auth'
import { useAuthStore } from '~/stores/auth'

const router = useRouter()
const route = useRoute()
const store = useAuthStore()
const logger = createScopedLogger('oauth-callback')
const { t } = useI18n()

const error = ref<string | null>(null)
const isProcessing = ref(true)

onMounted(async () => {
  const code = route.query.code as string | undefined
  const state = route.query.state as string | undefined
  const errorParam = route.query.error as string | undefined

  if (errorParam) {
    error.value = `OAuth provider error: ${errorParam}`
    isProcessing.value = false
    return
  }

  if (!code || !state) {
    error.value = 'Missing authorization code or state parameter.'
    isProcessing.value = false
    return
  }

  try {
    const result = await exchangeOAuthCode(code, state)
    store.setAuth(result.user, result.token, result.refreshToken, result.expiresIn)
    logger.info('OAuth login successful')
    router.replace('/dashboard').catch((redirectError) => {
      logger.error('OAuth redirect to dashboard failed', { error: redirectError })
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'OAuth authentication failed.'
    error.value = message
    logger.error('OAuth callback failed', { error: message })
  } finally {
    isProcessing.value = false
  }
})
</script>

<template>
  <div class="bg-surface-50 dark:bg-surface-950 flex min-h-screen items-center justify-center">
    <div
      class="border-surface-200 dark:border-surface-700 dark:bg-surface-900 w-full max-w-md rounded-xl border bg-white p-8 shadow-sm"
    >
      <div v-if="isProcessing" class="text-center">
        <div
          class="border-primary-200 border-t-primary-600 mx-auto mb-4 size-8 animate-spin rounded-full border-4"
        />
        <p class="text-surface-600 dark:text-surface-400">{{ t('auth_callback_processing') }}</p>
      </div>

      <div v-else-if="error" class="text-center">
        <div
          class="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30"
        >
          <span class="text-xl text-red-600 dark:text-red-400">!</span>
        </div>
        <h2 class="text-surface-900 mb-2 text-lg font-semibold dark:text-white">
          {{ t('auth_callback_failed') }}
        </h2>
        <p class="text-surface-500 dark:text-surface-400 mb-6 text-sm">{{ error }}</p>
        <button
          class="bg-primary-600 hover:bg-primary-700 rounded-lg px-4 py-2 text-sm font-medium text-white"
          @click="router.push('/auth/login')"
        >
          {{ t('auth_callback_back_to_login') }}
        </button>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: blank
</route>
