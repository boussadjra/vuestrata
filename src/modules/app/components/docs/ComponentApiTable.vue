<script setup lang="ts">
export interface ApiPropRow {
  name: string
  type: string
  default?: string
  description: string
}

export interface ApiEventRow {
  name: string
  payload: string
  description: string
}

export interface ApiSlotRow {
  name: string
  props?: string
  description: string
}

defineProps<{
  props?: ApiPropRow[]
  events?: ApiEventRow[]
  slots?: ApiSlotRow[]
}>()

const hasSlotProps = (rows: ApiSlotRow[]) => rows.some((r) => r.props)
</script>

<template>
  <section class="space-y-4">
    <h2 class="text-xl font-semibold">API Reference</h2>

    <!-- Props -->
    <template v-if="props?.length">
      <h3 class="mt-6 text-base font-medium">Props</h3>
      <div class="border-surface-200 dark:border-surface-700/60 overflow-x-auto rounded-xl border">
        <table class="w-full text-sm">
          <thead class="bg-surface-50 dark:bg-surface-800/50">
            <tr>
              <th class="px-4 py-2 text-start font-medium">Prop</th>
              <th class="px-4 py-2 text-start font-medium">Type</th>
              <th class="px-4 py-2 text-start font-medium">Default</th>
              <th class="px-4 py-2 text-start font-medium">Description</th>
            </tr>
          </thead>
          <tbody class="divide-surface-200 dark:divide-surface-700/60 divide-y">
            <tr v-for="row in props" :key="row.name">
              <td class="px-4 py-2 font-mono text-xs">{{ row.name }}</td>
              <td class="px-4 py-2 font-mono text-xs">{{ row.type }}</td>
              <td class="px-4 py-2 font-mono text-xs">{{ row.default ?? '—' }}</td>
              <td class="px-4 py-2">{{ row.description }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- Events -->
    <template v-if="events?.length">
      <h3 class="mt-6 text-base font-medium">Events</h3>
      <div class="border-surface-200 dark:border-surface-700/60 overflow-x-auto rounded-xl border">
        <table class="w-full text-sm">
          <thead class="bg-surface-50 dark:bg-surface-800/50">
            <tr>
              <th class="px-4 py-2 text-start font-medium">Event</th>
              <th class="px-4 py-2 text-start font-medium">Payload</th>
              <th class="px-4 py-2 text-start font-medium">Description</th>
            </tr>
          </thead>
          <tbody class="divide-surface-200 dark:divide-surface-700/60 divide-y">
            <tr v-for="row in events" :key="row.name">
              <td class="px-4 py-2 font-mono text-xs">{{ row.name }}</td>
              <td class="px-4 py-2 font-mono text-xs">{{ row.payload }}</td>
              <td class="px-4 py-2">{{ row.description }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- Slots -->
    <template v-if="slots?.length">
      <h3 class="mt-6 text-base font-medium">Slots</h3>
      <div class="border-surface-200 dark:border-surface-700/60 overflow-x-auto rounded-xl border">
        <table class="w-full text-sm">
          <thead class="bg-surface-50 dark:bg-surface-800/50">
            <tr>
              <th class="px-4 py-2 text-start font-medium">Slot</th>
              <th v-if="hasSlotProps(slots)" class="px-4 py-2 text-start font-medium">Props</th>
              <th class="px-4 py-2 text-start font-medium">Description</th>
            </tr>
          </thead>
          <tbody class="divide-surface-200 dark:divide-surface-700/60 divide-y">
            <tr v-for="row in slots" :key="row.name">
              <td class="px-4 py-2 font-mono text-xs">{{ row.name }}</td>
              <td v-if="hasSlotProps(slots)" class="px-4 py-2 font-mono text-xs">
                {{ row.props ?? '—' }}
              </td>
              <td class="px-4 py-2">{{ row.description }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>
