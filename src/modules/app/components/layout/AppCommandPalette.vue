<script setup lang="ts">
/**
 * ⌘K navigation palette.
 *
 * `UiCommandPalette` already existed but had no trigger anywhere in the app —
 * it was reachable only from the component showcase. This wires it to the
 * keyboard shortcut users expect and feeds it the same permission-filtered nav
 * tree the sidebar renders, so the palette can never offer a route the user
 * would be bounced out of.
 */
import { useI18n } from 'vue-i18n'

import { UiCommandPalette, UiDialog } from '@/components/ui'
import { useModuleNav, type VisibleNavItem } from '@/composables/useModuleNav'
import { resolveIcon } from '@/config/icon-provider'
import type { CommandItem } from '@/types'

const { t } = useI18n()
const router = useRouter()
const { groups } = useModuleNav()

const open = ref(false)
const query = ref('')

/**
 * Flatten the nav tree into commands.
 *
 * The group name rides along as the hint, which is what makes two identically
 * named leaves distinguishable — "Overview" under Commerce and "Overview" under
 * Projects are otherwise the same string in a flat list.
 */
const items = computed<CommandItem[]>(() => {
  const commands: CommandItem[] = []

  function walk(navItems: VisibleNavItem[], groupLabel: string) {
    for (const item of navItems) {
      if (item.to) commands.push({ id: item.to, label: t(item.label), hint: groupLabel })
      if (item.children) walk(item.children, groupLabel)
    }
  }

  for (const group of groups.value) walk(group.items, t(group.label))
  return commands
})

// `useMagicKeys` reports the physical combination, so this covers ⌘K on macOS
// and Ctrl+K elsewhere without sniffing the platform.
const keys = useMagicKeys({
  passive: false,
  onEventFired(event) {
    // The browser binds Ctrl+K to the address bar; without this the palette
    // opens and focus immediately leaves the page.
    if (event.key === 'k' && (event.metaKey || event.ctrlKey) && event.type === 'keydown') {
      event.preventDefault()
    }
  },
})

watch([keys['Meta+K'], keys['Control+K']], ([meta, control]) => {
  if (meta || control) open.value = !open.value
})

watch(open, (isOpen) => {
  if (!isOpen) query.value = ''
})

function navigate(path: string) {
  open.value = false
  void router.push(path)
}
</script>

<template>
  <!--
    A real button rather than a decorative div: the shortcut is a convenience,
    not the only way in. Touch users and anyone who never learns the chord still
    need a control they can activate.

    One root so the dialog is not a second flex item in the header toolbar —
    that is what sat the search field off the locale select's baseline.
  -->
  <div class="hidden h-[var(--control-height)] items-stretch md:inline-flex">
    <button
      type="button"
      class="border-surface-300 dark:border-surface-600 bg-card text-muted-foreground hover:text-foreground hover:border-surface-400 dark:hover:border-surface-500 shaped-border shaped-radius-sm inline-flex h-full w-56 items-center gap-2 border px-3 text-sm leading-5 transition-colors lg:w-72"
      :aria-label="t('command_palette_open')"
      :aria-keyshortcuts="'Meta+K Control+K'"
      data-testid="command-palette-trigger"
      @click="open = true"
    >
      <span :class="[resolveIcon('search'), 'h-4 w-4 shrink-0']" aria-hidden="true" />
      <span class="flex-1 text-start">{{ t('command_palette_placeholder') }}</span>
      <kbd
        class="border-border bg-muted ms-auto shrink-0 rounded border px-1.5 py-0.5 font-sans text-[11px]"
        aria-hidden="true"
      >
        ⌘K
      </kbd>
    </button>

    <UiDialog
      v-model:open="open"
      :title="t('command_palette_title')"
      :description="t('command_palette_description')"
      content-class="max-w-xl p-0"
    >
      <UiCommandPalette
        v-model="query"
        :items="items"
        :placeholder="t('command_palette_placeholder')"
        :empty-text="t('command_palette_empty')"
        @select="navigate"
      />
    </UiDialog>
  </div>
</template>
