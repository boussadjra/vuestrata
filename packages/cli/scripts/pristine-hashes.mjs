import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { logger, parseArgs } from '../src/lib/cli.mjs'
import { hashFor } from '../src/lib/lockfile.mjs'
import { classify } from '../src/lib/managed.mjs'

/**
 * What each file hashed to in each release, for a migration's `pristine` list.
 *
 * A `promote` step adopts a project's copy only when its hash is one some
 * release actually shipped, and a `reclassify` step accepts the same for a file
 * changing class. Those hashes come from the tags, not from memory:
 *
 *     node packages/cli/scripts/pristine-hashes.mjs \
 *       --tags v1.0.1-alpha.5,v1.0.1-alpha.6 src/main.ts src/App.vue
 *
 * Hashed the way the lockfile hashes them, by the class each path has now —
 * blanked for a merged file. `--class managed|merged` overrides that, e.g. for
 * a file that is about to be promoted and so is not in the lists yet. `--json`
 * prints `{ path: { class, pristine, tags } }`, `pristine` deduplicated in tag
 * order, ready to paste into a step.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

const { positional: paths, flags } = parseArgs(process.argv.slice(2))
const tags = typeof flags.tags === 'string' ? flags.tags.split(',').map((tag) => tag.trim()) : []

if (tags.length === 0 || paths.length === 0) {
  // `--json` last: a bare flag followed by a path would take the path as its value.
  logger.error(
    'Usage: node packages/cli/scripts/pristine-hashes.mjs --tags <tag,tag,...> <path...> ' +
      '[--class managed|merged] [--json]',
  )
  process.exit(1)
}

if (flags.class !== undefined && !['managed', 'merged'].includes(flags.class)) {
  logger.error('--class must be managed or merged.')
  process.exit(1)
}

const result = {}

for (const input of paths) {
  const rel = input.replaceAll('\\', '/')
  const cls = flags.class ?? (classify(rel) === 'merged' ? 'merged' : 'managed')
  const entry = { class: cls, pristine: [], tags: {} }

  for (const tag of tags) {
    const shown = spawnSync('git', ['show', `${tag}:${rel}`], {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })

    // Absent at that tag: the file did not exist yet, or the tag does not.
    if (shown.status !== 0) {
      entry.tags[tag] = null
      continue
    }

    const hash = hashFor(rel, shown.stdout, cls)
    entry.tags[tag] = hash
    if (!entry.pristine.includes(hash)) entry.pristine.push(hash)
  }

  result[rel] = entry
}

// Plain stdout, not the logger: this output is meant to be copied into a
// migration, and badges or colour codes would come with it.
if (flags.json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
} else {
  const lines = Object.entries(result).flatMap(([rel, entry]) => [
    `${rel}  (${entry.class})`,
    ...Object.entries(entry.tags).map(([tag, hash]) => `  ${tag.padEnd(20)} ${hash ?? '(absent)'}`),
  ])
  process.stdout.write(`${lines.join('\n')}\n`)
}
