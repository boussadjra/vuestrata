/**
 * Where the project's seeded configuration files reach the runtime.
 *
 * Vuestrata's code stays replaceable by `vuestrata upgrade` only while a
 * project never has to edit it. The way a project changes behaviour instead is
 * a small file it owns — brand colours, API conventions, RBAC roles — which
 * Vuestrata's own code reads. This function is the one place those files are
 * read and handed to the framework-agnostic `core/lib` runtime slots.
 *
 * It is a deliberate no-op in this release. It exists now so that the boot
 * order is fixed before any seam depends on it: `boot()` calls it right after
 * `installRuntimeBackends()` and before anything reads an API client, a role
 * definition or a permission, so a later release adds its seam here and every
 * project that has taken this release picks it up without editing `main.ts`.
 *
 * Keep it synchronous. A seam that needs to load something asynchronously
 * belongs in its own boot step, where a failure reaches `renderBootFailure()`
 * like any other.
 */
export function installSeams(): void {
  // Intentionally empty. Later packages read the project's seeded config
  // files (`*.overrides.ts`) here and install them into `core/lib`.
}
