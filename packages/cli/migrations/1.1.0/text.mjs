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
 * @param {string} source
 * @param {{ from: string, to: string, optional?: boolean, all?: boolean }[]} blocks
 */
export function replaceBlocks(source, blocks) {
  let text = toLf(source)

  if (blocks.some((block) => !block.optional && !text.includes(block.from))) return source

  for (const block of blocks) {
    // A function, so a `$` in the replacement is not read as a pattern.
    text = block.all
      ? text.replaceAll(block.from, () => block.to)
      : text.replace(block.from, () => block.to)
  }

  return inEolOf(source, text)
}

/** `names`, joined the way a sentence lists them: "a, b and c". */
export function listOf(names) {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}
