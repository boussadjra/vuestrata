/**
 * Idempotent, anchored edits to the registry files.
 *
 * Registries are the part of a scaffold that gets forgotten, so the tools write
 * them. Doing that safely needs an insertion point that is unambiguous and
 * survives the file being reformatted, reordered, or commented — which rules
 * out "after the last line matching this regex".
 *
 * Hence sentinels: a pair of comments marking a region the tools own.
 *
 *     // app:modules-start
 *     // app:modules-end
 *
 * They sit at the END of a hand-curated list, so existing entries keep their
 * deliberate ordering and new ones append beneath.
 *
 * Each registry carries two regions — `vuestrata:` for what upstream ships and
 * `app:` for what the project adds — so the two sets of entries cannot collide
 * on an upgrade. Generators write to `app:`. See UPGRADING.md.
 *
 * Every helper here is idempotent: running a generator twice inserts once.
 */

/** Region owned by the upgrade path. Never written by a generator. */
export const UPSTREAM_SCOPE = 'vuestrata'
/** Region owned by whoever owns the project. Never written by an upgrade. */
export const APP_SCOPE = 'app'

/**
 * Region names, without a scope prefix. Theme names and module imports are
 * absent by design — both are inserted in sorted position instead, because
 * oxfmt reorders them and would move a sentinel region out from under us.
 */
export const REGIONS = {
  modules: 'modules',
  navGroups: 'nav-groups',
  themes: 'themes',
  themeImports: 'theme-imports',
  uiComponents: 'ui-components',
  formComposables: 'form-composables',
  iconMaps: 'icon-maps',
  permissions: 'permissions',
  env: 'env',
  tokens: 'tokens',
}

/**
 * Every registry the tools write into. One list, because `doctor` and the 1.1.0
 * migration each had their own and they had already diverged.
 *
 * `hadLegacyMarker` is history, not configuration: `navGroups` and `env` gained
 * their regions in 1.1.0, so there was no old marker to rewrite.
 */
export const ANCHORED_REGISTRIES = [
  { slot: 'moduleRegistry', region: REGIONS.modules, comment: '//', hadLegacyMarker: true },
  { slot: 'navGroups', region: REGIONS.navGroups, comment: '//', hadLegacyMarker: false },
  { slot: 'themeRegistry', region: REGIONS.themes, comment: '//', hadLegacyMarker: true },
  { slot: 'styleEntry', region: REGIONS.themeImports, comment: '/*', hadLegacyMarker: true },
  { slot: 'uiBarrel', region: REGIONS.uiComponents, comment: '//', hadLegacyMarker: true },
  {
    slot: 'formComposablesBarrel',
    region: REGIONS.formComposables,
    comment: '//',
    hadLegacyMarker: true,
  },
  { slot: 'iconBarrel', region: REGIONS.iconMaps, comment: '//', hadLegacyMarker: true },
  { slot: 'permissions', region: REGIONS.permissions, comment: '//', hadLegacyMarker: true },
  { slot: 'envExample', region: REGIONS.env, comment: '#', hadLegacyMarker: false },
]

/** Build a scoped sentinel name, e.g. `app:modules`. */
export function sentinel(region, scope = APP_SCOPE) {
  if (!Object.values(REGIONS).includes(region)) {
    throw new Error(`unknown region "${region}". Known: ${Object.values(REGIONS).join(', ')}`)
  }
  return `${scope}:${region}`
}

/** Every region in the app scope, so call sites read `SENTINELS.modules`. */
export const SENTINELS = Object.fromEntries(
  Object.entries(REGIONS).map(([key, region]) => [key, sentinel(region, APP_SCOPE)]),
)

/** The same set in the upstream scope, used by `upgrade`. */
export const UPSTREAM_SENTINELS = Object.fromEntries(
  Object.entries(REGIONS).map(([key, region]) => [key, sentinel(region, UPSTREAM_SCOPE)]),
)

/**
 * Locate a sentinel region, falling back to the pre-1.1.0 unscoped `gen:` name
 * for projects the migration has not yet run against.
 */
function findRegion(source, name, comment) {
  const bare = name.slice(name.indexOf(':') + 1)
  const candidates = [name, `gen:${bare}`]

  for (const candidate of candidates) {
    const endIndex = source.indexOf(`${comment} ${candidate}-end`)
    if (endIndex === -1) continue
    return {
      name: candidate,
      endIndex,
      startIndex: source.indexOf(`${comment} ${candidate}-start`),
    }
  }

  return undefined
}

/**
 * Insert `line` just before the closing sentinel, preserving indentation.
 * A no-op if the exact line is already inside the region.
 */
export function insertBeforeSentinel(source, name, line, { comment = '//' } = {}) {
  const region = findRegion(source, name, comment)

  if (!region) {
    throw new Error(
      `sentinel "${comment} ${name}-end" not found. The tools anchor on it — ` +
        'restore it, or run `vuestrata doctor` to see which registries have drifted.',
    )
  }

  const { endIndex, startIndex } = region

  if (startIndex !== -1) {
    const inside = source.slice(startIndex, endIndex)
    // Already present: return the source untouched so `validate()` reports the
    // no-op rather than the caller silently double-writing.
    if (inside.includes(line.trim())) return source
  }

  // Reuse the closing sentinel's own indentation for the inserted line.
  const lineStart = source.lastIndexOf('\n', endIndex) + 1
  const indent = source.slice(lineStart, endIndex)

  return `${source.slice(0, lineStart)}${indent}${line.trim()}\n${source.slice(lineStart)}`
}

/** Whether a scoped region exists in `source`. Used by `doctor`. */
export function hasSentinel(source, name, { comment = '//' } = {}) {
  return findRegion(source, name, comment) !== undefined
}

/** Read the lines currently inside a region. Used by `eject` and `doctor`. */
export function readRegion(source, name, { comment = '//' } = {}) {
  const region = findRegion(source, name, comment)
  if (!region || region.startIndex === -1) return []

  const startMarker = `${comment} ${region.name}-start`
  const body = source.slice(region.startIndex + startMarker.length, region.endIndex)

  return body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

/**
 * Add an import statement, sorted among its siblings.
 *
 * Imports are not sentinel-anchored: oxfmt sorts them anyway (`sortImports` in
 * vite.config.ts), so a sentinel region would be reordered out from under us on
 * the next format. Inserting in sorted position instead means the file is
 * already correct and `vpr fmt --check` stays green without a format step.
 */
export function insertImport(source, statement, { matching }) {
  if (source.includes(statement)) return source

  const lines = source.split('\n')
  const siblings = []
  for (let i = 0; i < lines.length; i++) {
    if (matching.test(lines[i])) siblings.push(i)
  }

  if (siblings.length === 0) {
    throw new Error(`no import matching ${matching} found to sort alongside`)
  }

  const insertAt =
    siblings.find((index) => lines[index].localeCompare(statement) > 0) ??
    siblings[siblings.length - 1] + 1

  lines.splice(insertAt, 0, statement)
  return lines.join('\n')
}

/**
 * Add a member to a string-literal union, before the open-ended `(string & {})`
 * tail if one is present.
 */
export function insertUnionMember(source, unionName, member) {
  const literal = `  | '${member}'`
  const start = source.indexOf(`export type ${unionName}`)
  if (start === -1) throw new Error(`union "${unionName}" not found`)

  const lines = source.split('\n')
  const cursor = lines.findIndex((line) => line.includes(`export type ${unionName}`))
  if (cursor === -1) throw new Error(`union "${unionName}" not found`)

  let lastMember = cursor
  let openEnded = -1

  for (let i = cursor + 1; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (trimmed === '') continue
    if (trimmed === literal.trim()) return source // already a member
    if (/^\|\s*'/.test(trimmed)) {
      lastMember = i
      continue
    }
    if (/^\|\s*\(string\s*&/.test(trimmed)) {
      openEnded = i
      break
    }
    break
  }

  const insertAt = openEnded !== -1 ? openEnded : lastMember + 1
  lines.splice(insertAt, 0, literal)
  return lines.join('\n')
}
