/**
 * Idempotent, anchored edits to the registry files.
 *
 * Registries are the part of a scaffold that gets forgotten, so the generators
 * write them. Doing that safely needs an insertion point that is unambiguous
 * and survives the file being reformatted, reordered, or commented — which
 * rules out "after the last line matching this regex".
 *
 * Hence sentinels: a pair of comments marking a region the tools own.
 *
 *     // gen:modules-start
 *     // gen:modules-end
 *
 * They sit at the END of a hand-curated list rather than around the whole
 * thing, so existing entries keep their deliberate ordering (setup.ts groups
 * modules by role, with comments) and generated ones append beneath.
 *
 * Every helper here is idempotent: running a generator twice inserts once.
 */

export const SENTINELS = {
  modules: 'gen:modules',
  moduleImports: 'gen:module-imports',
  themes: 'gen:themes',
  themeImports: 'gen:theme-imports',
  themeNames: 'gen:theme-names',
  uiComponents: 'gen:ui-components',
  formComposables: 'gen:form-composables',
  iconMaps: 'gen:icon-maps',
  permissions: 'gen:permissions',
}

/**
 * Insert `line` just before the closing sentinel, preserving indentation.
 * A no-op if the exact line is already inside the region.
 */
export function insertBeforeSentinel(source, sentinel, line, { comment = '//' } = {}) {
  const endMarker = `${comment} ${sentinel}-end`
  const endIndex = source.indexOf(endMarker)

  if (endIndex === -1) {
    throw new Error(
      `sentinel "${endMarker}" not found. The generators anchor on it — ` +
        'restore it or update scripts/gen/lib/registry.mjs.',
    )
  }

  const startMarker = `${comment} ${sentinel}-start`
  const startIndex = source.indexOf(startMarker)
  if (startIndex !== -1) {
    const region = source.slice(startIndex, endIndex)
    // Already present: return the source untouched so `validate()` reports the
    // no-op rather than the caller silently double-writing.
    if (region.includes(line.trim())) return source
  }

  // Reuse the closing sentinel's own indentation for the inserted line.
  const lineStart = source.lastIndexOf('\n', endIndex) + 1
  const indent = source.slice(lineStart, endIndex)

  return `${source.slice(0, lineStart)}${indent}${line.trim()}\n${source.slice(lineStart)}`
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
