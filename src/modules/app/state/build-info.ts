import { appConfig } from '~/config/app.config'
import { createScopedLogger } from '~/lib/logger'

const buildInfoLogger = createScopedLogger('build-info')

/**
 * What `dist/version.json` contains. Written at build time by
 * `scripts/build/write-version.mjs`.
 */
export interface BuildInfo {
  name: string
  version: string
  /** Git SHA, or 'unknown' when the build supplied none. */
  release: string
  runtimeMode: string
  buildTime: string
}

/**
 * How often to check whether a newer build has been deployed.
 *
 * Fifteen minutes: frequent enough that a long-lived tab notices a deploy
 * within a reasonable window, rare enough to be invisible in request volume.
 * The response is a few hundred bytes and served from the same origin.
 */
const POLL_INTERVAL_MS = 15 * 60 * 1000

/**
 * Identity of the running build, and whether a newer one has shipped.
 *
 * Two gaps this closes. First, nothing could answer "which commit is live?" —
 * `VUESTRATA_RELEASE` was passed at build time but only ever reached the error
 * reporter, so without an error to inspect there was no way to tell. Second,
 * an open tab had no idea a deploy had happened; it found out by failing to
 * load a chunk (see plugins/stale-chunk.ts), which is recovery, not notice.
 *
 * `updateAvailable` is advisory. It deliberately does NOT reload: interrupting
 * someone mid-form to install a new frontend is worse than letting them finish.
 * Surface it as a dismissible prompt and let the user choose.
 */
export const useBuildInfo = createGlobalState(() => {
  const current = ref<BuildInfo | null>(null)
  const latest = ref<BuildInfo | null>(null)

  const updateAvailable = computed(() => {
    const from = current.value?.release
    const to = latest.value?.release
    // 'unknown' on either side means the build carried no identifier, so a
    // difference proves nothing. Never prompt on a comparison that cannot
    // distinguish "new deploy" from "no data".
    if (!from || !to || from === 'unknown' || to === 'unknown') return false
    return from !== to
  })

  async function fetchVersion(): Promise<BuildInfo | null> {
    try {
      // `cache: 'no-store'` matters: version.json is served with a
      // must-revalidate policy, but a bfcache or an intermediary that ignores
      // that would hand back the very build we are trying to compare against.
      const response = await fetch('/version.json', { cache: 'no-store' })
      if (!response.ok) return null
      return (await response.json()) as BuildInfo
    } catch {
      // Offline, or the host does not serve version.json. Neither is an error
      // worth surfacing — this is a background nicety, not a feature.
      return null
    }
  }

  /**
   * Read the running build's identity, then poll for newer ones.
   *
   * Returns a stop function. Skipped entirely in demo mode: the hosted demo
   * redeploys on every push and would nag its visitors constantly.
   */
  async function start(): Promise<() => void> {
    if (appConfig.runtimeMode === 'demo') return () => {}

    current.value = await fetchVersion()
    if (!current.value) {
      buildInfoLogger.debug('No /version.json served — deploy detection is off.')
      return () => {}
    }

    buildInfoLogger.info(`Running release ${current.value.release}.`)

    const timer = window.setInterval(async () => {
      // Nothing to learn while the tab is hidden, and polling backgrounded tabs
      // is how a harmless check turns into battery drain.
      if (document.visibilityState !== 'visible') return
      const next = await fetchVersion()
      if (next) latest.value = next
    }, POLL_INTERVAL_MS)

    return () => window.clearInterval(timer)
  }

  return { current, latest, updateAvailable, start }
})
