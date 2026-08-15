<script setup lang="ts">
import { UiPanel } from '@/components/ui'
import { useFormatters } from '@/composables/useFormatters'
import { resolveIcon } from '~/config/icon-provider'
import type { IconName } from '~/types'

import { useDashboardI18n } from '../composables/useDashboardI18n'
import type { SystemHealth } from '../types/dashboard'

const props = defineProps<{
  data: SystemHealth | undefined
  loading: boolean
  error: boolean
  updating?: boolean
}>()

const emit = defineEmits<{ retry: [] }>()

const { dt } = useDashboardI18n()
const { number, percent } = useFormatters()

const services = computed(() => props.data?.services ?? [])
const isEmpty = computed(() => services.value.length === 0)

/**
 * Status carries an ICON and TEXT as well as a colour.
 *
 * A row of coloured dots is unreadable in greyscale and to a colour-blind
 * reader — and "is the system up?" is exactly the question you cannot afford
 * to answer ambiguously.
 */
const STATUS: Record<SystemHealth['services'][number]['status'], { icon: IconName; tone: string }> =
  {
    operational: { icon: 'check-circle', tone: 'text-success-700 dark:text-success-300' },
    degraded: { icon: 'danger-triangle', tone: 'text-warning-700 dark:text-warning-300' },
    outage: { icon: 'close-circle', tone: 'text-destructive' },
  }

function healthStatus(status: SystemHealth['services'][number]['status']): string {
  if (status === 'degraded') return dt('dash_health_status_degraded')
  if (status === 'outage') return dt('dash_health_status_outage')
  return dt('dash_health_status_operational')
}

/** The worst status wins — one outage means the system is not "operational". */
const overall = computed(() => {
  if (services.value.some((service) => service.status === 'outage')) return 'outage'
  if (services.value.some((service) => service.status === 'degraded')) return 'degraded'
  return 'operational'
})
</script>

<template>
  <UiPanel
    :title="dt('dash_health_title')"
    :loading="loading"
    :error="error"
    :updating="updating"
    :empty="isEmpty"
    content-class="min-h-56"
    @retry="emit('retry')"
  >
    <template #actions>
      <span v-if="!loading && !error && !isEmpty" class="flex items-center gap-1.5 text-sm">
        <span
          :class="[resolveIcon(STATUS[overall].icon), STATUS[overall].tone, 'h-4 w-4']"
          aria-hidden="true"
        />
        <span :class="[STATUS[overall].tone, 'font-medium']">
          {{ healthStatus(overall) }}
        </span>
      </span>
    </template>

    <ul class="space-y-3">
      <li v-for="service in services" :key="service.key" class="flex items-center gap-3">
        <span
          :class="[
            resolveIcon(STATUS[service.status].icon),
            STATUS[service.status].tone,
            'h-4 w-4 shrink-0',
          ]"
          aria-hidden="true"
        />
        <span class="min-w-0 flex-1">
          <span class="text-foreground block text-sm leading-snug font-medium">{{
            service.name
          }}</span>
          <span class="text-muted-foreground block text-xs">
            {{ healthStatus(service.status) }} ·
            {{ dt('dash_health_uptime', { value: percent(service.uptimePercent, 2) }) }}
          </span>
        </span>
        <span class="text-muted-foreground shrink-0 text-xs tabular-nums">
          {{ dt('dash_health_latency', { ms: number(service.latencyMs) }) }}
        </span>
      </li>
    </ul>
  </UiPanel>
</template>
