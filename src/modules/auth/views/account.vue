<script setup lang="ts">
/**
 * Account — identity, session security, and the grants the UI currently honors.
 *
 * Lives in the auth module because everything on it is an auth concern, and
 * because what it can offer depends on the configured adapter: the mock adapter
 * supports MFA, the JWT and OAuth adapters advertise their own capabilities.
 * The page reads `capabilities` rather than assuming, so a control is never
 * shown for something the adapter will refuse at click time.
 */
import { useI18n } from 'vue-i18n'

import {
  UiAlert,
  UiAvatar,
  UiBadge,
  UiButton,
  UiEmptyState,
  UiPageHeader,
  UiPanel,
} from '@/components/ui'
import { useFormatters } from '@/composables/useFormatters'
import { resolveIcon } from '@/config/icon-provider'
import { getRolePermissions } from '@/lib/rbac'
import { useAuthStore } from '@/stores/auth'

import AccountGrantsGrid from '../components/AccountGrantsGrid.vue'
import { getAuthAdapter } from '../composables/useAuth'
import { accountT, ensureAccountMessages } from '../ensure-account-i18n'

const { t, locale } = useI18n()
const { dateTime } = useFormatters()
const authStore = useAuthStore()

ensureAccountMessages()
const grantsTitle = computed(() => {
  void locale.value
  return accountT('account_permissions_title')
})
const grantsBody = computed(() => {
  void locale.value
  return accountT('account_permissions_body')
})

const user = computed(() => authStore.user)
const adapter = getAuthAdapter()

/**
 * What this deployment's adapter can actually do.
 *
 * Before the Phase 3 capability contract, every adapter declared eleven methods
 * and half of them threw — the UI discovered a feature was unsupported only
 * when the user clicked it.
 */
const capabilities = computed(() => adapter.capabilities)

const grantedTokens = computed(() => {
  const current = user.value
  if (!current) return []
  return current.permissions ?? getRolePermissions(current.role)
})
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-10">
    <UiPageHeader :title="t('account_title')" :description="t('account_subtitle')">
      <template #actions>
        <UiButton to="/dashboard/settings" variant="ghost">
          <span :class="[resolveIcon('settings'), 'h-4 w-4']" aria-hidden="true" />
          {{ t('nav_settings') }}
        </UiButton>
      </template>
    </UiPageHeader>

    <template v-if="user">
      <!--
        Two peer panels, equal columns and stretched height. `items-start` plus
        a custom identity card next to `UiPanel` was the staggered layout.
        Identity is a person, not a form — the mail link is the copyable,
        activatable version of the same facts.
      -->
      <div class="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
        <UiPanel :title="t('account_profile_title')" content-class="min-h-0">
          <div class="flex h-full min-h-0 flex-col gap-5 sm:flex-row sm:items-start">
            <span class="shrink-0">
              <UiAvatar :src="user.avatar" :fallback="user.name" size="lg" />
            </span>
            <div class="flex min-w-0 flex-1 flex-col">
              <p class="text-foreground text-lg font-semibold">{{ user.name }}</p>
              <a
                :href="`mailto:${user.email}`"
                class="text-link hover:text-link-hover mt-0.5 inline-block text-sm break-all hover:underline"
              >
                {{ user.email }}
              </a>
              <ul class="mt-3 flex flex-wrap items-center gap-2">
                <li>
                  <UiBadge variant="secondary" size="md">{{ t(`role_${user.role}`) }}</UiBadge>
                </li>
                <li>
                  <UiBadge :variant="user.emailVerified ? 'success' : 'warning'" size="md">
                    {{
                      user.emailVerified
                        ? t('account_email_verified')
                        : t('account_email_unverified')
                    }}
                  </UiBadge>
                </li>
              </ul>
              <p class="text-foreground mt-auto pt-4 text-sm">
                {{ t('account_managed_externally') }}
              </p>
            </div>
          </div>
        </UiPanel>

        <UiPanel :title="t('account_security_title')" content-class="min-h-0">
          <!--
            A `<dl>` may only directly contain `<dt>`/`<dd>` pairs or `<div>`
            groups, and each group may hold only the pair. The adapter name
            belongs to the definition, so it lives in the `<dd>` — putting it
            beside the pair produced `definition-list` and `dlitem` violations.
          -->
          <dl class="divide-border divide-y text-sm">
            <!--
              The sentence is the definition. An Enabled/Disabled chip next to
              it restated the same fact and made colour do work the words
              already did.
            -->
            <div class="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
              <dt class="text-foreground font-medium">{{ t('account_mfa') }}</dt>
              <dd class="text-foreground">
                {{ user.mfaEnabled ? t('account_mfa_on') : t('account_mfa_off') }}
              </dd>
            </div>

            <div class="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
              <dt class="text-foreground font-medium">{{ t('account_transport') }}</dt>
              <dd
                class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
              >
                <span class="text-foreground">
                  {{ t(`account_transport_${adapter.transport}`) }}
                </span>
                <UiBadge variant="default" size="md" class="w-fit shrink-0">
                  {{ adapter.name }}
                </UiBadge>
              </dd>
            </div>

            <div v-if="user.lastLoginAt" class="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
              <dt class="text-foreground font-medium">{{ t('account_last_sign_in') }}</dt>
              <dd class="text-foreground">
                <time :datetime="user.lastLoginAt">{{ dateTime(user.lastLoginAt) }}</time>
              </dd>
            </div>
          </dl>

          <!--
            Stated rather than silently omitted. A user who cannot find MFA needs
            to know it is the deployment's auth provider that does not offer it,
            not that they are looking in the wrong place.
          -->
          <UiAlert v-if="!capabilities.mfa" variant="info" class="mt-4">
            {{ t('account_mfa_unsupported', { adapter: adapter.name }) }}
          </UiAlert>
        </UiPanel>
      </div>

      <UiPanel
        class="overflow-hidden"
        :title="grantsTitle"
        :description="grantsBody"
        content-class="min-h-0 overflow-hidden p-0"
      >
        <AccountGrantsGrid :tokens="grantedTokens" />
      </UiPanel>
    </template>

    <UiEmptyState
      v-else
      variant="error"
      icon="shield-user"
      :title="t('account_unavailable_title')"
      :description="t('account_unavailable_body')"
    >
      <template #action>
        <UiButton to="/auth/login" variant="primary">{{ t('auth_login') }}</UiButton>
      </template>
    </UiEmptyState>
  </div>
</template>
