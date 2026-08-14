<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { UiPageHeader } from '@/components/ui'
import { resolveIcon } from '@/config/icon-provider'
import type { IconName } from '@/types'

import { useAuditLogsQuery } from '../composables/useAuditLogsQuery'
import type { AuditLogFilters } from '../composables/useAuditLogsQuery'

const { t } = useI18n()

const page = ref(1)
const actionFilter = ref('')
const searchQuery = ref('')

const filters = computed<AuditLogFilters>(() => ({
  page: page.value,
  limit: 10,
  action: actionFilter.value || undefined,
}))

const { entries, totalPages, total, isLoading: loading, refetch } = useAuditLogsQuery(filters)

// Re-fetch is automatic via reactive query key; no manual fetchLogs needed

function changePage(p: number) {
  page.value = p
}

function filterByAction(action: string) {
  actionFilter.value = action
  page.value = 1
}

const filteredEntries = computed(() => {
  if (!searchQuery.value) return entries.value
  const q = searchQuery.value.toLowerCase()
  return entries.value.filter(
    (e) =>
      e.action.toLowerCase().includes(q) ||
      e.userId.toLowerCase().includes(q) ||
      e.resource.toLowerCase().includes(q) ||
      (e.details && JSON.stringify(e.details).toLowerCase().includes(q)),
  )
})

/**
 * Tone applied to an action badge.
 *
 * Actions are grouped into a handful of tones rather than each picking its own
 * colour. The previous map mixed raw palette families (blue, cyan, yellow, red)
 * with theme families (primary, secondary) in the same object, so half the
 * badges followed the active theme and half did not.
 */
const ACTION_TONES = {
  neutral: 'bg-muted text-muted-foreground',
  info: 'bg-info-100 text-info-800 dark:bg-info-900/30 dark:text-info-200',
  success: 'bg-success-100 text-success-800 dark:bg-success-900/30 dark:text-success-200',
  warning: 'bg-warning-100 text-warning-800 dark:bg-warning-900/30 dark:text-warning-200',
  danger: 'bg-danger-100 text-danger-800 dark:bg-danger-900/30 dark:text-danger-200',
  primary: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300',
  secondary: 'bg-secondary-100 text-secondary-700 dark:bg-secondary-900/30 dark:text-secondary-300',
} as const

type ActionTone = keyof typeof ACTION_TONES

const actionTones: Record<string, ActionTone> = {
  'user.login': 'info',
  'user.logout': 'neutral',
  'user.register': 'success',
  'user.invite': 'success',
  'user.update_role': 'info',
  'role.update': 'info',
  'report.create': 'secondary',
  'report.export': 'secondary',
  'billing.subscribe': 'primary',
  'billing.update_plan': 'primary',
  'billing.cancel': 'danger',
  'settings.update': 'warning',
}

function toneClassFor(action: string): string {
  return ACTION_TONES[actionTones[action] ?? 'neutral']
}

const actionIconNames: Record<string, IconName> = {
  'user.login': 'login',
  'user.logout': 'logout',
  'user.register': 'user-plus',
  'user.invite': 'user-plus',
  'user.update_role': 'shield-user',
  'role.update': 'shield-user',
  'report.create': 'document',
  'billing.subscribe': 'card',
  'billing.cancel': 'close-circle',
  'billing.update_plan': 'card',
  'settings.update': 'settings',
  'report.export': 'download',
}

function humanizeAuditAction(action: string) {
  return action.replace(/[._]+/g, ' ').replace(/\b\w/g, (segment) => segment.toUpperCase())
}

function formatAuditAction(action: string) {
  const translationKey = `audit_action_${action.replace(/[.]/g, '_')}`
  const translated = t(translationKey)
  return translated === translationKey ? humanizeAuditAction(action) : translated
}

const { locale } = useI18n()
function formatTime(iso: string) {
  const d = new Date(iso)
  return (
    d.toLocaleDateString(locale.value, { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString(locale.value, { hour: '2-digit', minute: '2-digit' })
  )
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const uniqueActions = computed(() => [...new Set(entries.value.map((e) => e.action))])
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-6">
    <UiPageHeader :title="t('audit_title')" :description="t('audit_subtitle')" />

    <!-- Stats -->
    <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
      <div
        class="dark:bg-surface-800/90 border-surface-200 dark:border-surface-700 rounded-xl border bg-white/90 p-4"
      >
        <p class="text-muted-foreground text-sm">{{ t('audit_total_events') }}</p>
        <p class="text-surface-900 text-2xl font-bold tabular-nums dark:text-white">{{ total }}</p>
      </div>
      <div
        class="dark:bg-surface-800/90 border-surface-200 dark:border-surface-700 rounded-xl border bg-white/90 p-4"
      >
        <p class="text-muted-foreground text-sm">{{ t('audit_auth_events') }}</p>
        <p class="text-info-700 dark:text-info-300 text-2xl font-bold tabular-nums">
          {{ entries.filter((e) => e.action.startsWith('user.')).length }}
        </p>
      </div>
      <div
        class="dark:bg-surface-800/90 border-surface-200 dark:border-surface-700 rounded-xl border bg-white/90 p-4"
      >
        <p class="text-muted-foreground text-sm">
          {{ t('audit_billing_events') }}
        </p>
        <p class="text-primary-600 dark:text-primary-400 text-2xl font-bold tabular-nums">
          {{ entries.filter((e) => e.action.startsWith('billing.')).length }}
        </p>
      </div>
      <div
        class="dark:bg-surface-800/90 border-surface-200 dark:border-surface-700 rounded-xl border bg-white/90 p-4"
      >
        <p class="text-muted-foreground text-sm">
          {{ t('audit_unique_actions') }}
        </p>
        <p class="text-surface-900 text-2xl font-bold tabular-nums dark:text-white">
          {{ uniqueActions.length }}
        </p>
      </div>
    </div>

    <!-- Filters -->
    <div
      class="dark:bg-surface-800/90 border-surface-200 dark:border-surface-700 overflow-hidden rounded-2xl border bg-white/90 shadow-sm"
    >
      <div
        class="border-surface-200 dark:border-surface-700 flex flex-col items-start gap-3 border-b p-4 sm:flex-row sm:items-center"
      >
        <div class="relative flex-1">
          <span
            :class="[
              resolveIcon('search'),
              'text-muted-foreground absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2',
            ]"
          />
          <input
            v-model="searchQuery"
            type="text"
            :placeholder="t('audit_search')"
            class="border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 focus:ring-primary-500/20 focus:border-primary-500 w-full rounded-xl border py-2 ps-9 pe-3 text-sm outline-none focus:ring-2"
          />
        </div>
        <div class="flex flex-wrap gap-2" role="group" :aria-label="t('audit_filter_group')">
          <button
            type="button"
            :aria-pressed="actionFilter === ''"
            :class="[
              actionFilter === ''
                ? 'bg-primary-600 text-primary-foreground'
                : 'bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-300',
              'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
            ]"
            @click="filterByAction('')"
          >
            {{ t('common_all') }}
          </button>
          <button
            v-for="action in uniqueActions"
            :key="action"
            type="button"
            :aria-pressed="actionFilter === action"
            :class="[
              actionFilter === action
                ? 'bg-primary-600 text-primary-foreground'
                : 'bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-300',
              'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
            ]"
            @click="filterByAction(action)"
          >
            {{ formatAuditAction(action) }}
          </button>
        </div>
      </div>

      <!-- Timeline list -->
      <div v-if="loading" class="text-muted-foreground p-12 text-center">
        <span :class="[resolveIcon('refresh'), 'mx-auto mb-2 block h-8 w-8 animate-spin']" />
        {{ t('audit_loading') }}
      </div>
      <div v-else-if="filteredEntries.length === 0" class="text-muted-foreground p-12 text-center">
        <span :class="[resolveIcon('document'), 'mx-auto mb-2 block h-8 w-8']" />
        {{ t('audit_empty') }}
      </div>
      <ul v-else class="divide-surface-100 dark:divide-surface-800 divide-y">
        <li
          v-for="entry in filteredEntries"
          :key="entry.id"
          class="hover:bg-surface-50/80 dark:hover:bg-surface-800/50 flex items-start gap-4 p-4 transition-colors"
        >
          <div
            :class="[
              toneClassFor(entry.action),
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
            ]"
          >
            <span :class="[resolveIcon(actionIconNames[entry.action] || 'document'), 'h-5 w-5']" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span
                :class="[
                  toneClassFor(entry.action),
                  'rounded-full px-2 py-0.5 text-xs font-semibold',
                ]"
              >
                {{ formatAuditAction(entry.action) }}
              </span>
              <span class="text-muted-foreground text-sm"
                >{{ t('common_on') }} <span class="font-medium">{{ entry.resource }}</span></span
              >
            </div>
            <div class="text-muted-foreground mt-1 flex items-center gap-3 text-xs">
              <span
                >{{ t('common_user') }}:
                <span class="text-muted-foreground font-medium">{{ entry.userId }}</span></span
              >
              <span v-if="entry.ip">{{ t('common_ip') }}: {{ entry.ip }}</span>
              <span :title="formatTime(entry.createdAt)">{{ relativeTime(entry.createdAt) }}</span>
            </div>
            <p v-if="entry.details" class="text-muted-foreground mt-1 max-w-xl truncate text-xs">
              {{ JSON.stringify(entry.details) }}
            </p>
          </div>
          <time
            :title="formatTime(entry.createdAt)"
            class="text-muted-foreground hidden shrink-0 text-xs tabular-nums sm:block"
          >
            {{ formatTime(entry.createdAt) }}
          </time>
        </li>
      </ul>

      <!-- Pagination -->
      <div
        v-if="totalPages > 1"
        class="border-surface-200 dark:border-surface-700 flex items-center justify-center gap-2 border-t p-4"
      >
        <button
          :disabled="page === 1"
          class="border-surface-200 dark:border-surface-700 hover:bg-surface-100 dark:hover:bg-surface-800 rounded-lg border px-3 py-1.5 text-sm transition-colors disabled:opacity-40"
          @click="changePage(page - 1)"
        >
          {{ t('common_previous') }}
        </button>
        <span class="text-muted-foreground px-2 text-sm font-medium tabular-nums">
          {{ page }} / {{ totalPages }}
        </span>
        <button
          :disabled="page === totalPages"
          class="border-surface-200 dark:border-surface-700 hover:bg-surface-100 dark:hover:bg-surface-800 rounded-lg border px-3 py-1.5 text-sm transition-colors disabled:opacity-40"
          @click="changePage(page + 1)"
        >
          {{ t('common_next') }}
        </button>
      </div>
    </div>
  </div>
</template>
