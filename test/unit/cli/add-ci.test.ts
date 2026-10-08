import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'

import {
  CI_MARKER,
  CI_WORKFLOW,
  ciFacts,
  explainCiProblem,
  planCi,
  renderCiWorkflow,
  workflowOrigin,
  // @ts-expect-error - the CLI is plain ESM JavaScript with no type declarations.
} from '../../../packages/cli/src/generators/ci.mjs'
// @ts-expect-error - see above.
import * as lockfile from '../../../packages/cli/src/lib/lockfile.mjs'
// @ts-expect-error - see above.
import { Plan } from '../../../packages/cli/src/lib/plan.mjs'
// @ts-expect-error - the lint scripts are plain ESM JavaScript with no type declarations.
import { checkToolchainPins } from '../../../scripts/lint/check-toolchain-pins.mjs'
import { MAINTAINER } from './cli'
import { createFixture, type Fixture } from './fixture'
import { readWorkflow, stepOf, type Workflow } from './workflow'

const { driftedFiles, readLock, recordProvenance, writeLock } = lockfile

/**
 * `vuestrata add ci`: the CI workflow of a project built from the template.
 *
 * The workflow cannot be run here, so these tests are about what it says: which
 * jobs, which commands, under which permissions, and that none of it is the
 * template maintaining itself. The last suite holds its commands to the ones
 * the template's own workflow runs, which GitHub does execute.
 */

const REPO = process.cwd()
const TEMPLATE_WORKFLOW = fs.readFileSync(path.join(REPO, CI_WORKFLOW), 'utf8')
const OWN_WORKFLOW = 'name: Ours\n\non: push\n\njobs:\n  build:\n    runs-on: ubuntu-latest\n'

interface CiPlan {
  files: { rel: string; contents: string; own: string }[]
  edits: unknown[]
  notes: string[]
  validate: (options?: { force?: boolean }) => string[]
  apply: () => { written: string[]; provenance: unknown[] }
  toJSON: () => unknown
}

let fixture: Fixture

/** A project with the sources of truth the pins are held to, on Node 20. */
function seed({ docker = false } = {}) {
  fixture.write('.nvmrc', '20\n')
  fixture.write('package.json', JSON.stringify({ packageManager: 'pnpm@11.20.0' }))
  fixture.write('node_modules/vite-plus/package.json', JSON.stringify({ version: '0.2.9' }))
  if (docker) {
    fixture.write('Dockerfile', 'FROM node:20-slim\n')
    fixture.write('e2e/production-artifact.spec.ts', '// the smoke spec\n')
  }
}

function plan(options: Record<string, unknown> = {}, positional: string[] = []): CiPlan {
  return planCi({
    plan: new Plan(fixture.project),
    root: fixture.project,
    positional,
    options,
  }) as CiPlan
}

/** What `add ci` does once the plan validates, without the command around it. */
function add(options: { force?: boolean } = {}) {
  const planned = plan()
  const problems = planned
    .validate({ force: options.force })
    .map((problem) => explainCiProblem(problem, { root: fixture.project }) as string)
  if (problems.length > 0 || planned.files.length === 0) return { planned, problems }

  const result = planned.apply()
  const lock = readLock(fixture.project, { version: '1.1.0' })
  recordProvenance(lock, result.provenance, '1.1.0')
  writeLock(fixture.project, lock)
  return { planned, problems }
}

const generated = (): Workflow => readWorkflow(fixture.read(CI_WORKFLOW))

beforeEach(() => {
  fixture = createFixture()
})

afterEach(() => {
  fixture.cleanup()
})

describe('add ci: the plan', () => {
  it('plans one seeded file and no edit, and writes nothing until it is applied', () => {
    seed()

    const planned = plan()

    expect(planned.files.map((file) => [file.rel, file.own])).toEqual([[CI_WORKFLOW, 'seeded']])
    expect(planned.edits).toEqual([])
    expect(planned.validate()).toEqual([])
    expect(planned.toJSON()).toMatchObject({ files: [{ file: CI_WORKFLOW, own: 'seeded' }] })
    // A dry run is this plan, printed. Nothing reached the disk.
    expect(fixture.exists(CI_WORKFLOW)).toBe(false)
  })

  it('says what is left to a person: the variables, the deploy job, the missing container', () => {
    seed()

    const notes = plan().notes.join('\n')

    expect(notes).toContain('VUESTRATA_API_URL')
    expect(notes).toContain('VUESTRATA_AUTH_ADAPTER')
    expect(notes).toContain('no deploy job')
    expect(notes).toContain('no Dockerfile')
  })

  it('takes no name, and refuses a branch it could not write as one', () => {
    seed()

    expect(() => plan({}, ['payments'])).toThrow(/takes no name/)
    expect(() => plan({ branch: 'main]\n  workflow_dispatch: [' })).toThrow(/not a branch name/)
    expect(plan({ branch: 'release/1.x' }).files[0]?.contents).toContain('branches: [release/1.x]')
  })

  it('reads the Node version from .nvmrc, and says so when there is none', () => {
    seed()
    expect(plan().files[0]?.contents).toContain("NODE_VERSION: '20'")

    fixture.remove('.nvmrc')
    expect(() => plan()).toThrow(/\.nvmrc/)
  })
})

describe('add ci: what the workflow holds', () => {
  beforeEach(() => {
    seed({ docker: true })
    add()
  })

  it('is read whole by these tests', () => {
    expect(generated().accounts).toBe(true)
  })

  it('says in its header that it is the project’s and that no upgrade touches it', () => {
    const header = fixture.read(CI_WORKFLOW).split('\nname: CI\n')[0] ?? ''

    expect(header).toContain(CI_MARKER)
    expect(header).toContain('`vuestrata upgrade` never rewrites it')
    expect(header.split('\n').every((line) => line.startsWith('#'))).toBe(true)
  })

  it('runs on pull requests and on pushes to the default branch, cancelling stale runs', () => {
    const source = fixture.read(CI_WORKFLOW)

    expect(source).toContain('\non:\n  push:\n    branches: [main]\n  pull_request:\n')
    expect(source).toContain(
      '\nconcurrency:\n  group: ci-${{ github.workflow }}-${{ github.ref }}\n  cancel-in-progress: true\n',
    )
    // No trigger that runs with a token able to write, or on a schedule.
    expect(source).not.toMatch(/pull_request_target|workflow_run|schedule:|workflow_dispatch/)
  })

  it('asks for read access to the contents and nothing else', () => {
    const source = fixture.read(CI_WORKFLOW)

    expect(source).toContain('\npermissions:\n  contents: read\n\n')
    expect(source.match(/^\s*permissions:/gm)).toHaveLength(1)
    expect(source).not.toMatch(/:\s*write(?:-all)?\s*$/m)
    expect(source).not.toContain('secrets.')
  })

  it('has the five jobs and the gate that waits for all of them', () => {
    const { jobs, job } = generated()

    expect(Object.keys(jobs)).toEqual(['check', 'test', 'build', 'e2e', 'docker', 'ci-ok'])
    expect(job('build').needs).toEqual(['check', 'test'])
    expect(job('e2e').needs).toEqual(['build'])
    expect(job('docker').needs).toEqual(['check', 'test'])
    expect(job('ci-ok').needs).toEqual(['check', 'test', 'build', 'e2e', 'docker'])
    expect(job('ci-ok').if).toBe('always()')
  })

  it('checks, lints and type-checks after generating the typings the three read', () => {
    const runs = generated()
      .job('check')
      .steps.flatMap((step) => step.run ?? [])

    expect(runs).toEqual(['vp build', 'vp check', 'vp run lint', 'vp exec vue-tsc --noEmit'])
  })

  it('runs the tests with coverage and keeps the report', () => {
    const { steps } = generated().job('test')

    expect(steps.flatMap((step) => step.run ?? [])).toEqual(['vp run test --run --coverage'])
    expect(steps.at(-1)).toMatchObject({
      uses: 'actions/upload-artifact@v4',
      if: 'always()',
      with: { name: 'coverage', path: 'coverage/' },
    })
  })

  it('builds for production from the repository variables, with defaults that pass', () => {
    const { steps } = generated().job('build')
    const build = stepOf(generated().job('build'), 'Build')

    expect(build?.run).toBe('vp build')
    expect(build?.env).toEqual({
      VUESTRATA_RUNTIME_MODE: 'production',
      VUESTRATA_USE_MOCKS: 'false',
      VUESTRATA_AUTH_ADAPTER: "${{ vars.VUESTRATA_AUTH_ADAPTER || 'jwt' }}",
      VUESTRATA_API_URL: "${{ vars.VUESTRATA_API_URL || 'https://api.vuestrata.invalid' }}",
      VUESTRATA_RELEASE: '${{ github.sha }}',
    })
    expect(steps.flatMap((step) => step.run ?? [])).toEqual([
      'vp build',
      'node scripts/build/verify-bundle.mjs --mode=production',
    ])
    expect(steps.at(-1)).toMatchObject({
      uses: 'actions/upload-artifact@v4',
      with: { name: 'dist-production', path: 'dist/' },
    })
  })

  it('runs the preview suite in Chromium, with the browser cached and the report kept on failure', () => {
    const { steps } = generated().job('e2e')

    expect(steps.find((step) => step.uses?.startsWith('actions/cache@'))?.with).toMatchObject({
      path: '~/.cache/ms-playwright',
    })
    expect(steps.flatMap((step) => step.run ?? [])).toEqual([
      'vp exec playwright install --with-deps chromium',
      'vpr test:e2e -- --project=chromium',
    ])
    expect(stepOf(generated().job('e2e'), 'Run E2E against the preview build')?.env).toEqual({
      E2E_TARGET: 'preview',
    })
    expect(steps.at(-1)).toMatchObject({ uses: 'actions/upload-artifact@v4', if: 'failure()' })
  })

  it('builds the image, opens it in a browser, and pushes nothing', () => {
    const job = generated().job('docker')
    const script = job.steps.flatMap((step) => step.run ?? []).join('\n')

    expect(script).toContain('docker build')
    expect(script).toContain('/healthz')
    expect(stepOf(job, 'Smoke-test the running production artifact')).toMatchObject({
      run: 'vpr test:e2e -- e2e/production-artifact.spec.ts --project=chromium',
      env: { E2E_TARGET: 'external', E2E_BASE_URL: 'http://127.0.0.1:8080' },
    })
    expect(script).not.toMatch(/docker (?:push|login)|--push/)
    expect(fixture.read(CI_WORKFLOW)).not.toMatch(/push:\s*true|docker\/login-action/)
  })

  it('has no deploy job, and says where one goes', () => {
    const source = fixture.read(CI_WORKFLOW)

    expect(Object.keys(generated().jobs).filter((id) => /deploy|release|publish/.test(id))).toEqual(
      [],
    )
    expect(source).toContain('# No deploy job.')
    expect(source).toContain('docs/8.deployment/3.ci-for-your-project.md')
  })

  // By name, so that a maintainer step copied across later fails here.
  it.each([
    'cli-roundtrip',
    'lint:maintainer',
    'VUESTRATA_MAINTAINER',
    'template-lock',
    'check-template-lock',
    'build-payload',
    'cli:payload',
    'public-surface',
    'packages/cli',
    'release:verify',
    'github.repository',
    'deploy-demo',
    'vercel',
    'VERCEL_TOKEN',
  ])('holds no maintainer step: %s', (name) => {
    expect(fixture.read(CI_WORKFLOW)).not.toContain(name)
  })

  it('pins every action to a major tag, as the repository’s own workflows do', () => {
    const { uses } = generated()

    expect(uses.length).toBeGreaterThan(10)
    for (const action of uses) expect(action).toMatch(/^[\w-]+\/[\w-]+@v\d+$/)
  })

  it('runs everything through vp, and no other package manager', () => {
    for (const run of generated().runs) {
      expect(run).not.toMatch(/\b(?:npm|npx|pnpm|yarn|bun|bunx)\b/)
    }
  })

  it('leaves no placeholder of the generator behind', () => {
    const source = fixture.read(CI_WORKFLOW)

    expect(source).not.toMatch(/(?<!\$)\{\{|@docker/)
    expect(source).not.toContain('\r')
  })
})

describe('add ci: the container job', () => {
  it('is not written for a project with no Dockerfile', () => {
    seed()
    add()

    const { jobs, job, accounts } = generated()

    expect(accounts).toBe(true)
    expect(Object.keys(jobs)).toEqual(['check', 'test', 'build', 'e2e', 'ci-ok'])
    expect(job('ci-ok').needs).toEqual(['check', 'test', 'build', 'e2e'])
    expect(fixture.read(CI_WORKFLOW)).not.toMatch(/docker/i)
  })

  it('is not written without the spec that opens the image, and the plan says why', () => {
    seed()
    fixture.write('Dockerfile', 'FROM node:20-slim\n')

    expect(ciFacts(fixture.project)).toMatchObject({ docker: false, dockerWithoutSpec: true })
    expect(plan().notes.join('\n')).toContain('e2e/production-artifact.spec.ts')
    add()
    expect(Object.keys(generated().jobs)).not.toContain('docker')
  })
})

describe('add ci: a workflow that is already there', () => {
  beforeEach(() => seed())

  it('refuses to write over the template’s, saying what it is and offering --force', () => {
    fixture.write(CI_WORKFLOW, TEMPLATE_WORKFLOW)

    const { problems } = add()

    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain("it is the template's own pipeline")
    expect(problems[0]).toContain('skipped outside the template repository')
    expect(problems[0]).toContain('`vuestrata add ci --force` replaces it')
    expect(fixture.read(CI_WORKFLOW)).toBe(TEMPLATE_WORKFLOW)
  })

  it('refuses to write over a workflow the project wrote, and says it is theirs', () => {
    fixture.write(CI_WORKFLOW, OWN_WORKFLOW)

    const { problems } = add()

    expect(problems).toEqual([expect.stringContaining('it is your own workflow')])
    expect(problems[0]).toContain('--force')
    expect(fixture.read(CI_WORKFLOW)).toBe(OWN_WORKFLOW)
  })

  it('replaces either with --force, and records the file as the project’s', () => {
    fixture.write(CI_WORKFLOW, TEMPLATE_WORKFLOW)

    expect(add({ force: true }).problems).toEqual([])

    expect(workflowOrigin(fixture.read(CI_WORKFLOW))).toBe('project')
    expect(readLock(fixture.project).files[CI_WORKFLOW]).toMatchObject({ class: 'seeded' })
  })

  it('writes nothing on a second run, and says the workflow is in place', () => {
    add()
    const first = fixture.read(CI_WORKFLOW)

    const { planned, problems } = add()

    expect(problems).toEqual([])
    expect(planned.files).toEqual([])
    expect(planned.notes).toEqual([expect.stringContaining('already the project workflow')])
    expect(fixture.read(CI_WORKFLOW)).toBe(first)
  })

  it('is as quiet about a copy checked out with CRLF line endings', () => {
    add()
    fixture.write(CI_WORKFLOW, fixture.read(CI_WORKFLOW).replaceAll('\n', '\r\n'))

    expect(plan().files).toEqual([])
  })

  it('does not write over the project’s edits to it either, without --force', () => {
    add()
    const edited = `${fixture.read(CI_WORKFLOW)}\n  deploy:\n    runs-on: ubuntu-latest\n`
    fixture.write(CI_WORKFLOW, edited)

    const { problems } = add()

    expect(problems).toEqual([expect.stringContaining('edited since it was written')])
    expect(fixture.read(CI_WORKFLOW)).toBe(edited)
  })

  it('is never drift: the lock holds it as the project’s, whatever is done to it', () => {
    add()
    fixture.write(CI_WORKFLOW, OWN_WORKFLOW)
    expect(driftedFiles(fixture.project, readLock(fixture.project))).toEqual([])

    fixture.remove(CI_WORKFLOW)
    expect(driftedFiles(fixture.project, readLock(fixture.project))).toEqual([])
  })
})

describe('add ci: the toolchain pins', () => {
  interface Pins {
    problems: string[]
    skipped: string[]
  }
  const pins = () => checkToolchainPins(fixture.project) as Pins

  it('writes a workflow the pins check passes', () => {
    seed()
    add()

    expect(pins().problems).toEqual([])
  })

  it('is held to .nvmrc afterwards: the check fails a workflow left behind by a Node bump', () => {
    seed()
    add()
    fixture.write('.nvmrc', '22\n')

    expect(pins().problems).toEqual([
      expect.stringContaining(`${CI_WORKFLOW}: Node pinned to 20, but the repo uses 22`),
    ])
  })

  it('passes a project that has no workflow at all', () => {
    seed()

    expect(pins().problems).toEqual([])
  })
})

/**
 * The commands, held to the template's own workflow.
 *
 * Nothing runs the generated workflow in this repository, so it could go on
 * naming a script that was renamed here a year ago. The template's workflow IS
 * run, on every push, and its `cli-roundtrip` job ends on "what a consumer's CI
 * runs". Each command below must be the same string in both; change one and
 * this fails until the other follows.
 */
describe.skipIf(!MAINTAINER)('add ci: the same commands as the template’s own workflow', () => {
  const template = readWorkflow(TEMPLATE_WORKFLOW)
  const project = readWorkflow(
    renderCiWorkflow({
      node: fs.readFileSync(path.join(REPO, '.nvmrc'), 'utf8').trim(),
      docker: true,
    }) as string,
  )

  const runsOf = (workflow: Workflow, job: string) =>
    workflow.job(job).steps.flatMap((step) => step.run ?? [])
  /** One leg of a matrix, written out the way the job would run it. */
  const leg = (text: string | undefined, values: Record<string, string>) =>
    Object.entries(values).reduce(
      (out, [key, value]) => out.replaceAll(`\${{ matrix.${key} }}`, value),
      text ?? '',
    )

  const consumer = runsOf(template, 'cli-roundtrip')
  const buildLeg = { target: 'production', runtime_mode: 'production', use_mocks: 'false' }

  it('reads both workflows whole', () => {
    expect(template.accounts).toBe(true)
    expect(project.accounts).toBe(true)
  })

  it('installs the toolchain the same way, in every job', () => {
    const [checkout, setup] = template.job('build').steps
    expect(setup?.uses).toMatch(/^voidzero-dev\/setup-vp@/)

    for (const job of ['check', 'test', 'build', 'e2e', 'docker']) {
      expect(project.job(job).steps.slice(0, 2), job).toEqual([checkout, setup])
    }
  })

  it.each(['vp build', 'vp check', 'vp run lint'])(
    'checks with a command the round trip runs as a consumer: %s',
    (command) => {
      expect(runsOf(project, 'check')).toContain(command)
      expect(consumer).toContain(command)
    },
  )

  it('type-checks with the template’s command', () => {
    const [typecheck] = runsOf(template, 'typecheck')

    expect(typecheck).toMatch(/vue-tsc/)
    expect(runsOf(project, 'check')).toContain(typecheck)
  })

  it('tests with the round trip’s command and the template’s coverage flag', () => {
    const run = consumer.find((command) => /^vp run test\b/.test(command))
    const [, flag] = /^vpr test:.+ -- (--\S+)$/.exec(runsOf(template, 'test')[0] ?? '') ?? []

    expect(run).toBeDefined()
    expect(flag).toBeDefined()
    expect(runsOf(project, 'test')).toEqual([`${run} ${flag}`])
  })

  it('builds with the template’s command and the variables of its production leg', () => {
    const theirs = stepOf(template.job('build'), 'Build')
    const ours = stepOf(project.job('build'), 'Build')

    expect(ours?.run).toBe(theirs?.run)
    expect(Object.keys(ours?.env ?? {})).toEqual(Object.keys(theirs?.env ?? {}))
    for (const key of ['VUESTRATA_RUNTIME_MODE', 'VUESTRATA_USE_MOCKS', 'VUESTRATA_RELEASE']) {
      expect(ours?.env[key], key).toBe(leg(theirs?.env[key], buildLeg))
    }
    // The two a project sets fall back to exactly what the template builds with.
    const production = /- target: production\n(?: {12}.*\n)+/.exec(TEMPLATE_WORKFLOW)?.[0] ?? ''
    const built = (key: string) => new RegExp(`${key}: (\\S+)`).exec(production)?.[1]
    expect(ours?.env.VUESTRATA_AUTH_ADAPTER).toBe(
      `\${{ vars.VUESTRATA_AUTH_ADAPTER || '${built('auth_adapter')}' }}`,
    )
    expect(ours?.env.VUESTRATA_API_URL).toBe(
      `\${{ vars.VUESTRATA_API_URL || '${built('api_url')}' }}`,
    )
  })

  it('verifies the bundle with the template’s command', () => {
    const theirs = stepOf(template.job('build'), 'Verify bundle invariants')

    expect(stepOf(project.job('build'), 'Verify bundle invariants')?.run).toBe(
      leg(theirs?.run, buildLeg),
    )
  })

  it('runs the end-to-end suite with the template’s commands, in one browser', () => {
    const theirs = stepOf(template.job('e2e'), 'Run E2E against the production preview')
    const ours = stepOf(project.job('e2e'), 'Run E2E against the preview build')

    expect(ours?.run).toBe(leg(theirs?.run, { browser: 'chromium' }))
    expect(ours?.env).toEqual(theirs?.env)
    // The template installs per matrix leg; its docker job names Chromium outright.
    const install = runsOf(project, 'e2e')[0]
    expect(install).toMatch(/playwright install/)
    expect(runsOf(template, 'docker')).toContain(install)
  })

  it('opens the image with the template’s smoke step', () => {
    const name = 'Smoke-test the running production artifact'

    expect(stepOf(project.job('docker'), name)).toEqual(stepOf(template.job('docker'), name))
  })

  it('pins each action the template also uses to the version the template uses', () => {
    const repoUses = fs
      .readdirSync(path.join(REPO, '.github/workflows'))
      .flatMap(
        (file) =>
          readWorkflow(fs.readFileSync(path.join(REPO, '.github/workflows', file), 'utf8')).uses,
      )
    const pinned = new Map(repoUses.map((action) => action.split('@') as [string, string]))

    for (const action of project.uses) {
      const [name = '', version] = action.split('@')
      // actions/cache is the one action the template's workflows do not use.
      if (pinned.has(name)) expect(version, name).toBe(pinned.get(name))
      else expect(name).toBe('actions/cache')
    }
  })
})

describe.skipIf(!MAINTAINER)('add ci: from the command line, in this repository', () => {
  const cli = (...args: string[]) =>
    spawnSync(process.execPath, ['packages/cli/src/index.mjs', 'add', 'ci', ...args], {
      cwd: REPO,
      encoding: 'utf8',
      env: { ...process.env, NO_COLOR: '1' },
    })

  it('refuses to replace the template’s workflow, and --dry-run --force prints the plan', () => {
    const refused = cli('--dry-run')
    expect(refused.status).toBe(1)
    expect(`${refused.stdout}${refused.stderr}`).toContain("it is the template's own pipeline")
    expect(`${refused.stdout}${refused.stderr}`).toContain('add ci --force')

    const planned = cli('--dry-run', '--force')
    expect(planned.status).toBe(0)
    expect(`${planned.stdout}${planned.stderr}`).toContain(`create  ${CI_WORKFLOW}  (seeded)`)

    expect(fs.readFileSync(path.join(REPO, CI_WORKFLOW), 'utf8')).toBe(TEMPLATE_WORKFLOW)
  }, 60_000)
})
