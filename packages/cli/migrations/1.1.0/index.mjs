import { slot } from '../../src/lib/manifest.mjs'
import { ANCHORED_REGISTRIES } from '../../src/lib/registry.mjs'
import { splitRegion } from '../split-regions.mjs'
import deployment from './deployment.mjs'
import notes from './notes.mjs'
import projectFiles from './project-files.mjs'
import promotions from './promotions.mjs'
import rbacEject from './rbac-eject.mjs'
import roles from './roles.mjs'

/**
 * Give every registry two sentinel regions instead of one.
 *
 * Before 1.1.0 a registry carried a single `gen:<region>` marker, and both a
 * Vuestrata release and a local `vuestrata add` appended to it. That is a
 * collision on every upgrade, in the files whose breakage is silent: a module
 * missing from `setup.ts` does not throw, the feature simply never loads.
 *
 * Everything currently inside the old region was written by this project's own
 * generator runs, so it moves to the `app:` region — the one nothing upstream
 * writes to. The `vuestrata:` region is created empty above it.
 *
 * This is also the migration that proves the mechanism, which is why it is the
 * first one: the anchor rename had to happen anyway, and doing it as a codemod
 * rather than a release note is the difference between the upgrade path being
 * real and being aspirational.
 */

const regionSplit = {
  description: 'split each gen: sentinel into vuestrata: and app: regions',
  steps: ANCHORED_REGISTRIES.filter((registry) => registry.hadLegacyMarker).map((registry) => ({
    file: (manifest) => slot(manifest, registry.slot),
    apply: (source) =>
      splitRegion(source, registry.region, { comment: registry.comment, keepIn: 'app' }),
  })),
}

// One release, several changes, each with a line of its own in the upgrade report.
//
// The order is the order of the report, and of the codemods: the region split
// first, because later steps look for the regions it creates. Ownership steps
// (promote, reclassify) run after every codemod, whatever their place here.
//
//   promotions      files the project owned that Vuestrata maintains from now on
//   rbacEject       core/lib/rbac/ as the 1.0 eject left it, taken back before it is judged
//   projectFiles    changes this release needs in files that stay the project's
//   deployment      the container and CI files, replaced when nobody edited them
//   roles           the router and the User type learn that a user may hold several roles
//   notes           what only a person can act on
export default [regionSplit, ...promotions, rbacEject, ...projectFiles, deployment, roles, notes]
