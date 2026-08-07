import type { Ref } from 'vue'

/**
 * Confine keyboard focus to a container while it is active.
 *
 * Written here rather than pulled from `@vueuse/integrations`, which would add
 * the `focus-trap` package as a peer dependency for one drawer. The behaviour a
 * modal actually needs is small and well-defined.
 *
 * Why it matters: a modal that does not trap focus lets Tab walk into the page
 * behind it. A sighted user sees the overlay and knows the page is blocked; a
 * screen-reader or keyboard-only user just finds themselves operating controls
 * they cannot see, with no way back (WCAG 2.4.3, 2.1.2).
 *
 * On deactivate, focus returns to whatever had it before — without that, focus
 * falls back to `<body>` and the user's place in the page is lost.
 */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',')

/**
 * Whether an element can actually receive focus.
 *
 * Deliberately NOT using `offsetParent !== null`, the usual shorthand: it
 * returns null for `position: fixed` elements even when they are perfectly
 * visible — and this trap's only caller is a fixed-position drawer, so that
 * check would have found nothing to focus. It is also unimplemented in jsdom,
 * which would make this untestable.
 *
 * `getComputedStyle` works in both, and answers the question directly.
 */
function isFocusable(element: HTMLElement): boolean {
  if (element.hasAttribute('inert') || element.closest('[inert]')) return false
  if (element.getAttribute('aria-hidden') === 'true') return false

  const style = getComputedStyle(element)
  if (style.display === 'none' || style.visibility === 'hidden') return false

  // An ancestor may be hidden without this element saying so.
  let parent = element.parentElement
  while (parent) {
    const parentStyle = getComputedStyle(parent)
    if (parentStyle.display === 'none' || parentStyle.visibility === 'hidden') return false
    parent = parent.parentElement
  }

  return true
}

function focusableWithin(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(isFocusable)
}

export function useFocusTrap(container: Ref<HTMLElement | null>) {
  const isActive = ref(false)
  const previouslyFocused = ref<HTMLElement | null>(null)

  function onKeydown(event: KeyboardEvent) {
    if (!isActive.value || event.key !== 'Tab') return

    const root = container.value
    if (!root) return

    const focusable = focusableWithin(root)
    if (focusable.length === 0) {
      // Nothing to focus inside: keep focus on the container itself rather
      // than letting Tab escape to the page behind.
      event.preventDefault()
      root.focus()
      return
    }

    const first = focusable[0]!
    const last = focusable[focusable.length - 1]!
    const active = document.activeElement

    if (event.shiftKey && (active === first || !root.contains(active))) {
      event.preventDefault()
      last.focus()
      return
    }
    if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  async function activate() {
    if (isActive.value || typeof document === 'undefined') return

    previouslyFocused.value =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    isActive.value = true

    // Wait a tick so the container is rendered and its children measurable
    // before we look for something to focus.
    await nextTick()
    const root = container.value
    if (!root) return
    const [first] = focusableWithin(root)
    ;(first ?? root).focus()
  }

  function deactivate() {
    if (!isActive.value) return
    isActive.value = false
    previouslyFocused.value?.focus()
    previouslyFocused.value = null
  }

  onMounted(() => document.addEventListener('keydown', onKeydown, true))
  onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKeydown, true)
    // Do not restore focus here — the element that had it is likely gone too.
    isActive.value = false
  })

  return { isActive, activate, deactivate }
}
