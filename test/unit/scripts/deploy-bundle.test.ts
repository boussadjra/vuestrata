import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vite-plus/test'

// @ts-expect-error - the build scripts are plain ESM JavaScript with no type declarations.
import { resolveDeployBundle } from '../../../scripts/security/deploy-config.mjs'

/**
 * `bundle` in `deploy.config.ts`: the budgets a project sets for its own
 * build, and the chunks it adds to or takes off the on-demand check.
 *
 * `scripts/build/verify-bundle.mjs` acts on it (verify-bundle.test.ts). What
 * is pinned here is the reading of it, which follows the rule the header
 * generator has for `headers`: nothing invalid is ever dropped silently. A
 * budget under a misspelt key would otherwise be a budget its author believes
 * is in force, in the one file whose whole purpose is to say what is.
 */

const DEPLOY_CONFIG = 'src/modules/app/config/deploy.config.ts'
const KNOWN = ['charts-vendor', 'docs-vendor']

function problemsOf(bundle: unknown) {
  try {
    resolveDeployBundle(bundle, { onDemandChunks: KNOWN })
    return ''
  } catch (error) {
    return (error as Error).message
  }
}

describe('resolveDeployBundle', () => {
  it('resolves nothing declared to no budget and no chunk', () => {
    expect(resolveDeployBundle(undefined)).toEqual({
      budgets: {},
      onDemandChunks: { add: [], remove: [] },
    })
    expect(resolveDeployBundle({})).toEqual({
      budgets: {},
      onDemandChunks: { add: [], remove: [] },
    })
  })

  it('keeps the budgets that were set, and only those', () => {
    expect(
      resolveDeployBundle(
        {
          totalJsKb: 8192,
          initialPayloadGzipKb: 620.5,
          onDemandChunks: {
            add: ['maps-vendor', 'maps-vendor', 'docs-vendor'],
            remove: ['charts-vendor'],
          },
        },
        { onDemandChunks: KNOWN },
      ),
    ).toEqual({
      budgets: { initialPayloadGzipKb: 620.5, totalJsKb: 8192 },
      // Once each, and not what the check looks for already.
      onDemandChunks: { add: ['maps-vendor'], remove: ['charts-vendor'] },
    })
  })

  it.each([
    [null, 'bundle: must be an object'],
    [[], 'bundle: must be an object'],
    [{ largestEagerChunkKb: 0 }, 'bundle.largestEagerChunkKb: 0 is not a size'],
    [{ largestEagerChunkKb: Number.NaN }, 'bundle.largestEagerChunkKb: NaN is not a size'],
    [
      { largestEagerStylesheetKb: Number.POSITIVE_INFINITY },
      'bundle.largestEagerStylesheetKb: Infinity is not a size',
    ],
    [{ totalJsKb: '7MB' }, 'bundle.totalJsKb: "7MB" is not a size'],
    [{ budget: 1 }, 'bundle.budget: unknown option. Known: initialPayloadGzipKb,'],
    [{ onDemandChunks: ['maps-vendor'] }, 'bundle.onDemandChunks: must be an object'],
    [{ onDemandChunks: { also: [] } }, 'bundle.onDemandChunks.also: unknown option'],
    [{ onDemandChunks: { add: 'maps-vendor' } }, 'bundle.onDemandChunks.add: must be a list'],
    [
      { onDemandChunks: { add: ['assets/maps-vendor'] } },
      'bundle.onDemandChunks.add: "assets/maps-vendor" is not a chunk name',
    ],
    [{ onDemandChunks: { add: [''] } }, 'bundle.onDemandChunks.add: "" is not a chunk name'],
    [
      { onDemandChunks: { add: ['maps-vendor'], remove: ['maps-vendor'] } },
      'bundle.onDemandChunks: "maps-vendor" is under both add and remove',
    ],
    [
      { onDemandChunks: { remove: ['chart-vendor'] } },
      'bundle.onDemandChunks.remove: "chart-vendor" is not a chunk the check looks for, so ' +
        'removing it changes nothing. It looks for: charts-vendor, docs-vendor.',
    ],
  ])('refuses %j', (bundle, problem) => {
    const message = problemsOf(bundle)

    // The file and the key, so the message can be acted on as it is.
    expect(message).toContain(`Invalid \`bundle\` in ${DEPLOY_CONFIG}`)
    expect(message).toContain(problem)
  })

  it('reports every problem at once', () => {
    const message = problemsOf({ totalJsKb: 0, budget: 1, onDemandChunks: { add: [7] } })

    expect(message.split('\n  - ')).toHaveLength(4)
  })

  it('takes any name to remove when it is not told which ones exist', () => {
    expect(resolveDeployBundle({ onDemandChunks: { remove: ['anything'] } })).toEqual({
      budgets: {},
      onDemandChunks: { add: [], remove: ['anything'] },
    })
  })
})

describe('the bundle key and the browser', () => {
  const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8')
  const code = (rel: string) => source(rel).replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '')

  // The app imports deploy.config.ts for its variables, so whatever reads
  // `bundle` at runtime would put the budgets, and the code that validates
  // them, into what every visitor downloads. Only build tooling reads it.
  it('is declared as a type in core/lib, with no code behind it', () => {
    const deploy = source('src/modules/core/lib/config/deploy.ts')

    expect(deploy).toMatch(/export interface DeployBundle \{/)
    expect(deploy).toMatch(/bundle\?: DeployBundle/)
    // The runtime parser uses zod's English diagnostics. No bundle validator
    // or other runtime dependency may reach the browser through this file.
    expect(code('src/modules/core/lib/config/deploy.ts').match(/^import (?!type ).*/gm)).toEqual([
      "import en from 'zod/v4/locales/en.js'",
    ])
    expect(code('src/modules/core/lib/config/deploy.ts')).not.toMatch(/\.bundle\b/)
  })

  it('is read by nothing under src/', () => {
    const readers = fs
      .readdirSync(path.join(process.cwd(), 'src'), { recursive: true, encoding: 'utf8' })
      .filter((rel) => /\.(?:ts|vue)$/.test(rel))
      .filter((rel) => /\bDeployBundle\b|\.bundle\b|resolveDeployBundle/.test(code(`src/${rel}`)))
      .map((rel) => rel.replaceAll('\\', '/'))

    expect(readers).toEqual(['modules/core/lib/config/deploy.ts'])
  })

  it('ships undeclared: the seeded file has it as a commented example only', () => {
    expect(code(DEPLOY_CONFIG)).not.toContain('bundle')
    expect(source(DEPLOY_CONFIG)).toContain('bundle: {')
  })
})
