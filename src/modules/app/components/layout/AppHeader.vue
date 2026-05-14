<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { UiButton, UiSelect } from '@/components/ui'
import { useTheme } from '@/composables/useTheme'
import { resolveIcon } from '@/config/icon-provider'
import { useAuth } from '@/modules/auth'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'

import Logo from '../Logo.vue'

withDefaults(
  defineProps<{
    showBrand?: boolean
  }>(),
  {
    showBrand: true,
  },
)

const { t, locale } = useI18n()
const appStore = useAppStore()
const authStore = useAuthStore()
const { logout } = useAuth()
const { isDark, toggleDark } = useTheme()
const route = useRoute()

const locales = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'ar', label: 'العربية' },
]

const supportedLocaleCodes = new Set(locales.map((entry) => entry.code))

function normalizeLocale(code: string) {
  const lowered = code.toLowerCase()
  if (supportedLocaleCodes.has(lowered)) return lowered
  const base = lowered.split('-')[0]
  return supportedLocaleCodes.has(base) ? base : 'en'
}

const currentLocale = computed(() => normalizeLocale(locale.value || appStore.locale || 'en'))

const normalizedPath = computed(() => {
  const path = route.path.replace(/\/+$/, '')
  return path || '/'
})

function routeStartsWith(base: string) {
  return normalizedPath.value === base || normalizedPath.value.startsWith(`${base}/`)
}

const isDashboardRoute = computed(() => routeStartsWith('/dashboard'))
const isDocsRoute = computed(() => routeStartsWith('/docs'))

const guestAction = computed(() => {
  if (normalizedPath.value === '/auth/login') {
    return {
      to: '/auth/register',
      label: t('auth_register'),
      icon: 'user-plus' as const,
      variant: 'ghost' as const,
      className:
        'border-surface-200 bg-surface-50/90 text-surface-700 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-200 hover:text-surface-900 dark:hover:text-surface-50 border',
    }
  }

  if (normalizedPath.value === '/auth/register') {
    return {
      to: '/auth/login',
      label: t('auth_login'),
      icon: 'login' as const,
      variant: 'ghost' as const,
      className:
        'border-surface-200 bg-surface-50/90 text-surface-700 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-200 hover:text-surface-900 dark:hover:text-surface-50 border',
    }
  }

  return {
    to: '/auth/login',
    label: t('auth_login'),
    icon: 'login' as const,
    variant: 'primary' as const,
    className: '',
  }
})

function switchLocale(code: string) {
  const normalized = normalizeLocale(code)
  locale.value = normalized
  appStore.setLocale(normalized)
}

watch(
  () => appStore.locale,
  (next) => {
    const normalized = normalizeLocale(next)
    if (locale.value !== normalized) locale.value = normalized
  },
  { immediate: true },
)
</script>

<template>
  <header
    class="border-surface-200/70 bg-surface-50/78 dark:border-surface-800/70 dark:bg-surface-950/84 sticky top-0 z-30 border-b backdrop-blur-xl transition-colors"
  >
    <div class="mx-auto flex h-16 w-full max-w-400 items-center justify-between gap-3 px-4 lg:px-6">
      <div class="flex min-w-0 items-center gap-2.5">
        <UiButton
          v-if="isDashboardRoute"
          variant="ghost"
          size="md"
          icon
          aria-label="Toggle sidebar"
          class="rounded-full lg:hidden"
          @click="appStore.toggleSidebar()"
        >
          <span :class="[resolveIcon('menu'), 'h-5 w-5']" />
        </UiButton>

        <RouterLink
          v-if="showBrand"
          to="/"
          class="group focus-visible:ring-primary-300/30 dark:focus-visible:ring-offset-surface-950 px- flex min-w-0 items-center gap-3 rounded-full py-1 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <span class="me-2 flex h-10 w-10 items-center">
            <Logo className="h-7 w-auto shrink-0" />
          </span>
          <span class="hidden min-w-0 flex-col sm:flex">
            <span
              class="text-primary-700 dark:text-primary-300 truncate text-lg leading-none font-semibold"
            >
              Vuestrata
            </span>
            <span
              class="text-surface-400 dark:text-surface-500 mt-1 truncate text-[11px] font-medium tracking-[0.18em] uppercase"
            >
              Starter workbench
            </span>
          </span>
        </RouterLink>

        <div v-else class="hidden min-w-0 flex-col lg:flex">
          <span
            class="text-surface-400 dark:text-surface-500 text-[11px] font-medium tracking-[0.18em] uppercase"
          >
            Workspace
          </span>
          <span class="text-surface-700 dark:text-surface-200 text-sm font-semibold">
            App shell
          </span>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <div
          class="border-surface-200/80 bg-surface-50/86 dark:border-surface-700/70 dark:bg-surface-900/82 flex items-center gap-1 rounded-full border p-1 px-6 shadow-(--shadow-soft)"
        >
          <UiSelect
            class="min-w-35"
            :model-value="currentLocale"
            :options="locales.map((l) => ({ label: l.label, value: l.code }))"
            :aria-label="t('header_locale_label', 'Change language')"
            @update:model-value="switchLocale"
          />

          <UiButton to="/docs" variant="ghost" size="md" class="hidden rounded-full sm:inline-flex">
            <span
              :class="[
                resolveIcon('document'),
                isDocsRoute
                  ? 'text-primary-500 dark:text-primary-300'
                  : 'text-surface-500 dark:text-surface-400',
                'h-5 w-5',
              ]"
            />
            <span class="hidden md:inline">Docs</span>
          </UiButton>
          <UiButton
            to="/docs"
            variant="ghost"
            size="md"
            icon
            aria-label="Documentation"
            :class="[
              'rounded-full sm:hidden',
              isDocsRoute
                ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/36 dark:text-primary-300 shadow-(--shadow-soft)'
                : '',
            ]"
          >
            <span
              :class="[
                resolveIcon('document'),
                isDocsRoute
                  ? 'text-primary-500 dark:text-primary-300'
                  : 'text-surface-500 dark:text-surface-400',
                'h-5 w-5',
              ]"
            />
          </UiButton>

          <UiButton
            variant="ghost"
            size="md"
            icon
            class="rounded-full"
            :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
            @click="toggleDark()"
          >
            <span v-if="isDark" :class="[resolveIcon('sun'), 'h-5 w-5 text-amber-400']" />
            <span v-else :class="[resolveIcon('moon'), 'text-primary-500 h-5 w-5']" />
          </UiButton>

          <template v-if="authStore.isAuthenticated">
            <UiButton
              to="/dashboard/settings"
              variant="ghost"
              size="md"
              icon
              class="rounded-full"
              :aria-label="t('nav_settings')"
            >
              <span
                :class="[resolveIcon('settings'), 'text-surface-500 dark:text-surface-400 h-5 w-5']"
              />
            </UiButton>
            <UiButton
              to="/dashboard"
              variant="ghost"
              size="md"
              icon
              class="rounded-full"
              :aria-label="t('sidebar_dashboard')"
            >
              <span :class="[resolveIcon('chart'), 'text-primary-500 h-5 w-5']" />
            </UiButton>
            <UiButton
              variant="ghost"
              size="md"
              icon
              class="rounded-full"
              :aria-label="t('auth_logout')"
              @click="logout"
            >
              <span
                :class="[resolveIcon('logout'), 'text-surface-500 dark:text-surface-400 h-5 w-5']"
              />
            </UiButton>
          </template>
          <template v-else>
            <UiButton
              :to="guestAction.to"
              :variant="guestAction.variant"
              size="sm"
              :class="['rounded-full px-4', guestAction.className]"
            >
              <span :class="[resolveIcon(guestAction.icon), 'h-4 w-4']" />
              {{ guestAction.label }}
            </UiButton>
          </template>
        </div>
      </div>
    </div>
  </header>
</template>
