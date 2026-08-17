<script setup lang="ts">
/**
 * Settings — appearance, shape, language, and icon vocabulary.
 *
 * Shares the account page's section chrome (`UiPageHeader` + `UiPanel`,
 * `max-w-5xl`, 3+2 grid) so moving between the two account-group routes does
 * not change the spatial language. Preference copy that the user must read
 * uses `text-foreground`; filler section descriptions are omitted.
 */
import { useI18n } from 'vue-i18n'

import { UiButton, UiPageHeader, UiPanel, UiSwitch } from '@/components/ui'
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

const iconProviderOptions = computed(() =>
  getIconProviders().map((provider) => ({
    value: provider,
    label: provider.charAt(0).toUpperCase() + provider.slice(1),
  })),
)

const localeOptions = computed(() => [
  { value: 'en', label: t('settings_locale_english') },
  { value: 'fr', label: t('settings_locale_french') },
  { value: 'ar', label: t('settings_locale_arabic') },
])

/*
 * Literal pixel radii, NOT `rounded-sm`/`rounded-xl`/etc.
 *
 * The named utilities resolve through `--radius-*`, which is the very scale
 * these swatches exist to preview — so once a preset is applied they all
 * collapse to whatever is currently selected and every option looks identical.
 * A preview of a choice cannot be rendered in the units that choice controls.
 */
const radiusOptions: { value: ShapeRadius; labelKey: string; preview: string }[] = [
  { value: 'none', labelKey: 'settings_radius_sharp', preview: 'rounded-[0px]' },
  { value: 'small', labelKey: 'settings_radius_subtle', preview: 'rounded-[3px]' },
  { value: 'medium', labelKey: 'settings_radius_rounded', preview: 'rounded-[8px]' },
  { value: 'large', labelKey: 'settings_radius_soft', preview: 'rounded-[14px]' },
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

/**
 * Exclusive choice chrome. Selected fill matches `UiToggleGroup` so a picked
 * theme, radius, or locale uses the same solid as a segmented control.
 *
 * Button rounding follows `--radius-md` (the theme), not `--shape-radius`.
 * The shape preset is what these buttons *set*; using it here would make every
 * option look identical the moment one is applied.
 */
function choiceClass(selected: boolean): string[] {
  return [
    'flex min-h-11 w-full cursor-pointer flex-col items-center justify-center gap-2 px-3 py-3 text-sm font-medium',
    'rounded-md border transition-colors duration-150',
    'motion-reduce:transition-none',
    selected
      ? 'border-transparent bg-primary-solid text-primary-foreground'
      : 'border-border bg-card text-foreground hover:bg-muted',
  ]
}

/** Decorative swatch fill. Inverts on the selected solid so the preview stays visible. */
function radiusPreviewClass(selected: boolean, preview: string): string[] {
  return [
    'h-8 w-8 border-2',
    preview,
    selected
      ? 'border-primary-foreground bg-primary-foreground/25'
      : 'border-primary-500 bg-primary-500/20',
  ]
}

function borderPreviewClass(selected: boolean, preview: string): string[] {
  return [
    'h-8 w-8 rounded-md',
    preview,
    selected ? 'border-primary-foreground' : 'border-foreground',
  ]
}

function shadowPreviewClass(selected: boolean, preview: string): string[] {
  return [
    'h-8 w-8 rounded-md border',
    preview,
    selected ? 'border-primary-foreground/40 bg-primary-foreground' : 'border-border bg-card',
  ]
}

function switchLocale(code: string) {
  appStore.setLocale(code)
}

function switchTheme(name: ThemeName) {
  setTheme(name)
}

function switchIconProvider(provider: IconProvider) {
  appStore.setIconProvider(provider)
}
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-8">
    <UiPageHeader :title="t('settings_title')" :description="t('settings_subtitle')">
      <template #actions>
        <UiButton to="/dashboard/account" variant="ghost">
          <span :class="[resolveIcon('shield-user'), 'h-4 w-4']" aria-hidden="true" />
          {{ t('account_nav') }}
        </UiButton>
      </template>
    </UiPageHeader>

    <div class="flex flex-col gap-8 lg:grid lg:grid-cols-5 lg:items-start">
      <div class="flex min-w-0 flex-col gap-8 lg:col-span-3">
        <UiPanel :title="t('settings_appearance')" content-class="min-h-0">
          <div class="flex items-center justify-between gap-4">
            <div class="min-w-0">
              <p class="text-foreground text-sm font-semibold">{{ t('settings_dark_mode') }}</p>
              <p class="text-foreground mt-0.5 text-sm">
                {{ isDark ? t('settings_dark_mode_active') : t('settings_light_mode_active') }}
              </p>
            </div>
            <UiSwitch v-model="darkModeModel" :aria-label="t('settings_dark_mode')" />
          </div>

          <div class="border-border mt-5 border-t pt-5">
            <h3 class="text-foreground text-sm font-semibold">{{ t('settings_theme') }}</h3>
            <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <button
                v-for="th in themes"
                :key="th.name"
                type="button"
                :class="choiceClass(currentThemeName === th.name)"
                :aria-pressed="currentThemeName === th.name"
                @click="switchTheme(th.name)"
              >
                {{ th.label }}
              </button>
            </div>
          </div>
        </UiPanel>

        <UiPanel :title="t('settings_shapes_title')" content-class="min-h-0">
          <div class="divide-border divide-y">
            <div class="py-5 first:pt-0 last:pb-0">
              <h3 class="text-foreground text-sm font-semibold">
                {{ t('settings_border_radius') }}
              </h3>
              <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <button
                  v-for="opt in radiusOptions"
                  :key="opt.value"
                  type="button"
                  :class="choiceClass(shapeRadius === opt.value)"
                  :aria-pressed="shapeRadius === opt.value"
                  @click="setRadius(opt.value)"
                >
                  <div :class="radiusPreviewClass(shapeRadius === opt.value, opt.preview)" />
                  {{ t(opt.labelKey) }}
                </button>
              </div>
            </div>

            <div class="py-5 first:pt-0 last:pb-0">
              <h3 class="text-foreground text-sm font-semibold">{{ t('settings_borders') }}</h3>
              <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <button
                  v-for="opt in borderOptions"
                  :key="opt.value"
                  type="button"
                  :class="choiceClass(shapeBorder === opt.value)"
                  :aria-pressed="shapeBorder === opt.value"
                  @click="setBorder(opt.value)"
                >
                  <div :class="borderPreviewClass(shapeBorder === opt.value, opt.preview)" />
                  {{ t(opt.labelKey) }}
                </button>
              </div>
            </div>

            <div class="py-5 first:pt-0 last:pb-0">
              <h3 class="text-foreground text-sm font-semibold">{{ t('settings_shadows') }}</h3>
              <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <button
                  v-for="opt in shadowOptions"
                  :key="opt.value"
                  type="button"
                  :class="choiceClass(shapeShadow === opt.value)"
                  :aria-pressed="shapeShadow === opt.value"
                  @click="setShadow(opt.value)"
                >
                  <div :class="shadowPreviewClass(shapeShadow === opt.value, opt.preview)" />
                  {{ t(opt.labelKey) }}
                </button>
              </div>
            </div>
          </div>
        </UiPanel>
      </div>

      <div class="flex min-w-0 flex-col gap-8 lg:col-span-2">
        <UiPanel :title="t('settings_language')" content-class="min-h-0">
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1">
            <button
              v-for="opt in localeOptions"
              :key="opt.value"
              type="button"
              :class="choiceClass(locale === opt.value)"
              :aria-pressed="locale === opt.value"
              @click="switchLocale(opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </UiPanel>

        <UiPanel :title="t('settings_icon_provider')" content-class="min-h-0">
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1">
            <button
              v-for="opt in iconProviderOptions"
              :key="opt.value"
              type="button"
              :class="choiceClass(appStore.iconProvider === opt.value)"
              :aria-pressed="appStore.iconProvider === opt.value"
              @click="switchIconProvider(opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </UiPanel>
      </div>
    </div>

    <UiButton variant="destructive" @click="logout">
      <span :class="[resolveIcon('logout'), 'h-4 w-4']" aria-hidden="true" />
      {{ t('auth_logout') }}
    </UiButton>
  </div>
</template>
