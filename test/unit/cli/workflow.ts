/**
 * A GitHub workflow, read just far enough to ask what its jobs run.
 *
 * Not a YAML parser, and it does not try to be one: no YAML package is a
 * dependency of this repository, and the tests that use this ask narrow
 * questions (which jobs, which steps, which `uses`, `run`, `with` and `env`).
 * It reads the block style the workflows here are written in, and `accounts`
 * says whether it saw every `uses:` and `run:` the text holds, so a workflow
 * written some other way fails the test that reads it and is not half-read.
 */

export interface WorkflowStep {
  name?: string
  uses?: string
  run?: string
  if?: string
  with: Record<string, string>
  env: Record<string, string>
}

export interface WorkflowJob {
  id: string
  name?: string
  if?: string
  needs: string[]
  steps: WorkflowStep[]
}

export interface Workflow {
  jobs: Record<string, WorkflowJob>
  /** The job `id`. Throws when the workflow has none, so a test names what is missing. */
  job: (id: string) => WorkflowJob
  /** Every `uses:` value, in order. */
  uses: string[]
  /** Every `run:` script, in order. */
  runs: string[]
  /** Whether every `uses:` and `run:` in the text was read into a step. */
  accounts: boolean
}

const indentOf = (line: string) => line.length - line.trimStart().length
const unquote = (value: string) => value.trim().replace(/^(['"])(.*)\1$/, '$2')

export function readWorkflow(source: string): Workflow {
  const lines = source.replaceAll('\r\n', '\n').split('\n')
  const jobsAt = lines.findIndex((line) => /^jobs:\s*$/.test(line))
  const jobs: Record<string, WorkflowJob> = {}

  let job: WorkflowJob | undefined
  let step: WorkflowStep | undefined
  /** The `with:` or `env:` map of the current step that is being filled. */
  let map: Record<string, string> | undefined

  for (let at = jobsAt + 1; at < lines.length; at++) {
    const line = lines[at] ?? ''
    const indent = indentOf(line)
    const text = line.trim()
    if (text === '' || text.startsWith('#')) continue

    if (indent === 2) {
      const id = /^([\w-]+):\s*$/.exec(text)?.[1]
      if (!id) continue
      job = { id, needs: [], steps: [] }
      jobs[id] = job
      step = undefined
      continue
    }
    if (!job) continue

    if (indent === 4) {
      step = undefined
      const [, key, value = ''] = /^([\w-]+):\s*(.*)$/.exec(text) ?? []
      if (key === 'name') job.name = unquote(value)
      if (key === 'if') job.if = value
      if (key === 'needs') {
        job.needs = value
          .replace(/^\[|\]$/g, '')
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean)
      }
      continue
    }

    let entry = text
    if (indent === 6 && text.startsWith('- ')) {
      step = { with: {}, env: {} }
      job.steps.push(step)
      map = undefined
      entry = text.slice(2)
    } else if (indent === 8) {
      map = undefined
    }
    if (!step) continue

    const [, key, value = ''] = /^([\w-]+):\s*(.*)$/.exec(entry) ?? []
    if (!key) continue

    if (indent === 10 && map) {
      map[key] = unquote(value)
      continue
    }

    if (key === 'with' || key === 'env') {
      map = step[key]
    } else if (key === 'name' || key === 'uses') {
      step[key] = unquote(value)
    } else if (key === 'if') {
      step.if = value
    } else if (key === 'run') {
      if (!/^[|>]-?$/.test(value)) {
        step.run = value
        continue
      }
      // A block scalar: every deeper line that follows, dedented.
      const body: string[] = []
      while (at + 1 < lines.length) {
        const next = lines[at + 1] ?? ''
        if (next.trim() !== '' && indentOf(next) <= 8) break
        body.push(next)
        at++
      }
      const depth = Math.min(...body.filter((l) => l.trim() !== '').map(indentOf))
      step.run = body
        .map((l) => l.slice(depth))
        .join('\n')
        .trim()
    }
  }

  const steps = Object.values(jobs).flatMap((entry) => entry.steps)
  const uses = steps.flatMap((entry) => (entry.uses === undefined ? [] : [entry.uses]))
  const runs = steps.flatMap((entry) => (entry.run === undefined ? [] : [entry.run]))

  const inText = (key: string) =>
    lines.filter((line) => new RegExp(`^\\s*(?:- )?${key}:(?:\\s|$)`).test(line)).length

  return {
    jobs,
    job(id) {
      const found = jobs[id]
      if (!found) throw new Error(`the workflow has no "${id}" job`)
      return found
    },
    uses,
    runs,
    accounts: jobsAt !== -1 && uses.length === inText('uses') && runs.length === inText('run'),
  }
}

/**
 * A stand-in for the template's own `ci.yml`: its shape, a Node pin, and the
 * `cli-roundtrip` job it is recognised by.
 *
 * Not the repository's file. These tests stay in a project that keeps
 * `packages/cli`, and there `.github/workflows/ci.yml` is the project's from
 * the day it runs `vuestrata add ci --force`; a test that read it as "the
 * template's workflow" would fail in that project for doing what it was told.
 */
export const TEMPLATE_CI = `name: CI

on:
  push:
    branches: [main]

env:
  NODE_VERSION: '22'

jobs:
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Maintainer gates (template lock, CLI payload)
        if: github.repository == 'boussadjra/vuestrata'
        run: vpr lint:maintainer

  docker:
    name: Docker image (production artifact)
    runs-on: ubuntu-latest
    needs: [lint]
    steps:
      - run: docker build -t vuestrata:ci .

  # The CLI edits projects built from this template.
  cli-roundtrip:
    name: CLI Round Trip
    if: github.repository == 'boussadjra/vuestrata'
    runs-on: ubuntu-latest
    steps:
      - run: node packages/cli/src/index.mjs doctor

  ci-ok:
    name: CI OK
    runs-on: ubuntu-latest
    if: always()
    needs: [lint, docker, cli-roundtrip]
    steps:
      - run: echo "All CI jobs succeeded."
`

/** The step of `job` named `name`, or the one whose `run` is exactly `name`. */
export function stepOf(job: WorkflowJob | undefined, name: string): WorkflowStep | undefined {
  return job?.steps.find((entry) => entry.name === name || entry.run === name)
}
