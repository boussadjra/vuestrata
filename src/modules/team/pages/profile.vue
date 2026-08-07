<script setup lang="ts">
/**
 * Team member profile — the profile-page pattern.
 *
 * Read-only. The directory is sourced from an HR system in any real deployment,
 * so offering an edit form the backend will reject would be a lie the template
 * teaches by example.
 */
import { useI18n } from 'vue-i18n'

import {
  UiAvatar,
  UiBadge,
  UiButton,
  UiCard,
  UiEmptyState,
  UiPageHeader,
  UiSkeleton,
} from '@/components/ui'
import { useBreadcrumbLabel } from '@/composables/useBreadcrumbs'
import { useFormatters } from '@/composables/useFormatters'
import { useLocales } from '@/composables/useLocales'
import { useRouteParam } from '@/composables/useRouteParam'
import { resolveIcon } from '@/config/icon-provider'

import { useTeamMemberQuery } from '../composables/useTeam'
import type { TeamMember } from '../types'

const { t } = useI18n()
const { date } = useFormatters()
const { current: locale } = useLocales()

const id = useRouteParam('id')
const { item: member, isPending, isError, error, refetch } = useTeamMemberQuery(id)

useBreadcrumbLabel(() => member.value?.name)

const isNotFound = computed(() => {
  const failure = (error.value as { status?: number; statusCode?: number } | null) ?? null
  return failure?.status === 404 || failure?.statusCode === 404
})

const STATUS_VARIANT: Record<TeamMember['status'], 'success' | 'warning' | 'default'> = {
  available: 'success',
  busy: 'warning',
  away: 'default',
  on_leave: 'default',
}

const localTime = computed(() => {
  if (!member.value) return null
  try {
    return new Intl.DateTimeFormat(locale.value, {
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
      timeZone: member.value.timezone,
    }).format(new Date())
  } catch {
    return null
  }
})
</script>

<template>
  <div class="space-y-6">
    <UiEmptyState
      v-if="isNotFound"
      variant="error"
      icon="search"
      :title="t('team_not_found_title')"
      :description="t('team_not_found_body')"
    >
      <UiButton to="/dashboard/team" variant="primary">{{ t('team_back_to_list') }}</UiButton>
    </UiEmptyState>

    <UiEmptyState
      v-else-if="isError"
      variant="error"
      :title="t('common_error_title')"
      :description="t('common_error_body')"
    >
      <UiButton variant="ghost" @click="refetch">{{ t('common_retry') }}</UiButton>
    </UiEmptyState>

    <div v-else-if="isPending" class="space-y-6" aria-busy="true" :aria-label="t('common_loading')">
      <UiSkeleton class="h-24" />
      <UiSkeleton class="h-64" />
    </div>

    <template v-else-if="member">
      <UiPageHeader :title="member.name" :description="member.title">
        <template #meta>
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <UiBadge :variant="STATUS_VARIANT[member.status]" size="sm">
              {{ t(`team_status_${member.status}`) }}
            </UiBadge>
            <UiBadge variant="secondary" size="sm">
              {{ t(`team_department_${member.department}`) }}
            </UiBadge>
          </div>
        </template>
        <template #actions>
          <UiButton to="/dashboard/team" variant="ghost">
            <span
              :class="[resolveIcon('arrow-left'), 'h-4 w-4 rtl:rotate-180']"
              aria-hidden="true"
            />
            {{ t('team_back_to_list') }}
          </UiButton>
          <UiButton :href="`mailto:${member.email}`" variant="primary" as="a">
            <span :class="[resolveIcon('letter'), 'h-4 w-4']" aria-hidden="true" />
            {{ t('team_contact') }}
          </UiButton>
        </template>
      </UiPageHeader>

      <div class="grid gap-6 lg:grid-cols-3">
        <UiCard class="flex flex-col items-center p-6 text-center">
          <UiAvatar :fallback="member.name" size="xl" />
          <p class="text-foreground mt-4 font-semibold">{{ member.name }}</p>
          <p class="text-muted-foreground text-sm">{{ member.title }}</p>
          <p v-if="localTime" class="text-muted-foreground mt-3 text-sm tabular-nums">
            {{ t('team_local_time') }}: {{ localTime }}
          </p>
        </UiCard>

        <UiCard class="p-5 lg:col-span-2">
          <h2 class="text-foreground text-base font-semibold">{{ t('common_details') }}</h2>
          <dl class="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <dt class="text-muted-foreground text-xs tracking-wide uppercase">
                {{ t('common_email') }}
              </dt>
              <dd class="mt-1">
                <a
                  :href="`mailto:${member.email}`"
                  class="text-link hover:text-link-hover break-all hover:underline"
                >
                  {{ member.email }}
                </a>
              </dd>
            </div>
            <div>
              <dt class="text-muted-foreground text-xs tracking-wide uppercase">
                {{ t('customers_location') }}
              </dt>
              <dd class="text-foreground mt-1">{{ member.location }}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground text-xs tracking-wide uppercase">
                {{ t('team_manager') }}
              </dt>
              <!-- The top of the tree has no manager. Saying so beats an empty
                   cell the reader has to interpret as missing data. -->
              <dd class="text-foreground mt-1">
                {{ member.manager ?? t('team_no_manager') }}
              </dd>
            </div>
            <div>
              <dt class="text-muted-foreground text-xs tracking-wide uppercase">
                {{ t('team_joined') }}
              </dt>
              <dd class="text-foreground mt-1">
                <time :datetime="member.joinedAt">{{ date(member.joinedAt) }}</time>
              </dd>
            </div>
          </dl>

          <h3 class="text-foreground mt-6 text-sm font-semibold">{{ t('team_skills') }}</h3>
          <ul class="mt-2 flex flex-wrap gap-2">
            <li v-for="skill in member.skills" :key="skill">
              <UiBadge variant="default" size="sm">{{ skill }}</UiBadge>
            </li>
          </ul>
        </UiCard>
      </div>
    </template>
  </div>
</template>
