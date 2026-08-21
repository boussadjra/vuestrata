<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import Logo from '@/components/Logo.vue'
import { brand, type BrandLink } from '~/config/app.overrides'

const { t } = useI18n()

const year = new Date().getFullYear()

/**
 * Vuestrata's own footer links, used until a project declares its own.
 *
 * Keeping them as a fallback rather than as literals in the template is what
 * lets `app.overrides.ts` replace them without editing this file — which an
 * upgrade replaces wholesale.
 */
const DEFAULT_LINKS: BrandLink[] = [
  { label: 'common_documentation', to: '/docs', icon: 'document' },
  {
    label: 'GitHub',
    href: 'https://github.com/boussadjra/vuestrata',
    iconClass: 'i-solar-github-bold',
  },
]

const name = computed(() => brand.copyright ?? brand.name ?? 'Vuestrata')
const links = computed(() => brand.links ?? DEFAULT_LINKS)

/**
 * Link labels are i18n keys when a key exists and literals otherwise, so a
 * project can write "GitHub" or "Status" without inventing a translation for a
 * proper noun.
 */
function label(link: BrandLink): string {
  return t(link.label) === link.label ? link.label : t(link.label)
}
</script>

<template>
  <footer
    class="border-surface-200/70 bg-surface-50/72 dark:border-surface-800/70 dark:bg-surface-950/70 border-t backdrop-blur-sm"
  >
    <div
      class="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 lg:flex-row lg:items-center lg:justify-between lg:px-6"
    >
      <div class="flex items-center gap-3">
        <span class="me-2 flex h-10 w-10 items-center">
          <Logo variant="icon" className="h-8 w-8" />
        </span>
        <div class="min-w-0">
          <p class="text-muted-foreground text-sm">
            © {{ year }} {{ name }}. {{ t('home_footer') }}
          </p>
        </div>
      </div>

      <!-- Semantic tokens, not `text-surface-600 dark:text-surface-300`. A ramp
           step is only a safe foreground on a ramp that runs where you assume:
           Terminal's `surface-300` is #52525b, so the dark-mode pair rendered
           dark grey on near-black at 2.63:1. `muted-foreground` is re-pointed
           per theme precisely so callers do not have to know that. -->
      <div class="flex flex-wrap items-center gap-2">
        <template v-for="link in links" :key="link.label">
          <RouterLink
            v-if="link.to"
            :to="link.to"
            class="border-border bg-muted text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
          >
            <AppIcon v-if="link.icon" :name="link.icon" size="sm" />
            <span
              v-else-if="link.iconClass"
              :class="link.iconClass"
              class="h-4 w-4"
              aria-hidden="true"
            />
            {{ label(link) }}
          </RouterLink>
          <a
            v-else
            :href="link.href"
            target="_blank"
            rel="noopener noreferrer"
            class="border-border bg-muted text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
          >
            <AppIcon v-if="link.icon" :name="link.icon" size="sm" />
            <span
              v-else-if="link.iconClass"
              :class="link.iconClass"
              class="h-4 w-4"
              aria-hidden="true"
            />
            <span>{{ label(link) }}</span>
          </a>
        </template>
      </div>
    </div>
  </footer>
</template>
