<script setup lang="ts">
import { useI18n } from 'vue-i18n'

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

function switchLocale(code: string) {
  locale.value = code
  appStore.setLocale(code)
}
</script>

<template>
  <header
    class="border-surface-200/80 dark:border-surface-700/60 dark:bg-surface-900/95 sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-white/95 px-4 backdrop-blur-sm transition-all duration-300 lg:px-6"
  >
    <!-- Left: Menu toggle + Brand -->
    <div class="flex items-center gap-3">
      <button
        class="hover:bg-surface-100 dark:hover:bg-surface-800 focus-visible:ring-primary-300/30 dark:focus-visible:ring-offset-surface-900 rounded-xl p-3 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-95 lg:hidden"
        aria-label="Toggle sidebar"
        @click="appStore.toggleSidebar()"
      >
        <span :class="[resolveIcon('menu'), 'h-5 w-5']" />
      </button>
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
      <select
        :value="locale"
        :aria-label="t('header_locale_label', 'Change language')"
        class="border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 focus:ring-primary-300 dark:focus:ring-primary-700 cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors focus:ring-2 focus:outline-none"
        @change="switchLocale(($event.target as HTMLSelectElement).value)"
      >
        <option v-for="loc in locales" :key="loc.code" :value="loc.code">{{ loc.label }}</option>
      </select>

      <!-- Docs link -->
      <RouterLink
        to="/docs"
        class="hover:bg-surface-100 dark:hover:bg-surface-800 focus-visible:ring-primary-300/30 dark:focus-visible:ring-offset-surface-900 rounded-xl p-3 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        aria-label="Documentation"
      >
        <span
          :class="[resolveIcon('document'), 'text-surface-500 dark:text-surface-400 h-5 w-5']"
        />
      </RouterLink>

      <!-- Dark mode toggle -->
      <button
        class="hover:bg-surface-100 dark:hover:bg-surface-800 focus-visible:ring-primary-300/30 dark:focus-visible:ring-offset-surface-900 rounded-xl p-3 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-95"
        :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
        @click="toggleDark()"
      >
        <span v-if="isDark" :class="[resolveIcon('sun'), 'h-5 w-5 text-amber-400']" />
        <span v-else :class="[resolveIcon('moon'), 'text-primary-500 h-5 w-5']" />
      </button>

      <!-- User menu -->
      <template v-if="authStore.isAuthenticated">
        <RouterLink
          to="/dashboard/settings"
          class="hover:bg-surface-100 dark:hover:bg-surface-800 focus-visible:ring-primary-300/30 dark:focus-visible:ring-offset-surface-900 rounded-xl p-3 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          :aria-label="t('nav_settings')"
        >
          <span
            :class="[resolveIcon('settings'), 'text-surface-500 dark:text-surface-400 h-5 w-5']"
          />
        </RouterLink>
        <RouterLink
          to="/dashboard"
          class="hover:bg-surface-100 dark:hover:bg-surface-800 focus-visible:ring-primary-300/30 dark:focus-visible:ring-offset-surface-900 rounded-xl p-3 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          :aria-label="t('sidebar_dashboard')"
        >
          <span :class="[resolveIcon('chart'), 'text-primary-500 h-5 w-5']" />
        </RouterLink>
        <button
          type="button"
          class="hover:bg-surface-100 dark:hover:bg-surface-800 focus-visible:ring-primary-300/30 dark:focus-visible:ring-offset-surface-900 rounded-xl p-3 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          :aria-label="t('auth_logout')"
          @click="logout"
        >
          <span
            :class="[resolveIcon('logout'), 'text-surface-500 dark:text-surface-400 h-5 w-5']"
          />
        </button>
      </template>
      <template v-else>
        <RouterLink
          to="/auth/login"
          class="bg-primary-500 hover:bg-primary-600 focus-visible:ring-primary-300/30 dark:focus-visible:ring-offset-surface-900 inline-flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:shadow-md focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-[0.98]"
        >
          <span :class="[resolveIcon('login'), 'h-4 w-4']" />
          {{ t('auth_login') }}
        </RouterLink>
      </template>
    </div>
  </header>
</template>
