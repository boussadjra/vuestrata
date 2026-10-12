import fs from 'node:fs'
import path from 'node:path'

/**
 * Reading TypeScript without a TypeScript compiler.
 *
 * `eject` runs in Node against a project it must not import: aliases, SFCs and
 * a `vite.config.ts` it cannot resolve. It needs three things from source text —
 * which files import which, which route strings a spec visits, and where a
 * `test(...)` call ends — and each is a small scan rather than a parse. They err
 * toward keeping a file: a spec this misjudges is one the project sees fail and
 * deletes, where a spec it wrongly removed is a test nobody knows is missing.
 */

/** Every file under `rel`, as root-relative forward-slash paths. */
export function filesUnder(root, rel) {
  const full = path.join(root, rel)
  if (!fs.existsSync(full)) return []
  if (fs.statSync(full).isFile()) return [rel]

  const found = []
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    found.push(...filesUnder(root, `${rel}/${entry.name}`))
  }
  return found
}

/**
 * Import specifiers: `from '…'`, `import('…')`, `require('…')` and bare
 * `import '…'`. Never a file's body — the comments here are full of paths, and
 * reporting documentation as breakage trains people to ignore the report.
 */
const IMPORT_SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)['"]([^'"]+)['"]/gm

export function importSpecifiers(source) {
  return [...source.matchAll(IMPORT_SPECIFIER)].map(([, specifier]) => specifier)
}

/**
 * The root-relative path a specifier names, without its extension, or
 * `undefined` for a package. Aliases resolve the way `tsconfig.json` does, so
 * `@/config/comark` is `src/modules/app/config/comark` and a removed directory
 * matches everything beneath it.
 */
export function resolveSpecifier(file, specifier, manifest) {
  const clean = specifier.replace(/[?#].*$/, '')
  const { appAlias, appAliasAlt } = manifest.conventions
  const appDir = manifest.slots.appDir
  const modulesDir = manifest.slots.modulesDir
  const libDir = `${modulesDir}/core/lib`

  let resolved
  if (clean.startsWith('./') || clean.startsWith('../')) {
    resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), clean))
  } else if (clean.startsWith('/')) {
    // Vite's root-relative form, as in `import.meta.glob('/docs/**')` and `?raw`.
    resolved = clean.slice(1)
  } else {
    for (const alias of [appAlias, appAliasAlt]) {
      if (clean === `${alias}/lib` || clean.startsWith(`${alias}/lib/`)) {
        resolved = clean.replace(`${alias}/lib`, libDir)
      } else if (clean === `${alias}/modules` || clean.startsWith(`${alias}/modules/`)) {
        resolved = clean.replace(`${alias}/modules`, modulesDir)
      } else if (clean.startsWith(`${alias}/`)) {
        resolved = clean.replace(`${alias}/`, `${appDir}/`)
      }
      if (resolved) break
    }
  }

  return resolved?.replace(/\.(?:ts|mts|vue|json|md)$/, '')
}

/** Whether `resolved` is `target` or lies beneath it. Both extension-less. */
export function isAt(resolved, target) {
  return resolved === target || resolved.startsWith(`${target}/`)
}

/**
 * `source` with comments blanked to spaces, so offsets still line up and a route
 * mentioned in prose is not mistaken for one that is visited. A `//` inside a
 * string or after a `:` (a URL) is left alone.
 */
export function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (match, lead) => lead + ' '.repeat(match.length - 1))
}

/**
 * The index just past the bracket that closes the one at `open` — `(`, `[` or
 * `{` — or `-1`. Skips strings, template literals (with their `${}`), comments
 * and regex literals, so a `)` inside `/(?:\/|$)/` or `'a)'` does not end a call
 * early.
 */
export function findClose(source, open) {
  let depth = 0

  for (let index = open; index < source.length; index++) {
    const char = source[index]
    const next = source[index + 1]

    if (char === '/' && next === '/') {
      index = source.indexOf('\n', index)
      if (index === -1) return -1
    } else if (char === '/' && next === '*') {
      index = source.indexOf('*/', index + 2)
      if (index === -1) return -1
      index += 1
    } else if (char === "'" || char === '"') {
      index = skipString(source, index, char)
      if (index === -1) return -1
    } else if (char === '`') {
      index = skipTemplate(source, index)
      if (index === -1) return -1
    } else if (char === '/' && startsRegex(source, index)) {
      index = skipRegex(source, index)
      if (index === -1) return -1
    } else if (char === '(' || char === '[' || char === '{') {
      depth++
    } else if (char === ')' || char === ']' || char === '}') {
      depth--
      if (depth === 0) return index + 1
    }
  }

  return -1
}

function skipString(source, start, quote) {
  for (let index = start + 1; index < source.length; index++) {
    if (source[index] === '\\') index++
    else if (source[index] === quote) return index
    else if (source[index] === '\n') return -1
  }
  return -1
}

function skipTemplate(source, start) {
  for (let index = start + 1; index < source.length; index++) {
    const char = source[index]
    if (char === '\\') {
      index++
    } else if (char === '`') {
      return index
    } else if (char === '$' && source[index + 1] === '{') {
      // A nested expression can hold its own strings and templates, so hand it
      // to the same scanner by balancing braces here.
      let depth = 0
      for (index += 1; index < source.length; index++) {
        const inner = source[index]
        if (inner === "'" || inner === '"') index = skipString(source, index, inner)
        else if (inner === '`') index = skipTemplate(source, index)
        else if (inner === '{') depth++
        else if (inner === '}' && --depth === 0) break
        if (index === -1) return -1
      }
    }
  }
  return -1
}

/** A `/` opens a regex literal when what precedes it cannot end an expression. */
function startsRegex(source, index) {
  let before = index - 1
  while (before >= 0 && /[ \t]/.test(source[before])) before--
  if (before < 0) return true
  return (
    /[(,=:[!&|?{};+\-*%<>~^]/.test(source[before]) || /\breturn$/.test(source.slice(0, before + 1))
  )
}

function skipRegex(source, start) {
  let inClass = false
  for (let index = start + 1; index < source.length; index++) {
    const char = source[index]
    if (char === '\\') index++
    else if (char === '[') inClass = true
    else if (char === ']') inClass = false
    else if (char === '/' && !inClass) return index
    else if (char === '\n') return -1
  }
  return -1
}
