import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vite-plus/test'

// @ts-expect-error - the lint scripts are plain ESM JavaScript with no type declarations.
import { checkToolchainPins } from '../../../scripts/lint/check-toolchain-pins.mjs'

/**
 * The toolchain pins, in projects that are not this repository.
 *
 * `vpr lint` runs this check in every project built from the template, and a
 * project deletes what it does not deploy with. A missing Dockerfile used to
 * end the check with ENOENT, so a project without a container could not lint.
 */

interface Result {
  fatal?: string
  problems: string[]
  skipped: string[]
  sources: { nodeMajor: string; pnpmVersion: string; vitePlusVersion: string }
}

const REPO = process.cwd()
/** The template's own checkout, where every pinned file is expected to be there. */
const MAINTAINER = process.env.VUESTRATA_MAINTAINER === '1'
const roots: string[] = []

/** A project holding the sources of truth, and the pinned files it is given. */
function project(files: Record<string, string> = {}): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vuestrata-pins-'))
  roots.push(root)

  const all: Record<string, string> = {
    '.nvmrc': '22\n',
    'package.json': JSON.stringify({ packageManager: 'pnpm@11.20.0', engines: { node: '>=20' } }),
    'node_modules/vite-plus/package.json': JSON.stringify({ version: '0.2.9' }),
    ...files,
  }
  for (const [rel, contents] of Object.entries(all)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
    fs.writeFileSync(path.join(root, rel), contents)
  }
  return root
}

const check = (root: string) => checkToolchainPins(root) as Result

const DOCKERFILE = [
  'FROM node:22-slim AS build',
  'RUN npm i -g pnpm@11.20.0 vite-plus@0.2.9 @voidzero-dev/vite-plus-linux-x64-gnu@0.2.9',
  '',
].join('\n')
const VERCEL = JSON.stringify({ installCommand: 'npm i -g vite-plus@0.2.9 && vp install' })
const CI = "env:\n  NODE_VERSION: '22'\n"

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

describe('check-toolchain-pins', () => {
  it('passes for this repository', () => {
    const result = check(REPO)

    expect(result.fatal).toBeUndefined()
    expect(result.problems).toEqual([])
    // A project may have deleted any of them. The template has them all.
    if (MAINTAINER) expect(result.skipped).toEqual([])
  })

  it('passes for a project that has every pinned file, in agreement', () => {
    const root = project({
      Dockerfile: DOCKERFILE,
      'vercel.json': VERCEL,
      '.github/workflows/ci.yml': CI,
      '.node-version': '22\n',
    })

    expect(check(root)).toEqual({
      problems: [],
      skipped: [],
      sources: { nodeMajor: '22', pnpmVersion: '11.20.0', vitePlusVersion: '0.2.9' },
    })
  })

  it('skips the Dockerfile of a project that ships no container', () => {
    const root = project({ 'vercel.json': VERCEL, '.github/workflows/ci.yml': CI })

    const result = check(root)

    expect(result.problems).toEqual([])
    expect(result.skipped).toEqual(['Dockerfile'])
  })

  it('skips the vercel.json of a project that deploys elsewhere', () => {
    const root = project({ Dockerfile: DOCKERFILE })

    const result = check(root)

    expect(result.problems).toEqual([])
    expect(result.skipped).toEqual(['vercel.json'])
  })

  it('passes with nothing to check but the sources of truth', () => {
    expect(check(project())).toMatchObject({ problems: [], skipped: ['Dockerfile', 'vercel.json'] })
  })

  it('still fails a Dockerfile that is there and has drifted', () => {
    const root = project({ Dockerfile: DOCKERFILE.replace('node:22', 'node:20') })

    expect(check(root).problems).toEqual([expect.stringContaining('Dockerfile: Node pinned to 20')])
  })

  it('checks a native build-stage pin when Docker declares its platform', () => {
    const native = DOCKERFILE.replace('FROM node:', 'FROM --platform=$BUILDPLATFORM node:')
    expect(check(project({ Dockerfile: native })).problems).toEqual([])
    expect(check(project({ Dockerfile: native.replace('node:22', 'node:20') })).problems).toEqual([
      expect.stringContaining('Dockerfile: Node pinned to 20'),
    ])
  })

  it('still fails a workflow that is there and has drifted', () => {
    const root = project({ '.github/workflows/ci.yml': CI.replace("'22'", "'20'") })

    expect(check(root).problems).toEqual([
      expect.stringContaining('.github/workflows/ci.yml: Node pinned to 20'),
    ])
  })

  describe('the workflows of a project', () => {
    // The shape `vuestrata add ci` writes: the pin, and the step that reads it.
    const PROJECT_CI = [
      'name: CI',
      'env:',
      "  NODE_VERSION: '22'",
      'jobs:',
      '  check:',
      '    steps:',
      '      - uses: voidzero-dev/setup-vp@v1',
      '        with:',
      '          node-version: ${{ env.NODE_VERSION }}',
      '',
    ].join('\n')

    it('passes the project workflow, and a project that has none', () => {
      expect(check(project({ '.github/workflows/ci.yml': PROJECT_CI })).problems).toEqual([])
      expect(check(project()).problems).toEqual([])
      expect(check(project({ '.github/dependabot.yml': 'version: 2\n' })).problems).toEqual([])
    })

    it('fails the project workflow when .nvmrc moved and it did not', () => {
      const root = project({ '.nvmrc': '24\n', '.github/workflows/ci.yml': PROJECT_CI })

      expect(check(root).problems).toEqual([
        expect.stringContaining(
          '.github/workflows/ci.yml: Node pinned to 22, but the repo uses 24',
        ),
      ])
    })

    it('holds a pinned workflow to .nvmrc whatever it is called', () => {
      const root = project({
        '.github/workflows/ci.yml': PROJECT_CI,
        '.github/workflows/deploy.yaml': PROJECT_CI.replace("'22'", "'20'"),
      })

      expect(check(root).problems).toEqual([
        expect.stringContaining('.github/workflows/deploy.yaml: Node pinned to 20'),
      ])
    })

    it('fails a workflow that still reads the pin and no longer has one', () => {
      const root = project({
        '.github/workflows/ci.yml': PROJECT_CI.replace("  NODE_VERSION: '22'\n", ''),
      })

      expect(check(root).problems).toEqual([
        expect.stringContaining('.github/workflows/ci.yml: no Node pin found'),
      ])
    })

    it('leaves alone a workflow the project wrote that gets its Node another way', () => {
      const own = 'name: CI\njobs:\n  build:\n    steps:\n      - run: vp check\n'
      const root = project({
        '.github/workflows/ci.yml': own,
        '.github/workflows/codeql.yml': 'name: CodeQL\n',
      })

      expect(check(root).problems).toEqual([])
    })
  })

  describe('.node-version, which is what vp runs locally', () => {
    it.each(['22', '22.23.2', 'v22.1.0', '22\r\n'])('accepts %j beside .nvmrc 22', (pinned) => {
      expect(check(project({ '.node-version': pinned })).problems).toEqual([])
    })

    it.each(['24', '20.11.0', 'lts/*', ''])('rejects %j beside .nvmrc 22', (pinned) => {
      expect(check(project({ '.node-version': pinned })).problems).toEqual([
        expect.stringMatching(/^\.node-version: pins Node .* but \.nvmrc builds on 22/),
      ])
    })

    it('is not required: a project without one is not failed for it', () => {
      const result = check(project())

      expect(result.problems).toEqual([])
      expect(result.skipped).not.toContain('.node-version')
    })

    // The template must have one. A project that upgraded from 1.0 has one only
    // if it added it, which the upgrade's note asks for and cannot do.
    const hasPin = fs.existsSync(path.join(REPO, '.node-version'))

    it.skipIf(!MAINTAINER && !hasPin)('is pinned here, to the major CI and the image use', () => {
      // Without it vp resolves Node from `engines.node`, a range, and picks the
      // newest major the range allows: 24 locally, 22 everywhere else.
      const pinned = fs.readFileSync(path.join(REPO, '.node-version'), 'utf8').trim()
      const nvmrc = fs.readFileSync(path.join(REPO, '.nvmrc'), 'utf8').trim()

      expect(pinned).toBe(nvmrc)
    })
  })

  it('says what is missing when a source of truth is', () => {
    const noManager = project({ 'package.json': '{}' })
    expect(check(noManager).fatal).toMatch(/packageManager/)

    const notInstalled = project()
    fs.rmSync(path.join(notInstalled, 'node_modules'), { recursive: true })
    expect(check(notInstalled).fatal).toMatch(/vite-plus is not installed/)
  })
})
