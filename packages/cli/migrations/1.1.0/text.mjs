/**
 * What the 1.1.0 codemods share: line endings, and replacing text only where it
 * is exactly what a release shipped.
 */

/** Files use LF or CRLF; a rewrite keeps whichever the file had. */
export const eolOf = (source) => (source.includes('\r\n') ? '\r\n' : '\n')

export const toLf = (source) => source.replaceAll('\r\n', '\n')

/** `text`, written in LF, in the line endings `source` uses. */
export const inEolOf = (source, text) => {
  const eol = eolOf(source)
  return eol === '\n' ? text : toLf(text).replaceAll('\n', eol)
}

/**
 * Replace each `from` with its `to`, or change nothing.
 *
 * A block is the text a release shipped, compared exactly: one a project
 * reworded, reindented or already replaced is not found. Every block must be
 * found for any to be replaced, because the blocks of one step are one change
 * (an import and the call that needs it), and half of it is a file that does
 * not compile. A block marked `optional` is the exception: it is replaced when
 * it is there and does not hold the others back, for a comment that follows a
 * change but is not part of it.
 *
 * `all: true` replaces every occurrence of a block; otherwise the first.
 *
 * `unless(text)` drops a block from the change when it holds: for a line the
 * file may already have in another place, such as an import. Without it the
 * codemod would write the line a second time.
 *
 * @param {string} source
 * @param {{ from: string, to: string, optional?: boolean, all?: boolean, unless?: (text: string) => boolean }[]} blocks
 */
export function replaceBlocks(source, blocks) {
  let text = toLf(source)

  const wanted = blocks.filter((block) => !block.unless?.(text))
  if (wanted.some((block) => !block.optional && !text.includes(block.from))) return source

  for (const block of wanted) {
    // A function, so a `$` in the replacement is not read as a pattern.
    text = block.all
      ? text.replaceAll(block.from, () => block.to)
      : text.replace(block.from, () => block.to)
  }

  return inEolOf(source, text)
}

/**
 * Where the string at `path` sits in a JSON document: the offsets of its
 * literal, quotes included, or `undefined` when there is no string there.
 *
 * For a codemod that changes one value and must leave the rest of the file as
 * it was written: `JSON.parse` says what the value is, this says where.
 * `['scripts', 'lint']` is the `lint` key of the top-level `scripts` object and
 * nothing else that happens to hold the same text.
 *
 * @param {string} source  JSON that parses.
 * @param {string[]} path
 * @returns {{ start: number, end: number } | undefined}
 */
export function jsonStringSpan(source, path) {
  let i = 0

  const skipSpace = () => {
    while (i < source.length && /\s/.test(source[i])) i++
  }

  const string = () => {
    const start = i
    i++
    while (i < source.length && source[i] !== '"') i += source[i] === '\\' ? 2 : 1
    i++
    return { start, end: i }
  }

  const at = (keys) => keys.length === path.length && keys.every((key, n) => key === path[n])

  function value(keys) {
    skipSpace()

    if (source[i] === '{') {
      i++
      skipSpace()
      while (i < source.length && source[i] !== '}') {
        const key = string()
        skipSpace()
        i++ // the colon
        const found = value([...keys, JSON.parse(source.slice(key.start, key.end))])
        if (found) return found
        skipSpace()
        if (source[i] === ',') i++
        skipSpace()
      }
      i++
      return undefined
    }

    if (source[i] === '[') {
      i++
      skipSpace()
      // An element has no key, so nothing under an array is ever at `path`.
      while (i < source.length && source[i] !== ']') {
        value([...keys, undefined])
        skipSpace()
        if (source[i] === ',') i++
        skipSpace()
      }
      i++
      return undefined
    }

    if (source[i] === '"') {
      const span = string()
      return at(keys) ? span : undefined
    }

    // A number, true, false or null.
    while (i < source.length && !/[,\]}\s]/.test(source[i])) i++
    return undefined
  }

  try {
    return value([])
  } catch {
    return undefined
  }
}

/**
 * `source` with its comments blanked, so that a codemod asking "does this file
 * set X" is not answered by a sentence that mentions X.
 *
 * A scanner, not a parser: it knows strings, template literals and the two
 * comment forms, which is what it takes not to cut `'http://…'` in half. A
 * `//` inside a regular expression literal is read as a comment; the callers
 * only look for names, and a name hidden that way reads as absent, which is
 * the answer that leaves a file alone.
 */
export function withoutComments(source) {
  return scan(source, { strings: true })
}

/** Comments blanked, and what strings hold too: their quotes stay, empty. */
function codeOnly(source) {
  return scan(source, { strings: false })
}

function scan(source, { strings }) {
  let out = ''
  let i = 0

  while (i < source.length) {
    const char = source[i]
    const next = source[i + 1]

    if (char === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i++
      continue
    }

    if (char === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2)
      const stop = end === -1 ? source.length : end + 2
      // Keep the line structure: callers match with `^` and `$`.
      out += source.slice(i, stop).replace(/[^\n]/g, '')
      i = stop
      continue
    }

    if (char === "'" || char === '"' || char === '`') {
      let j = i + 1
      while (j < source.length && source[j] !== char) {
        if (source[j] === '\\') j++
        // An unterminated quote on a line is prose (an apostrophe), not a string.
        if (char !== '`' && source[j] === '\n') break
        j++
      }
      const closed = source[j] === char
      if (strings || !closed) out += source.slice(i, j + 1)
      else out += char + source.slice(i + 1, j).replace(/[^\n]/g, '') + char
      i = j + 1
      continue
    }

    if (char === '\\') {
      out += source.slice(i, i + 2)
      i += 2
      continue
    }

    out += char
    i++
  }

  return out
}

const escapeForRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The text between the bracket at `open` and the one that closes it. */
function bracketed(text, open) {
  const pairs = { '{': '}', '[': ']' }
  let depth = 0

  for (let i = open; i < text.length; i++) {
    if (text[i] in pairs) depth++
    else if (text[i] === '}' || text[i] === ']') {
      depth--
      if (depth === 0) return text.slice(open + 1, i)
    }
  }
  return text.slice(open + 1)
}

/** The local names an import clause binds: `a, { b, c as d }, * as e` gives a, b, d, e. */
function importedNames(clause) {
  return clause
    .replace(/[{}]/g, ',')
    .split(',')
    .map((part) => part.trim().replace(/^type\s+/, ''))
    .filter(Boolean)
    .map((part) => /\bas\s+([\w$]+)$/.exec(part)?.[1] ?? part)
}

/**
 * Whether `source` declares `name` anywhere: a `const`, `let`, `var`,
 * `function`, `class` or type, a destructured binding, or an import.
 *
 * It is what a codemod asks before it inserts a declaration, because a file
 * that already has one would then hold two and stop compiling. Deliberately
 * generous: a declaration in an inner scope, which would not clash, counts as
 * well. The cost of a wrong yes is a note; the cost of a wrong no is a broken
 * file.
 */
export function declaresBinding(source, name) {
  const text = codeOnly(source)
  const id = escapeForRegExp(name)

  const declared = new RegExp(
    `\\b(?:const|let|var|function\\s*\\*?|class|enum|type|interface|namespace)\\s+${id}(?![\\w$])`,
  )
  if (declared.test(text)) return true

  // In a destructuring pattern the name binds unless a colon follows it:
  // `{ name }` and `{ other: name }` declare it, `{ name: other }` does not.
  const named = new RegExp(`(?<![\\w$.])${id}(?![\\w$])(?!\\s*:)`)

  for (const match of text.matchAll(/\b(?:const|let|var)\s*(?=[{[])/g)) {
    if (named.test(bracketed(text, match.index + match[0].length))) return true
  }

  for (const [, clause] of text.matchAll(/\bimport\s+(?:type\s+)?([^'"]*?)\s+from\s*['"]/g)) {
    if (importedNames(clause).includes(name)) return true
  }

  return false
}

/** `names`, joined the way a sentence lists them: "a, b and c". */
export function listOf(names) {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}
