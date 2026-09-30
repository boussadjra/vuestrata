import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * The CLI package may not be there: a project that ejected and removed
 * `packages/cli` still runs `vp run test --run`, and a static import of a file
 * that does not exist fails collection for the whole run, not just this suite.
 *
 * So the suites load it here. The specifier is built at run time and marked for
 * Vite to leave alone, otherwise the import is resolved while the file is being
 * transformed, and a missing package fails before any test can skip itself.
 */

const CLI_ROOT = path.resolve(process.cwd(), 'packages/cli')

/** Whether `packages/cli` is in this checkout. Gate every suite on it. */
export const CLI_PRESENT = fs.existsSync(path.join(CLI_ROOT, 'src/index.mjs'))

/**
 * A module of the CLI package, by path inside it — `src/lib/lockfile.mjs`.
 * Resolves to an empty object when the package is absent, so a suite can
 * destructure at module scope and be skipped rather than crash.
 *
 * The CLI is plain ESM JavaScript with no type declarations, hence `any`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadCli(rel: string): Promise<any> {
  if (!CLI_PRESENT) return {}
  return import(/* @vite-ignore */ pathToFileURL(path.join(CLI_ROOT, rel)).href)
}
