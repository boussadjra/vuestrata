import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { UPSTREAM_REPOSITORY } from '../lib/eject/project.mjs'

/**
 * Scaffold the CI workflow of a PROJECT.
 *
 * The workflows the template ships are the template's own: they round-trip the
 * CLI, publish a release tarball and deploy the hosted demo. A project needs
 * the half of that which is about an application: check, test, a production
 * build that is verified, the end-to-end suite, and the container when it ships
 * one. This writes that half, and nothing that maintains the template.
 *
 * The file is `seeded`: recorded in the lockfile as the project's, so no
 * upgrade writes over it and `doctor` never compares it. That is the class
 * under which a team editing its own pipeline sees neither drift nor an
 * overwrite, and it still tells a later release that this file started here.
 *
 * The text lives in `templates/ci.yml`, as a workflow rather than as strings in
 * this file: `${{ … }}` is GitHub's syntax and a template literal's, and a
 * workflow that can be read is one that gets reviewed. A maintainer test holds
 * its commands to the ones the template's own workflow runs.
 */

export const CI_WORKFLOW = '.github/workflows/ci.yml'

/** What tells the project workflow from any other, including the template's. */
export const CI_MARKER = 'Written once, by `vuestrata add ci` or `vuestrata eject`.'

const DOCS_PAGE = 'docs/8.deployment/3.ci-for-your-project.md'
const DOCKERFILE = 'Dockerfile'
const DOCKER_SPEC = 'e2e/production-artifact.spec.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const TEMPLATE = path.resolve(here, '../templates/ci.yml')

const DOCKER_BLOCK = / {2}# @docker:start\n([\s\S]*?) {2}# @docker:end\n\n?/

/**
 * The workflow, for a project with these answers.
 *
 * @param {object} options
 * @param {string} options.node The Node major, as `.nvmrc` has it.
 * @param {string} [options.branch] The default branch.
 * @param {boolean} [options.docker] Whether the project builds a container.
 * @param {string} [options.docs] Where the page that explains the workflow is.
 */
export function renderCiWorkflow({ node, branch = 'main', docker = false, docs = docsUrl() }) {
  const template = fs.readFileSync(TEMPLATE, 'utf8').replaceAll('\r\n', '\n')

  return template
    .replace(DOCKER_BLOCK, docker ? '$1\n' : '')
    .replace('needs: [check, test, build, e2e, docker]', () =>
      docker ? 'needs: [check, test, build, e2e, docker]' : 'needs: [check, test, build, e2e]',
    )
    .replace("branches: ['{{branch}}']", () => `branches: [${branch}]`)
    .replace('{{node}}', () => node)
    .replace('{{docs}}', () => docs)
}

/**
 * The page about this workflow, in the upstream repository. At the tag of the
 * CLI that wrote it and not at `main`: the page describes the workflow of a
 * release, and the one a project holds does not move when `main` does.
 */
export function docsUrl(ref = `v${cliVersion()}`) {
  return `${UPSTREAM_REPOSITORY}/blob/${ref}/${DOCS_PAGE}`
}

/**
 * What the project itself says the workflow should hold: the Node version, from
 * the source `check-toolchain-pins.mjs` holds every pin to, and whether it
 * builds a container.
 *
 * Without `.nvmrc` the version is read from the workflow that is already there,
 * which carried the same pin. Throws when neither says.
 *
 * `exists` is for a caller that is about to remove files: `eject` passes one
 * that already answers for the tree it will leave.
 */
export function ciFacts(root, { exists = (rel) => fs.existsSync(path.join(root, rel)) } = {}) {
  const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')

  const node =
    (exists('.nvmrc') ? /^v?(\d+(?:\.\d+){0,2})/.exec(read('.nvmrc').trim())?.[1] : undefined) ??
    (exists(CI_WORKFLOW)
      ? /NODE_VERSION: '(\d+(?:\.\d+){0,2})'/.exec(read(CI_WORKFLOW))?.[1]
      : undefined)
  if (!node) {
    throw new Error(
      'Could not tell which Node this project builds on: .nvmrc is missing or does not start ' +
        'with a major version. It is the one source every Node pin is held to ' +
        '(scripts/lint/check-toolchain-pins.mjs); write the major there, e.g. `22`.',
    )
  }

  // A project that ships no container deletes its Dockerfile (see
  // OPTIONAL_DEPLOYMENTS in lib/managed.mjs), and a job that builds an image
  // from one that is not there fails every run.
  const hasDockerfile = exists(DOCKERFILE)
  const docker = hasDockerfile && exists(DOCKER_SPEC)

  return {
    node,
    docker,
    /** A Dockerfile, but not the spec the docker job opens the image with. */
    dockerWithoutSpec: hasDockerfile && !docker,
    docs: docsUrl(),
  }
}

function cliVersion() {
  return JSON.parse(fs.readFileSync(path.resolve(here, '../../package.json'), 'utf8')).version
}

/** Which workflow `source` is: the one written here, the template's own, or the project's. */
export function workflowOrigin(source) {
  if (source.includes(CI_MARKER)) return 'project'
  // The round trip is the template testing its own CLI. `eject` keys on the
  // same job; a workflow without it has been taken in hand by somebody.
  if (/^ {2}cli-roundtrip:\s*$/m.test(source.replaceAll('\r\n', '\n'))) return 'template'
  return 'custom'
}

/**
 * `vuestrata add ci [--branch <name>] [--force]`.
 *
 * Writes nothing when the workflow in place is already the one it would write,
 * so a second run is quiet. Any other workflow stops the plan unless `--force`
 * is passed (see `explainCiProblem`).
 */
export function planCi({ plan, root, positional, options }) {
  if (positional.length > 0) {
    throw new Error(`\`add ci\` takes no name (got "${positional[0]}")`)
  }

  const branch = typeof options.branch === 'string' ? options.branch : 'main'
  if (!/^[\w.-]+(?:\/[\w.-]+)*$/.test(branch)) {
    throw new Error(`"${branch}" is not a branch name this can write into a workflow`)
  }

  const facts = ciFacts(root)
  const contents = renderCiWorkflow({ ...facts, branch })

  const full = path.join(root, CI_WORKFLOW)
  if (fs.existsSync(full) && fs.readFileSync(full, 'utf8').replaceAll('\r\n', '\n') === contents) {
    plan.addNote(`${CI_WORKFLOW} is already the project workflow. Nothing to write.`)
    return plan
  }

  plan.addFile(CI_WORKFLOW, contents, { own: 'seeded' })

  for (const note of ciNotes(facts)) plan.addNote(note)
  return plan
}

/** What is left for a person once the workflow is written. */
export function ciNotes(facts) {
  const notes = [
    'Set the repository variables VUESTRATA_API_URL and VUESTRATA_AUTH_ADAPTER before you deploy ' +
      'what the build job uploads. Until then it builds against https://api.vuestrata.invalid ' +
      'with the jwt adapter, which passes and reaches no backend.',
    `There is no deploy job, on purpose. ${facts.docs} shows where one goes.`,
  ]
  if (facts.dockerWithoutSpec) {
    notes.push(
      `No docker job was written: there is a ${DOCKERFILE}, but not the ${DOCKER_SPEC} the job ` +
        'opens the image with.',
    )
  } else if (!facts.docker) {
    notes.push(
      `No docker job was written: this project has no ${DOCKERFILE}. Run \`vuestrata add ci ` +
        '--force` after adding one.',
    )
  }
  return notes
}

/**
 * Say what the workflow in the way is, instead of only that a file exists.
 *
 * A project that did not eject still has the template's `ci.yml`. Its
 * maintainer steps are skipped outside the template's repository, so it is not
 * broken, but it is not a project's pipeline either: it builds against the
 * template's placeholder API, runs four browsers and the template's image
 * checks. This is where a team learns that, and that `--force` is the way over.
 */
export function explainCiProblem(problem, { root }) {
  if (!problem.startsWith(`${CI_WORKFLOW} already exists`)) return problem

  const origin = workflowOrigin(fs.readFileSync(path.join(root, CI_WORKFLOW), 'utf8'))

  if (origin === 'template') {
    return (
      `${CI_WORKFLOW} already exists, and it is the template's own pipeline: its maintainer ` +
      'steps are skipped outside the template repository, and the rest tests the template ' +
      '(four browsers, the image started three ways, a demo build verified beside the ' +
      'production one, and no setting for your API). ' +
      '`vuestrata add ci --force` replaces it with the project pipeline; `vuestrata eject` does ' +
      'the same while removing the demo.'
    )
  }
  if (origin === 'project') {
    return (
      `${CI_WORKFLOW} already exists: it is the project workflow, edited since it was written. ` +
      '`vuestrata add ci --force` writes the current version over your changes.'
    )
  }
  return (
    `${CI_WORKFLOW} already exists, and it is your own workflow. Nothing was written. ` +
    '`vuestrata add ci --force` replaces it with the project pipeline.'
  )
}
