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
  /** Built-in permissions a project takes away, rather than editing the union. */
  withdrawn: 'withdrawn',
}

/**
 * Every registry the tools write into. One list, because `doctor` and the 1.1.0
 * migration each had their own and they had already diverged.
 *
 * `hadLegacyMarker` is history, not configuration: `navGroups` and `env` gained
 * their regions in 1.1.0, so there was no old marker to rewrite.
 *
 * `keyedBy: 'variable'` makes an upgrade compare `.env.example` entries by the
 * variable they document rather than line by line — see `regionEntries`.
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
  {
    slot: 'envExample',
    region: REGIONS.env,
    comment: '#',
    hadLegacyMarker: false,
    keyedBy: 'variable',
  },
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

// ── Whole regions ──────────────────────────────────────────────────────────
//
// What an upgrade needs: which lines of a file belong to which side. Unlike
// the helpers above these are strict — an exact `scope:region` marker pair and
// no `gen:` fallback — because an upgrade that mistook a legacy region for
// Vuestrata's would write upstream entries into the project's own list.

/** A marker line, in any of the three comment styles the registries use. */
const MARKER = /^\s*(?:\/\/|\/\*|#)\s*([a-z]+):([a-z][a-z0-9-]*)-(start|end)\b/

function parseMarker(line) {
  const match = MARKER.exec(line)
  return match ? { scope: match[1], region: match[2], edge: match[3] } : undefined
}

/**
 * Every balanced region of `scope` in `lines`, as the indexes of its two marker
 * lines. An unclosed start or a stray end is ignored rather than guessed at: a
 * region that cannot be delimited cannot be blanked or spliced safely.
 */
function regionPairs(lines, scope) {
  const pairs = []
  let open

  for (let index = 0; index < lines.length; index++) {
    const marker = parseMarker(lines[index])
    if (!marker || marker.scope !== scope) continue

    if (marker.edge === 'start') {
      open = { region: marker.region, start: index }
    } else if (open?.region === marker.region) {
      pairs.push({ ...open, end: index })
      open = undefined
    }
  }

  return pairs
}

/** The names of the balanced `scope:` regions in `source`, in order. */
export function regionNames(source, { scope = APP_SCOPE } = {}) {
  return regionPairs(source.split(/\r?\n/), scope).map((pair) => pair.region)
}

/**
 * `contents` with the body of every `app:` region removed and the markers kept.
 *
 * This is what a merged file is hashed as: the entries a generator appends
 * there are the project's, so adding one is not an edit to Vuestrata's file.
 */
export function blankRegions(contents, { scope = APP_SCOPE } = {}) {
  const lines = contents.split('\n')
  const dropped = new Set()

  for (const pair of regionPairs(lines, scope)) {
    for (let index = pair.start + 1; index < pair.end; index++) dropped.add(index)
  }

  return lines.filter((_, index) => !dropped.has(index)).join('\n')
}

/**
 * `contents` with every region marker moved to column 0, whatever its scope.
 *
 * The other half of what a merged file is hashed as. The formatter indents a
 * marker by what follows it: in the permission union, the three markers above
 * the first `app:` member move right once `vuestrata add module` puts one
 * there, and move back when an upgrade writes the release's copy. So a
 * marker's indentation says where the project's entries are, never whether
 * Vuestrata's part of the file was edited.
 */
export function dedentMarkers(contents) {
  return contents
    .split('\n')
    .map((line) => (parseMarker(line) ? line.trimStart() : line))
    .join('\n')
}

/**
 * `incoming` with each `app:` region body replaced by the one in `current` — a
 * new release of a merged file that keeps the project's entries.
 *
 * A region `current` lacks comes out empty. A region `current` has and
 * `incoming` dropped cannot be carried anywhere, so it is returned in
 * `warnings` with the lines it held, for the caller to refuse or report; it is
 * never dropped silently.
 *
 * @returns {{ contents: string, warnings: { region: string, lines: string[] }[] }}
 */
export function spliceRegions(incoming, current, { scope = APP_SCOPE } = {}) {
  const eol = incoming.includes('\r\n') ? '\r\n' : '\n'
  const incomingLines = incoming.split(/\r?\n/)
  const currentLines = current.split(/\r?\n/)

  // Matched by name and occurrence, so a region that appears twice pairs up
  // in order rather than one copy vanishing.
  const bodies = new Map()
  for (const pair of regionPairs(currentLines, scope)) {
    const queue = bodies.get(pair.region) ?? []
    queue.push(currentLines.slice(pair.start + 1, pair.end))
    bodies.set(pair.region, queue)
  }

  const out = []
  let cursor = 0

  for (const pair of regionPairs(incomingLines, scope)) {
    out.push(...incomingLines.slice(cursor, pair.start + 1))
    out.push(...(bodies.get(pair.region)?.shift() ?? []))
    cursor = pair.end
  }
  out.push(...incomingLines.slice(cursor))

  const warnings = []
  for (const [region, queue] of bodies) {
    for (const body of queue) {
      warnings.push({
        region: `${scope}:${region}`,
        lines: body.map((line) => line.trim()).filter(Boolean),
      })
    }
  }

  return { contents: out.join(eol), warnings }
}

/**
 * The raw lines inside an exact `scope:region` pair, or `undefined` when the
 * file does not carry that pair.
 */
export function regionLines(source, name) {
  const [scope, region] = name.split(':')
  const lines = source.split(/\r?\n/)
  const pair = regionPairs(lines, scope).find((candidate) => candidate.region === region)
  return pair ? lines.slice(pair.start + 1, pair.end) : undefined
}

/** `KEY=value` or a commented-out `# KEY=value`: the line an env entry documents. */
const ENV_ASSIGNMENT = /^#?\s*([A-Z][A-Z0-9_]*)=/

/**
 * A region's entries, each with the key an append-only sync compares by.
 *
 * Most registries hold one entry per line, compared trimmed so that a re-indent
 * is not an edit. `.env.example` holds documented variables — the comment block
 * directly above a `VUESTRATA_X=` line, and the line — keyed by the variable
 * alone, so a changed default or a reworded comment is still the same entry.
 *
 * A comment that documents no variable — a trailing note, or a block a blank
 * line sets apart from the variable below it — is not an entry. Keyed by its
 * text it would never be found in the file read whole, where it runs into the
 * region's markers, so it would be appended on every upgrade; folded into the
 * next variable instead, a note that upstream later writes a variable after
 * would arrive a second time. `build-payload` refuses to ship one.
 *
 * @returns {{ key: string, lines: string[] }[]}
 */
export function regionEntries(lines, { keyedBy = 'line' } = {}) {
  if (keyedBy !== 'variable') {
    return lines
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => ({ key: line, lines: [line] }))
  }

  const entries = []
  let comments = []

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      comments = []
      continue
    }

    const assignment = ENV_ASSIGNMENT.exec(line)
    if (!assignment) {
      comments.push(line)
      continue
    }
    entries.push({ key: assignment[1], lines: [...comments, line] })
    comments = []
  }

  return entries
}

/**
 * Insert `entries` at the end of an exact `scope:region` pair, in order, with
 * the closing marker's indentation. Variable-keyed entries are separated by a
 * blank line, the way `.env.example` documents them.
 */
export function appendToRegion(source, name, entries, { keyedBy = 'line' } = {}) {
  const [scope, region] = name.split(':')
  const eol = source.includes('\r\n') ? '\r\n' : '\n'
  const lines = source.split(/\r?\n/)
  const pair = regionPairs(lines, scope).find((candidate) => candidate.region === region)

  if (!pair) {
    throw new Error(`region "${name}" not found. Run \`vuestrata doctor\` to see which have gone.`)
  }

  const indent = /^\s*/.exec(lines[pair.end])[0]
  const inserted = []

  for (const entry of entries) {
    const occupied = pair.end > pair.start + 1 || inserted.length > 0
    if (keyedBy === 'variable' && occupied) inserted.push('')
    inserted.push(...entry.lines.map((line) => `${indent}${line}`))
  }

  lines.splice(pair.end, 0, ...inserted)
  return lines.join(eol)
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
