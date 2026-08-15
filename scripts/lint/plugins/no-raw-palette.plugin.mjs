import fs from 'node:fs'
import path from 'node:path'

/**
 * Forbid raw Tailwind palette utilities where a semantic token exists.
 *
 * Vuestrata ships ten themes. A component that hardcodes `bg-green-50` or
 * `text-red-500` renders identically on all ten, ignoring the theme's ramps,
 * and needs a hand-written `dark:` twin that is easy to forget or get wrong.
 * The semantic layer in `src/modules/app/styles/semantic.css` exists precisely
 * so meaning ("this is a destructive action") is expressed once.
 *
 * ── Ratchet, not a big bang ────────────────────────────────────────────────
 * This rule ships with a BASELINE of the violations that already existed. New
 * and edited code cannot add to it, while untouched files keep working. Each
 * migration lowers the baseline; when a file reaches zero it is removed from
 * the map entirely, and the rule fails if a file has FEWER violations than its
 * baseline — that is the ratchet, and it is what stops the count drifting back
 * up after a migration.
 *
 * Escape hatch: `<!-- lint-allow-raw-palette -->` or `// lint-allow-raw-palette`
 * on or directly above the offending line. Use it for genuine brand colours
 * (a provider's logo tint) that must not follow the theme.
 */

const PALETTE_FAMILIES = [
  'slate',
  'gray',
  'zinc',
  'neutral',
  'stone',
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
]

const UTILITY_PREFIXES = [
  'text',
  'bg',
  'border',
  'from',
  'to',
  'via',
  'ring',
  'fill',
  'stroke',
  'divide',
  'shadow',
  'outline',
  'decoration',
  'placeholder',
  'accent',
  'caret',
]

/**
 * Matches e.g. `bg-red-50`, `dark:text-green-400/70`, `hover:border-amber-200`.
 * Requires a numeric step so semantic names (`bg-primary`, `text-success`)
 * and one-off words are not caught.
 */
const RAW_PALETTE_PATTERN = new RegExp(
  String.raw`\b(?:[a-z-]+:)*(?:${UTILITY_PREFIXES.join('|')})-(?:${PALETTE_FAMILIES.join('|')})-\d{2,3}\b`,
  'g',
)

const INLINE_ALLOW_MARKER = 'lint-allow-raw-palette'

/**
 * Violations present when the rule was introduced, by file.
 *
 * Lower a number when you migrate a file; delete the entry at zero. Never
 * raise one — that is what the rule exists to prevent.
 */
/**
 * The users entries below used to be one line: `src/modules/users/pages/users.vue`
 * at 22. Splitting that page into a route adapter, a screen and a presentation
 * module moved the same 22 violations into three files without changing one of
 * them (20 + 1 + 1). Relocating a debt is not paying it — the total is
 * unchanged on purpose, and each file is still a migration waiting to happen.
 */
const BASELINE = new Map([
  ['src/modules/showcase/pages/tables.vue', 25],
  ['src/modules/users/presentation.ts', 20],
  ['src/modules/users/components/UsersScreen.vue', 1],
  ['src/modules/users/components/RolePermissionMatrix.vue', 1],
])

export function noRawPalettePlugin() {
  return {
    name: 'no-raw-palette',
    check({ root, logger }) {
      const files = walkSourceFiles(path.join(root, 'src'))
      const counts = new Map()
      const details = new Map()

      for (const filePath of files) {
        const rel = path.relative(root, filePath).replaceAll('\\', '/')
        const hits = scanFile(filePath)
        if (hits.length === 0) continue
        counts.set(rel, hits.length)
        details.set(rel, hits)
      }

      const added = []
      const improved = []

      for (const [file, count] of counts) {
        const baseline = BASELINE.get(file) ?? 0
        if (count > baseline) {
          added.push({ file, count, baseline, hits: details.get(file) })
        } else if (count < baseline) {
          improved.push({ file, count, baseline })
        }
      }

      // A file that dropped to zero disappears from `counts` entirely.
      for (const [file, baseline] of BASELINE) {
        if (!counts.has(file)) improved.push({ file, count: 0, baseline })
      }

      if (added.length > 0) {
        logger.error(
          'Raw Tailwind palette utilities are not allowed — they ignore the active theme ' +
            'and need hand-written dark: twins. Use the semantic tokens in ' +
            'src/modules/app/styles/semantic.css (bg-card, text-muted-foreground, ' +
            'border-border, text-destructive, bg-success-subtle, …).',
        )
        for (const entry of added) {
          logger.error(`- ${entry.file}: ${entry.count} (baseline ${entry.baseline})`)
          for (const hit of entry.hits.slice(0, 8)) {
            logger.error(`    ${entry.file}:${hit.line}  ${hit.match}`)
          }
        }
        return {
          ok: false,
          message: `${added.length} file(s) exceed their raw-palette baseline`,
        }
      }

      if (improved.length > 0) {
        // Failing here is deliberate: an un-lowered baseline silently allows the
        // count to climb back to the old number on the next edit.
        logger.error(
          'Raw-palette baseline is out of date. These files now have FEWER violations ' +
            'than recorded — lower (or delete) their entries in ' +
            'scripts/lint/plugins/no-raw-palette.plugin.mjs so the ratchet holds:',
        )
        for (const entry of improved) {
          logger.error(
            `- ${entry.file}: ${entry.baseline} → ${entry.count}${entry.count === 0 ? ' (remove the entry)' : ''}`,
          )
        }
        return { ok: false, message: `${improved.length} baseline entry(ies) need lowering` }
      }

      const remaining = [...counts.values()].reduce((sum, n) => sum + n, 0)
      if (remaining > 0) {
        logger.success(
          `No new raw-palette usage. ${remaining} pre-existing occurrence(s) across ` +
            `${counts.size} file(s) remain to migrate.`,
        )
      } else {
        logger.success('No raw-palette usage. The semantic token layer is fully adopted.')
      }
      return { ok: true }
    },
  }
}

function walkSourceFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkSourceFiles(full, acc)
      continue
    }
    if (!entry.isFile()) continue
    if (full.endsWith('.vue') || (full.endsWith('.ts') && !full.endsWith('.d.ts'))) {
      acc.push(full)
    }
  }
  return acc
}

function scanFile(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
  const hits = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.includes(INLINE_ALLOW_MARKER)) continue
    if (i > 0 && lines[i - 1].includes(INLINE_ALLOW_MARKER)) continue

    const matches = line.match(RAW_PALETTE_PATTERN)
    if (!matches) continue
    for (const match of matches) {
      hits.push({ line: i + 1, match })
    }
  }

  return hits
}
