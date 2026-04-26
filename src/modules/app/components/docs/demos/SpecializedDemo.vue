<script setup lang="ts">
const volume = ref(65)
const accentColor = ref('#6366f1')
const pageTitle = ref('Click to edit this title')
const rating = ref(3)
</script>

<template>
  <div class="grid gap-5 lg:grid-cols-2">
    <UiCard>
      <template #header>
        <div>
          <h3 class="text-surface-900 text-lg font-bold dark:text-white">Specialized inputs</h3>
          <p class="text-surface-500 dark:text-surface-400 mt-1 text-sm">
            Slider, ColorPicker, Editable, and RatingField.
          </p>
        </div>
      </template>

      <div class="space-y-5">
        <UiSlider
          v-model="volume"
          name="volume"
          label="Volume"
          :min="0"
          :max="100"
          :step="5"
          hint="Drag the thumb or use arrow keys"
        />

        <UiColorPicker
          v-model="accentColor"
          name="accentColor"
          label="Accent color"
          :swatches="['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e']"
          hint="Choose from presets or pick a custom color"
        />

        <UiEditable
          v-model="pageTitle"
          name="pageTitle"
          label="Page title"
          placeholder="Click to edit…"
          hint="Click the text to start editing"
        />

        <UiRatingField
          v-model="rating"
          name="satisfaction"
          label="How satisfied are you?"
          :max="5"
          hint="Click a star to rate"
        />
      </div>
    </UiCard>

    <UiCard>
      <template #header>
        <h3 class="text-surface-900 text-lg font-bold dark:text-white">Live values</h3>
      </template>
      <dl class="space-y-3 text-sm">
        <div class="flex items-center justify-between">
          <dt class="text-surface-500 dark:text-surface-400">Volume</dt>
          <dd class="text-surface-900 font-mono dark:text-white">{{ volume }}%</dd>
        </div>
        <div class="flex items-center justify-between">
          <dt class="text-surface-500 dark:text-surface-400">Accent color</dt>
          <dd class="flex items-center gap-2">
            <span
              class="border-surface-200 dark:border-surface-600 inline-block h-4 w-4 rounded-full border"
              :style="{ backgroundColor: accentColor }"
            />
            <span class="text-surface-900 font-mono dark:text-white">{{ accentColor }}</span>
          </dd>
        </div>
        <div class="flex items-center justify-between">
          <dt class="text-surface-500 dark:text-surface-400">Page title</dt>
          <dd class="text-surface-900 max-w-48 truncate font-mono dark:text-white">
            {{ pageTitle }}
          </dd>
        </div>
        <div class="flex items-center justify-between">
          <dt class="text-surface-500 dark:text-surface-400">Rating</dt>
          <dd class="text-surface-900 font-mono dark:text-white">{{ rating }} / 5</dd>
        </div>
      </dl>
    </UiCard>
  </div>
</template>
