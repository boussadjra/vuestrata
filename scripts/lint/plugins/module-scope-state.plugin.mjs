import fs from 'node:fs'
import path from 'node:path'

/**
 * Forbid module-scope mutable state.
 *
 * Policy (decided in /memories/session/plan.md):
 * - Simple shared client state must use VueUse `createGlobalState`.
 * - Complex client orchestration must use Pinia stores.
 * - `src/modules/core/lib` stays framework-agnostic via injected providers.
 *
 * The rule denylists three high-leverage shapes at module scope (column 0):
 *   1. `let X = ...`               — mutable bindings.
 *   2. `const X = new Map/Set/WeakMap/WeakSet(...)` — accumulator registries.
 *   3. Top-level Vue reactivity calls (ref/reactive/computed/watch/watchEffect/
 *      useStorage/useAppStorage/shallowRef/shallowReactive) outside a factory
 *      such as `defineStore(...)` or `createGlobalState(...)`.
 *
 * Escape hatches:
 *   - Add the file path to `ALLOWLISTED_FILES` for intentional infrastructure
 *     singletons (e.g. the app event bus, runtime injection slots).
 *   - Place a `// lint-allow-module-scope-state` comment on or directly above
 *     a violating line for a one-off, reviewer-acknowledged exception.
 */

const FORBIDDEN_REACTIVITY = [
  'ref',
  'reactive',
  'shallowRef',
  'shallowReactive',
  'computed',
  'watch',
  'watchEffect',
  'useStorage',
  'useAppStorage',
]

const ALLOWLISTED_FILES = new Set([
  // App-wide event bus — stable infrastructure service, not mutable state.
  'src/modules/core/lib/events.ts',
  // Single injection-slot file for cross-cutting runtime providers.
  // Intentionally allowlisted so core/lib can stay framework-agnostic
  // while accepting state backends installed by the app layer at bootstrap.
  'src/modules/core/lib/runtime.ts',
])

const INLINE_ALLOW_MARKER = '// lint-allow-module-scope-state'

export function moduleScopeStatePlugin() {
  return {
    name: 'module-scope-state',
    check({ root, logger }) {
      const srcDir = path.join(root, 'src')
      const files = walkTsFiles(srcDir)
      const violations = []

      for (const filePath of files) {
        const rel = path.relative(root, filePath).replaceAll('\\', '/')
        if (ALLOWLISTED_FILES.has(rel)) continue
        if (rel.endsWith('.d.ts')) continue
        if (rel.endsWith('.test.ts') || rel.endsWith('.spec.ts')) continue
        if (rel.includes('/__tests__/') || rel.includes('/__mocks__/')) continue

        const fileViolations = scan(filePath)
        for (const v of fileViolations) {
          violations.push({ file: rel, ...v })
        }
      }

      if (violations.length > 0) {
        logger.error(
          'Module-scope mutable state is forbidden. ' +
            'Use createGlobalState (simple shared state) or Pinia (complex orchestration). ' +
            'Infrastructure singletons must be explicitly allowlisted.',
        )
        for (const v of violations) {
          logger.error(`- ${v.file}:${v.line} [${v.kind}] ${v.snippet.slice(0, 140)}`)
        }
        return {
          ok: false,
          message: `${violations.length} module-scope mutable state violation(s) found`,
        }
      }

      logger.success('No module-scope mutable state violations found.')
      return { ok: true }
    },
  }
}

function walkTsFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkTsFiles(full, acc)
      continue
    }
    if (entry.isFile() && full.endsWith('.ts') && !full.endsWith('.d.ts')) {
      acc.push(full)
    }
  }
  return acc
}

/**
 * Strip block comments, line comments, and string contents while preserving
 * line numbers and column positions so subsequent regex-based scans operate
 * on a syntactically clean view of the source.
 */
function stripCommentsAndStrings(src) {
  let out = ''
  let i = 0
  while (i < src.length) {
    const c = src[i]
    const n = src[i + 1]

    if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2)
      if (end === -1) {
        out += src.slice(i).replace(/[^\n]/g, ' ')
        break
      }
      out += src.slice(i, end + 2).replace(/[^\n]/g, ' ')
      i = end + 2
      continue
    }
    if (c === '/' && n === '/') {
      const nl = src.indexOf('\n', i)
      if (nl === -1) {
        out += ' '.repeat(src.length - i)
        break
      }
      out += ' '.repeat(nl - i)
      i = nl
      continue
    }
    if (c === '`' || c === "'" || c === '"') {
      const quote = c
      out += c
      i++
      while (i < src.length) {
        const ch = src[i]
        if (ch === '\\') {
          out += '  '
          i += 2
          continue
        }
        if (ch === quote) {
          out += ch
          i++
          break
        }
        if (ch === '\n') {
          out += '\n'
          i++
          continue
        }
        out += ' '
        i++
      }
      continue
    }

    out += c
    i++
  }
  return out
}

function scan(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8')
  const stripped = stripCommentsAndStrings(raw)
  const rawLines = raw.split(/\r?\n/)
  const lines = stripped.split(/\r?\n/)
  const violations = []

  const reactivityNames = FORBIDDEN_REACTIVITY.join('|')
  const reReactivityCall = new RegExp(`\\b(${reactivityNames})\\s*\\(`)
  const reReactivityFactoryWrap = /\b(defineStore|createGlobalState)\s*\(/

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    // Only consider statements that begin at column 0 — module top-level.
    if (/^\s/.test(line)) continue

    const rawLine = rawLines[i] ?? ''
    const prevRaw = rawLines[i - 1] ?? ''
    if (rawLine.includes(INLINE_ALLOW_MARKER)) continue
    if (prevRaw.trim().endsWith(INLINE_ALLOW_MARKER)) continue

    // 1. `let X = ...` at module scope.
    if (/^(export\s+)?let\s+/.test(line)) {
      violations.push({ line: i + 1, kind: 'top-level-let', snippet: rawLine.trim() })
      continue
    }

    // 2. `const X = new (Map|Set|WeakMap|WeakSet)(...)` at module scope.
    //    SCREAMING_SNAKE_CASE bindings are treated as immutable constant
    //    lookup tables (e.g. RTL_LOCALES, IDEMPOTENT_METHODS) and exempted.
    const collMatch = line.match(
      /^(?:export\s+)?const\s+(\w+)\s*(?::[^=]+)?=\s*new\s+(Map|Set|WeakMap|WeakSet)\s*[<(]/,
    )
    if (collMatch) {
      const name = collMatch[1]
      const isScreamingSnake = /^[A-Z][A-Z0-9_]*$/.test(name)
      if (!isScreamingSnake) {
        violations.push({ line: i + 1, kind: 'mutable-collection', snippet: rawLine.trim() })
      }
      continue
    }

    // 3. Top-level Vue reactivity call — but skip declarations and factory wraps.
    if (reReactivityCall.test(line)) {
      if (/^(export\s+)?(async\s+)?function\s+/.test(line)) continue
      if (/^(export\s+)?(abstract\s+)?class\s+/.test(line)) continue
      if (/^(export\s+)?(type|interface|enum|namespace)\s+/.test(line)) continue
      // Allow when wrapped in defineStore / createGlobalState on the same line.
      if (reReactivityFactoryWrap.test(line)) continue
      violations.push({ line: i + 1, kind: 'top-level-reactivity', snippet: rawLine.trim() })
      continue
    }
  }

  return violations
}
