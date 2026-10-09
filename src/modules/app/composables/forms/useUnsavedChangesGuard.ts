import { createGlobalState } from '@vueuse/core'
import type { MaybeRefOrGetter } from 'vue'
import {
  matchedRouteKey,
  onBeforeRouteLeave,
  onBeforeRouteUpdate,
  routerKey,
  type RouteLocationNormalized,
} from 'vue-router'

import { appEvents } from '~/lib/events'
import { useAuthStore } from '~/stores/auth'

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
 * **A session that ended is never held.** When the session expires, or the
 * user signs out, the app sends them to the login page, and "keep editing"
 * would leave them on a protected page with no session and changes that can
 * no longer be saved. So the guard stands down for as long as a session that
 * existed is gone: it lets every navigation through, answers a question that
 * is already open with "leave", and takes its `beforeunload` listener away.
 * It reads the auth store when it is asked, which no ordering of events can
 * get round, and listens for `auth.logout` so that a question on screen
 * closes the moment the session does. A page that never had a session (a
 * public form) is guarded as usual.
 *
 * A sign-out the user asked for is the one case with time to ask first:
 * `useAuth().logout()` awaits `confirmDiscardingChanges()` before it ends
 * anything.
 *
 * Navigation is this composable's job, which is why it reads the router. It
 * must be called in `setup()`. Inside a routed page it guards that page's
 * route; anywhere else (a layout, a dialog outside `<RouterView>`) it guards
 * every navigation for as long as the caller is mounted.
 */
export interface UnsavedChangesGuardOptions {
  /** Off, the guard never asks and never blocks. Defaults to on. */
  enabled?: MaybeRefOrGetter<boolean>
  /**
   * A navigation that must not be held, whatever was typed: answer `true` to
   * let it through unasked. For a project's own cases (a forced redirect to a
   * maintenance page, a step of the same wizard); the end of the session is
   * already one.
   */
  allow?: (to: RouteLocationNormalized, from: RouteLocationNormalized) => boolean
}

/**
 * The guards on screen, and what has been answered.
 *
 * Shared, because two dirty forms on one page are still one decision. The
 * router asks a page's guards one after the other, so the second one is
 * reached only after "discard", and takes that answer for the navigation it
 * was given for instead of asking again.
 */
const useLeaveQuestions = createGlobalState(() => ({
  /** Each answers with its question, or `null` when it has nothing unsaved. */
  askers: new Set<() => Promise<boolean> | null>(),
  answered: new WeakMap<RouteLocationNormalized, Promise<boolean>>(),
}))

/**
 * Ask every guard on screen that has unsaved changes whether they may go, and
 * answer `false` if the user would rather keep editing. `true` at once when
 * nothing is unsaved.
 *
 * For an action that loses the page without navigating first, a sign-out
 * above all: `if (!(await confirmDiscardingChanges())) return`.
 */
export async function confirmDiscardingChanges(): Promise<boolean> {
  // One question answers for every form on screen.
  for (const ask of useLeaveQuestions().askers) {
    const question = ask()
    if (question) return question
  }
  return true
}

/**
 * Whether the auth store holds a session, or `null` where there is no store
 * to ask (a component test, an embed with no Pinia). Read member by member,
 * and only members a store from 1.0 has: a project may have kept its own.
 */
function readSession(): (() => boolean) | null {
  try {
    const store = useAuthStore()
    return () => store.user !== null || store.token !== null
  } catch {
    return null
  }
}

export function useUnsavedChangesGuard(
  isDirty: MaybeRefOrGetter<boolean>,
  options: UnsavedChangesGuardOptions = {},
) {
  const questions = useLeaveQuestions()
  const isPrompting = shallowRef(false)
  const pending: { answer: ((leave: boolean) => void) | null } = { answer: null }

  // ─── The session ─────────────────────────────────────────

  const hasSession = readSession()
  /** A session existed while this guard was mounted. */
  const hadSession = shallowRef(hasSession?.() ?? false)
  /** The store may be one that announces nothing; the event is heard anyway. */
  const endAnnounced = shallowRef(false)
  const sessionEnded = computed(() => {
    if (!hasSession) return endAnnounced.value
    if (hasSession()) return false
    return hadSession.value || endAnnounced.value
  })

  if (hasSession) {
    watch(
      hasSession,
      (has) => {
        if (!has) return
        hadSession.value = true
        endAnnounced.value = false
      },
      { flush: 'sync' },
    )
  }

  const isBlocking = computed(
    () => toValue(options.enabled ?? true) && toValue(isDirty) && !sessionEnded.value,
  )

  // ─── The question ────────────────────────────────────────

  function settle(leave: boolean): void {
    const answer = pending.answer
    pending.answer = null
    isPrompting.value = false
    answer?.(leave)
  }

  function ask(): Promise<boolean> {
    // A second navigation while the question is open: the first one stays,
    // and the question now stands for the second.
    pending.answer?.(false)
    isPrompting.value = true
    return new Promise<boolean>((resolve) => {
      pending.answer = resolve
    })
  }

  const askIfBlocking = () => (isBlocking.value ? ask() : null)
  questions.askers.add(askIfBlocking)

  function guard(to: RouteLocationNormalized, from: RouteLocationNormalized) {
    if (!isBlocking.value) return true
    // A query or a hash change (a tab, a filter, an anchor) keeps the page and
    // what was typed into it.
    if (to.path === from.path) return true
    if (options.allow?.(to, from)) return true
    // Another guard on the page was already asked about this navigation.
    const answered = questions.answered.get(to)
    if (answered) return answered
    const question = ask()
    questions.answered.set(to, question)
    return question
  }

  if (inject(matchedRouteKey, null)) {
    onBeforeRouteLeave(guard)
    // `/customers/1/edit` → `/customers/2/edit` reuses the page for another record.
    onBeforeRouteUpdate(guard)
  } else {
    const router = inject(routerKey, null)
    if (router) onScopeDispose(router.beforeEach(guard))
  }

  // The session ended with a question on screen: it is answered, because the
  // redirect behind it is not the user's to cancel.
  const stopListening = appEvents.on('auth.logout', () => {
    endAnnounced.value = !hasSession || !hasSession()
    if (sessionEnded.value) settle(true)
  })
  watch(
    sessionEnded,
    (ended) => {
      if (ended) settle(true)
    },
    { flush: 'sync' },
  )

  // ─── Leaving the app ─────────────────────────────────────

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
    stopListening()
    questions.askers.delete(askIfBlocking)
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
