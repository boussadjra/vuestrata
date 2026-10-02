/**
 * How `deploy.config.ts` reaches the tooling that acts on it.
 *
 * The file is data. Two of Vuestrata's scripts read it: the Vite plugin, which
 * validates the variables it declares and makes every page load
 * `runtime-config.js`, and the header generator, which turns its `headers` and
 * `runtime` into the CSP and the container's key list. Both are Vuestrata's, so
 * a pristine project gets the copies that read it from the upgrade.
 *
 * An edited copy stays as it was. The project then has a `deploy.config.ts`
 * that looks effective and is not: nothing validates it, nothing widens the
 * policy, and nothing fails to say so. `doctor` warns.
 */

/** Whether `source` loads the project's deployment configuration. */
export const readsDeployConfig = (source) => /\bloadDeployConfig\s*\(/.test(source)

/**
 * The scripts that must read it, each with what is lost while its copy does
 * not. Paths are relative to the project root: neither file has a slot, because
 * `vite.config.ts` and `package.json` name them where they are.
 */
export const DEPLOY_CONFIG_READERS = [
  {
    file: 'scripts/vite/vuestrata-plugin.mjs',
    consequence:
      'the variables you declare under `env` are not validated when the app is built, and no ' +
      'page loads runtime-config.js, so nothing a deployment sets at start reaches the app',
  },
  {
    file: 'scripts/security/sync-headers.mjs',
    consequence:
      'the `headers` and `runtime` you declare there reach neither the generated security ' +
      'headers nor docker/runtime/keys',
  },
]

/** What to do about an edited copy, as one sentence for a warning. */
export const deployWiringSteps = (file, incoming) =>
  `${file} is a copy from before that file existed. Compare it with this release's version ` +
  `(the next \`vuestrata upgrade\` writes it to ${incoming}), merge your changes into that one, ` +
  `then run \`vuestrata adopt ${file}\`.`

/**
 * A warning for a Dockerfile that builds the runtime-configured image without
 * telling the header generator so, or `undefined`.
 *
 * The image reads its API URL when a container starts, so its page must leave
 * connections to the header: a browser enforces the page's CSP `<meta>` as
 * well, and a tag written for the build's API origin blocks the one a
 * container is given. `sync-headers.mjs --runtime-config` is what writes the
 * open tag. The Dockerfile is the project's file, so an upgrade cannot add the
 * flag, and without it nothing fails until a container is started against
 * another origin. The image is recognised by its copying the entrypoint.
 */
export function dockerfileWithoutRuntimeConfig(source) {
  if (!/docker-entrypoint\.d/.test(source)) return undefined

  const steps = source
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('#') && /sync-headers\.mjs/.test(line))
  if (steps.length === 0 || steps.every((line) => /--runtime-config\b/.test(line))) {
    return undefined
  }

  return (
    'Dockerfile runs scripts/security/sync-headers.mjs without --runtime-config. The image ' +
    'reads its API URL when a container starts, and its page would then block an API origin ' +
    'the container was given. Make the step ' +
    '`RUN node scripts/security/sync-headers.mjs --runtime-config --api-url="$VUESTRATA_API_URL"`.'
  )
}
