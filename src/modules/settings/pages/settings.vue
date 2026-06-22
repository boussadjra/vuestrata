<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { UiButton, UiSwitch } from '@/components/ui'
import { useShape } from '@/composables/useShape'
import type { ShapeRadius, ShapeBorder, ShapeShadow } from '@/composables/useShape'
import { useTheme } from '@/composables/useTheme'
import { getIconProviders, resolveIcon } from '@/config/icon-provider'
import { useAuth } from '@/modules/auth'
import { useAppStore } from '@/stores/app'
import type { IconProvider, ThemeName } from '@/types'

const { t, locale } = useI18n()
const appStore = useAppStore()
const { isDark, toggleDark, themes, currentThemeName, setTheme } = useTheme()
const {
  radius: shapeRadius,
  border: shapeBorder,
  shadow: shapeShadow,
  setRadius,
  setBorder,
  setShadow,
} = useShape()
const { logout } = useAuth()

const iconProviderOptions: { value: string; label: string }[] = getIconProviders().map((p) => ({
  value: p,
  label: p.charAt(0).toUpperCase() + p.slice(1),
}))

const locales = [
  { code: 'en', labelKey: 'settings_locale_english', flag: '🇺🇸' },
  { code: 'fr', labelKey: 'settings_locale_french', flag: '🇫🇷' },
  { code: 'ar', labelKey: 'settings_locale_arabic', flag: '🇸🇦' },
]

const radiusOptions: { value: ShapeRadius; labelKey: string; preview: string }[] = [
  { value: 'none', labelKey: 'settings_radius_sharp', preview: 'rounded-none' },
  { value: 'small', labelKey: 'settings_radius_subtle', preview: 'rounded' },
  { value: 'medium', labelKey: 'settings_radius_rounded', preview: 'rounded-xl' },
  { value: 'large', labelKey: 'settings_radius_soft', preview: 'rounded-2xl' },
]

const borderOptions: { value: ShapeBorder; labelKey: string; preview: string }[] = [
  { value: 'none', labelKey: 'settings_border_none', preview: 'border-0' },
  { value: 'thin', labelKey: 'settings_border_thin', preview: 'border' },
  { value: 'medium', labelKey: 'settings_border_medium', preview: 'border-2' },
  { value: 'bold', labelKey: 'settings_border_bold', preview: 'border-3' },
]

const shadowOptions: { value: ShapeShadow; labelKey: string; preview: string }[] = [
  { value: 'none', labelKey: 'settings_shadow_flat', preview: 'shadow-none' },
  { value: 'subtle', labelKey: 'settings_shadow_subtle', preview: 'shadow-sm' },
  { value: 'medium', labelKey: 'settings_shadow_medium', preview: 'shadow-md' },
  { value: 'elevated', labelKey: 'settings_shadow_elevated', preview: 'shadow-xl' },
]

const darkModeModel = computed({
  get: () => isDark.value,
  set: (value: boolean) => {
    if (value !== isDark.value) {
      toggleDark()
    }
  },
})

function switchLocale(code: string) {
  appStore.setLocale(code)
}

function switchTheme(name: ThemeName) {
  setTheme(name)
}

function switchIconProvider(p: IconProvider) {
  appStore.setIconProvider(p)
}
</script>

<template>
  <div class="animate-fade-in mx-auto max-w-3xl px-4 py-10">
    <h1 class="mb-2 text-3xl font-bold">{{ t('settings_title') }}</h1>
    <p class="text-surface-500 dark:text-surface-400 mb-10">{{ t('settings_subtitle') }}</p>

    <div class="space-y-8">
      <!-- Appearance -->
      <section
        class="card border-surface-200 dark:border-surface-700/50 dark:bg-surface-800/80 rounded-2xl border bg-white p-7"
      >
        <h2 class="mb-2 text-lg font-bold">{{ t('settings_appearance') }}</h2>
        <p class="text-surface-500 dark:text-surface-400 mb-6 text-sm">
          {{ t('settings_appearance_desc') }}
        </p>

        <div
          class="bg-surface-50 dark:bg-surface-800/60 border-surface-200/60 dark:border-surface-700/40 flex items-center justify-between rounded-xl border p-4"
        >
          <div class="flex items-center gap-3">
            <div
              class="bg-surface-200 dark:bg-surface-700 flex h-10 w-10 items-center justify-center rounded-xl"
            >
              <span v-if="isDark" :class="[resolveIcon('moon'), 'text-primary-400 h-5 w-5']" />
              <span v-else :class="[resolveIcon('sun'), 'h-5 w-5 text-amber-500']" />
            </div>
            <div>
              <span class="block text-sm font-semibold">{{ t('settings_dark_mode') }}</span>
              <span class="text-surface-500 text-xs">
                {{ isDark ? t('settings_dark_mode_active') : t('settings_light_mode_active') }}
              </span>
            </div>
          </div>
          <UiSwitch v-model="darkModeModel" :aria-label="t('settings_dark_mode')" />
        </div>
      </section>

      <!-- Shapes -->
      <section
        class="card border-surface-200 dark:border-surface-700/50 dark:bg-surface-800/80 rounded-2xl border bg-white p-7"
      >
        <h2 class="mb-2 text-lg font-bold">{{ t('settings_shapes_title') }}</h2>
        <p class="text-surface-500 dark:text-surface-400 mb-6 text-sm">
          {{ t('settings_shapes_desc') }}
        </p>

        <!-- Border Radius -->
        <div class="mb-6">
          <h3 class="text-surface-700 dark:text-surface-300 mb-3 text-sm font-semibold">
            {{ t('settings_border_radius') }}
          </h3>
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <button
              v-for="opt in radiusOptions"
              :key="opt.value"
              :class="[
                'flex flex-col items-center gap-2 px-3 py-3.5 text-xs font-medium transition-all duration-200',
                shapeRadius === opt.value
                  ? 'ring-primary-500 dark:ring-offset-surface-800 bg-primary-50 dark:bg-primary-900/20 text-primary-600 rounded-xl shadow-md ring-2 ring-offset-2'
                  : 'border-surface-200 dark:border-surface-700/50 hover:border-primary-300 dark:hover:border-primary-700/50 hover:bg-surface-50 dark:hover:bg-surface-800/80 rounded-xl border',
              ]"
              @click="setRadius(opt.value)"
            >
              <div
                :class="['bg-primary-500/20 border-primary-500 h-8 w-8 border-2', opt.preview]"
              />
              {{ t(opt.labelKey) }}
            </button>
          </div>
        </div>

        <!-- Borders -->
        <div class="mb-6">
          <h3 class="text-surface-700 dark:text-surface-300 mb-3 text-sm font-semibold">
            {{ t('settings_borders') }}
          </h3>
          <div class="grid grid-cols-4 gap-3">
            <button
              v-for="opt in borderOptions"
              :key="opt.value"
              :class="[
                'flex flex-col items-center gap-2 rounded-xl px-3 py-3.5 text-xs font-medium transition-all duration-200',
                shapeBorder === opt.value
                  ? 'ring-primary-500 dark:ring-offset-surface-800 bg-primary-50 dark:bg-primary-900/20 text-primary-600 shadow-md ring-2 ring-offset-2'
                  : 'border-surface-200 dark:border-surface-700/50 hover:border-primary-300 dark:hover:border-primary-700/50 hover:bg-surface-50 dark:hover:bg-surface-800/80 border',
              ]"
              @click="setBorder(opt.value)"
            >
              <div
                :class="[
                  'border-surface-500 dark:border-surface-400 h-8 w-8 rounded-lg',
                  opt.preview,
                ]"
              />
              {{ t(opt.labelKey) }}
            </button>
          </div>
        </div>

        <!-- Shadows -->
        <div>
          <h3 class="text-surface-700 dark:text-surface-300 mb-3 text-sm font-semibold">
            {{ t('settings_shadows') }}
          </h3>
          <div class="grid grid-cols-4 gap-3">
            <button
              v-for="opt in shadowOptions"
              :key="opt.value"
              :class="[
                'flex flex-col items-center gap-2 rounded-xl px-3 py-3.5 text-xs font-medium transition-all duration-200',
                shapeShadow === opt.value
                  ? 'ring-primary-500 dark:ring-offset-surface-800 bg-primary-50 dark:bg-primary-900/20 text-primary-600 shadow-md ring-2 ring-offset-2'
                  : 'border-surface-200 dark:border-surface-700/50 hover:border-primary-300 dark:hover:border-primary-700/50 hover:bg-surface-50 dark:hover:bg-surface-800/80 border',
              ]"
              @click="setShadow(opt.value)"
            >
              <div
                :class="[
                  'dark:bg-surface-700 border-surface-200 dark:border-surface-600 h-8 w-8 rounded-lg border bg-white',
                  opt.preview,
                ]"
              />
              {{ t(opt.labelKey) }}
            </button>
          </div>
        </div>
      </section>

      <!-- Language -->
      <section
        class="card border-surface-200 dark:border-surface-700/50 dark:bg-surface-800/80 rounded-2xl border bg-white p-7"
      >
        <h2 class="mb-2 text-lg font-bold">{{ t('settings_language') }}</h2>
        <p class="text-surface-500 dark:text-surface-400 mb-5 text-sm">
          {{ t('settings_language_desc') }}
        </p>
        <div class="grid grid-cols-3 gap-3">
          <button
            v-for="loc in locales"
            :key="loc.code"
            :class="[
              'flex items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-medium transition-all duration-200',
              locale === loc.code
                ? 'ring-primary-500 dark:ring-offset-surface-800 bg-primary-50 dark:bg-primary-900/20 text-primary-600 shadow-md ring-2 ring-offset-2'
                : 'border-surface-200 dark:border-surface-700/50 hover:border-primary-300 dark:hover:border-primary-700/50 hover:bg-surface-50 dark:hover:bg-surface-800/80 border',
            ]"
            @click="switchLocale(loc.code)"
          >
            <span class="text-lg">{{ loc.flag }}</span>
            {{ t(loc.labelKey) }}
          </button>
        </div>
      </section>

      <!-- Theme -->
      <section
        class="card border-surface-200 dark:border-surface-700/50 dark:bg-surface-800/80 rounded-2xl border bg-white p-7"
      >
        <h2 class="mb-2 text-lg font-bold">{{ t('settings_theme') }}</h2>
        <p class="text-surface-500 dark:text-surface-400 mb-5 text-sm">
          {{ t('settings_theme_desc') }}
        </p>
        <div class="grid grid-cols-3 gap-3">
          <button
            v-for="th in themes"
            :key="th.name"
            :class="[
              'flex flex-col items-center gap-2 rounded-xl px-4 py-4 text-sm font-medium transition-all duration-200',
              currentThemeName === th.name
                ? 'ring-primary-500 dark:ring-offset-surface-800 bg-primary-50 dark:bg-primary-900/20 text-primary-600 shadow-md ring-2 ring-offset-2'
                : 'border-surface-200 dark:border-surface-700/50 hover:border-primary-300 dark:hover:border-primary-700/50 hover:bg-surface-50 dark:hover:bg-surface-800/80 border',
            ]"
            @click="switchTheme(th.name)"
          >
            <span :class="[resolveIcon('palette-round'), 'h-5 w-5']" />
            {{ th.label }}
          </button>
        </div>
      </section>

      <!-- Icon Provider -->
      <section
        class="card border-surface-200 dark:border-surface-700/50 dark:bg-surface-800/80 rounded-2xl border bg-white p-7"
      >
        <h2 class="mb-2 text-lg font-bold">{{ t('settings_icon_provider') }}</h2>
        <p class="text-surface-500 dark:text-surface-400 mb-5 text-sm">
          {{ t('settings_icon_provider_desc') }}
        </p>
        <div class="grid grid-cols-3 gap-3">
          <button
            v-for="ip in iconProviderOptions"
            :key="ip.value"
            :class="[
              'flex flex-col items-center gap-2 rounded-xl px-4 py-4 text-sm font-medium transition-all duration-200',
              appStore.iconProvider === ip.value
                ? 'ring-primary-500 dark:ring-offset-surface-800 bg-primary-50 dark:bg-primary-900/20 text-primary-600 shadow-md ring-2 ring-offset-2'
                : 'border-surface-200 dark:border-surface-700/50 hover:border-primary-300 dark:hover:border-primary-700/50 hover:bg-surface-50 dark:hover:bg-surface-800/80 border',
            ]"
            @click="switchIconProvider(ip.value)"
          >
            <span :class="[resolveIcon('star'), 'h-5 w-5']" />
            {{ ip.label }}
          </button>
        </div>
      </section>

      <!-- Logout -->
      <UiButton variant="destructive" block @click="logout">
        <span :class="[resolveIcon('logout'), 'mr-1 h-4 w-4']" />
        {{ t('auth_logout') }}
      </UiButton>
    </div>
  </div>
</template>

<style scoped></style>
