#!/usr/bin/env node
/**
 * Verify that the documentation still describes the code that exists.
 *
 * Docs rot silently. A path renamed in a refactor leaves the prose pointing at
 * a file nobody will find, and nothing fails — the reader simply loses trust in
 * the whole document. This checks the two claims a doc makes that a machine can
 * actually verify:
 *
 *   1. every `src/…`, `scripts/…`, `e2e/…` or `test/…` path it mentions exists
 *   2. every relative Markdown link resolves to a real page
 *
 * It deliberately does NOT check prose accuracy — no script can. What it does
 * is remove the excuse that a stale path went unnoticed.
 *
 * Usage: node scripts/docs/check-links.mjs [--quiet]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { consola } from 'consola'

const logger = consola.withTag('check-links')

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const QUIET = process.argv.includes('--quiet')

/** Files scanned. README and SECURITY make the same kind of claims as docs/. */
const ROOTS = ['docs', 'README.md', 'SECURITY.md', 'CONTRIBUTING.md']

/**
 * Paths that look like source references but are not.
 *
 * `src/app.css`-style examples inside generated or illustrative snippets, and
 * anything under a placeholder segment, would otherwise produce noise that
 * trains people to ignore this script.
 */
const IGNORED_PATTERNS = [
  /[<>{}]/, // src/modules/<name>/index.ts — a template, not a path
  /\*/, // globs
  /\.\.\./, // elisions
  // `your-thing.css` marks a file the READER is told to create. Naming that
  // convention explicitly beats an allowlist of individual exceptions, which
  // would grow until nobody trusted it.
  /(^|\/)your-/,
]

function walk(entry, files = []) {
  const absolute = resolve(ROOT, entry)
  let stats
  try {
    stats = statSync(absolute)
  } catch {
    return files
  }

  if (stats.isFile()) {
    if (absolute.endsWith('.md')) files.push(absolute)
    return files
  }

  for (const child of readdirSync(absolute)) {
    walk(join(entry, child), files)
  }
  return files
}

/** Strip fenced code blocks before looking for links; keep them for paths. */
function withoutFences(markdown) {
  return markdown.replace(/```[\s\S]*?```/g, '')
}

/**
 * A tutorial's paths are prescriptive, not descriptive — they name files the
 * reader is told to create, which by definition do not exist yet. Such a
 * document opts out with frontmatter:
 *
 *   ---
 *   prescriptivePaths: true
 *   ---
 *
 * Explicit and greppable, so it stays a deliberate choice rather than an
 * allowlist of individual exceptions that grows until nobody trusts the script.
 * Markdown *links* are still checked in these files — a broken cross-reference
 * is a defect regardless of what the document is teaching.
 */
function hasPrescriptivePaths(source) {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source)
  return frontmatter ? /^prescriptivePaths:\s*true\s*$/m.test(frontmatter[1]) : false
}

function exists(candidate) {
  try {
    statSync(resolve(ROOT, candidate))
    return true
  } catch {
    return false
  }
}

const problems = []
let checkedPaths = 0
let checkedLinks = 0

for (const file of ROOTS.flatMap((entry) => walk(entry))) {
  const source = readFileSync(file, 'utf8')
  const relativeFile = relative(ROOT, file).replaceAll('\\', '/')
  const lines = source.split('\n')

  // ── Source paths ────────────────────────────────────────
  // Matched anywhere, including inside code fences: a fenced example that
  // names a real file is exactly the kind of reference that goes stale.
  const pathPattern = /\b((?:src|scripts|e2e|test|public)\/[A-Za-z0-9_@./-]+\.[A-Za-z0-9]+)/g
  const prescriptive = hasPrescriptivePaths(source)

  lines.forEach((line, index) => {
    if (prescriptive) return
    for (const match of line.matchAll(pathPattern)) {
      const candidate = match[1]
      if (IGNORED_PATTERNS.some((pattern) => pattern.test(candidate))) continue

      checkedPaths += 1
      if (!exists(candidate)) {
        problems.push({ file: relativeFile, line: index + 1, kind: 'path', target: candidate })
      }
    }
  })

  // ── Relative markdown links ─────────────────────────────
  const prose = withoutFences(source)
  const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g

  for (const match of prose.matchAll(linkPattern)) {
    const target = match[1].split('#')[0].trim()
    if (!target || /^(https?:|mailto:|#|\/)/.test(target)) continue

    checkedLinks += 1
    const resolved = join(dirname(relativeFile), target)
    // A doc link may omit `.md`, matching how the docs site routes.
    if (!exists(resolved) && !exists(`${resolved}.md`) && !exists(join(resolved, 'index.md'))) {
      const line = lines.findIndex((entry) => entry.includes(match[0])) + 1
      problems.push({ file: relativeFile, line: line || 1, kind: 'link', target })
    }
  }
}

if (problems.length > 0) {
  logger.error(`${problems.length} stale documentation reference(s):`)
  for (const problem of problems) {
    logger.log(`  ${problem.file}:${problem.line}  ${problem.kind}  →  ${problem.target}`)
  }
  logger.info('Either restore the target or update the document.')
  process.exit(1)
}

if (!QUIET) {
  logger.success(
    `Documentation references OK — ${checkedPaths} source path(s) and ${checkedLinks} link(s) resolve.`,
  )
}
