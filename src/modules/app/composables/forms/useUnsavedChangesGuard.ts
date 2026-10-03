import type { MaybeRefOrGetter } from 'vue'
import {
  matchedRouteKey,
  onBeforeRouteLeave,
  onBeforeRouteUpdate,
  routerKey,
  type RouteLocationNormalized,
} from 'vue-router'

/**
 * Ask before unsaved changes are thrown away.
 *
 * Two ways out of a page lose what was typed into it, and they need different
 * handling:
 *
 *   - a navigation inside the app, which this holds until the user answers
 *     `isPrompting`. Bind it to `UiUnsavedChangesDialog`, which is what
 *     `UiForm` does for `confirm-leave`:
 *
 *         const guard = useUnsavedChangesGuard(() => isDirty.value)
 *
 *         <UiUnsavedChangesDialog
 *           :open="guard.isPrompting.value"
 *           @stay="guard.stay"
 *           @leave="guard.leave"
 *         />
 *
 *     Something must answer: a held navigation with no dialog on screen is a
 *     link that silently does nothing.
 *   - a reload, a closed tab or a typed address, where the browser asks in its
 *     own words (`beforeunload`). No page may put its own dialog there. The
 *     listener exists only while there is something to lose, because a page
 *     that always has one is kept out of the browser's back/forward cache.
 *
 * Nothing is asked once the form is clean again, so a save that re-baselines
 * the form (as `UiForm`'s `action` does) can navigate away at once.
 *
 * Navigation is this composable's job, which is why it reads the router. It
 * must be called in `setup()`. Inside a routed page it guards that page's
 * route; anywhere else (a layout, a dialog outside `<RouterView>`) it guards
 * every navigation for as long as the caller is mounted.
 */
export interface UnsavedChangesGuardOptions {
  /** Off, the guard never asks and never blocks. Defaults to on. */
  enabled?: MaybeRefOrGetter<boolean>
}

export function useUnsavedChangesGuard(
  isDirty: MaybeRefOrGetter<boolean>,
  options: UnsavedChangesGuardOptions = {},
) {
  const isPrompting = shallowRef(false)
  const isBlocking = computed(() => toValue(options.enabled ?? true) && toValue(isDirty))
  const pending: { answer: ((leave: boolean) => void) | null } = { answer: null }

  function settle(leave: boolean): void {
    const answer = pending.answer
    pending.answer = null
    isPrompting.value = false
    answer?.(leave)
  }

  function ask(): Promise<boolean> {
    // A second navigation while the question is open: the first one stays.
    pending.answer?.(false)
    isPrompting.value = true
    return new Promise((resolve) => {
      pending.answer = resolve
    })
  }

  function guard(to: RouteLocationNormalized, from: RouteLocationNormalized) {
    if (!isBlocking.value) return true
    // A query or a hash change (a tab, a filter, an anchor) keeps the page and
    // what was typed into it.
    if (to.path === from.path) return true
    return ask()
  }

  if (inject(matchedRouteKey, null)) {
    onBeforeRouteLeave(guard)
    // `/customers/1/edit` → `/customers/2/edit` reuses the page for another record.
    onBeforeRouteUpdate(guard)
  } else {
    const router = inject(routerKey, null)
    if (router) onScopeDispose(router.beforeEach(guard))
  }

  function onBeforeUnload(event: BeforeUnloadEvent): void {
    event.preventDefault()
    // What Chrome and Safari still look at; the text itself is never shown.
    event.returnValue = ''
  }

  watch(
    isBlocking,
    (blocking) => {
      if (blocking) window.addEventListener('beforeunload', onBeforeUnload)
      else window.removeEventListener('beforeunload', onBeforeUnload)
    },
    { immediate: true, flush: 'sync' },
  )

  onScopeDispose(() => {
    window.removeEventListener('beforeunload', onBeforeUnload)
    // Nobody is left to answer, so a navigation still waiting stays put.
    settle(false)
  })

  return {
    /** A navigation is waiting for an answer. */
    isPrompting: readonly(isPrompting),
    /** There are unsaved changes and the guard is on. */
    isBlocking,
    /** Answer: keep editing. The navigation is cancelled. */
    stay: () => settle(false),
    /** Answer: discard the changes. The navigation goes ahead. */
    leave: () => settle(true),
  }
}
