<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import Logo from '@/components/Logo.vue'
import { UiButton } from '@/components/ui'
import { useModuleNav } from '@/composables/useModuleNav'
import { resolveIcon } from '@/config/icon-provider'
import { useAppStore } from '@/stores/app'

import AppSidebarNavItem from './AppSidebarNavItem.vue'

const { t } = useI18n()
const appStore = useAppStore()
const route = useRoute()

// Permission filtering, grouping and active-route resolution all happen in the
// composable; this component only lays the result out.
const { groups, currentPath } = useModuleNav()

// `useMediaQuery` replaces a hand-rolled resize listener: it uses
// matchMedia change events rather than firing on every resize frame, and it
// cleans itself up.
const isMobileViewport = useMediaQuery('(max-width: 1023px)')

const isSidebarOpen = computed(() =>
  isMobileViewport.value ? appStore.mobileSidebarOpen : !appStore.sidebarCollapsed,
)

/**
 * True while the sidebar is an off-canvas modal drawer.
 *
 * On mobile the sidebar is only translated off-screen, which hides it visually
 * but leaves every link focusable and announced. A keyboard user tabbing
 * through the page would walk into a menu they cannot see. `inert` removes the
 * whole subtree from the tab order and the accessibility tree while closed.
 */
const isDrawer = computed(() => isMobileViewport.value)
const isDrawerOpen = computed(() => isDrawer.value && appStore.mobileSidebarOpen)
const isInert = computed(() => isDrawer.value && !appStore.mobileSidebarOpen)

const sidebarRef = ref<HTMLElement | null>(null)

// Focus trap: while the drawer is open it behaves as a modal, so Tab must not
// escape into the page behind it. Deactivated (and focus restored) the moment
// the drawer closes.
const { activate: activateFocusTrap, deactivate: deactivateFocusTrap } = useFocusTrap(sidebarRef)

watch(isDrawerOpen, (open) => {
  if (open) void activateFocusTrap()
  else deactivateFocusTrap()
})

// Esc closes the drawer — the conventional dismissal for anything modal, and
// the only way out for a keyboard user once focus is trapped.
onKeyStroke('Escape', () => {
  if (isDrawerOpen.value) appStore.closeSidebar()
})

watch(
  () => route.fullPath,
  () => {
    if (isMobileViewport.value) {
      appStore.closeSidebar()
    }
  },
  { immediate: true },
)

function closeSidebarAfterNavigation() {
  if (isMobileViewport.value) {
    appStore.closeSidebar()
  }
}

const isCollapsedRail = computed(() => !isMobileViewport.value && appStore.sidebarCollapsed)
</script>

<template>
  <aside
    ref="sidebarRef"
    role="navigation"
    :aria-label="t('sidebar_aria_label')"
    :aria-modal="isDrawerOpen ? 'true' : undefined"
    :inert="isInert || undefined"
    :class="[
      'fixed inset-y-0 inset-s-0 z-(--z-modal) flex flex-col border-e',
      'border-sidebar-border bg-sidebar/88 backdrop-blur-xl',
      'transition-[width,transform,background-color,border-color] duration-300',
      isMobileViewport ? 'w-72' : appStore.sidebarCollapsed ? 'w-20' : 'w-72',
      'max-lg:data-[open=true]:translate-x-0 max-lg:ltr:-translate-x-full max-lg:rtl:translate-x-full',
    ]"
    :data-open="isSidebarOpen"
  >
    <!-- Sidebar header -->
    <div
      :class="[
        'border-surface-200/70 dark:border-surface-800/70 flex h-16 items-center border-b',
        isMobileViewport
          ? 'justify-between gap-2 px-3'
          : appStore.sidebarCollapsed
            ? 'justify-center px-0'
            : 'justify-start px-3',
      ]"
    >
      <RouterLink
        v-if="!appStore.sidebarCollapsed"
        to="/"
        class="focus-visible:ring-primary-300/30 dark:focus-visible:ring-offset-surface-950 flex min-w-0 items-center gap-3 rounded-lg py-1 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        <span class="flex h-9 w-9 shrink-0 items-center justify-center p-1">
          <Logo class="h-6 w-auto shrink-0" />
        </span>
        <span class="min-w-0">
          <span class="text-primary-600 dark:text-primary-300 block truncate text-sm font-semibold">
            Vuestrata
          </span>
          <span
            class="text-muted-foreground mt-0.5 block truncate text-[11px] font-medium tracking-[0.18em] uppercase"
          >
            {{ t('common_workspace') }}
          </span>
        </span>
      </RouterLink>
      <RouterLink
        v-else
        to="/"
        class="focus-visible:ring-primary-300/30 dark:focus-visible:ring-offset-surface-950 flex h-8 w-8 items-center justify-center rounded-lg p-1 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        <Logo class="h-5 w-auto shrink-0" />
      </RouterLink>
      <UiButton
        v-if="isMobileViewport"
        variant="ghost"
        :size="appStore.sidebarCollapsed ? 'sm' : 'md'"
        icon
        class="shrink-0"
        :aria-label="t('sidebar_toggle')"
        @click="appStore.toggleSidebar()"
      >
        <span :class="[resolveIcon('sidebar'), 'h-4 w-4']" />
      </UiButton>
    </div>

    <!--
      Navigation.

      One `<ul>` per section, each labelled by its heading via `aria-labelledby`
      so a screen reader announces "Commerce, list, 3 items" rather than three
      anonymous lists in a row. In the collapsed rail the headings are hidden
      visually but kept in the accessibility tree — the grouping is exactly the
      context a non-sighted user still needs when the labels are gone.
    -->
    <nav class="flex-1 space-y-5 overflow-y-auto px-2.5 py-4">
      <section v-for="group in groups" :key="group.id">
        <p
          :id="`sidebar-group-${group.id}`"
          :class="[
            'text-sidebar-foreground px-3 pb-2 text-[11px] font-medium tracking-[0.18em] uppercase',
            isCollapsedRail && 'sr-only',
          ]"
        >
          {{ t(group.label) }}
        </p>
        <ul class="space-y-1" :aria-labelledby="`sidebar-group-${group.id}`">
          <li v-for="item in group.items" :key="item.label">
            <AppSidebarNavItem
              :item="item"
              :current-path="currentPath"
              :collapsed="isCollapsedRail"
              @navigate="closeSidebarAfterNavigation"
            />
          </li>
        </ul>
      </section>
    </nav>
  </aside>

  <!-- Overlay for mobile -->
  <Transition
    enter-active-class="transition-opacity duration-200"
    leave-active-class="transition-opacity duration-150"
    enter-from-class="opacity-0"
    leave-to-class="opacity-0"
  >
    <div
      v-if="isMobileViewport && isSidebarOpen"
      class="bg-surface-950/45 fixed inset-0 z-(--z-modal-backdrop) backdrop-blur-[2px] lg:hidden"
      @click="appStore.closeSidebar()"
    />
  </Transition>
</template>
