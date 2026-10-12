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
 *
 * `scripts/build/verify-bundle.mjs` reads the file through it as well, for the
 * `bundle` key, which is validated here: `resolveDeployBundle`.
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

/** The budgets `scripts/build/verify-bundle.mjs` has, by the name a project sets them under. */
const BUNDLE_BUDGETS = [
  'initialPayloadGzipKb',
  'largestEagerChunkKb',
  'largestEagerStylesheetKb',
  'totalJsKb',
]

const BUNDLE_OPTIONS = [...BUNDLE_BUDGETS, 'onDemandChunks']

/** A chunk's name, as `name` in a `codeSplitting` group: no path, no spaces. */
const CHUNK_NAME = /^[^\s/\\]+$/

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

/** A value as its author wrote it, for a message: `"620"`, `NaN`, `-1`. */
const written = (value) =>
  typeof value === 'number' ? String(value) : (JSON.stringify(value) ?? String(value))

/**
 * `bundle` from `deploy.config.ts`, validated: the budgets the project set, in
 * KB, and the chunk names it adds to or takes off the on-demand check.
 *
 * It is the header generator's rule, for the same reason (`resolveDeployHeaders`):
 * every problem is collected and thrown at once, naming the file and the key,
 * and nothing invalid is dropped silently. A budget misspelt would otherwise be
 * a budget its author believes is in force.
 *
 * Build tooling only. The app imports `deploy.config.ts` for its variables and
 * never reads this key, so nothing here, and no schema for it, is in a bundle.
 *
 * @param {unknown} bundle
 * @param {object} [options]
 * @param {readonly string[]} [options.onDemandChunks] The names the check
 *   looks for by default, which are the ones `remove` may name.
 * @returns {{ budgets: Record<string, number>, onDemandChunks: { add: string[], remove: string[] } }}
 */
export function resolveDeployBundle(bundle = {}, { onDemandChunks = [] } = {}) {
  const fail = (problems) => {
    throw new Error(`Invalid \`bundle\` in ${DEPLOY_CONFIG_PATH}:\n  - ${problems.join('\n  - ')}`)
  }
  if (!isPlainObject(bundle)) fail(['bundle: must be an object.'])

  const problems = []

  for (const key of Object.keys(bundle)) {
    if (!BUNDLE_OPTIONS.includes(key)) {
      problems.push(`bundle.${key}: unknown option. Known: ${BUNDLE_OPTIONS.join(', ')}.`)
    }
  }

  const budgets = {}
  for (const key of BUNDLE_BUDGETS) {
    const value = bundle[key]
    if (value === undefined) continue
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      problems.push(
        `bundle.${key}: ${written(value)} is not a size. ` +
          'Give a number of KB above 0, such as 620.',
      )
    } else {
      budgets[key] = value
    }
  }

  /** @type {{ add: string[], remove: string[] }} */
  const lists = { add: [], remove: [] }
  const declared = bundle.onDemandChunks
  if (declared !== undefined && !isPlainObject(declared)) {
    problems.push('bundle.onDemandChunks: must be an object with `add` and/or `remove`.')
  } else if (declared !== undefined) {
    for (const key of Object.keys(declared)) {
      if (!Object.hasOwn(lists, key)) {
        problems.push(`bundle.onDemandChunks.${key}: unknown option. Known: add, remove.`)
      }
    }
    for (const key of Object.keys(lists)) {
      const names = declared[key]
      if (names === undefined) continue
      if (!Array.isArray(names)) {
        problems.push(`bundle.onDemandChunks.${key}: must be a list of chunk names.`)
        continue
      }
      for (const name of names) {
        if (typeof name !== 'string' || !CHUNK_NAME.test(name)) {
          problems.push(
            `bundle.onDemandChunks.${key}: ${written(name)} is not a ` +
              'chunk name, such as "maps-vendor": the `name` of a group in vite.config.ts.',
          )
        } else if (!lists[key].includes(name)) {
          lists[key].push(name)
        }
      }
    }

    for (const name of lists.remove) {
      if (lists.add.includes(name)) {
        problems.push(`bundle.onDemandChunks: "${name}" is under both add and remove.`)
      } else if (onDemandChunks.length > 0 && !onDemandChunks.includes(name)) {
        problems.push(
          `bundle.onDemandChunks.remove: "${name}" is not a chunk the check looks for, so ` +
            `removing it changes nothing. It looks for: ${onDemandChunks.join(', ')}.`,
        )
      }
    }
    // Already looked for: saying so twice would only report it twice.
    lists.add = lists.add.filter((name) => !onDemandChunks.includes(name))
  }

  if (problems.length > 0) fail(problems)
  return { budgets, onDemandChunks: lists }
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
