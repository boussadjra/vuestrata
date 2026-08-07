<script setup lang="ts">
import { useI18n } from 'vue-i18n'

/**
 * "Skip to main content" link.
 *
 * Must be the FIRST focusable element on the page. Without it, a keyboard or
 * screen-reader user has to tab through the entire sidebar and header on every
 * single navigation before reaching the content — which on the dashboard is
 * dozens of stops, repeated on every route change (WCAG 2.4.1 Bypass Blocks).
 *
 * Hidden until focused: `sr-only` keeps it in the accessibility tree and the
 * tab order while taking no visual space, and `focus:not-sr-only` reveals it
 * the moment it receives focus.
 */
withDefaults(defineProps<{ targetId?: string }>(), { targetId: 'main-content' })

const { t } = useI18n()
</script>

<template>
  <a
    :href="`#${targetId}`"
    class="bg-primary-600 text-primary-foreground focus:ring-ring sr-only rounded-lg px-4 py-2 text-sm font-semibold shadow-lg focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:ring-2 focus:ring-offset-2"
  >
    {{ t('a11y_skip_to_content') }}
  </a>
</template>
