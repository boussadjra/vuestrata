<script setup lang="ts">
/**
 * Account — profile, security, and sessions.
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
  UiCard,
  UiPageHeader,
  UiTextField,
} from '@/components/ui'
import { useFormatters } from '@/composables/useFormatters'
import { resolveIcon } from '@/config/icon-provider'
import { useAuthStore } from '@/stores/auth'

import { getAuthAdapter } from '../composables/useAuth'

const { t } = useI18n()
const { dateTime } = useFormatters()
const authStore = useAuthStore()

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

const permissions = computed(() => user.value?.permissions ?? [])
</script>

<template>
  <div class="space-y-6">
    <UiPageHeader :title="t('account_title')" :description="t('account_subtitle')" />

    <div v-if="user" class="grid gap-6 lg:grid-cols-3">
      <UiCard class="flex flex-col items-center p-6 text-center">
        <UiAvatar :src="user.avatar" :fallback="user.name" size="xl" />
        <p class="text-foreground mt-4 font-semibold">{{ user.name }}</p>
        <p class="text-muted-foreground text-sm">{{ user.email }}</p>
        <UiBadge variant="secondary" size="sm" class="mt-3">{{ t(`role_${user.role}`) }}</UiBadge>

        <!--
          Verification state is worth surfacing: an unverified address silently
          fails password resets, and the user has no other way to find out.
        -->
        <UiBadge :variant="user.emailVerified ? 'success' : 'warning'" size="sm" class="mt-2">
          {{ user.emailVerified ? t('account_email_verified') : t('account_email_unverified') }}
        </UiBadge>
      </UiCard>

      <UiCard class="p-5 lg:col-span-2">
        <h2 class="text-foreground text-base font-semibold">{{ t('account_profile_title') }}</h2>
        <p class="text-muted-foreground mt-1 text-sm">{{ t('account_profile_body') }}</p>

        <div class="mt-4 grid gap-4 sm:grid-cols-2">
          <!--
            Disabled, not absent. The profile endpoint is a backend concern this
            template does not ship, and rendering an editable form that silently
            discards its input would be worse than showing the values read-only
            and saying why.
          -->
          <UiTextField
            :model-value="user.name"
            :label="t('common_name')"
            disabled
            :description="t('account_managed_externally')"
          />
          <UiTextField
            :model-value="user.email"
            :label="t('common_email')"
            disabled
            :description="t('account_managed_externally')"
          />
        </div>
      </UiCard>

      <UiCard class="p-5 lg:col-span-2">
        <h2 class="text-foreground text-base font-semibold">{{ t('account_security_title') }}</h2>

        <!--
          A `<dl>` may only directly contain `<dt>`/`<dd>` pairs or `<div>`
          groups, and each group may hold only the pair. An earlier version put
          the status badge beside the pair inside the group div, which reads
          fine and produces two serious axe violations (`definition-list` and
          `dlitem`). The badge belongs to the definition, so it lives in the
          `<dd>` — which is also more accurate: "Disabled" IS the value.
        -->
        <dl class="mt-4 space-y-4 text-sm">
          <div>
            <dt class="text-foreground font-medium">{{ t('account_mfa') }}</dt>
            <dd class="mt-1 flex flex-wrap items-center justify-between gap-2">
              <span class="text-muted-foreground">
                {{ user.mfaEnabled ? t('account_mfa_on') : t('account_mfa_off') }}
              </span>
              <UiBadge :variant="user.mfaEnabled ? 'success' : 'warning'" size="sm">
                {{ user.mfaEnabled ? t('account_enabled') : t('account_disabled') }}
              </UiBadge>
            </dd>
          </div>

          <div>
            <dt class="text-foreground font-medium">{{ t('account_transport') }}</dt>
            <dd class="mt-1 flex flex-wrap items-center justify-between gap-2">
              <span class="text-muted-foreground">
                {{ t(`account_transport_${adapter.transport}`) }}
              </span>
              <UiBadge variant="default" size="sm">{{ adapter.name }}</UiBadge>
            </dd>
          </div>

          <div v-if="user.lastLoginAt">
            <dt class="text-foreground font-medium">{{ t('account_last_sign_in') }}</dt>
            <dd class="text-muted-foreground mt-1">
              <time :datetime="user.lastLoginAt">{{ dateTime(user.lastLoginAt) }}</time>
            </dd>
          </div>
        </dl>

        <!--
          Stated rather than silently omitted. A user who cannot find MFA needs
          to know it is the deployment's auth provider that does not offer it,
          not that they are looking in the wrong place.
        -->
        <UiAlert v-if="!capabilities.mfa" variant="info" class="mt-5">
          {{ t('account_mfa_unsupported', { adapter: adapter.name }) }}
        </UiAlert>
      </UiCard>

      <UiCard class="p-5">
        <h2 class="text-foreground text-base font-semibold">
          {{ t('account_permissions_title') }}
        </h2>
        <p class="text-muted-foreground mt-1 text-sm">{{ t('account_permissions_body') }}</p>

        <ul v-if="permissions.length" class="mt-4 flex flex-wrap gap-1.5">
          <li v-for="permission in permissions" :key="permission">
            <UiBadge variant="default" size="sm">
              <span class="font-mono text-xs">{{ permission }}</span>
            </UiBadge>
          </li>
        </ul>
        <p v-else class="text-muted-foreground mt-4 text-sm">
          {{ t('account_permissions_empty') }}
        </p>
      </UiCard>

      <UiCard class="p-5 lg:col-span-3">
        <h2 class="text-foreground text-base font-semibold">{{ t('account_danger_title') }}</h2>
        <p class="text-muted-foreground mt-1 text-sm">{{ t('account_danger_body') }}</p>
        <div class="mt-4">
          <UiButton to="/dashboard/settings" variant="ghost">
            <span :class="[resolveIcon('settings'), 'h-4 w-4']" aria-hidden="true" />
            {{ t('nav_settings') }}
          </UiButton>
        </div>
      </UiCard>
    </div>
  </div>
</template>
