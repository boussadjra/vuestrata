<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { UiPanel } from '@/components/ui'
import { useFormatters } from '@/composables/useFormatters'
import { resolveIcon } from '~/config/icon-provider'
import type { IconName } from '~/types'

import type { AttentionItems } from '../types/dashboard'

const props = defineProps<{
  data: AttentionItems | undefined
  loading: boolean
  error: boolean
  updating?: boolean
}>()

const emit = defineEmits<{ retry: [] }>()

const { t } = useI18n()
const { number } = useFormatters()

const items = computed(() => props.data?.items ?? [])
const isEmpty = computed(() => items.value.length === 0)

function attentionTitle(titleKey: string): string {
  if (titleKey === 'dash_attention_failed_payments') return t('dash_attention_failed_payments')
  if (titleKey === 'dash_attention_pending_invites') return t('dash_attention_pending_invites')
  if (titleKey === 'dash_attention_expiring_trials') return t('dash_attention_expiring_trials')
  if (titleKey === 'dash_attention_audit_review') return t('dash_attention_audit_review')
  return titleKey
}

function severityLabel(severity: AttentionItems['items'][number]['severity']): string {
  if (severity === 'critical') return t('dash_severity_critical')
  if (severity === 'warning') return t('dash_severity_warning')
  return t('dash_severity_info')
}

const SEVERITY: Record<
  AttentionItems['items'][number]['severity'],
  { icon: IconName; tone: string; badge: string }
> = {
  critical: {
    icon: 'danger-triangle',
    tone: 'text-destructive',
    badge: 'bg-destructive-subtle text-destructive',
  },
  warning: {
    icon: 'clock',
    tone: 'text-warning-700 dark:text-warning-300',
    badge: 'bg-warning-subtle text-warning-800 dark:text-warning-200',
  },
  info: {
    icon: 'info-circle',
    tone: 'text-info-700 dark:text-info-300',
    badge: 'bg-info-subtle text-info-800 dark:text-info-200',
  },
}
</script>

<template>
  <UiPanel
    :title="t('dash_attention_title')"
    :description="t('dash_attention_desc')"
    :loading="loading"
    :error="error"
    :updating="updating"
    :empty="isEmpty"
    :empty-title="t('dash_attention_empty_title')"
    :empty-description="t('dash_attention_empty_body')"
    content-class="min-h-64"
    @retry="emit('retry')"
  >
    <ul class="space-y-2">
      <li v-for="item in items" :key="item.id">
        <!--
          Each row is a link, not a card with a button inside it: the whole row
          is the target, it works with middle-click and keyboard, and it needs
          no extra tab stop.
        -->
        <RouterLink
          :to="item.href"
          class="border-border hover:bg-muted flex items-center gap-3 rounded-[var(--shape-radius-sm)] border p-3 transition-colors"
        >
          <span
            :class="[
              resolveIcon(SEVERITY[item.severity].icon),
              SEVERITY[item.severity].tone,
              'h-5 w-5 shrink-0',
            ]"
            aria-hidden="true"
          />
          <span class="text-foreground min-w-0 flex-1 text-sm leading-snug font-medium">
            {{ attentionTitle(item.titleKey) }}
          </span>
          <!-- The severity is spelled out for anyone who cannot see the icon. -->
          <span class="sr-only">{{ severityLabel(item.severity) }}</span>
          <span
            :class="[
              SEVERITY[item.severity].badge,
              'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
            ]"
          >
            {{ number(item.count) }}
          </span>
        </RouterLink>
      </li>
    </ul>
  </UiPanel>
</template>
