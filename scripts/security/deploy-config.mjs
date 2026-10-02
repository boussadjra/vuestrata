/**
 * Reads the project's deployment configuration from Node.
 *
 * `src/modules/app/config/deploy.config.ts` is a TypeScript module the app
 * imports through an alias (`~/lib/config/deploy`). The header generator and
 * the Vite plugin run before any bundler exists, so they load it with tsx,
 * which resolves the `paths` in `tsconfig.json` the way the build does.
 *
 * One loader for both, so the build, the generated headers and the container
 * entrypoint's key list are all derived from the same reading of the file.
 */
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** Where the seeded file lives, relative to the project root. */
export const DEPLOY_CONFIG_PATH = 'src/modules/app/config/deploy.config.ts'

const RUNTIME_OVERLAY_PATH = 'src/modules/core/lib/config/runtime-overlay.ts'

/** Import a TypeScript module of the project, honouring its tsconfig paths. */
async function importTs(file, root) {
  let tsImport
  try {
    ;({ tsImport } = await import('tsx/esm/api'))
  } catch (error) {
    throw new Error(
      `Reading ${file} needs the "tsx" devDependency, which could not be loaded ` +
        `(${error.message}). Run \`vp install\`.`,
      { cause: error },
    )
  }

  const tsconfig = resolve(root, 'tsconfig.json')
  const loaded = await tsImport(pathToFileURL(file).href, {
    parentURL: import.meta.url,
    ...(existsSync(tsconfig) ? { tsconfig } : {}),
  })
  // A module loaded as CommonJS arrives wrapped once more.
  return loaded.default?.__esModule ? loaded.default : loaded
}

/**
 * The project's `defineDeployConfig({...})`, or an empty config when the file
 * does not exist.
 *
 * A project that has not taken the release that introduced the file has none
 * until `vuestrata upgrade` writes it, and its headers must still generate.
 * Missing means "nothing declared", which is also the narrowest policy. The
 * app's own static import of the file is what makes deleting it fail loudly.
 */
export async function loadDeployConfig({ root = REPO_ROOT, file } = {}) {
  const path = file ? resolve(root, file) : resolve(root, DEPLOY_CONFIG_PATH)
  if (!existsSync(path)) return {}

  let loaded
  try {
    loaded = await importTs(path, root)
  } catch (error) {
    throw new Error(`Could not load ${path}: ${error.message}`, { cause: error })
  }

  const config = loaded.default
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error(`${path} must \`export default defineDeployConfig({ ... })\`.`)
  }
  return config
}

/**
 * The built-in keys a deployment may set at runtime: `RUNTIME_OVERRIDABLE_KEYS`
 * as the app defines it, read from the source so the entrypoint's list cannot
 * fall out of step with what the browser accepts.
 */
export async function loadRuntimeOverridableKeys({ root = REPO_ROOT } = {}) {
  return (await loadRuntimeKeys({ root })).keys
}

/**
 * Those keys, and `RUNTIME_KEY_FORMATS`: what the entrypoint accepts for the
 * ones that are not held to the URL-safe set (a title with spaces, a value
 * from a fixed list). A copy of the module from before the formats existed
 * exports none, and every key is then held to that set.
 */
export async function loadRuntimeKeys({ root = REPO_ROOT } = {}) {
  const path = resolve(root, RUNTIME_OVERLAY_PATH)
  const { RUNTIME_OVERRIDABLE_KEYS: keys, RUNTIME_KEY_FORMATS: formats = {} } = await importTs(
    path,
    root,
  )
  if (!Array.isArray(keys) || keys.some((key) => typeof key !== 'string')) {
    throw new Error(`${path} does not export RUNTIME_OVERRIDABLE_KEYS as a list of names.`)
  }
  if (formats === null || typeof formats !== 'object' || Array.isArray(formats)) {
    throw new Error(`${path} does not export RUNTIME_KEY_FORMATS as an object.`)
  }
  return { keys: [...keys], formats: { ...formats } }
}
