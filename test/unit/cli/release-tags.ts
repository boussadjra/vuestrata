import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { MAINTAINER } from './cli'

/**
 * The releases a migration is written against, read from their tags.
 *
 * A migration replaces a file only when it is what a release shipped, so its
 * tests need those files as they were. A checkout without the tags cannot run
 * them and skips; in the template's own CI a skipped proof is a proof that did
 * not run, and there the missing tags fail (see promotions-1.1.0.test.ts).
 */

// Vitest runs from the repository root, as every script here does.
export const REPO = process.cwd()

/** The two releases 1.1.0 migrates from. They agree on every file it reads. */
export const TAGS = ['v1.0.1-alpha.5', 'v1.0.1-alpha.6']
export const FROM = '1.0.1-alpha.6'
export const TAG = `v${FROM}`

function git(...args: string[]) {
  return spawnSync('git', args, { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

export const hasTags = TAGS.every(
  (tag) => git('rev-parse', '--verify', '--quiet', `${tag}^{commit}`).status === 0,
)

/** A project built from the template has no upstream tags; only the template's CI must. */
export const TAGS_REQUIRED = MAINTAINER && Boolean(process.env.CI)

const shown = new Map<string, string | null>()

/** A file as a release shipped it. Cached: each lookup is a `git show` process. */
export function atTag(tag: string, rel: string): string | null {
  const key = `${tag}:${rel}`
  if (!shown.has(key)) {
    const result = git('show', key)
    shown.set(key, result.status === 0 ? result.stdout : null)
  }
  return shown.get(key) ?? null
}

/** A file as 1.0.1-alpha.6 shipped it. Throws for one that release did not have. */
export function released(rel: string): string {
  const contents = atTag(TAG, rel)
  if (contents === null) throw new Error(`${rel} is not in ${TAG}`)
  return contents
}

export const inRepo = (rel: string) => fs.readFileSync(path.join(REPO, rel), 'utf8')
export const lf = (text: string) => text.replaceAll('\r\n', '\n')
