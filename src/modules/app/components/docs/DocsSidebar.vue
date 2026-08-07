<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { getGroupPanelId, type SidebarSection, type SubsectionGroup } from './docsNavigation'

const { t } = useI18n()

const props = defineProps<{
  sections: SidebarSection[]
  currentSlug: string
  open: boolean
  expandedGroups: Set<string>
}>()

const DESKTOP_BREAKPOINT = '(min-width: 1024px)'
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

const emit = defineEmits<{
  close: []
  toggleGroup: [key: string]
}>()

const sidebarRef = ref<HTMLElement | null>(null)
const isDesktop = ref(false)
const restoreFocusOnClose = ref(true)
const focusMainOnClose = ref(false)
const lastFocusedElement = ref<HTMLElement | null>(null)

let desktopMediaQuery: MediaQueryList | null = null
let previousBodyOverflow = ''

function isActive(slug: string) {
  return props.currentSlug === slug
}

const isMobileOpen = computed(() => !isDesktop.value && props.open)
const isMobileClosed = computed(() => !isDesktop.value && !props.open)

function isGroupExpanded(key: string) {
  return props.expandedGroups.has(key)
}

function isGroupActive(group: SubsectionGroup) {
  return group.items.some((doc) => isActive(doc.slug))
}

function closeSidebar(options: { restoreFocus?: boolean; focusMain?: boolean } = {}) {
  restoreFocusOnClose.value = options.restoreFocus ?? true
  focusMainOnClose.value = options.focusMain ?? false
  emit('close')
}

function closeSidebarAfterNavigation() {
  closeSidebar({ restoreFocus: false, focusMain: true })
}

function syncDesktopState(event?: MediaQueryListEvent) {
  isDesktop.value = event?.matches ?? desktopMediaQuery?.matches ?? false
}

function setBodyScrollLock(locked: boolean) {
  if (typeof document === 'undefined') return

  if (locked) {
    previousBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return
  }

  document.body.style.overflow = previousBodyOverflow
  previousBodyOverflow = ''
}

function getToggleButtonElement() {
  if (typeof document === 'undefined') return null
  return document.querySelector<HTMLElement>('[aria-controls="docs-sidebar"]')
}

function getFocusableElements() {
  if (!sidebarRef.value) return []

  return [...sidebarRef.value.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    (element) => {
      if (element.matches('[disabled], [inert], [aria-hidden="true"]')) return false
      if (getComputedStyle(element).visibility === 'hidden') return false
      return element.getClientRects().length > 0
    },
  )
}

function focusElement(target: HTMLElement | null) {
  if (!target) return

  const hadTabindex = target.hasAttribute('tabindex')
  if (!hadTabindex) target.setAttribute('tabindex', '-1')

  target.focus({ preventScroll: true })

  if (!hadTabindex) {
    target.addEventListener(
      'blur',
      () => {
        target.removeAttribute('tabindex')
      },
      { once: true },
    )
  }
}

function focusSidebarContent() {
  const currentPageLink = sidebarRef.value?.querySelector<HTMLElement>('[aria-current="page"]')
  focusElement(currentPageLink ?? getFocusableElements()[0] ?? sidebarRef.value)
}

function restoreStoredFocus() {
  const target = lastFocusedElement.value?.isConnected
    ? lastFocusedElement.value
    : getToggleButtonElement()
  focusElement(target)
}

function focusMainContent() {
  if (typeof document === 'undefined') return

  const target =
    document.querySelector<HTMLElement>('main h1, main [role="heading"][aria-level="1"], main') ??
    document.querySelector<HTMLElement>('main')

  focusElement(target)
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (!isMobileOpen.value) return

  if (event.key === 'Escape') {
    event.preventDefault()
    closeSidebar()
    return
  }

  if (event.key !== 'Tab') return

  const focusableElements = getFocusableElements()
  const first = focusableElements[0]
  const last = focusableElements[focusableElements.length - 1]
  const activeElement =
    document.activeElement instanceof HTMLElement ? document.activeElement : null

  if (!first || !last) {
    event.preventDefault()
    focusElement(sidebarRef.value)
    return
  }

  if (!activeElement || !sidebarRef.value?.contains(activeElement)) {
    event.preventDefault()
    focusElement(first)
    return
  }

  if (event.shiftKey && (activeElement === first || activeElement === sidebarRef.value)) {
    event.preventDefault()
    focusElement(last)
    return
  }

  if (!event.shiftKey && activeElement === last) {
    event.preventDefault()
    focusElement(first)
  }
}

onMounted(() => {
  if (typeof window === 'undefined') return

  desktopMediaQuery = window.matchMedia(DESKTOP_BREAKPOINT)
  syncDesktopState()
  desktopMediaQuery.addEventListener('change', syncDesktopState)
})

onBeforeUnmount(() => {
  desktopMediaQuery?.removeEventListener('change', syncDesktopState)
  document.removeEventListener('keydown', handleDocumentKeydown)
  setBodyScrollLock(false)
})

watch(
  isMobileOpen,
  async (open, wasOpen) => {
    document.removeEventListener('keydown', handleDocumentKeydown)
    setBodyScrollLock(open)

    if (open) {
      if (document.activeElement instanceof HTMLElement) {
        lastFocusedElement.value = document.activeElement
      }

      document.addEventListener('keydown', handleDocumentKeydown)
      await nextTick()
      focusSidebarContent()
      return
    }

    if (!wasOpen) return

    if (focusMainOnClose.value) {
      await nextTick()
      requestAnimationFrame(() => {
        focusMainContent()
        focusMainOnClose.value = false
      })
    } else if (!isDesktop.value && restoreFocusOnClose.value) {
      await nextTick()
      restoreStoredFocus()
    }

    lastFocusedElement.value = null
    restoreFocusOnClose.value = true
  },
  { flush: 'post' },
)

const itemLinkClass =
  'focus-visible:ring-primary-300 flex min-h-10 w-full items-center rounded-lg px-3 py-2 text-start text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none lg:min-h-8 lg:py-1.5'

const childLinkClass =
  'focus-visible:ring-primary-300 flex min-h-9 w-full items-center rounded-lg py-2 pe-3 ps-4 text-start text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none lg:min-h-8 lg:py-1.5'
</script>

<template>
  <aside
    ref="sidebarRef"
    id="docs-sidebar"
    :aria-label="t('common_docs_sidebar_label')"
    :aria-hidden="isMobileClosed ? 'true' : undefined"
    :inert="isMobileClosed || undefined"
    :tabindex="isMobileOpen ? -1 : undefined"
    :class="[
      'border-surface-200/80 bg-surface-50/98 dark:border-surface-700 dark:bg-surface-900/98 min-h-0 w-72 shrink-0 border-e shadow-(--shadow-elevated) lg:shadow-none',
      'overflow-y-auto p-4 lg:sticky lg:top-0 lg:h-full',
      'fixed inset-y-16 inset-s-0 z-(--z-drawer) lg:relative lg:inset-auto',
      open ? 'translate-x-0' : 'max-lg:ltr:-translate-x-full max-lg:rtl:translate-x-full',
      'transition-transform duration-200',
    ]"
  >
    <RouterLink
      to="/docs"
      :class="[
        itemLinkClass,
        'mb-3 font-semibold',
        currentSlug === ''
          ? 'bg-primary-50 dark:bg-primary-950/30 text-primary-700 dark:text-primary-300'
          : 'text-foreground hover:bg-surface-100 dark:hover:bg-surface-800',
      ]"
      :aria-current="currentSlug === '' ? 'page' : undefined"
      @click="closeSidebarAfterNavigation"
    >
      {{ t('common_documentation') }}
    </RouterLink>

    <nav :aria-label="t('common_documentation')" class="space-y-4 lg:space-y-3">
      <section v-for="section in sections" :key="section.key">
        <h2
          :id="`docs-section-${section.key}`"
          class="text-muted-foreground mb-2 px-3 text-xs font-bold tracking-wider uppercase"
        >
          {{ section.label }}
        </h2>

        <ul class="list-none space-y-1 p-0" :aria-labelledby="`docs-section-${section.key}`">
          <li
            v-for="entry in section.entries"
            :key="entry.kind === 'item' ? entry.doc.slug : entry.group.key"
          >
            <RouterLink
              v-if="entry.kind === 'item'"
              :to="entry.doc.slug ? `/docs/${entry.doc.slug}` : '/docs'"
              :class="[
                itemLinkClass,
                isActive(entry.doc.slug)
                  ? 'bg-primary-50 dark:bg-primary-950/30 text-primary-700 dark:text-primary-300 font-semibold'
                  : 'text-muted-foreground hover:bg-surface-100 dark:hover:bg-surface-800 hover:text-surface-900 dark:hover:text-surface-100',
              ]"
              :aria-current="isActive(entry.doc.slug) ? 'page' : undefined"
              @click="closeSidebarAfterNavigation"
            >
              {{ entry.doc.title }}
            </RouterLink>

            <template v-else>
              <button
                type="button"
                :class="[
                  itemLinkClass,
                  'justify-between font-semibold',
                  isGroupActive(entry.group)
                    ? 'bg-surface-100 text-surface-900 dark:bg-surface-800 dark:text-surface-100'
                    : 'text-foreground hover:bg-surface-100 dark:hover:bg-surface-800 hover:text-surface-900 dark:hover:text-surface-100',
                ]"
                :aria-expanded="isGroupExpanded(entry.group.key)"
                :aria-controls="getGroupPanelId(entry.group.key)"
                @click="emit('toggleGroup', entry.group.key)"
              >
                <span class="min-w-0 truncate">{{ entry.group.label }}</span>
                <span
                  :class="[
                    'i-solar-alt-arrow-right-linear h-4 w-4 shrink-0 transition-transform duration-200',
                    isGroupExpanded(entry.group.key) ? 'rotate-90' : '',
                  ]"
                  aria-hidden="true"
                />
              </button>

              <ul
                v-show="isGroupExpanded(entry.group.key)"
                :id="getGroupPanelId(entry.group.key)"
                class="border-surface-200 dark:border-surface-700 ms-6 mt-1 list-none space-y-1 border-s p-0"
              >
                <li v-for="sub in entry.group.items" :key="sub.slug">
                  <RouterLink
                    :to="`/docs/${sub.slug}`"
                    :class="[
                      childLinkClass,
                      isActive(sub.slug)
                        ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/30 dark:text-primary-300 font-semibold'
                        : 'text-muted-foreground hover:bg-surface-100 dark:hover:bg-surface-800 hover:text-surface-900 dark:hover:text-surface-100',
                    ]"
                    :aria-current="isActive(sub.slug) ? 'page' : undefined"
                    @click="closeSidebarAfterNavigation"
                  >
                    {{ sub.title }}
                  </RouterLink>
                </li>
              </ul>
            </template>
          </li>
        </ul>
      </section>
    </nav>
  </aside>

  <div
    v-if="isMobileOpen"
    class="fixed inset-0 z-(--z-drawer-backdrop) bg-black/30 lg:hidden"
    aria-hidden="true"
    @click="closeSidebar()"
  />
</template>
