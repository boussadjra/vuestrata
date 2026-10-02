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
