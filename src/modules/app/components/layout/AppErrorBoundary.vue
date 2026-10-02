<script setup lang="ts">
import {
  getCurrentInstance,
  nextTick,
  onBeforeUnmount,
  onErrorCaptured,
  ref,
  shallowRef,
  watch,
  type ComponentInternalInstance,
  type ComponentPublicInstance,
  type SuspenseBoundary,
  type VNode,
} from 'vue'
import { useI18n } from 'vue-i18n'
import { START_LOCATION, useRoute, useRouter, type RouteLocationNormalized } from 'vue-router'

import { pendingStaleChunkReloadMs } from '@/bootstrap/stale-chunk-reload'
import { UiButton } from '@/components/ui'
import { resolveIcon } from '@/config/icon-provider'
import {
  normalizeError,
  parseVueErrorInfo,
  reportError,
  type ErrorReportContext,
  type VueErrorCode,
} from '@/lib/errors'
import { logger } from '@/lib/logger'
import { isStaleChunkError } from '@/plugins/stale-chunk'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const boundary = getCurrentInstance()

/**
 * What stopped the page, and therefore what "Retry" has to redo.
 *   render      — a route component failed while it was being created or drawn
 *   navigation  — the router could not load the next route's chunk, or a guard threw
 */
interface Failure {
  kind: 'render' | 'navigation'
  error: Error
  /** What it is reported with. */
  report: ErrorReportContext
  /** The location a failed navigation was heading for. */
  target?: string
  /**
   * A file the page needs could not be fetched, so mounting the page again
   * cannot help: Chromium keeps a dynamic import that failed for as long as the
   * document lives, and asking again fails again without a request ever leaving
   * the browser. Retry has to be a page load.
   */
  needsPageLoad?: boolean
}

const failure = shallowRef<Failure | null>(null)
const heading = ref<HTMLElement | null>(null)

// Vue's codes for where an error surfaced. `vue-error-info.test.ts` pins them
// to the installed version.
const SETUP: VueErrorCode = 0
const RENDER: VueErrorCode = 1
const ASYNC_LOADER: VueErrorCode = 13

/**
 * How many times in a row a component may fail to render before the boundary
 * gives up on it. Three, not two: the usual transient case is a template
 * reading data that is not there yet, and it fails on mount and again when a
 * loading flag flips, then renders once the data lands.
 */
const RENDER_FAILURE_LIMIT = 3

/**
 * How long a failed component update is remembered. Vue gives no sign of an
 * update that went through, so for these "in a row" can only mean "close
 * together".
 */
const UPDATE_FAILURE_WINDOW_MS = 5000

interface RenderFailures {
  count: number
  at: number
  /** What the component was left showing by the failure. */
  tree?: VNode
}

// Render failures in a row, per component instance. Per instance because a list
// of rows that each fail once is ten transient errors, not one component that
// keeps failing.
const renderFailures = { seen: new WeakMap<object, RenderFailures>() }

// Set while an error is being held back for a page reload that is on its way.
const held: { timer?: ReturnType<typeof setTimeout> } = {}

// Failed async component loaders waiting to see what their wrapper renders.
const loaderChecks = new Set<ReturnType<typeof setTimeout>>()

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

function reset(): void {
  clearTimeout(held.timer)
  held.timer = undefined
  failure.value = null
  renderFailures.seen = new WeakMap()
}

/**
 * Show the error state for `next`, and report it.
 *
 * Not while a stale-chunk reload is on its way: `plugins/stale-chunk.ts` has
 * asked for one, the page is about to be replaced, and the errors that arrive in
 * the meantime are the same missing chunk seen from other angles. They are held
 * for as long as the reload is given, and shown only if the page is still here.
 */
function raise(next: Failure): void {
  const wait = pendingStaleChunkReloadMs()
  if (wait > 0) {
    held.timer ??= setTimeout(() => {
      held.timer = undefined
      raise(next)
    }, wait)
    return
  }

  logger.error(next.kind === 'render' ? 'Vue error boundary:' : 'Navigation failed:', {
    err: next.error,
    ...next.report,
  })
  // For a render failure this is the only report there will be: the hook below
  // returns `false`, which stops Vue calling `app.config.errorHandler`, and that
  // is what reports everything else.
  reportError(next.error, next.report)

  if (next.kind === 'navigation') {
    // Always the newest. With the error state already up, a navigation can only
    // have come from its own buttons or from Back, and that is the failure the
    // visitor is now looking at.
    failure.value = next
  } else {
    // The first failure is the cause; the ones that follow are usually the
    // rest of the same subtree falling over.
    failure.value ??= next
  }
}

/**
 * Give an error the boundary decided not to trap to `app.config.errorHandler`,
 * which is where Vue would have taken it. Only for a decision made after the
 * hook had to return: an error turned away inside the hook gets there by the
 * hook returning nothing.
 */
function handOn(err: unknown, instance: ComponentPublicInstance | null, info: string): void {
  const handler = boundary?.appContext.config.errorHandler
  try {
    if (handler) handler(err, instance, info)
    else logger.error('Vue error:', { err, info })
  } catch (handlerError) {
    logger.error('The app error handler threw:', { err: handlerError })
  }
}

/**
 * Count a render failure, and return how many this component has now had in a
 * row.
 *
 * In a row, not in total. A detail panel that throws for one bad record, or a
 * template that reads data which is briefly undefined on every refetch, fails
 * and recovers any number of times on a long-lived page, and a total would trap
 * it on the third.
 *
 * A render function that throws has not replaced the component's tree yet, so
 * the tree is still the one the previous failure left behind exactly when
 * nothing rendered in between. A failed update (the render worked, applying it
 * did not) has no such sign, so those are counted while they come close
 * together.
 */
function countRenderFailure(instance: ComponentPublicInstance, code: VueErrorCode | null): number {
  const internal = instance.$
  const last = renderFailures.seen.get(internal)
  const now = Date.now()
  let inARow = false
  if (last) {
    inARow =
      code === RENDER
        ? last.tree !== undefined && internal.subTree === last.tree
        : now - last.at < UPDATE_FAILURE_WINDOW_MS
  }

  const entry: RenderFailures = { count: inARow && last ? last.count + 1 : 1, at: now }
  renderFailures.seen.set(internal, entry)
  // Vue puts the placeholder for a failed render in place once this hook has
  // returned, so it can only be read afterwards.
  queueMicrotask(() => {
    entry.tree = internal.subTree
  })
  return entry.count
}

/**
 * Whether the page a component belongs to is already on screen.
 *
 * A `setup()` that throws leaves that one component empty. While the page is
 * still coming up that is a page which never rendered, and it gets the error
 * state. Once the page is up it is one missing piece of a page the visitor is
 * using: a dialog opened by a click, the panel of a tab. Replacing the page for
 * that would throw away the form they were filling in, so it is left to
 * `app.config.errorHandler`.
 *
 * "The page" is the nearest route component above the one that failed. With no
 * route component above it there is nothing to say the page is safe, and the
 * answer is no.
 */
function pageIsOnScreen(instance: ComponentPublicInstance): boolean {
  const routeComponents = new Set<unknown>()
  for (const record of router.currentRoute.value.matched) {
    for (const component of Object.values(record.components ?? {})) routeComponents.add(component)
  }
  // A route component that fails is the page failing.
  if (routeComponents.has(instance.$.type)) return false

  for (let above = instance.$.parent; above && above !== boundary; above = above.parent) {
    if (!routeComponents.has(above.type)) continue
    // Mounted, and not inside a `<Suspense>` that is still waiting to show it:
    // on a first load the page mounts off screen while its async parts load.
    return above.isMounted && !suspenseOf(above)?.pendingBranch
  }
  return false
}

/**
 * The `<Suspense>` a component was created under. Vue keeps it on the instance
 * and leaves it out of the published type; `app-error-boundary.test.ts` has a
 * case that fails if it stops being there.
 */
function suspenseOf(instance: ComponentInternalInstance): SuspenseBoundary | null | undefined {
  return (instance as ComponentInternalInstance & { suspense?: SuspenseBoundary | null }).suspense
}

/**
 * Whether a `defineAsyncComponent()` wrapper went on to show its own
 * `errorComponent`.
 *
 * Vue calls the error hooks for a failed loader whether or not the wrapper has
 * an `errorComponent`, and nothing it passes says which. What tells them apart
 * is what the wrapper renders next: its `errorComponent`, which it hands the
 * error as a prop, or nothing. `app-error-boundary.test.ts` pins this against
 * the installed Vue.
 */
function showsItsOwnError(wrapper: ComponentPublicInstance, err: unknown): boolean {
  const shown = wrapper.$.subTree as VNode | null | undefined
  return shown?.props?.error === err
}

/**
 * Run `check` once the wrapper of a failed loader has rendered what it is going
 * to render. A task, not a microtask: inside `<Suspense>` the wrapper renders
 * several promise turns after the hook was called.
 */
function afterLoaderSettles(check: () => void): void {
  const timer = setTimeout(() => {
    loaderChecks.delete(timer)
    check()
  }, 0)
  loaderChecks.add(timer)
}

/**
 * Decide whether an error from below is fatal for the route subtree.
 *
 * Only errors that leave the page unable to render are shown as a screen: a
 * `setup()` that fails while the page is coming up (async ones included), an
 * async component loader that fails with nothing of its own to show for it, and
 * a render function that keeps failing. A watcher, a lifecycle hook, an event
 * handler or a one-off render error recovers on its own, and trapping the UI
 * for it would turn a failed click into a dead page. Those return `undefined`,
 * so Vue carries on to `app.config.errorHandler`, which reports them.
 *
 * Vue passes `info` as a readable name in development and as a
 * `https://vuejs.org/error-reference/#runtime-N` URL in production; the parser
 * handles both. Matching the readable form only, as this used to, meant the
 * boundary never fired in production.
 */
onErrorCaptured((err, instance, info) => {
  const parsed = parseVueErrorInfo(info)
  if (!parsed.fatal && !parsed.fatalIfRepeated) return

  // A request the app cancelled itself rejects like a failure and is not one.
  // It reaches here through an async `setup()` that was still loading when the
  // visitor moved on.
  if (normalizeError(err).kind === 'aborted') return

  if (failure.value) {
    // One incident, one report. Until the error state has rendered, everything
    // below is the page that failed, still falling over; after that, what is
    // left of it are its unmounted components, whose imports and async setups
    // go on rejecting. A component that is still mounted by then belongs to the
    // error state itself, and its error is not this incident.
    return heading.value && !instance?.$.isUnmounted ? undefined : false
  }
  // The same visitor, the other way round: the page they left failed after
  // they left it. It is not on screen, so it cannot have broken what is.
  if (instance?.$.isUnmounted) return

  if (parsed.fatalIfRepeated) {
    if (!instance || countRenderFailure(instance, parsed.code) < RENDER_FAILURE_LIMIT) return
  } else if (parsed.code === SETUP && instance && pageIsOnScreen(instance)) {
    return
  }

  const next: Failure = {
    kind: 'render',
    error: toError(err),
    report: {
      source: 'vue:boundary',
      component: instance?.$options?.name ?? instance?.$options?.__name,
      info,
    },
    needsPageLoad: parsed.code === ASYNC_LOADER || isStaleChunkError(err),
  }

  if (parsed.code === ASYNC_LOADER && instance) {
    // Whether this one is the boundary's depends on what the wrapper renders,
    // which it has not done yet. Vue is told it was handled, and whichever way
    // it goes it is reported once.
    afterLoaderSettles(() => {
      // Another failure of the same page got there first.
      if (failure.value) return
      if (instance.$.isUnmounted || showsItsOwnError(instance, err)) handOn(err, instance, info)
      else raise(next)
    })
    return false
  }

  raise(next)
  return false
})

/**
 * Whether a router error is about the route already on screen.
 *
 * vue-router sends more than failed navigations to `onError`: a
 * `scrollBehavior` that throws arrives there too, after the navigation it
 * belongs to has succeeded and the page has rendered.
 */
function isCurrentRoute(to: RouteLocationNormalized): boolean {
  const current = router.currentRoute.value
  return current !== START_LOCATION && (to === current || to.fullPath === current.fullPath)
}

// A failed dynamic import during navigation never reaches `onErrorCaptured`:
// the router rejects the navigation and the click appears to do nothing.
// `plugins/stale-chunk.ts` reloads once for a missing chunk, from the listener
// in `plugins/router.ts` that runs before this one. What a reload does not fix,
// a second failure or a guard that threw, gets a screen here.
const removeRouterErrorListener = router.onError((error, to) => {
  // The page loaded, and replacing it with "could not be loaded" would be
  // untrue. Nothing to report either: vue-router rejects a promise nobody holds
  // for this, and `installErrorHandlers()` reports the unhandled rejection.
  if (isCurrentRoute(to)) return
  raise({
    kind: 'navigation',
    error: toError(error),
    report: { source: 'vue:router', component: to.path },
    target: to.fullPath,
  })
})

onBeforeUnmount(() => {
  clearTimeout(held.timer)
  for (const timer of loaderChecks) clearTimeout(timer)
  loaderChecks.clear()
  removeRouterErrorListener()
})

// Leaving the page resets the boundary, so Back, or a link in a layout that
// rendered before the failure, is never met by a stale error screen.
watch(() => route.fullPath, reset)

// The alert replaces the whole page, including the layout the user was in, so
// focus has nowhere sensible to be. Put it on the heading.
watch(failure, async (value) => {
  if (!value) return
  await nextTick()
  heading.value?.focus()
})

function retry(): void {
  const current = failure.value
  if (current?.kind === 'navigation' && current.target) {
    // A failed navigation did not move the route, so it has to be asked for
    // again, and with a page load rather than `router.push()`: Chromium keeps a
    // dynamic import that failed for as long as the document lives, so asking
    // the router again fails again without a request ever leaving the browser.
    window.location.assign(router.resolve(current.target).href)
    return
  }
  if (current?.needsPageLoad) {
    // The same, for a component the page loads lazily: the route is already
    // this one, so it is a reload.
    window.location.reload()
    return
  }
  // Clearing the failure mounts the route subtree from scratch.
  reset()
}

/**
 * A navigation that moves the route resets the boundary through the watcher
 * above, and one that fails puts its own failure up. What is left is the one
 * that goes nowhere because the visitor is already there: home is the page that
 * failed, and it has to be mounted again by hand.
 */
async function goHome(): Promise<void> {
  const shown = failure.value
  await router.push('/').catch(() => undefined)
  if (failure.value === shown) reset()
}

function reload(): void {
  window.location.reload()
}
</script>

<template>
  <main
    v-if="failure"
    class="bg-background text-foreground flex min-h-screen items-center justify-center px-5 py-12"
    data-testid="app-error-boundary"
  >
    <section role="alert" class="w-full max-w-md text-center">
      <div
        class="bg-destructive-subtle mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl"
      >
        <span
          :class="[resolveIcon('danger-triangle'), 'text-destructive h-8 w-8']"
          aria-hidden="true"
        />
      </div>

      <h1
        ref="heading"
        tabindex="-1"
        class="text-foreground text-2xl font-bold tracking-tight focus:outline-none"
      >
        {{ t('common_error_title') }}
      </h1>
      <p class="text-muted-foreground mt-2 leading-relaxed">
        {{
          failure.kind === 'navigation' || failure.needsPageLoad
            ? t('app_error_load_description')
            : t('app_error_description')
        }}
      </p>

      <div class="mt-8 flex flex-wrap items-center justify-center gap-3">
        <UiButton variant="primary" data-testid="app-error-retry" @click="retry">
          {{ t('common_retry') }}
        </UiButton>
        <UiButton variant="secondary" data-testid="app-error-reload" @click="reload">
          {{ t('app_error_reload') }}
        </UiButton>
        <UiButton variant="ghost" data-testid="app-error-home" @click="goHome">
          {{ t('app_error_home') }}
        </UiButton>
      </div>
    </section>
  </main>

  <slot v-else />
</template>
