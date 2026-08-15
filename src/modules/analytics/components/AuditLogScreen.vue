<script setup lang="ts">
/**
 * Audit log — a timeline of what happened, who did it and when.
 *
 * The whole experience, independent of the URL that leads here: filters, the
 * timeline, and the pager. The rules it draws on (which tone an action gets,
 * what the search box matches) are pure functions in `lib/audit-log`.
 */
import { useI18n } from 'vue-i18n'

import { useFormatters } from '@/composables/useFormatters'
import { resolveIcon } from '@/config/icon-provider'

import { useAuditLog } from '../composables/useAuditLog'
import {
  auditActionIcon,
  auditActionToneClass,
  auditActionTranslationKey,
  humanizeAuditAction,
} from '../lib/audit-log'

// `te` is wrapped rather than destructured: vue-i18n declares it as a method,
// so pulling it off the composer trips `unbound-method`, and it reads `this`.
const i18n = useI18n()
const { t } = i18n
const te = (key: string) => i18n.te(key)

const { dateTime, relativeTime } = useFormatters()

const {
  page,
  action,
  search,
  visibleEntries,
  actions,
  stats,
  totalPages,
  isLoading,
  goToPage,
  filterByAction,
} = useAuditLog()

/**
 * Prefer the translated label, fall back to a humanized key.
 *
 * A new server-side action must not blank its own filter chip while three
 * locale files catch up.
 */
function actionLabel(value: string): string {
  const key = auditActionTranslationKey(value)
  return te(key) ? t(key) : humanizeAuditAction(value)
}
</script>

<template>
  <div class="space-y-6">
    <!-- Stats -->
    <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
      <div
        class="dark:bg-surface-800/90 border-surface-200 dark:border-surface-700 rounded-xl border bg-white/90 p-4"
      >
        <p class="text-muted-foreground text-sm">{{ t('audit_total_events') }}</p>
        <p class="text-surface-900 text-2xl font-bold tabular-nums dark:text-white">
          {{ stats.total }}
        </p>
      </div>
      <div
        class="dark:bg-surface-800/90 border-surface-200 dark:border-surface-700 rounded-xl border bg-white/90 p-4"
      >
        <p class="text-muted-foreground text-sm">{{ t('audit_auth_events') }}</p>
        <p class="text-info-700 dark:text-info-300 text-2xl font-bold tabular-nums">
          {{ stats.auth }}
        </p>
      </div>
      <div
        class="dark:bg-surface-800/90 border-surface-200 dark:border-surface-700 rounded-xl border bg-white/90 p-4"
      >
        <p class="text-muted-foreground text-sm">{{ t('audit_billing_events') }}</p>
        <p class="text-primary-600 dark:text-primary-400 text-2xl font-bold tabular-nums">
          {{ stats.billing }}
        </p>
      </div>
      <div
        class="dark:bg-surface-800/90 border-surface-200 dark:border-surface-700 rounded-xl border bg-white/90 p-4"
      >
        <p class="text-muted-foreground text-sm">{{ t('audit_unique_actions') }}</p>
        <p class="text-surface-900 text-2xl font-bold tabular-nums dark:text-white">
          {{ stats.uniqueActions }}
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
            v-model="search"
            type="text"
            :placeholder="t('audit_search')"
            class="border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 focus:ring-primary-500/20 focus:border-primary-500 w-full rounded-xl border py-2 ps-9 pe-3 text-sm outline-none focus:ring-2"
          />
        </div>
        <div class="flex flex-wrap gap-2" role="group" :aria-label="t('audit_filter_group')">
          <button
            type="button"
            :aria-pressed="action === ''"
            :class="[
              action === ''
                ? 'bg-primary-600 text-primary-foreground'
                : 'bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-300',
              'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
            ]"
            @click="filterByAction('')"
          >
            {{ t('common_all') }}
          </button>
          <button
            v-for="value in actions"
            :key="value"
            type="button"
            :aria-pressed="action === value"
            :class="[
              action === value
                ? 'bg-primary-600 text-primary-foreground'
                : 'bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-300',
              'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
            ]"
            @click="filterByAction(value)"
          >
            {{ actionLabel(value) }}
          </button>
        </div>
      </div>

      <!-- Timeline list -->
      <div v-if="isLoading" class="text-muted-foreground p-12 text-center">
        <span :class="[resolveIcon('refresh'), 'mx-auto mb-2 block h-8 w-8 animate-spin']" />
        {{ t('audit_loading') }}
      </div>
      <div v-else-if="visibleEntries.length === 0" class="text-muted-foreground p-12 text-center">
        <span :class="[resolveIcon('document'), 'mx-auto mb-2 block h-8 w-8']" />
        {{ t('audit_empty') }}
      </div>
      <ul v-else class="divide-surface-100 dark:divide-surface-800 divide-y">
        <li
          v-for="entry in visibleEntries"
          :key="entry.id"
          class="hover:bg-surface-50/80 dark:hover:bg-surface-800/50 flex items-start gap-4 p-4 transition-colors"
        >
          <div
            :class="[
              auditActionToneClass(entry.action),
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
            ]"
          >
            <span :class="[resolveIcon(auditActionIcon(entry.action)), 'h-5 w-5']" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span
                :class="[
                  auditActionToneClass(entry.action),
                  'rounded-full px-2 py-0.5 text-xs font-semibold',
                ]"
              >
                {{ actionLabel(entry.action) }}
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
              <!--
                Relative time through `useFormatters`, not a hand-rolled
                `${n}h ago`: the latter is English-only and got the plural
                wrong in every other locale this app ships.
              -->
              <span :title="dateTime(entry.createdAt)">{{ relativeTime(entry.createdAt) }}</span>
            </div>
            <p v-if="entry.details" class="text-muted-foreground mt-1 max-w-xl truncate text-xs">
              {{ JSON.stringify(entry.details) }}
            </p>
          </div>
          <time
            :datetime="entry.createdAt"
            :title="dateTime(entry.createdAt)"
            class="text-muted-foreground hidden shrink-0 text-xs tabular-nums sm:block"
          >
            {{ dateTime(entry.createdAt) }}
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
          @click="goToPage(page - 1)"
        >
          {{ t('common_previous') }}
        </button>
        <span class="text-muted-foreground px-2 text-sm font-medium tabular-nums">
          {{ page }} / {{ totalPages }}
        </span>
        <button
          :disabled="page === totalPages"
          class="border-surface-200 dark:border-surface-700 hover:bg-surface-100 dark:hover:bg-surface-800 rounded-lg border px-3 py-1.5 text-sm transition-colors disabled:opacity-40"
          @click="goToPage(page + 1)"
        >
          {{ t('common_next') }}
        </button>
      </div>
    </div>
  </div>
</template>
