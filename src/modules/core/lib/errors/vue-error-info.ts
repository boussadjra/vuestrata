/**
 * What Vue's `info` argument means.
 *
 * `onErrorCaptured` and `app.config.errorHandler` receive a string describing
 * WHERE in the framework the error surfaced, and that string has two shapes:
 *
 *   - development: the readable name, `'setup function'`, `'render function'`
 *   - production:  a URL, `'https://vuejs.org/error-reference/#runtime-0'`,
 *                  because the name table is stripped from the production build
 *
 * Code that matches the readable form only works in development. The app's old
 * boundary tested `info.includes('async')`, which is a single dev string
 * (`'async component loader'`) and never matches a production URL — so in
 * production nothing was ever caught, and in development an async `setup()`
 * failure (which reports `'setup function'`) was missed as well.
 *
 * This module turns either shape into one answer. It imports nothing from Vue:
 * the numbers below are Vue's `ErrorCodes` and are pinned to the installed
 * version by `test/unit/lib/vue-error-info.test.ts`, so a Vue upgrade that
 * renumbers them fails a test instead of quietly mislabelling errors.
 */

/**
 * Vue's numeric error codes, and the lifecycle-hook keys, mapped to the
 * readable name development builds report. Mirrors `ErrorTypeStrings` in
 * `@vue/runtime-core` 3.5.
 *
 * A lifecycle hook is identified by its short key (`'bm'` for `beforeMount`),
 * not a number, and the production URL carries that key: `#runtime-bm`.
 */
const VUE_ERROR_NAMES = {
  sp: 'serverPrefetch hook',
  bc: 'beforeCreate hook',
  c: 'created hook',
  bm: 'beforeMount hook',
  m: 'mounted hook',
  bu: 'beforeUpdate hook',
  u: 'updated',
  bum: 'beforeUnmount hook',
  um: 'unmounted hook',
  a: 'activated hook',
  da: 'deactivated hook',
  ec: 'errorCaptured hook',
  rtc: 'renderTracked hook',
  rtg: 'renderTriggered hook',
  0: 'setup function',
  1: 'render function',
  2: 'watcher getter',
  3: 'watcher callback',
  4: 'watcher cleanup function',
  5: 'native event handler',
  6: 'component event handler',
  7: 'vnode hook',
  8: 'directive hook',
  9: 'transition hook',
  10: 'app errorHandler',
  11: 'app warnHandler',
  12: 'ref function',
  13: 'async component loader',
  14: 'scheduler flush',
  15: 'component update',
  16: 'app unmount cleanup function',
} as const

export type VueErrorCode = keyof typeof VUE_ERROR_NAMES

/**
 * The name → code lookup for development strings. Built once from the table
 * above so the two directions cannot drift apart.
 */
const CODE_BY_NAME = new Map<string, VueErrorCode>(
  (Object.entries(VUE_ERROR_NAMES) as Array<[string, string]>).map(([key, name]) => [
    name,
    (/^\d+$/.test(key) ? Number(key) : key) as VueErrorCode,
  ]),
)

/** Codes for which the subtree cannot go on: it never rendered, or never will. */
const FATAL_CODES: ReadonlySet<VueErrorCode> = new Set([
  0, // setup function — includes an async setup() that rejects (Suspense)
  13, // async component loader — a defineAsyncComponent() whose import failed
])

/**
 * Codes that are recoverable once but not when they keep coming back.
 *
 * A render function that throws leaves a comment node in the component's place
 * and re-runs on the next reactive change, which is usually all it takes: a
 * computed reading data an `onMounted` has not filled in yet fails once and then
 * renders. A component that goes on failing is not waiting for anything. How
 * many failures that takes is the caller's decision, because only the caller
 * can count them.
 */
const REPEAT_FATAL_CODES: ReadonlySet<VueErrorCode> = new Set([
  1, // render function
  15, // component update
])

export interface VueErrorInfo {
  /**
   * Vue's code for where the error surfaced, or `null` for a string this
   * module does not recognise (a newer Vue, or something that is not Vue's).
   */
  code: VueErrorCode | null
  /** The readable name, as a development build spells it. `'unknown'` when unmatched. */
  name: string
  /**
   * The subtree that raised it cannot recover: an error boundary should stop
   * rendering it. Setup failures (including async setup) and async component
   * loaders. Everything else — watchers, lifecycle hooks, event handlers,
   * directives, transitions, refs — is a callback that failed while the tree
   * stayed intact, and trapping the UI for it would turn a failed click handler
   * into a dead page.
   */
  fatal: boolean
  /**
   * Not fatal by itself, fatal when the same component keeps raising it: render
   * function and component update errors. The caller counts occurrences.
   */
  fatalIfRepeated: boolean
}

const UNKNOWN: VueErrorInfo = { code: null, name: 'unknown', fatal: false, fatalIfRepeated: false }

/**
 * The trailing code of a production info URL. Anchored on the fragment so a
 * future change to the host or path in front of it does not break parsing.
 */
const PRODUCTION_INFO = /#runtime-([a-z0-9]+)$/i

function describe(code: VueErrorCode): VueErrorInfo {
  return {
    code,
    name: VUE_ERROR_NAMES[code],
    fatal: FATAL_CODES.has(code),
    fatalIfRepeated: REPEAT_FATAL_CODES.has(code),
  }
}

/**
 * Classify the `info` string Vue hands an error hook. Anything it cannot place
 * is `fatal: false`: an error the boundary does not understand must not blank
 * the page, it falls through to `app.config.errorHandler` and is reported there.
 */
export function parseVueErrorInfo(info: unknown): VueErrorInfo {
  if (typeof info !== 'string' || info === '') return UNKNOWN

  const production = PRODUCTION_INFO.exec(info)
  if (production) {
    const key = production[1] as string
    const code = /^\d+$/.test(key) ? Number(key) : key
    return Object.hasOwn(VUE_ERROR_NAMES, key) ? describe(code as VueErrorCode) : UNKNOWN
  }

  const code = CODE_BY_NAME.get(info)
  return code === undefined ? UNKNOWN : describe(code)
}
