import { runtimeEnv } from '~/lib/config'
import type { AppConfig } from '~/types'

// Re-exported so app-layer code keeps importing configuration from one place.
// The schema itself lives in core/lib/config because the API client (also core)
// consumes it, and core must not depend on app.
export {
  AUTH_ADAPTER_ENV_KEY,
  AUTH_ADAPTERS,
  ENV_KEYS,
  ICON_PROVIDERS,
  RUNTIME_MODES,
  SESSION_PERSISTENCE_MODES,
  isDemoRuntime,
} from '~/lib/config'
export type {
  AuthAdapterName,
  IconProviderName,
  RuntimeEnv,
  RuntimeMode,
  SessionPersistence,
} from '~/lib/config'

/**
 * The configured auth adapter. Exported separately because it is read during
 * bootstrap before `appConfig` consumers exist.
 */
export const authAdapter = runtimeEnv.authAdapter

export const appConfig: AppConfig = {
  runtimeMode: runtimeEnv.runtimeMode,
  title: runtimeEnv.title,
  apiUrl: runtimeEnv.apiUrl,
  useMocks: runtimeEnv.useMocks,
  authProvider: runtimeEnv.authAdapter,
  sessionPersistence: runtimeEnv.sessionPersistence,
  iconProvider: runtimeEnv.iconProvider,
  theme: runtimeEnv.theme,
  demoAuth: runtimeEnv.demoAuth,
  errorReporting: runtimeEnv.errorReporting,
}
