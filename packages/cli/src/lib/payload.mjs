import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { hashContents } from './plan.mjs'

/**
 * The files this release ships, bundled into the package by
 * `scripts/build-payload.mjs` at pack time.
 *
 * Bundled rather than fetched so that upgrading needs no network, and so the
 * CLI and the code it installs are the same version by construction.
 *
 * `index.json` has had two shapes, and both are read:
 *
 *   v1  { version, files }
 *       Every file managed. Nothing seeded, merged or region-scoped shipped.
 *
 *   v2  { version, files, seeded, merged, regions }
 *       files    path → hash of every file an upgrade keeps in sync, merged
 *                files included, so a v1 reader still sees the whole set
 *       seeded   path → hash of the seams, copied in to be written once
 *       merged   path → hash with the `app:` region bodies blanked
 *       regions  slot → region → the lines inside this release's
 *                `vuestrata:` region of each project registry
 *       docs     the `docs/` pages the release ships, which no upgrade installs.
 *                `eject` removes those and no other, and reads this list when
 *                the project's lockfile predates its own. Optional.
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
  const files = index.files ?? {}
  const seeded = index.seeded ?? {}
  const merged = index.merged ?? {}
  const regions = index.regions ?? {}
  const docs = index.docs
  const full = (rel) => path.join(root, 'files', rel)

  return {
    version: index.version,
    format: ['seeded', 'merged', 'regions'].some((key) => key in index) ? 2 : 1,
    files,
    seeded,
    merged,
    regions,
    /** The `docs/` pages the template ships, or `undefined` when this payload predates the list. */
    docs: Array.isArray(docs) ? docs : undefined,
    /** @returns {'managed' | 'merged' | 'seeded' | undefined} */
    classOf: (rel) => {
      if (Object.hasOwn(merged, rel)) return 'merged'
      if (Object.hasOwn(files, rel)) return 'managed'
      if (Object.hasOwn(seeded, rel)) return 'seeded'
      return undefined
    },
    has: (rel) => fs.existsSync(full(rel)),
    read: (rel) => fs.readFileSync(full(rel), 'utf8'),
    hash: (rel) => hashContents(fs.readFileSync(full(rel), 'utf8')),
  }
}
