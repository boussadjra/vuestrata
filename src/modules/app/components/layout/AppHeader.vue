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

const { t } = useI18n()
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

function normalizeLocale(code: string | string[] | null | undefined) {
  const candidate = Array.isArray(code) ? code[0] : code
  if (typeof candidate !== 'string' || candidate.length === 0) return 'en'

  const lowered = candidate.toLowerCase()
  if (supportedLocaleCodes.has(lowered)) return lowered
  const base = lowered.split('-')[0]
  return base && supportedLocaleCodes.has(base) ? base : 'en'
}

// Use a ref instead of writable computed for explicit two-way binding
const currentLocale = ref(normalizeLocale(appStore.locale))

// Sync store -> local ref (when store changes externally)
watch(
  () => appStore.locale,
  (newLocale) => {
    currentLocale.value = normalizeLocale(newLocale)
  },
)

// Sync local ref -> store (when user selects a different locale)
watch(currentLocale, (newValue) => {
  const normalized = normalizeLocale(newValue)
  if (normalized !== appStore.locale) {
    appStore.setLocale(normalized)
  }
})

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
</script>

<template>
  <header
    class="app-header border-surface-200/70 bg-surface-50/78 dark:border-surface-800/70 dark:bg-surface-950/84 sticky top-0 z-30 border-b backdrop-blur-xl transition-colors"
  >
    <div
      :class="[
        'flex h-16 w-full items-center justify-between gap-3 px-4 lg:px-6',
        showBrand ? 'mx-auto max-w-400' : '',
      ]"
    >
      <div class="flex min-w-0 items-center gap-2.5">
        <UiButton
          v-if="isDashboardRoute"
          variant="ghost"
          size="md"
          icon
          aria-label="Toggle sidebar"
          class="lg:hidden"
          @click="appStore.toggleSidebar()"
        >
          <span :class="[resolveIcon('menu'), 'h-5 w-5']" />
        </UiButton>

        <UiButton
          v-if="isDashboardRoute"
          variant="ghost"
          size="md"
          icon
          class="hidden shrink-0 lg:inline-flex"
          :aria-label="t('sidebar_toggle')"
          @click="appStore.toggleSidebar()"
        >
          <span :class="[resolveIcon('sidebar'), 'h-4 w-4']" />
        </UiButton>

        <RouterLink
          v-if="showBrand"
          to="/"
          class="group focus-visible:ring-primary-300/30 dark:focus-visible:ring-offset-surface-950 flex min-w-0 items-center gap-3 rounded-lg py-1 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <span class="flex h-9 w-9 shrink-0 items-center justify-center p-1">
            <Logo className="h-6 w-auto shrink-0" />
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
              {{ t('common_starter_workbench') }}
            </span>
          </span>
        </RouterLink>

        <div v-else class="hidden min-w-0 flex-col lg:flex">
          <span
            class="text-surface-400 dark:text-surface-500 text-[11px] font-medium tracking-[0.18em] uppercase"
          >
            {{ t('common_workspace') }}
          </span>
          <span class="text-surface-700 dark:text-surface-200 text-sm font-semibold">
            {{ t('common_app_shell') }}
          </span>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <div class="flex items-center gap-1.5 sm:gap-2">
          <UiSelect
            class="min-w-35"
            v-model="currentLocale"
            :options="locales.map((l) => ({ label: l.label, value: l.code }))"
            :aria-label="t('header_locale_label')"
          />

          <UiButton to="/docs" variant="ghost" size="md" class="hidden sm:inline-flex">
            <span
              :class="[
                resolveIcon('document'),
                isDocsRoute
                  ? 'text-primary-500 dark:text-primary-300'
                  : 'text-surface-500 dark:text-surface-400',
                'h-5 w-5',
              ]"
            />
            <span class="hidden md:inline">{{ t('common_documentation') }}</span>
          </UiButton>
          <UiButton
            to="/docs"
            variant="ghost"
            size="md"
            icon
            :aria-label="t('common_documentation')"
            :class="['sm:hidden', isDocsRoute ? 'text-primary-700 dark:text-primary-300' : '']"
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
            :aria-label="isDark ? t('common_switch_light_mode') : t('common_switch_dark_mode')"
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
              :aria-label="t('sidebar_dashboard')"
            >
              <span :class="[resolveIcon('chart'), 'text-primary-500 h-5 w-5']" />
            </UiButton>
            <UiButton variant="ghost" size="md" icon :aria-label="t('auth_logout')" @click="logout">
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
              :class="['px-4', guestAction.className]"
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
