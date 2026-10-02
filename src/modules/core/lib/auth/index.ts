/**
 * What a project's `app/config/auth.config.ts`, and an auth adapter of its own,
 * are written with.
 *
 * It is importable as `~/lib/auth` from anywhere, and all of it is Vuestrata's:
 * `vuestrata upgrade` keeps this folder current, so a member added to
 * `AuthConfig` or to the adapter contract reaches every project. That is why
 * the seam's helpers are here rather than behind the auth module's barrel,
 * which is the project's file.
 */
export type {
  AuthAdapter,
  AuthAdapterFactory,
  AuthAdapterOptions,
  AuthCapabilities,
  AuthProviderId,
  AuthStateChange,
  AuthTransport,
  RefreshedSession,
  ResumedSession,
} from './adapter'
export {
  AUTH_ADAPTER_NAME_PATTERN,
  DEFAULT_AUTH_PROVIDERS,
  defineAuthConfig,
  getAuthConfig,
  getAuthProviders,
  resolveAuthConfig,
  type AuthAdapterRegistration,
  type AuthConfig,
  type AuthProviderOption,
  type ResolvedAdapterRegistration,
  type ResolvedAuthConfig,
} from './config'
export {
  AUTH_ENDPOINT_NAMES,
  AuthEndpointDisabledError,
  authRefreshBodies,
  authResponseMappers,
  createAuthEndpoints,
  endpointPresets,
  resolveAuthEndpoints,
  type AuthEndpoint,
  type AuthEndpointMethod,
  type AuthEndpointName,
  type AuthEndpointOverrides,
  type AuthEndpoints,
  type AuthEndpointSetting,
  type AuthEndpointSpec,
  type AuthMapping,
  type AuthRequestBody,
  type AuthResponseMapper,
  type MappedAuthResponse,
} from './endpoints'
export {
  AUTH_CONFIG_FILE,
  createRegisteredAuthAdapter,
  loadAuthAdapter,
  registeredAuthAdapterNames,
} from './registry'
export { parseUser, userSchema, type UserInput } from './user'
// The names a project's own adapters are registered under. A project that
// registers one declares it by augmenting this module, in `auth.config.ts`:
//
//   declare module '~/lib/auth' {
//     interface RegisteredAuthAdapterNames {
//       acme: true
//     }
//   }
export type {
  AuthAdapterName,
  BuiltinAuthAdapterName,
  RegisteredAuthAdapterNames,
} from '../config/env.schema'
// The slot the resolved configuration is installed in. `bootstrap/seams.ts`
// does it for the app; a test does it for itself:
// `installAuthConfig(resolveAuthConfig({ … }))`.
export { installAuthConfig } from '../runtime'
