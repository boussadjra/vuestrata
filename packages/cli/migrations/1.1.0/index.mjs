import { slot } from '../../src/lib/manifest.mjs'
import { ANCHORED_REGISTRIES } from '../../src/lib/registry.mjs'
import { splitRegion } from '../split-regions.mjs'

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

export default {
  description: 'split each gen: sentinel into vuestrata: and app: regions',
  steps: ANCHORED_REGISTRIES.filter((registry) => registry.hadLegacyMarker).map((registry) => ({
    file: (manifest) => slot(manifest, registry.slot),
    apply: (source) =>
      splitRegion(source, registry.region, { comment: registry.comment, keepIn: 'app' }),
  })),
}
