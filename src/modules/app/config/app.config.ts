import { createScopedLogger } from '~/lib/logger'
import type { AppConfig } from '~/types'

// Canonical auth env key: keep the existing VUESTRATA_ prefix convention and use
// VUESTRATA_AUTH_ADAPTER consistently across runtime code, env examples, and docs.
export const AUTH_ADAPTER_ENV_KEY = 'VUESTRATA_AUTH_ADAPTER' as const

const configLogger = createScopedLogger('app-config')

const VALID_AUTH_PROVIDERS = ['mock', 'jwt', 'oauth'] as const satisfies ReadonlyArray<
  AppConfig['authProvider']
>
const VALID_UI_PROVIDERS = ['reka', 'vuetify0'] as const satisfies ReadonlyArray<
  AppConfig['uiProvider']
>
const VALID_ICON_PROVIDERS = ['solar', 'lucide', 'heroicons'] as const satisfies ReadonlyArray<
  AppConfig['iconProvider']
>
const VALID_VALIDATION_ADAPTERS = ['zod', 'valibot', 'yup'] as const satisfies ReadonlyArray<
  AppConfig['validationAdapter']
>

/**
 * Validate an env value against a fixed allowlist and fall back to a default
 * when unset or invalid. Unsafe `as` casts on env vars are a security and
 * correctness hazard — prefer this helper at every env boundary.
 */
function pickEnum<T extends string>(
  envKey: string,
  value: unknown,
  allowed: ReadonlyArray<T>,
  fallback: T,
): T {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'string' && (allowed as ReadonlyArray<string>).includes(value)) {
    return value as T
  }
  configLogger.warn(
    `Invalid ${envKey} value ${JSON.stringify(value)} — expected one of ${allowed.join(', ')}. Falling back to "${fallback}".`,
  )
  return fallback
}

function resolveAuthAdapter(): AppConfig['authProvider'] {
  const raw = import.meta.env.VUESTRATA_AUTH_ADAPTER
  if (import.meta.env.PROD) {
    if (typeof raw !== 'string' || !(VALID_AUTH_PROVIDERS as ReadonlyArray<string>).includes(raw)) {
      throw new Error(
        `[app-config] ${AUTH_ADAPTER_ENV_KEY} must be set to one of ${VALID_AUTH_PROVIDERS.join(', ')} in production (received ${JSON.stringify(raw)}).`,
      )
    }
    return raw as AppConfig['authProvider']
  }
  return pickEnum(AUTH_ADAPTER_ENV_KEY, raw, VALID_AUTH_PROVIDERS, 'mock')
}

export const authAdapter = resolveAuthAdapter()

export const appConfig: AppConfig = {
  title: import.meta.env.VUESTRATA_APP_TITLE || 'Vuestrata',
  apiUrl: import.meta.env.VUESTRATA_API_URL || '/api',
  useMocks: import.meta.env.VUESTRATA_USE_MOCKS === 'true',
  authProvider: authAdapter,
  uiProvider: pickEnum(
    'VUESTRATA_UI_PROVIDER',
    import.meta.env.VUESTRATA_UI_PROVIDER,
    VALID_UI_PROVIDERS,
    'reka',
  ),
  iconProvider: pickEnum(
    'VUESTRATA_ICON_PROVIDER',
    import.meta.env.VUESTRATA_ICON_PROVIDER,
    VALID_ICON_PROVIDERS,
    'solar',
  ),
  validationAdapter: pickEnum(
    'VUESTRATA_VALIDATION_ADAPTER',
    import.meta.env.VUESTRATA_VALIDATION_ADAPTER,
    VALID_VALIDATION_ADAPTERS,
    'zod',
  ),
}
