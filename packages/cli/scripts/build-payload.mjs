import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { collectManaged } from '../src/lib/managed.mjs'

/**
 * Snapshot the files Vuestrata owns into the CLI package.
 *
 * `upgrade` needs the new contents of every managed file, and the only source
 * of truth for those is this repository. Copying them in at build time makes
 * the CLI and the code it installs the same version by construction — a CLI
 * that fetched them at run time could always be pointed at a payload nobody
 * tested it against.
 *
 * Run before publishing, and in CI so a stale payload cannot ship:
 *
 *     node packages/cli/scripts/build-payload.mjs
 *     node packages/cli/scripts/build-payload.mjs --check
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../..')
const payloadRoot = path.resolve(here, '../payload')

function hash(contents) {
  return `sha256-${crypto.createHash('sha256').update(contents.replaceAll('\r\n', '\n')).digest('hex')}`
}

function build({ check }) {
  const version = JSON.parse(fs.readFileSync(path.resolve(here, '../package.json'), 'utf8')).version
  const files = collectManaged(repoRoot)
  const index = { version, files: {} }

  const stale = []

  for (const rel of files) {
    const contents = fs.readFileSync(path.join(repoRoot, rel), 'utf8')
    index.files[rel] = hash(contents)

    const target = path.join(payloadRoot, 'files', rel)

    if (check) {
      if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== contents) stale.push(rel)
      continue
    }

    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, contents)
  }

  const indexPath = path.join(payloadRoot, 'index.json')
  const serialized = `${JSON.stringify(index, null, 2)}\n`

  if (check) {
    if (!fs.existsSync(indexPath) || fs.readFileSync(indexPath, 'utf8') !== serialized) {
      stale.push('payload/index.json')
    }

    // A payload file with no source is just as wrong as a missing one: it means
    // something was deleted upstream and would be reinstalled on every upgrade.
    for (const orphan of existingPayloadFiles()) {
      if (!(orphan in index.files)) stale.push(`${orphan} (no longer in the repository)`)
    }

    if (stale.length > 0) {
      console.error('The CLI payload is stale. Run `node packages/cli/scripts/build-payload.mjs`.')
      for (const rel of stale.slice(0, 20)) console.error(`  - ${rel}`)
      if (stale.length > 20) console.error(`  … and ${stale.length - 20} more`)
      process.exit(1)
    }

    console.log(`Payload is current: ${files.length} file(s) at ${version}.`)
    return
  }

  // Drop anything that is no longer part of the template.
  for (const orphan of existingPayloadFiles()) {
    if (orphan in index.files) continue
    fs.rmSync(path.join(payloadRoot, 'files', orphan))
  }

  fs.mkdirSync(payloadRoot, { recursive: true })
  fs.writeFileSync(indexPath, serialized)
  console.log(`Payload built: ${files.length} file(s) at ${version}.`)
}

function existingPayloadFiles() {
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

build({ check: process.argv.includes('--check') })
