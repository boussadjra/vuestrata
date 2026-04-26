import { createScopedLogger } from '~/lib/logger'
import { useAppStore } from '~/stores/app'

const uiLogger = createScopedLogger('ui-provider')

export function useUiProvider() {
  const appStore = useAppStore()
  return {
    provider: appStore.uiProvider,
    setProvider: appStore.setUiProvider.bind(appStore),
  }
}

const KNOWN_PROVIDERS = ['reka', 'vuetify0'] as const
// Component names are interpolated into dynamic import paths, so constrain
// them to a safe PascalCase alphabet to prevent path traversal.
const COMPONENT_NAME_RE = /^[A-Z][A-Za-z0-9]+$/

/**
 * Resolve an adapter component dynamically based on active provider.
 * Use `:key="appStore.uiProvider"` on the parent container to remount
 * the subtree when the provider changes (key-flush strategy).
 */
export function resolveUiComponent(name: string): Component {
  if (!COMPONENT_NAME_RE.test(name)) {
    throw new Error(
      `resolveUiComponent: invalid component name "${name}" (expected PascalCase identifier).`,
    )
  }
  const appStore = useAppStore()
  return defineAsyncComponent(() => {
    const p = appStore.uiProvider
    if (!KNOWN_PROVIDERS.includes(p as (typeof KNOWN_PROVIDERS)[number])) {
      uiLogger.warn(`Unknown UI provider "${p}", falling back to reka`)
    }
    if (p === 'vuetify0') {
      return import(`../components/ui/provider/vuetify0/V0${name}.vue`).catch(() => {
        uiLogger.warn(`V0${name} not found, falling back to Reka${name}`)
        return import(`../components/ui/provider/reka/Reka${name}.vue`)
      })
    }
    return import(`../components/ui/provider/reka/Reka${name}.vue`)
  })
}
