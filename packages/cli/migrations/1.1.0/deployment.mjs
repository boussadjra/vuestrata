import { incomingPath } from '../../src/lib/workspace.mjs'
import {
  headersBeingReplaced,
  headersGenerateTheNewConfig,
  REGENERATE_HEADERS,
} from './headers-unit.mjs'
import { heldBack, replaceWithShipped } from './shipped.mjs'
import { listOf } from './text.mjs'

/**
 * The container, the CI workflow and the two checks that read them.
 *
 * All of them are the project's files, and 1.1.0 changed every one: the image
 * builds for arm64, compresses, answers /healthz and pins its base images; CI
 * probes that endpoint and no longer runs the template's own gates in a
 * project. A copy nobody edited is replaced. An edited one stays, with the new
 * version in .vuestrata/incoming/, and ONE note covers the family: six notes
 * saying "this differs" would bury the two sentences that matter.
 */

const SPEC = 'e2e/production-artifact.spec.ts'
const CI = '.github/workflows/ci.yml'

/** What each file gained, for the note. Short: the incoming copy has the rest. */
const WHAT_CHANGED = {
  Dockerfile:
    'Dockerfile builds for arm64 as well as amd64 (the vite-plus binding follows TARGETARCH), ' +
    'pins both base images by digest (nginx 1.30.5), writes a .gz beside each text asset for ' +
    'gzip_static, and its HEALTHCHECK probes /healthz',
  'docker-compose.yml': 'docker-compose.yml probes /healthz in its healthcheck',
  '.dockerignore':
    '.dockerignore excludes every node_modules (`**/node_modules`), not only the root one',
  '.github/dependabot.yml':
    '.github/dependabot.yml gains a `docker` entry, without which the digest-pinned base images ' +
    'never move',
  [CI]:
    `${CI} runs the template's own gates (\`vpr lint:maintainer\`, VUESTRATA_MAINTAINER, the ` +
    '`cli-roundtrip` job) only in the template repository, checks out full history for the ' +
    'test job (`fetch-depth: 0`), waits for the container on /healthz, and ends the docker job ' +
    'with a build-only arm64 check. In a project the `cli-roundtrip` job tests the copy of the ' +
    'CLI under packages/cli, which no upgrade updates: delete that job, or take the condition ' +
    'on it from the incoming copy',
  [SPEC]:
    `${SPEC} also asserts the /healthz probe, the JSON 502 for an unrouted /api, compression ` +
    'and the cache lifetimes',
  'scripts/lint/check-toolchain-pins.mjs':
    'scripts/lint/check-toolchain-pins.mjs checks both vite-plus bindings the Dockerfile names, ' +
    'skips a Dockerfile, a vercel.json or a workflow that is not there (`vuestrata eject` ' +
    'removes two workflows, and a project deletes what it does not deploy with), and holds ' +
    '.node-version to .nvmrc',
}

const family = [
  replaceWithShipped({
    file: 'Dockerfile',
    carries: (source) => source.includes('/healthz') && source.includes('TARGETARCH'),
  }),
  replaceWithShipped({
    file: 'docker-compose.yml',
    carries: (source) => source.includes('/healthz'),
  }),
  replaceWithShipped({
    file: '.dockerignore',
    carries: (source) => /^\*\*\/node_modules\s*$/m.test(source),
  }),
  replaceWithShipped({
    file: '.github/dependabot.yml',
    carries: (source) => /package-ecosystem:\s*['"]?docker\b/.test(source),
  }),
  replaceWithShipped({
    file: CI,
    // The one change a project cannot leave: the round trip either gone, or
    // limited to the template's repository.
    carries: (source) =>
      !/^ {2}cli-roundtrip:/m.test(source) ||
      /^ {2}cli-roundtrip:\s*\n(?: {4}.*\n)*? {4}if:\s*github\.repository\s*==/m.test(source),
  }),
  replaceWithShipped({
    file: SPEC,
    carries: (source) => source.includes('/healthz'),
    // Its new assertions describe the nginx config the 1.1.0 generators write.
    // Beside the old generators it fails against a correct image.
    ready: headersGenerateTheNewConfig,
  }),
  replaceWithShipped({
    file: 'scripts/lint/check-toolchain-pins.mjs',
    carries: (source) => source.includes('existsSync') && source.includes('[a-z0-9-]'),
  }),
]

/** The family's files this upgrade leaves alone. Promotions ask, to say it once. */
export function deploymentHeldBack(manifest, ws) {
  return heldBack(family, manifest, ws)
}

function familyNote(source, manifest, ws) {
  const held = deploymentHeldBack(manifest, ws)
  if (held.length === 0) return undefined

  // Held back although it is a release's copy: only the spec, waiting for the
  // header generators.
  const waiting = held.filter((step) => step.wasPristine(ws.read(step.file)))
  const edited = held.filter((step) => !waiting.includes(step))
  const parts = []

  if (edited.length > 0) {
    const names = edited.map((step) => step.file)
    parts.push(
      `${listOf(names)} ${names.length === 1 ? 'differs' : 'differ'} from what 1.0.1-alpha.6 ` +
        `shipped, so ${names.length === 1 ? 'it was' : 'they were'} left as ` +
        `${names.length === 1 ? 'it is' : 'they are'}. This release's ` +
        `${names.length === 1 ? 'version is' : 'versions are'} in ` +
        `${incomingPath('')} to compare and merge. What changed: ` +
        `${edited.map((step) => WHAT_CHANGED[step.file]).join('; ')}.`,
    )
  }

  if (waiting.length > 0) {
    parts.push(
      `${SPEC} was not replaced although yours is unedited: its new assertions (the /healthz ` +
        'probe, the JSON 502 for an unrouted /api, compression, the cache lifetimes) hold only ' +
        'for an image built from the docker/nginx.conf the 1.1.0 header generators write, and ' +
        'yours were held back (see the note on scripts/security/headers.mjs). Once you have ' +
        'merged them and run `vpr security:headers`, replace the spec with ' +
        `${incomingPath(SPEC)}.`,
    )
  }

  // The reminder that follows a replaced pair of generators, folded in here so
  // that it is not a second note about the same files.
  if (headersBeingReplaced(ws)) {
    parts.push(
      `The header generators were replaced, so before you build an image, ${REGENERATE_HEADERS}`,
    )
  }

  return parts.join(' ')
}

export default {
  description: 'the container, the CI workflow and their checks follow the hardened image',
  steps: [...family, { kind: 'note', note: familyNote }],
}
