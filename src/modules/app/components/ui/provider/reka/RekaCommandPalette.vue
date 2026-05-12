<script setup lang="ts">
import BaseCommandPalette from '@/components/ui/base/BaseCommandPalette.vue'
import type { CommandItem } from '~/types'

export type { CommandItem }

export interface CommandPaletteProps {
  items: CommandItem[]
  modelValue?: string
  placeholder?: string
  emptyText?: string
}

const props = withDefaults(defineProps<CommandPaletteProps>(), {
  modelValue: '',
  placeholder: 'Search commands...',
  emptyText: 'No results found.',
})

const emit = defineEmits<{ 'update:modelValue': [value: string]; select: [id: string] }>()
</script>

<template>
  <BaseCommandPalette
    v-bind="props"
    provider="reka"
    @update:modelValue="emit('update:modelValue', $event)"
    @select="emit('select', $event)"
  />
</template>
