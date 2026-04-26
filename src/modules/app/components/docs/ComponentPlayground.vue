<script setup lang="ts">
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
      <button
        class="text-surface-500 hover:text-surface-700 dark:text-surface-400 dark:hover:text-surface-200 text-xs transition-colors"
        @click="reset"
      >
        Reset
      </button>
    </div>

    <div
      class="divide-surface-200 dark:divide-surface-700/60 grid divide-y lg:grid-cols-2 lg:divide-x lg:divide-y-0"
    >
      <!-- Preview -->
      <div
        class="dark:bg-surface-900 flex min-h-40 flex-col items-center justify-center bg-white p-6"
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

          <input
            v-else-if="def.type === 'string'"
            v-model="values[def.name]"
            class="border-surface-200 dark:border-surface-700 dark:bg-surface-900 w-full max-w-48 rounded-md border bg-white px-2 py-1 text-xs"
          />

          <input
            v-else-if="def.type === 'number'"
            v-model.number="values[def.name]"
            type="number"
            class="border-surface-200 dark:border-surface-700 dark:bg-surface-900 w-24 rounded-md border bg-white px-2 py-1 text-xs"
          />

          <select
            v-else-if="def.type === 'select'"
            v-model="values[def.name]"
            class="border-surface-200 dark:border-surface-700 dark:bg-surface-900 w-full max-w-48 rounded-md border bg-white px-2 py-1 text-xs"
          >
            <option v-for="opt in def.options" :key="String(opt.value)" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
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
            <input
              v-model="slotValues[slot.name]"
              class="border-surface-200 dark:border-surface-700 dark:bg-surface-900 w-full rounded-md border bg-white px-2 py-1 text-xs"
            />
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
