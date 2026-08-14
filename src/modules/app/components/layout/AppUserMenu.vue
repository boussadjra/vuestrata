<script setup lang="ts">
/**
 * Account menu.
 *
 * Replaces the row of unlabelled icon buttons that used to sit in the header
 * (settings, dashboard, log out). Three separate icons cost three tab stops and
 * gave no indication of *whose* account they act on; a menu collapses them to
 * one control that states the signed-in identity.
 *
 * Reka's DropdownMenu supplies the roving-focus, typeahead, Esc-to-close and
 * focus-restore behaviour the ARIA menu pattern requires.
 */
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'reka-ui'
import { useI18n } from 'vue-i18n'

import { UiAvatar } from '@/components/ui'
import { resolveIcon } from '@/config/icon-provider'
import { useAuth } from '@/modules/auth'
import { useAuthStore } from '@/stores/auth'
import type { IconName } from '@/types'

const { t } = useI18n()
const authStore = useAuthStore()
const { logout } = useAuth()
const router = useRouter()

const user = computed(() => authStore.user)

const links: { to: string; label: string; icon: IconName }[] = [
  { to: '/dashboard/account', label: 'account_nav', icon: 'shield-user' },
  { to: '/dashboard/settings', label: 'nav_settings', icon: 'settings' },
]

// `router.push` rather than a nested RouterLink: a link inside a menu item
// produces two nested interactive elements, and screen readers announce the
// result as a link *and* a menu item.
function go(to: string) {
  void router.push(to)
}
</script>

<template>
  <DropdownMenuRoot v-if="user">
    <DropdownMenuTrigger
      class="hover:bg-muted flex items-center gap-2 rounded-[var(--shape-radius-sm)] p-1 transition-colors"
      :aria-label="t('account_menu_label', { name: user.name })"
    >
      <UiAvatar :src="user.avatar" :fallback="user.name" size="sm" />
      <span class="hidden min-w-0 flex-col items-start md:flex">
        <span class="text-foreground max-w-32 truncate text-sm font-medium">{{ user.name }}</span>
        <span class="text-muted-foreground text-[11px] leading-tight">
          {{ t(`role_${user.role}`) }}
        </span>
      </span>
      <span
        :class="[
          resolveIcon('chevron-down'),
          'text-muted-foreground hidden h-4 w-4 shrink-0 sm:block',
        ]"
        aria-hidden="true"
      />
    </DropdownMenuTrigger>

    <DropdownMenuPortal>
      <DropdownMenuContent
        align="end"
        :side-offset="8"
        class="border-border bg-elevated z-(--z-dropdown) min-w-56 rounded-[var(--shape-radius-sm)] border p-1.5 shadow-[var(--shadow-soft)]"
      >
        <div class="px-2.5 py-2">
          <p class="text-foreground truncate text-sm font-medium">{{ user.name }}</p>
          <p class="text-muted-foreground truncate text-xs">{{ user.email }}</p>
        </div>
        <DropdownMenuSeparator class="bg-border my-1 h-px" />

        <DropdownMenuItem
          v-for="link in links"
          :key="link.to"
          class="text-foreground data-[highlighted]:bg-muted flex cursor-pointer items-center gap-2.5 rounded-[var(--shape-radius-sm)] px-2.5 py-2 text-sm outline-none"
          @select="go(link.to)"
        >
          <span
            :class="[resolveIcon(link.icon), 'text-muted-foreground h-4 w-4']"
            aria-hidden="true"
          />
          {{ t(link.label) }}
        </DropdownMenuItem>

        <DropdownMenuSeparator class="bg-border my-1 h-px" />

        <DropdownMenuItem
          class="text-destructive data-[highlighted]:bg-destructive-subtle flex cursor-pointer items-center gap-2.5 rounded-[var(--shape-radius-sm)] px-2.5 py-2 text-sm outline-none"
          @select="logout()"
        >
          <span :class="[resolveIcon('logout'), 'h-4 w-4']" aria-hidden="true" />
          {{ t('auth_logout') }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
