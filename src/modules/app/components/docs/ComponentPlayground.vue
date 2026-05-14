<script setup lang="ts">
import { UiButton, UiTextField, UiSelect, UiNumberField } from '@/components/ui'

export interface PropDef {
  name: string
  type: 'boolean' | 'string' | 'number' | 'select'
  default?: unknown
  options?: { label: string; value: unknown }[]
}

export interface SlotDef {
  name: string
  default: string
}

const props = defineProps<{
  propDefs: PropDef[]
  slotDefs?: SlotDef[]
}>()

const values = reactive<Record<string, unknown>>({})
const slotValues = reactive<Record<string, string>>({})

for (const def of props.propDefs) {
  values[def.name] =
    def.default ?? (def.type === 'boolean' ? false : def.type === 'number' ? 0 : '')
}
if (props.slotDefs) {
  for (const def of props.slotDefs) {
    slotValues[def.name] = def.default
  }
}

const boundProps = computed(() => {
  const result: Record<string, unknown> = {}
  for (const def of props.propDefs) {
    result[def.name] = values[def.name]
  }
  return result
})

function reset() {
  for (const def of props.propDefs) {
    values[def.name] =
      def.default ?? (def.type === 'boolean' ? false : def.type === 'number' ? 0 : '')
  }
  if (props.slotDefs) {
    for (const def of props.slotDefs) {
      slotValues[def.name] = def.default
    }
  }
}
</script>

<template>
  <div class="border-surface-200 dark:border-surface-700/60 overflow-hidden rounded-xl border">
    <div
      class="border-surface-200 dark:border-surface-700/60 bg-surface-50 dark:bg-surface-800/50 flex items-center justify-between border-b px-4 py-2"
    >
      <span
        class="text-primary-600 dark:text-primary-400 text-xs font-semibold tracking-wider uppercase"
        >Playground</span
      >
      <UiButton variant="ghost" size="sm" @click="reset"> Reset </UiButton>
    </div>

    <div
      class="divide-surface-200 dark:divide-surface-700/60 grid divide-y lg:grid-cols-2 lg:divide-x lg:divide-y-0"
    >
      <!-- Preview -->
      <div
        class="bg-surface-50 dark:bg-surface-900 flex min-h-40 flex-col items-center justify-center p-6"
      >
        <slot :props="boundProps" :slots="slotValues" />
      </div>

      <!-- Controls -->
      <div class="bg-surface-50/50 dark:bg-surface-800/30 max-h-96 space-y-3 overflow-y-auto p-4">
        <div
          v-for="def in propDefs"
          :key="def.name"
          class="flex items-center justify-between gap-3"
        >
          <label class="text-surface-600 dark:text-surface-400 shrink-0 font-mono text-xs">{{
            def.name
          }}</label>

          <UiSwitch v-if="def.type === 'boolean'" v-model="values[def.name] as boolean" size="sm" />

          <UiTextField
            v-else-if="def.type === 'string'"
            v-model="values[def.name]"
            size="sm"
            class="w-full max-w-48"
          />

          <UiNumberField
            v-else-if="def.type === 'number'"
            v-model="values[def.name]"
            size="sm"
            class="w-24"
          />

          <UiSelect
            v-else-if="def.type === 'select'"
            v-model="values[def.name]"
            :options="def.options"
            size="sm"
            class="w-full max-w-48"
          />
        </div>

        <template v-if="slotDefs?.length">
          <div class="border-surface-200 dark:border-surface-700/60 mt-3 border-t pt-3">
            <span
              class="text-surface-400 dark:text-surface-500 text-xs font-semibold tracking-wider uppercase"
              >Slots</span
            >
          </div>
          <div v-for="slot in slotDefs" :key="slot.name" class="space-y-1">
            <label class="text-surface-600 dark:text-surface-400 font-mono text-xs">{{
              slot.name
            }}</label>
            <UiTextField v-model="slotValues[slot.name]" size="sm" class="w-full" />
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
