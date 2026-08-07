<script setup lang="ts">
const open = ref(false)
const query = ref('Ada Lovelace')
</script>

<template>
  <UiCard class="border-0 bg-transparent shadow-none">
    <template #header>
      <div class="flex items-center justify-between gap-3">
        <div>
          <p
            class="text-primary-600 dark:text-primary-300 text-xs font-semibold tracking-[0.22em] uppercase"
          >
            Adapter UI
          </p>
          <h3 class="text-surface-900 mt-1 text-xl font-bold dark:text-white">
            Unified component API
          </h3>
        </div>
        <UiBadge variant="success">Live Preview</UiBadge>
      </div>
    </template>

    <div class="grid gap-4 md:grid-cols-[1.3fr_0.9fr]">
      <div class="space-y-4">
        <UiTextField
          v-model="query"
          label="Customer Name"
          placeholder="Search customer"
          hint="Same API across providers"
        />
        <div class="grid gap-3 sm:grid-cols-2">
          <UiButton variant="primary" @click="open = true"> Open confirmation </UiButton>
          <UiButton variant="ghost"> Secondary action </UiButton>
        </div>
      </div>

      <div
        class="border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800/70 rounded-2xl border p-4"
      >
        <p class="text-muted-foreground text-sm font-medium">Current input</p>
        <p class="text-surface-900 mt-2 text-lg font-semibold dark:text-white">{{ query }}</p>
        <div class="mt-4">
          <UiProgress :model-value="72" />
        </div>
      </div>
    </div>
  </UiCard>

  <UiDialog v-model:open="open">
    <template #title>Preview dialog</template>
    <p class="text-muted-foreground text-sm">
      This example uses the same `Ui*` components shown in the docs code pane.
    </p>
  </UiDialog>
</template>
