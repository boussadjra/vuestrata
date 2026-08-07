<script setup lang="ts">
/**
 * One sidebar entry, rendered recursively.
 *
 * Three shapes, chosen by what the item actually is rather than by a flag:
 *   - a leaf              → RouterLink
 *   - a parent, expanded  → disclosure button + nested list
 *   - a parent, collapsed → flyout popover (there is no room for a sub-list in
 *                           a 5rem rail, and hiding the children entirely would
 *                           make those routes unreachable from the sidebar)
 */
import {
  CollapsibleContent,
  CollapsibleRoot,
  CollapsibleTrigger,
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger,
} from 'reka-ui'
import { useI18n } from 'vue-i18n'

import { safeResolveIcon } from '@/config/icon-provider'

import { isBranchActive, matchesRoute, type VisibleNavItem } from '../../composables/useModuleNav'

const props = withDefaults(
  defineProps<{
    item: VisibleNavItem
    currentPath: string
    collapsed?: boolean
    depth?: number
  }>(),
  { collapsed: false, depth: 0 },
)

const emit = defineEmits<{ navigate: [] }>()

const { t } = useI18n()

const children = computed(() => props.item.children ?? [])
const hasChildren = computed(() => children.value.length > 0)
const isActive = computed(() => matchesRoute(props.currentPath, props.item.to, props.item.exact))
const isBranch = computed(() => isBranchActive(props.currentPath, props.item))

/**
 * Open state is *seeded* from the active route, not bound to it.
 *
 * Binding it would fight the user: collapsing a section you are currently
 * inside would spring straight back open. Seeding gives the right default —
 * navigate to a nested page and its section is already open — while leaving the
 * disclosure under the user's control from then on.
 */
const open = ref(isBranch.value)
watch(isBranch, (active) => {
  if (active) open.value = true
})

const label = computed(() => t(props.item.label))
const iconClass = computed(() => safeResolveIcon(props.item.icon))

const linkClasses = [
  'group flex min-h-11 w-full items-center gap-3 rounded-[var(--shape-radius-sm)] px-3.5 py-2.5',
  'text-sm font-medium text-sidebar-foreground transition-colors duration-200',
  'hover:bg-sidebar-accent hover:text-foreground',
]

const activeClasses = 'bg-sidebar-accent text-sidebar-accent-foreground shadow-[var(--shadow-soft)]'

// Nested levels indent instead of nesting visually with borders: at depth 2 a
// border rail plus padding leaves the label ~8rem wide and everything truncates.
const indentStyle = computed(() =>
  props.depth > 0 && !props.collapsed
    ? { paddingInlineStart: `${0.875 + props.depth * 0.75}rem` }
    : undefined,
)
</script>

<template>
  <!-- Leaf -->
  <RouterLink
    v-if="!hasChildren && item.to"
    :to="item.to"
    :title="collapsed ? label : undefined"
    :aria-current="isActive ? 'page' : undefined"
    :class="[linkClasses, isActive && activeClasses, collapsed && 'justify-center px-0']"
    :style="indentStyle"
    @click="emit('navigate')"
  >
    <span :class="[iconClass, 'h-5 w-5 shrink-0']" aria-hidden="true" />
    <span v-if="!collapsed" class="truncate">{{ label }}</span>
    <!-- The label still has to reach a screen reader in the collapsed rail;
         `title` alone is not reliably announced. -->
    <span v-else class="sr-only">{{ label }}</span>
  </RouterLink>

  <!-- Parent, collapsed rail: flyout -->
  <PopoverRoot v-else-if="hasChildren && collapsed">
    <PopoverTrigger
      :class="[linkClasses, isBranch && activeClasses, 'justify-center px-0']"
      :aria-label="label"
    >
      <span :class="[iconClass, 'h-5 w-5 shrink-0']" aria-hidden="true" />
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent
        side="right"
        align="start"
        :side-offset="8"
        class="border-border bg-elevated z-50 min-w-52 rounded-[var(--shape-radius-sm)] border p-1.5 shadow-[var(--shadow-soft)]"
      >
        <p class="text-muted-foreground px-2.5 pt-1 pb-2 text-xs font-semibold">{{ label }}</p>
        <ul class="space-y-1">
          <li v-for="child in children" :key="child.label">
            <AppSidebarNavItem
              :item="child"
              :current-path="currentPath"
              :depth="0"
              @navigate="emit('navigate')"
            />
          </li>
        </ul>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>

  <!-- Parent, expanded: disclosure -->
  <CollapsibleRoot v-else-if="hasChildren" v-model:open="open">
    <CollapsibleTrigger
      :class="[linkClasses, isBranch && !open && activeClasses]"
      :style="indentStyle"
    >
      <span :class="[iconClass, 'h-5 w-5 shrink-0']" aria-hidden="true" />
      <span class="grow truncate text-start">{{ label }}</span>
      <span
        :class="[
          safeResolveIcon('chevron-down'),
          'h-4 w-4 shrink-0 transition-transform duration-200',
          open && 'rotate-180',
        ]"
        aria-hidden="true"
      />
    </CollapsibleTrigger>
    <CollapsibleContent>
      <ul class="mt-1 space-y-1">
        <li v-for="child in children" :key="child.label">
          <AppSidebarNavItem
            :item="child"
            :current-path="currentPath"
            :depth="depth + 1"
            @navigate="emit('navigate')"
          />
        </li>
      </ul>
    </CollapsibleContent>
  </CollapsibleRoot>
</template>
