<script setup lang="ts">
/**
 * The primary cell of a list row: a link to the record, with optional
 * secondary context beneath it.
 *
 * A real `<a>` rather than a click handler on the `<tr>`. A row click is
 * invisible to the keyboard, cannot be opened in a new tab, shows no target in
 * the status bar, and is announced as nothing at all — an entire list becomes
 * unusable without a mouse.
 */
defineProps<{
  to: string
  label: string
  /** Secondary line — location, SKU, email. Omitted when there is nothing to add. */
  sublabel?: string
}>()
</script>

<template>
  <span class="block min-w-0">
    <RouterLink :to="to" class="text-link hover:text-link-hover font-medium hover:underline">
      {{ label }}
    </RouterLink>
    <span v-if="sublabel" class="text-muted-foreground block truncate text-xs">
      {{ sublabel }}
    </span>
  </span>
</template>
