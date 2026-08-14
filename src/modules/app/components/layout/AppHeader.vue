<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { UiButton, UiSelect } from '@/components/ui'
import { useLocales } from '@/composables/useLocales'
import { useTheme } from '@/composables/useTheme'
import { resolveIcon } from '@/config/icon-provider'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'

import Logo from '../Logo.vue'
import AppBreadcrumb from './AppBreadcrumb.vue'
import AppCommandPalette from './AppCommandPalette.vue'
import AppUserMenu from './AppUserMenu.vue'

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
const { isDark, toggleDark } = useTheme()
const route = useRoute()

// The locale list, its normalization, and the store round-trip all live in one
// composable now — this component used to carry its own copy of each.
const { options: locales, current: currentLocale } = useLocales()

const localeOptions = computed(() =>
  locales.map((entry) => ({ label: `${entry.flag} ${entry.label}`, value: entry.code })),
)

const normalizedPath = computed(() => {
  const path = route.path.replace(/\/+$/, '')
  return path || '/'
})

function routeStartsWith(base: string) {
  return normalizedPath.value === base || normalizedPath.value.startsWith(`${base}/`)
}

const isDashboardRoute = computed(() => routeStartsWith('/dashboard'))
const isDocsRoute = computed(() => routeStartsWith('/docs'))

const docsSidebar = useDocsSidebar()

const guestAction = computed(() => {
  if (normalizedPath.value === '/auth/login') {
    return {
      to: '/auth/register',
      label: t('auth_register'),
      icon: 'user-plus' as const,
      variant: 'ghost' as const,
      className: 'border-border border',
    }
  }

  if (normalizedPath.value === '/auth/register') {
    return {
      to: '/auth/login',
      label: t('auth_login'),
      icon: 'login' as const,
      variant: 'ghost' as const,
      className: 'border-border border',
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
    class="app-header border-surface-200/70 bg-surface-50/78 dark:border-surface-800/70 dark:bg-surface-950/84 sticky top-0 z-(--z-sticky) border-b backdrop-blur-xl transition-colors"
  >
    <div
      :class="[
        'flex h-16 w-full min-w-0 items-center justify-between gap-2 px-3 sm:gap-3 sm:px-4 lg:px-6',
        showBrand ? 'mx-auto max-w-400' : '',
      ]"
    >
      <div class="flex min-w-0 items-center gap-2.5">
        <UiButton
          v-if="isDashboardRoute"
          variant="ghost"
          size="md"
          icon
          :aria-label="t('sidebar_toggle')"
          data-testid="mobile-sidebar-toggle"
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
          data-testid="desktop-sidebar-toggle"
          :aria-label="t('sidebar_toggle')"
          @click="appStore.toggleSidebar()"
        >
          <span :class="[resolveIcon('sidebar'), 'h-4 w-4']" />
        </UiButton>

        <UiButton
          v-if="isDocsRoute"
          variant="ghost"
          size="md"
          icon
          aria-controls="docs-sidebar"
          :aria-label="t('common_toggle_docs_nav')"
          :aria-expanded="docsSidebar.open.value"
          data-testid="docs-sidebar-toggle"
          class="lg:hidden"
          @click="docsSidebar.toggle()"
        >
          <span :class="[resolveIcon('menu'), 'h-5 w-5']" />
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
              class="text-muted-foreground mt-1 truncate text-[11px] font-medium tracking-[0.18em] uppercase"
            >
              {{ t('common_starter_workbench') }}
            </span>
          </span>
        </RouterLink>

        <!--
          Inside the dashboard the header carries the breadcrumb instead of a
          static "App shell" caption. The caption told the user nothing they
          could not see; the trail tells them where they are and gets them back.
        -->
        <div v-else class="hidden min-w-0 lg:block">
          <AppBreadcrumb />
        </div>
      </div>

      <div class="flex min-w-0 items-center gap-1 sm:gap-2">
        <div class="flex min-w-0 items-center gap-1 sm:gap-2">
          <AppCommandPalette v-if="authStore.isAuthenticated" />

          <UiSelect
            class="max-w-28 min-w-0 sm:max-w-none sm:min-w-35"
            v-model="currentLocale"
            :options="localeOptions"
            :aria-label="t('header_locale_label')"
          />

          <UiButton
            to="/docs"
            variant="ghost"
            size="md"
            class="hidden sm:inline-flex"
            :aria-current="isDocsRoute ? 'page' : undefined"
          >
            <span
              :class="[
                resolveIcon('document'),
                isDocsRoute ? 'text-primary-500 dark:text-primary-300' : 'text-muted-foreground',
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
            :aria-current="isDocsRoute ? 'page' : undefined"
            :class="['sm:hidden', isDocsRoute ? 'text-primary-700 dark:text-primary-300' : '']"
          >
            <span
              :class="[
                resolveIcon('document'),
                isDocsRoute ? 'text-primary-500 dark:text-primary-300' : 'text-muted-foreground',
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
            <span v-if="isDark" :class="[resolveIcon('sun'), 'text-warning-400 h-5 w-5']" />
            <span v-else :class="[resolveIcon('moon'), 'text-primary-500 h-5 w-5']" />
          </UiButton>

          <template v-if="authStore.isAuthenticated">
            <UiButton
              v-if="!isDashboardRoute"
              to="/dashboard"
              variant="ghost"
              size="md"
              icon
              :aria-label="t('sidebar_dashboard')"
            >
              <span :class="[resolveIcon('chart'), 'text-primary-500 h-5 w-5']" />
            </UiButton>
            <AppUserMenu />
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
