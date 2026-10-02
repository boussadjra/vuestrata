import authConfig from '@/config/auth.config'
import { resolveAuthConfig } from '@/lib/auth/config'
import { installAuthConfig } from '@/lib/runtime'

/**
 * Where the project's seeded configuration files reach the runtime.
 *
 * Vuestrata's code stays replaceable by `vuestrata upgrade` only while a
 * project never has to edit it. The way a project changes behaviour instead is
 * a small file it owns — brand colours, API conventions, RBAC roles — which
 * Vuestrata's own code reads. This function is the one place those files are
 * read and handed to the code that uses them.
 *
 * `boot()` calls it right after `installRuntimeBackends()` and before anything
 * reads an API client, an auth adapter, a role definition or a permission.
 * Each seam is imported statically, at the top of this file, on purpose: a
 * seeded file that was deleted fails the build instead of quietly restoring
 * the defaults.
 *
 * Keep it synchronous. A seam that needs to load something asynchronously
 * belongs in its own boot step, where a failure reaches `renderBootFailure()`
 * like any other.
 */
export function installSeams(): void {
  // `app/config/auth.config.ts`: endpoints, response shapes, providers and the
  // project's own adapters. Resolving it checks it, so a mistake in that file
  // fails the boot with a message that names it.
  installAuthConfig(resolveAuthConfig(authConfig))
}
