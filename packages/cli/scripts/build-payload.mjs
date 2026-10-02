import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { hashFor } from '../src/lib/lockfile.mjs'
import {
  classify,
  collectDocs,
  collectManaged,
  collectSeeded,
  PROJECT_REGISTRIES,
} from '../src/lib/managed.mjs'
import { loadManifest, slot } from '../src/lib/manifest.mjs'
import { hashContents } from '../src/lib/plan.mjs'
import {
  blankRegions,
  regionEntries,
  regionLines,
  regionNames,
  sentinel,
  UPSTREAM_SCOPE,
} from '../src/lib/registry.mjs'

/**
 * Snapshot the files Vuestrata ships into the CLI package.
 *
 * `upgrade` needs the new contents of every file it installs, and the only
 * source of truth for those is this repository. Copying them in at build time
 * makes the CLI and the code it installs the same version by construction — a
 * CLI that fetched them at run time could always be pointed at a payload nobody
 * tested it against.
 *
 * The index says what each file is (see lib/payload.mjs for the shape): the
 * managed and merged files an upgrade keeps in sync, with a blanked hash for
 * each merged one; the seams, copied in so an upgrade can write a new one once;
 * and the lines of each project registry's `vuestrata:` region, which an
 * upgrade appends to the project's copy.
 *
 * Run before publishing, and in CI so a stale payload cannot ship:
 *
 *     node packages/cli/scripts/build-payload.mjs
 *     node packages/cli/scripts/build-payload.mjs --check
 */

const here = path.dirname(fileURLToPath(import.meta.url))

/**
 * Build the payload for `repoRoot` into `payloadRoot`, or with `check`, compare
 * what is there against what would be built. Exported so a test can build one
 * from this repository into a directory of its own.
 *
 * @returns {{ ok: boolean, problems: string[], stale: string[], index: object }}
 */
export function buildPayload({
  repoRoot = path.resolve(here, '../../..'),
  payloadRoot = path.resolve(here, '../payload'),
  check = false,
} = {}) {
  const version = JSON.parse(fs.readFileSync(path.resolve(here, '../package.json'), 'utf8')).version
  const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8')

  const index = { version, files: {}, seeded: {}, merged: {}, regions: {}, docs: [] }
  const shipped = new Map()
  const problems = []

  for (const rel of collectManaged(repoRoot)) {
    const contents = read(rel)
    index.files[rel] = hashContents(contents)
    shipped.set(rel, contents)

    if (classify(rel) !== 'merged') continue

    // A merged file with no app: region is a managed file under a misleading
    // name, and the classification is what is wrong — not the file.
    if (regionNames(contents).length === 0) {
      problems.push(`${rel} is in MERGED_FILES but has no app: region.`)
    }
    // An upgrade replaces the body of every app: region with the project's, so
    // anything shipped there reaches nobody who already has the file.
    if (blankRegions(contents) !== contents) {
      problems.push(
        `${rel} ships entries inside an app: region. Those are the project's; what Vuestrata ` +
          'ships belongs in the vuestrata: region.',
      )
    }
    index.merged[rel] = hashFor(rel, contents, 'merged')
  }

  for (const rel of collectSeeded(repoRoot)) {
    const contents = read(rel)
    index.seeded[rel] = hashContents(contents)
    shipped.set(rel, contents)
  }

  const manifest = loadManifest(repoRoot)
  for (const registry of PROJECT_REGISTRIES) {
    const rel = slot(manifest, registry.slot)
    const name = sentinel(registry.region, UPSTREAM_SCOPE)
    const lines = fs.existsSync(path.join(repoRoot, rel)) ? regionLines(read(rel), name) : undefined

    if (lines === undefined) {
      problems.push(`${rel} has no ${name} region, so a release could never add to it.`)
      continue
    }
    problems.push(...unsyncableLines(rel, name, lines, registry))

    index.regions[registry.slot] = {
      ...index.regions[registry.slot],
      [registry.region]: lines.map((line) => line.trim()).filter(Boolean),
    }
  }

  // Which pages of `docs/` are the template's, so `eject` removes those and not
  // the runbooks a project keeps beside them. Not files an upgrade installs.
  index.docs = collectDocs(repoRoot)

  if (problems.length > 0) return { ok: false, problems, stale: [], index }

  const indexPath = path.join(payloadRoot, 'index.json')
  const serialized = `${JSON.stringify(index, null, 2)}\n`
  const orphans = existingPayloadFiles(payloadRoot).filter((rel) => !shipped.has(rel))

  if (check) {
    const stale = []
    for (const [rel, contents] of shipped) {
      const target = path.join(payloadRoot, 'files', rel)
      if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== contents) stale.push(rel)
    }
    if (!fs.existsSync(indexPath) || fs.readFileSync(indexPath, 'utf8') !== serialized) {
      stale.push('payload/index.json')
    }
    // A payload file with no source is just as wrong as a missing one: it means
    // something was deleted upstream and would be reinstalled on every upgrade.
    for (const orphan of orphans) stale.push(`${orphan} (no longer in the repository)`)

    return { ok: stale.length === 0, problems: [], stale, index }
  }

  for (const [rel, contents] of shipped) {
    const target = path.join(payloadRoot, 'files', rel)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, contents)
  }

  // Drop anything that is no longer part of the template.
  for (const orphan of orphans) fs.rmSync(path.join(payloadRoot, 'files', orphan))

  fs.mkdirSync(payloadRoot, { recursive: true })
  fs.writeFileSync(indexPath, serialized)
  return { ok: true, problems: [], stale: [], index }
}

/**
 * What in a registry's `vuestrata:` region an upgrade could not deliver whole.
 *
 * Region sync appends, one at a time, the entries a project's copy lacks
 * anywhere in the file. Most registries are compared line by line, so an entry
 * the formatter wrapped over several lines would arrive in pieces: a lone `},`
 * is already in the file, and the lines around it are not. `.env.example` is
 * compared by variable, and a comment that documents none is not an entry
 * (see `regionEntries`), so it would never arrive at all.
 */
export function unsyncableLines(rel, name, lines, registry) {
  const present = lines.map((line) => line.trim()).filter(Boolean)

  if (registry.keyedBy !== 'variable') {
    return present
      .filter((line) => !balanced(line))
      .map(
        (line) =>
          `${rel}: "${line}" in ${name} is not a whole entry. An upgrade appends the lines a ` +
          'project lacks one at a time, so an entry wrapped over several lines would arrive in ' +
          'pieces. Keep each entry on one line.',
      )
  }

  // The lines no entry claimed, counted rather than matched: `#` repeats.
  const claimed = regionEntries(lines, { keyedBy: 'variable' }).flatMap((entry) => entry.lines)
  const stray = present.filter((line) => {
    const at = claimed.indexOf(line)
    if (at !== -1) claimed.splice(at, 1)
    return at === -1
  })

  return stray.length === 0
    ? []
    : [
        `${rel}: ${stray.map((line) => `"${line}"`).join(', ')} in ${name} documents no ` +
          'variable. An upgrade appends each variable with the comment block directly above ' +
          'it, so this would never arrive. Move it onto the variable it describes, or out of ' +
          'the region.',
      ]
}

/** Whether `line` closes every bracket it opens, ignoring strings and comments. */
function balanced(line) {
  const code = line
    .replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g, '')
    .replace(/\/\*.*?\*\//g, '')
    .replace(/\/\/.*$/, '')

  let depth = 0
  for (const char of code) {
    if ('([{'.includes(char)) depth++
    else if (')]}'.includes(char) && --depth < 0) return false
  }
  return depth === 0
}

function existingPayloadFiles(payloadRoot) {
  const base = path.join(payloadRoot, 'files')
  if (!fs.existsSync(base)) return []

  const found = []
  const stack = ['']
  while (stack.length > 0) {
    const relDir = stack.pop()
    for (const entry of fs.readdirSync(path.join(base, relDir), { withFileTypes: true })) {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name
      if (entry.isDirectory()) stack.push(rel)
      else found.push(rel)
    }
  }
  return found
}

function main() {
  const check = process.argv.includes('--check')
  const result = buildPayload({ check })
  const counts =
    `${Object.keys(result.index.files).length} synced file(s), ` +
    `${Object.keys(result.index.seeded).length} seeded, ` +
    `${Object.keys(result.index.merged).length} of them merged`

  if (!result.ok) {
    const [heading, lines] =
      result.problems.length > 0
        ? ['The CLI payload cannot be built:', result.problems]
        : [
            'The CLI payload is stale. Run `node packages/cli/scripts/build-payload.mjs`.',
            result.stale,
          ]

    console.error(heading)
    for (const line of lines.slice(0, 20)) console.error(`  - ${line}`)
    if (lines.length > 20) console.error(`  … and ${lines.length - 20} more`)
    process.exit(1)
  }

  console.log(
    check
      ? `Payload is current: ${counts} at ${result.index.version}.`
      : `Payload built: ${counts} at ${result.index.version}.`,
  )
}

/**
 * Whether this module is the script Node was asked to run, rather than one a
 * test imported for `buildPayload`. Compared by real path: Node loads the main
 * module through its realpath, so run through a symlink or junction `argv[1]`
 * names the link, and a plain comparison would skip `main()` and exit 0 having
 * checked nothing.
 */
export function isEntryPoint(argv1) {
  if (!argv1) return false
  try {
    const real = (file) => fs.realpathSync(file).toLowerCase()
    return real(path.resolve(argv1)) === real(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (isEntryPoint(process.argv[1])) main()
