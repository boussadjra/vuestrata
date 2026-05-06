<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { UiButton } from '@/components/ui'
import { useShape } from '@/composables/useShape'
import type { ShapeRadius, ShapeBorder, ShapeShadow } from '@/composables/useShape'
import { useTheme } from '@/composables/useTheme'
import { getIconProviders, resolveIcon } from '@/config/icon-provider'
import { useAuth } from '@/modules/auth'
import { useAppStore } from '@/stores/app'
import type { UiProvider, IconProvider, ThemeName, ValidationAdapterName } from '@/types'

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

const providers: { value: UiProvider; label: string; iconName: 'widget' | 'code' }[] = [
  { value: 'reka', label: 'Reka UI', iconName: 'widget' },
  { value: 'vuetify0', label: 'Vuetify 0 (experimental)', iconName: 'code' },
]

const iconProviderOptions: { value: string; label: string }[] = getIconProviders().map((p) => ({
  value: p,
  label: p.charAt(0).toUpperCase() + p.slice(1),
}))

const validationOptions: { value: ValidationAdapterName; label: string }[] = [
  { value: 'zod', label: 'Zod' },
  { value: 'valibot', label: 'Valibot' },
  { value: 'yup', label: 'Yup' },
  { value: 'arktype', label: 'ArkType' },
]

const locales = [
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'ar', label: 'العربية', flag: '🇸🇦' },
]

const radiusOptions: { value: ShapeRadius; label: string; preview: string }[] = [
  { value: 'none', label: 'Sharp', preview: 'rounded-none' },
  { value: 'small', label: 'Subtle', preview: 'rounded' },
  { value: 'medium', label: 'Rounded', preview: 'rounded-xl' },
  { value: 'large', label: 'Soft', preview: 'rounded-2xl' },
  { value: 'full', label: 'Pill', preview: 'rounded-full' },
]

const borderOptions: { value: ShapeBorder; label: string; preview: string }[] = [
  { value: 'none', label: 'None', preview: 'border-0' },
  { value: 'thin', label: 'Thin', preview: 'border' },
  { value: 'medium', label: 'Medium', preview: 'border-2' },
  { value: 'bold', label: 'Bold', preview: 'border-3' },
]

const shadowOptions: { value: ShapeShadow; label: string; preview: string }[] = [
  { value: 'none', label: 'Flat', preview: 'shadow-none' },
  { value: 'subtle', label: 'Subtle', preview: 'shadow-sm' },
  { value: 'medium', label: 'Medium', preview: 'shadow-md' },
  { value: 'elevated', label: 'Elevated', preview: 'shadow-xl' },
]

function switchLocale(code: string) {
  appStore.setLocale(code)
}

function switchTheme(name: ThemeName) {
  setTheme(name)
}

function switchIconProvider(p: IconProvider) {
  appStore.setIconProvider(p)
}

function switchValidationAdapter(a: ValidationAdapterName) {
  appStore.setValidationAdapter(a)
}
</script>

<template>
  <div class="animate-fade-in mx-auto max-w-3xl px-4 py-10">
    <h1 class="mb-2 text-3xl font-bold">{{ t('settings_title') }}</h1>
    <p class="text-surface-500 dark:text-surface-400 mb-10">Customize your experience</p>

    <div class="space-y-8">
      <!-- Appearance -->
      <section
        class="card border-surface-200 dark:border-surface-700/50 dark:bg-surface-800/80 rounded-2xl border bg-white p-7"
      >
        <h2 class="mb-2 text-lg font-bold">{{ t('settings_appearance') }}</h2>
        <p class="text-surface-500 dark:text-surface-400 mb-6 text-sm">
          Toggle between light and dark mode
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
              <span class="text-surface-500 text-xs">{{
                isDark ? 'Dark mode active' : 'Light mode active'
              }}</span>
            </div>
          </div>
          <button
            :class="[
              'relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200',
              isDark ? 'bg-primary-500' : 'bg-surface-300',
            ]"
            role="switch"
            :aria-checked="isDark"
            @click="toggleDark()"
          >
            <span
              :class="[
                'inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200',
                isDark ? 'translate-x-6' : 'translate-x-1',
              ]"
            />
          </button>
        </div>
      </section>

      <!-- Shapes -->
      <section
        class="card border-surface-200 dark:border-surface-700/50 dark:bg-surface-800/80 rounded-2xl border bg-white p-7"
      >
        <h2 class="mb-2 text-lg font-bold">Shapes</h2>
        <p class="text-surface-500 dark:text-surface-400 mb-6 text-sm">
          Customize border radius, borders, and shadows
        </p>

        <!-- Border Radius -->
        <div class="mb-6">
          <h3 class="text-surface-700 dark:text-surface-300 mb-3 text-sm font-semibold">
            Border Radius
          </h3>
          <div class="grid grid-cols-5 gap-3">
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
              {{ opt.label }}
            </button>
          </div>
        </div>

        <!-- Borders -->
        <div class="mb-6">
          <h3 class="text-surface-700 dark:text-surface-300 mb-3 text-sm font-semibold">Borders</h3>
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
              {{ opt.label }}
            </button>
          </div>
        </div>

        <!-- Shadows -->
        <div>
          <h3 class="text-surface-700 dark:text-surface-300 mb-3 text-sm font-semibold">Shadows</h3>
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
              {{ opt.label }}
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
          Select your preferred language
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
            {{ loc.label }}
          </button>
        </div>
      </section>

      <!-- UI Provider -->
      <section
        class="card border-surface-200 dark:border-surface-700/50 dark:bg-surface-800/80 rounded-2xl border bg-white p-7"
      >
        <h2 class="mb-2 text-lg font-bold">{{ t('settings_ui_provider') }}</h2>
        <p class="text-surface-500 dark:text-surface-400 mb-5 text-sm">
          Switch the underlying component library
        </p>
        <div class="grid grid-cols-2 gap-3">
          <button
            v-for="p in providers"
            :key="p.value"
            :class="[
              'flex items-center gap-3 rounded-xl px-4 py-3.5 text-sm font-medium transition-all duration-200',
              appStore.uiProvider === p.value
                ? 'ring-primary-500 dark:ring-offset-surface-800 bg-primary-50 dark:bg-primary-900/20 text-primary-600 shadow-md ring-2 ring-offset-2'
                : 'border-surface-200 dark:border-surface-700/50 hover:border-primary-300 dark:hover:border-primary-700/50 hover:bg-surface-50 dark:hover:bg-surface-800/80 border',
            ]"
            @click="appStore.setUiProvider(p.value)"
          >
            <span :class="[resolveIcon(p.iconName), 'h-4 w-4']" />
            {{ p.label }}
          </button>
        </div>
      </section>

      <!-- Theme -->
      <section
        class="card border-surface-200 dark:border-surface-700/50 dark:bg-surface-800/80 rounded-2xl border bg-white p-7"
      >
        <h2 class="mb-2 text-lg font-bold">Theme</h2>
        <p class="text-surface-500 dark:text-surface-400 mb-5 text-sm">
          Switch the visual theme of the application
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
        <h2 class="mb-2 text-lg font-bold">Icon Provider</h2>
        <p class="text-surface-500 dark:text-surface-400 mb-5 text-sm">
          Choose the icon set used throughout the app
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

      <!-- Validation Adapter -->
      <section
        class="card border-surface-200 dark:border-surface-700/50 dark:bg-surface-800/80 rounded-2xl border bg-white p-7"
      >
        <h2 class="mb-2 text-lg font-bold">Validation Library</h2>
        <p class="text-surface-500 dark:text-surface-400 mb-5 text-sm">
          Choose the schema validation library used for forms
        </p>
        <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
          <button
            v-for="va in validationOptions"
            :key="va.value"
            :class="[
              'flex flex-col items-center gap-2 rounded-xl px-4 py-4 text-sm font-medium transition-all duration-200',
              appStore.validationAdapter === va.value
                ? 'ring-primary-500 dark:ring-offset-surface-800 bg-primary-50 dark:bg-primary-900/20 text-primary-600 shadow-md ring-2 ring-offset-2'
                : 'border-surface-200 dark:border-surface-700/50 hover:border-primary-300 dark:hover:border-primary-700/50 hover:bg-surface-50 dark:hover:bg-surface-800/80 border',
            ]"
            @click="switchValidationAdapter(va.value)"
          >
            <span :class="[resolveIcon('shield-check'), 'h-5 w-5']" />
            {{ va.label }}
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
