<script setup lang="ts">
/**
 * Reports — the permission-restricted page pattern.
 *
 * The route itself requires `reports:read`, so a user without it never reaches
 * this component; the guard is the gate, not this template. What happens *here*
 * is the second half of the pattern: `reports:export` is a separate, higher
 * permission, so the page renders in full for a viewer while the export control
 * is absent.
 *
 * Both layers are UI affordances. The server is the authority — a missing
 * button stops nobody who can type a URL, and the export endpoint must check
 * the permission again.
 */
import { useI18n } from 'vue-i18n'

import {
  UiBadge,
  UiButton,
  UiCard,
  UiEmptyState,
  UiPageHeader,
  UiSelect,
  UiSkeleton,
} from '@/components/ui'
import { useFormatters } from '@/composables/useFormatters'
import { useRbac } from '@/composables/useRbac'
import { resolveIcon } from '@/config/icon-provider'
import { useNotificationStore } from '@/stores/notification'

import { useReportsQuery } from '../composables/useReports'
import {
  REPORT_KINDS,
  REPORT_PERIODS,
  type ReportKind,
  type ReportPeriod,
  type ReportFilters,
} from '../types'

const { t } = useI18n()
const { can } = useRbac()
const { currency, number, signedPercent, dateTime } = useFormatters()
const notifications = useNotificationStore()

const kind = ref<ReportKind | 'all'>('all')
const period = ref<ReportPeriod | 'all'>('all')

const filters = computed<ReportFilters>(() => ({
  kind: kind.value,
  period: period.value,
  pageSize: 50,
  sortBy: 'name',
  sortOrder: 'asc',
}))

const { items, isPending, isError, refetch } = useReportsQuery(filters)

const kindOptions = computed(() => [
  { label: t('common_all'), value: 'all' },
  ...REPORT_KINDS.map((value) => ({ label: t(`reports_kind_${value}`), value })),
])
const periodOptions = computed(() => [
  { label: t('common_all'), value: 'all' },
  ...REPORT_PERIODS.map((value) => ({ label: t(`reports_period_${value}`), value })),
])

/**
 * Export is a stub with an honest message rather than a silent no-op.
 *
 * A real export needs a backend job — the payload is larger than a browser
 * should assemble, and the file has to outlive the tab. Wiring a fake download
 * would teach the reader that this template ships a working export.
 */
function requestExport(name: string) {
  notifications.add({ type: 'info', message: t('reports_export_queued', { name }) })
}
</script>

<template>
  <div class="space-y-6">
    <UiPageHeader :title="t('reports_title')" :description="t('reports_subtitle')">
      <template #actions>
        <UiSelect
          v-model="kind"
          class="min-w-40"
          :options="kindOptions"
          :aria-label="t('reports_filter_kind')"
        />
        <UiSelect
          v-model="period"
          class="min-w-36"
          :options="periodOptions"
          :aria-label="t('reports_filter_period')"
        />
      </template>
    </UiPageHeader>

    <!--
      Stated, not implied. A viewer who cannot find the export button should be
      told why rather than concluding the feature is broken.
    -->
    <p v-if="!can('reports:export')" class="text-muted-foreground text-sm">
      {{ t('reports_export_restricted') }}
    </p>

    <UiEmptyState
      v-if="isError"
      variant="error"
      :title="t('common_error_title')"
      :description="t('common_error_body')"
    >
      <UiButton variant="ghost" @click="refetch">{{ t('common_retry') }}</UiButton>
    </UiEmptyState>

    <div v-else-if="isPending" class="space-y-4" aria-busy="true" :aria-label="t('common_loading')">
      <UiSkeleton v-for="index in 3" :key="index" class="h-64" />
    </div>

    <UiEmptyState
      v-else-if="items.length === 0"
      icon="document"
      :title="t('reports_empty_title')"
      :description="t('reports_empty_body')"
    />

    <UiCard v-for="report in items" v-else :key="report.id" class="overflow-hidden">
      <div class="border-border flex flex-wrap items-start justify-between gap-3 border-b p-5">
        <div class="min-w-0">
          <h2 class="text-foreground font-semibold">{{ report.name }}</h2>
          <p class="text-muted-foreground mt-1 text-sm">{{ report.description }}</p>
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <UiBadge variant="secondary" size="sm">{{ t(`reports_kind_${report.kind}`) }}</UiBadge>
            <UiBadge variant="default" size="sm">{{
              t(`reports_period_${report.period}`)
            }}</UiBadge>
            <span class="text-muted-foreground text-xs">
              {{ t('reports_generated') }}
              <time :datetime="report.generatedAt">{{ dateTime(report.generatedAt) }}</time>
            </span>
          </div>
        </div>

        <UiButton
          v-if="can('reports:export')"
          variant="secondary"
          size="sm"
          :aria-label="t('reports_export_of', { name: report.name })"
          @click="requestExport(report.name)"
        >
          <span :class="[resolveIcon('download'), 'h-4 w-4']" aria-hidden="true" />
          {{ t('common_export') }}
        </UiButton>
      </div>

      <!--
        A table, not a chart. These are exact figures a reader will compare and
        copy, and a canvas gives them neither. The proportional bar is a visual
        aid layered on top of the number, hidden from assistive technology
        because the number is already there.
      -->
      <div class="overflow-x-auto" tabindex="0" role="region" :aria-label="report.name">
        <table class="w-full text-sm">
          <caption class="sr-only">
            {{
              report.name
            }}
            —
            {{
              report.description
            }}
          </caption>
          <thead>
            <tr class="border-border border-b">
              <th scope="col" class="text-muted-foreground px-5 py-2 text-start font-medium">
                {{ t('reports_col_dimension') }}
              </th>
              <th scope="col" class="text-muted-foreground px-5 py-2 text-end font-medium">
                {{ report.unit }}
              </th>
              <th
                v-if="report.rows[0]?.amount"
                scope="col"
                class="text-muted-foreground px-5 py-2 text-end font-medium"
              >
                {{ t('common_total') }}
              </th>
              <th scope="col" class="text-muted-foreground px-5 py-2 text-end font-medium">
                {{ t('reports_col_change') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in report.rows"
              :key="row.label"
              class="border-border border-b last:border-b-0"
            >
              <th scope="row" class="px-5 py-3 text-start font-normal">
                <span class="text-foreground block font-medium">{{ row.label }}</span>
                <span
                  class="bg-muted mt-1.5 block h-1.5 w-full max-w-48 overflow-hidden rounded-full"
                  aria-hidden="true"
                >
                  <span
                    class="bg-primary-solid block h-full rounded-full"
                    :style="{
                      width: `${Math.round((row.value / Math.max(...report.rows.map((entry) => entry.value))) * 100)}%`,
                    }"
                  />
                </span>
              </th>
              <td class="text-foreground px-5 py-3 text-end tabular-nums">
                {{ number(row.value) }}
              </td>
              <td v-if="row.amount" class="text-foreground px-5 py-3 text-end tabular-nums">
                {{ currency(row.amount.amount, row.amount.currency, true) }}
              </td>
              <!--
                The sign is in the text, so the direction survives without
                colour. `signedPercent` always renders "+" or "−" (WCAG 1.4.1).
              -->
              <td
                :class="[
                  'px-5 py-3 text-end tabular-nums',
                  row.changePercent >= 0
                    ? 'text-success-700 dark:text-success-400'
                    : 'text-destructive',
                ]"
              >
                {{ signedPercent(row.changePercent) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UiCard>
  </div>
</template>
