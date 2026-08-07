<script setup lang="ts">
/**
 * Dashboard breadcrumb.
 *
 * Rendered as a labelled `<nav>` wrapping an ordered list, which is what
 * assistive technology expects of a breadcrumb — the separator is decorative
 * and hidden, so the trail is announced as "Orders, ORD-1042" rather than
 * "Orders slash ORD-1042".
 */
import { useI18n } from 'vue-i18n'

import { useBreadcrumbs } from '@/composables/useBreadcrumbs'
import { resolveIcon } from '@/config/icon-provider'

const { t } = useI18n()
const { items } = useBreadcrumbs()
</script>

<template>
  <nav v-if="items.length > 1" :aria-label="t('a11y_breadcrumb')" class="min-w-0">
    <ol class="text-muted-foreground flex flex-wrap items-center gap-1.5 text-sm">
      <li
        v-for="(item, index) in items"
        :key="`${item.label}-${index}`"
        class="flex items-center gap-1.5"
      >
        <span
          v-if="index > 0"
          :class="[resolveIcon('chevron-right'), 'h-3.5 w-3.5 shrink-0 rtl:rotate-180']"
          aria-hidden="true"
        />
        <RouterLink
          v-if="item.to"
          :to="item.to"
          class="hover:text-foreground truncate transition-colors"
        >
          {{ item.label }}
        </RouterLink>
        <!-- The current page is not a link, and says so. -->
        <span v-else class="text-foreground truncate font-medium" aria-current="page">
          {{ item.label }}
        </span>
      </li>
    </ol>
  </nav>
</template>
