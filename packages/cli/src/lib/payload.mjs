import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { hashContents } from './plan.mjs'

/**
 * The managed files this release ships, bundled into the package by
 * `scripts/build-payload.mjs` at pack time.
 *
 * Bundled rather than fetched so that upgrading needs no network, and so the
 * CLI and the code it installs are the same version by construction.
 */

const here = path.dirname(fileURLToPath(import.meta.url))

export function payloadRoot() {
  return path.resolve(here, '../../payload')
}

/**
 * A readable payload, or `undefined` when the package was built without one.
 *
 * Taken as an argument by `upgrade` rather than reached for directly, so a test
 * can supply a payload built for the occasion instead of publishing two
 * releases to test an upgrade between them.
 */
export function createPayloadSource(root = payloadRoot()) {
  const indexPath = path.join(root, 'index.json')
  if (!fs.existsSync(indexPath)) return undefined

  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'))

  return {
    version: index.version,
    files: index.files,
    has: (rel) => fs.existsSync(path.join(root, 'files', rel)),
    read: (rel) => fs.readFileSync(path.join(root, 'files', rel), 'utf8'),
    hash: (rel) => hashContents(fs.readFileSync(path.join(root, 'files', rel), 'utf8')),
  }
}
