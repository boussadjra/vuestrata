<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { UiPanel } from '@/components/ui'
import { useRbac } from '@/composables/useRbac'
import { resolveIcon } from '~/config/icon-provider'
import type { IconName, Permission } from '~/types'

/**
 * Shortcuts to the tasks a dashboard user most often starts.
 *
 * Every entry points at a route that EXISTS. A quick action that goes nowhere,
 * or a button with no handler, is worse than no shortcut at all — it teaches
 * the user the interface is unreliable.
 *
 * Actions the current user lacks permission for are removed rather than
 * disabled: a disabled control invites the user to work out why, and there is
 * no answer they can act on.
 */
const { t } = useI18n()
const { can } = useRbac()

interface QuickAction {
  key: string
  to: string
  icon: IconName
  permission?: Permission
}

const ACTIONS: QuickAction[] = [
  { key: 'invite_user', to: '/dashboard/users', icon: 'user-plus', permission: 'users:create' },
  { key: 'view_billing', to: '/dashboard/billing', icon: 'card', permission: 'billing:read' },
  { key: 'explore_charts', to: '/dashboard/charts', icon: 'graph' },
  { key: 'review_audit', to: '/dashboard/audit', icon: 'shield-check', permission: 'audit:read' },
  { key: 'open_settings', to: '/dashboard/settings', icon: 'settings' },
]

const visibleActions = computed(() =>
  ACTIONS.filter((action) => !action.permission || can(action.permission)),
)
</script>

<template>
  <UiPanel :title="t('dash_quick_actions_title')" content-class="min-h-0">
    <ul class="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <li v-for="action in visibleActions" :key="action.key">
        <RouterLink
          :to="action.to"
          class="border-border hover:bg-muted flex items-center gap-2.5 rounded-[var(--shape-radius-sm)] border p-3 text-sm font-medium transition-colors"
        >
          <span
            :class="[resolveIcon(action.icon), 'text-muted-foreground h-4 w-4 shrink-0']"
            aria-hidden="true"
          />
          <span class="text-foreground truncate">{{ t(`dash_action_${action.key}`) }}</span>
        </RouterLink>
      </li>
    </ul>
  </UiPanel>
</template>
