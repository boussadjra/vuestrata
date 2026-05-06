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
    class="border-surface-200/80 dark:border-surface-700/60 dark:bg-surface-900/95 sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-white/95 px-4 backdrop-blur-sm transition-all duration-300 lg:px-6"
  >
    <!-- Left: Menu toggle + Brand -->
    <div class="flex items-center gap-3">
      <UiButton
        variant="ghost"
        size="md"
        icon
        aria-label="Toggle sidebar"
        class="lg:hidden"
        @click="appStore.toggleSidebar()"
      >
        <span :class="[resolveIcon('menu'), 'h-5 w-5']" />
      </UiButton>
      <RouterLink v-if="showBrand" to="/" class="group flex items-center gap-3 text-lg font-bold">
        <span class="h-14">
          <Logo className="w-auto shrink-0 mt-2" />
        </span>
        <span class="text-primary-700 dark:text-primary-400 hidden sm:inline"> Vuestrata </span>
      </RouterLink>
    </div>

    <!-- Right: Actions -->
    <div class="flex items-center gap-1.5">
      <!-- Locale switcher -->
      <UiSelect
        :model-value="currentLocale"
        :options="locales.map((l) => ({ label: l.label, value: l.code }))"
        :aria-label="t('header_locale_label', 'Change language')"
        @update:model-value="switchLocale"
      />

      <!-- Docs link -->
      <UiButton to="/docs" variant="ghost" size="md" icon aria-label="Documentation">
        <span
          :class="[resolveIcon('document'), 'text-surface-500 dark:text-surface-400 h-5 w-5']"
        />
      </UiButton>

      <!-- Dark mode toggle -->
      <UiButton
        variant="ghost"
        size="md"
        icon
        :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
        @click="toggleDark()"
      >
        <span v-if="isDark" :class="[resolveIcon('sun'), 'h-5 w-5 text-amber-400']" />
        <span v-else :class="[resolveIcon('moon'), 'text-primary-500 h-5 w-5']" />
      </UiButton>

      <!-- User menu -->
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
        <UiButton to="/auth/login" variant="primary" size="sm">
          <span :class="[resolveIcon('login'), 'h-4 w-4']" />
          {{ t('auth_login') }}
        </UiButton>
      </template>
    </div>
  </header>
</template>
