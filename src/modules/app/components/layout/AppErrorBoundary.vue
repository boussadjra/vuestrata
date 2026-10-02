<script setup lang="ts">
import { nextTick, onBeforeUnmount, onErrorCaptured, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import { pendingStaleChunkReloadMs } from '@/bootstrap/stale-chunk-reload'
import { UiButton } from '@/components/ui'
import { resolveIcon } from '@/config/icon-provider'
import {
  normalizeError,
  parseVueErrorInfo,
  reportError,
  type ErrorReportContext,
} from '@/lib/errors'
import { logger } from '@/lib/logger'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()

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
}

const failure = shallowRef<Failure | null>(null)
const heading = ref<HTMLElement | null>(null)

/**
 * How many times a component may fail to render before the boundary gives up on
 * it. Three, not two: the usual transient case is a template reading data that
 * is not there yet, and it fails on mount and again when a loading flag flips,
 * then renders once the data lands.
 */
const RENDER_FAILURE_LIMIT = 3

// Render failures since the last reset, per component instance. Per instance
// because a list of rows that each fail once is ten transient errors, not one
// component that keeps failing.
const renderFailures = { counts: new WeakMap<object, number>() }

// Set while an error is being held back for a page reload that is on its way.
const held: { timer?: ReturnType<typeof setTimeout> } = {}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

function reset(): void {
  clearTimeout(held.timer)
  held.timer = undefined
  failure.value = null
  renderFailures.counts = new WeakMap()
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
 * Decide whether an error from below is fatal for the route subtree.
 *
 * Only errors that leave the subtree unable to render are shown as a screen:
 * a failed `setup()` (async ones included) or a failed async component loader,
 * and a render function that keeps failing. A watcher, a lifecycle hook, an
 * event handler or a one-off render error recovers on its own, and trapping the
 * UI for it would turn a failed click into a dead page. Those return
 * `undefined`, so Vue carries on to `app.config.errorHandler`, which reports
 * them.
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
  // The same visitor, the other way round: the page they left failed after
  // they left it. It is not on screen, so it cannot have broken what is.
  if (instance?.$.isUnmounted) return

  if (!parsed.fatal) {
    if (!instance) return
    const seen = (renderFailures.counts.get(instance) ?? 0) + 1
    renderFailures.counts.set(instance, seen)
    if (seen < RENDER_FAILURE_LIMIT) return
  }

  const component = instance?.$options?.name ?? instance?.$options?.__name
  raise({
    kind: 'render',
    error: toError(err),
    report: { source: 'vue:boundary', component, info },
  })
  return false
})

// A failed dynamic import during navigation never reaches `onErrorCaptured`:
// the router rejects the navigation and the click appears to do nothing.
// `plugins/stale-chunk.ts` reloads once for a missing chunk, from the listener
// in `plugins/router.ts` that runs before this one. What a reload does not fix,
// a second failure or a guard that threw, gets a screen here.
const removeRouterErrorListener = router.onError((error, to) => {
  raise({
    kind: 'navigation',
    error: toError(error),
    report: { source: 'vue:router', component: to.path },
    target: to.fullPath,
  })
})

onBeforeUnmount(() => {
  clearTimeout(held.timer)
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
          failure.kind === 'navigation'
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
