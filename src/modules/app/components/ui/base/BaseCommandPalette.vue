<script setup lang="ts">
import { resolveIcon } from '~/config/icon-provider'
import type { CommandItem } from '~/types'

export interface BaseCommandPaletteProps {
  provider: 'reka'
  items: CommandItem[]
  modelValue?: string
  placeholder?: string
  emptyText?: string
}

const props = withDefaults(defineProps<BaseCommandPaletteProps>(), {
  modelValue: '',
  placeholder: 'Search commands...',
  emptyText: 'No results found.',
})

const emit = defineEmits<{ 'update:modelValue': [value: string]; select: [id: string] }>()
const query = ref(props.modelValue)

watch(
  () => props.modelValue,
  (value) => {
    query.value = value
  },
)

const filtered = computed(() => {
  const term = query.value.trim().toLowerCase()
  if (!term) return props.items
  return props.items.filter(
    (item) => item.label.toLowerCase().includes(term) || item.hint?.toLowerCase().includes(term),
  )
})

function selectItem(id: string) {
  emit('select', id)
}
</script>

<template>
  <div
    class="shaped-border shaped-radius shaped-shadow border-surface-200 dark:border-surface-700 dark:bg-surface-900 border bg-white p-3"
    data-ui="command-palette"
    :data-provider="provider"
  >
    <div
      class="shaped-border shaped-radius-sm border-surface-200 bg-surface-50 text-surface-700 focus-within:border-primary-400 focus-within:ring-primary-300/30 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-200 dark:focus-within:border-primary-500 dark:focus-within:ring-primary-500/20 mb-3 flex items-center gap-2 border px-2.5 py-2 transition-colors focus-within:ring-2"
    >
      <span :class="[resolveIcon('search'), 'text-surface-500 h-4 w-4']" />
      <input
        v-model="query"
        :placeholder="placeholder"
        class="placeholder:text-surface-400 dark:placeholder:text-surface-500 w-full appearance-none border-0 bg-transparent text-sm text-inherit shadow-none ring-0 outline-none"
        @input="emit('update:modelValue', query)"
      />
    </div>

    <ul v-if="filtered.length" class="space-y-1">
      <li v-for="item in filtered" :key="item.id">
        <button
          class="shaped-radius-sm text-surface-700 hover:bg-surface-100 dark:text-surface-200 dark:hover:bg-surface-800/80 flex w-full items-start justify-between px-2.5 py-2 text-left transition-colors"
          @click="selectItem(item.id)"
        >
          <span class="text-sm">{{ item.label }}</span>
          <span v-if="item.hint" class="text-surface-500 dark:text-surface-400 ml-3 text-xs">
            {{ item.hint }}
          </span>
        </button>
      </li>
    </ul>
    <p v-else class="text-surface-500 dark:text-surface-400 px-2 py-1 text-sm">{{ emptyText }}</p>
  </div>
</template>
