import { spawnSync } from 'node:child_process'
import process from 'node:process'

import { createConsola } from 'consola'

export const logger = createConsola({ level: 3, formatOptions: { colors: true, compact: false } })

/**
 * Long-form flags only, with `--flag value` and bare `--flag` both accepted.
 *
 * Deliberately not a full parser. Every command here is invoked by a person
 * reading a recipe or by CI reading a script, and neither needs `-xvf`.
 */
export function parseArgs(argv) {
  const positional = []
  const flags = {}

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) {
      positional.push(arg)
      continue
    }
    const key = arg.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) {
      flags[key] = true
    } else {
      flags[key] = next
      i++
    }
  }

  return { positional, flags }
}

/**
 * Format what was just written, rather than hand-matching every template to
 * oxfmt's current settings. Non-fatal: an unformatted file is a nuisance, and
 * `vpr fmt` fixes it on the next commit.
 */
export function formatTouchedFiles(files, cwd = process.cwd()) {
  const targets = [...new Set(files)].filter((file) => /\.(ts|vue|json|css)$/.test(file))
  if (targets.length === 0) return

  const result = spawnSync('vp', ['fmt', ...targets], {
    cwd,
    stdio: 'ignore',
    shell: process.platform === 'win32',
  })

  if (result.status !== 0) {
    logger.warn(
      'Could not run `vpr fmt` on the generated files — run it yourself before committing.',
    )
  }
}

/**
 * Whether the working tree is clean. `upgrade` and `eject` refuse to run on a
 * dirty one, because `git checkout .` is the whole recovery plan.
 */
export function isGitClean(root) {
  const result = spawnSync('git', ['status', '--porcelain'], {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })

  // Not a git repository, or git is unavailable: not something to block on.
  if (result.status !== 0) return true
  return result.stdout.trim() === ''
}
