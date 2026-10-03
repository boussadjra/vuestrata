import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { stripVTControlCharacters } from 'node:util'

import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'

// Importing the script must not run it: `isEntryPoint()` keeps the checks, the
// dist walk and their `process.exit()` behind a direct invocation.
// @ts-expect-error - the build scripts are plain ESM JavaScript with no type declarations.
import { chunkName, chunksNamed } from '../../../scripts/build/verify-bundle.mjs'

/**
 * `verify-bundle.mjs` is the only gate that can see what a build shipped, so a
 * false positive in it is expensive twice: the build goes red for nothing, and
 * the next real failure gets rebuilt away as "that flaky check again".
 *
 * Its MSW check matched "msw" anywhere in a chunk's filename — content hash
 * included — and `register-WvaWmSwy.js` lowercases to "…wmswy". These tests pin
 * the name/hash split against real rolldown output, and run the script itself
 * against small fixture builds.
 */

const SCRIPT = path.join(process.cwd(), 'scripts/build/verify-bundle.mjs')

describe('chunkName', () => {
  it('strips the directory, the content hash and the extension', () => {
    expect(chunkName('assets/msw-vendor-e1wNtvZD.js')).toBe('msw-vendor')
    expect(chunkName('assets/register-WvaWmSwy.js')).toBe('register')
  })

  // All three are file names from a real build. The hash is base64url, so a
  // dash inside or at either end of it must not be read as the name separator.
  it('keeps names intact when the hash itself contains a dash', () => {
    expect(chunkName('assets/docs--8Mo5HM9.js')).toBe('docs')
    expect(chunkName('assets/1.overview-DlhRris-.js')).toBe('1.overview')
    expect(chunkName('assets/3.add-a-theme-CS1YJ-aE.js')).toBe('3.add-a-theme')
  })

  it('falls back to the whole basename for a file with no hash', () => {
    expect(chunkName('mockServiceWorker.js')).toBe('mockServiceWorker')
  })
})

describe('chunksNamed', () => {
  it('does not mistake a content hash that spells "msw" for an MSW chunk', () => {
    expect(chunksNamed(['assets/register-WvaWmSwy.js'], 'msw')).toEqual([])
  })

  it('finds the MSW vendor chunk by its name', () => {
    expect(chunksNamed(['assets/msw-vendor-XXXXXXXX.js'], 'msw')).toEqual([
      'assets/msw-vendor-XXXXXXXX.js',
    ])
  })

  it('ignores "msw" at every position a hash can hold it', () => {
    const files = [0, 1, 2, 3, 4, 5].map(
      (at) => `assets/register-${'AbCdE'.slice(0, at)}mSw${'AbCdE'.slice(at)}.js`,
    )
    expect(files.every((file) => chunkName(file) === 'register')).toBe(true)
    expect(chunksNamed(files, 'msw')).toEqual([])
  })

  it('matches whole words of the name, not letters that happen to line up', () => {
    const files = [
      'assets/itemsWidget-Ab12Cd34.js',
      'assets/useMswWorker-Ab12Cd34.js',
      'assets/MSWSetup-Ab12Cd34.js',
      'assets/formsWizard-Ab12Cd34.js',
    ]
    expect(chunksNamed(files, 'msw')).toEqual([
      'assets/useMswWorker-Ab12Cd34.js',
      'assets/MSWSetup-Ab12Cd34.js',
    ])
  })
})

describe('verify-bundle.mjs', () => {
  let dist: string

  beforeEach(() => {
    dist = fs.mkdtempSync(path.join(os.tmpdir(), 'vuestrata-verify-bundle-'))
  })

  afterEach(() => {
    fs.rmSync(dist, { recursive: true, force: true })
  })

  /** The page a build emits: the runtime configuration first, then the app. */
  const PAGE =
    '<!doctype html><html><head><script src="/runtime-config.js"></script>' +
    '<script type="module" crossorigin src="/assets/index-D5TFPTY5.js"></script></head>' +
    '<body><div id="app"></div></body></html>'

  /**
   * Write a fake build output: `assets/<file>` → chunk source, beside the page
   * and the runtime configuration every build has. `root` replaces or (with
   * `null`) removes one of those two.
   */
  function emit(chunks: Record<string, string>, root: Record<string, string | null> = {}) {
    fs.mkdirSync(path.join(dist, 'assets'), { recursive: true })
    for (const [file, source] of Object.entries(chunks)) {
      fs.writeFileSync(path.join(dist, 'assets', file), source)
    }
    const files = {
      'index.html': PAGE,
      'runtime-config.js': 'window.__VUESTRATA_RUNTIME__ ||= {}\n',
      ...root,
    }
    for (const [file, source] of Object.entries(files)) {
      if (source !== null) fs.writeFileSync(path.join(dist, file), source)
    }
  }

  function run(...args: string[]) {
    const result = spawnSync(process.execPath, [SCRIPT, ...args], {
      encoding: 'utf8',
      // The child inherits Vitest's NODE_ENV=test, under which consola prints
      // only warnings and errors. The assertions read the full report.
      env: { ...process.env, CONSOLA_LEVEL: '3' },
    })
    return {
      status: result.status,
      output: stripVTControlCharacters(`${result.stdout}${result.stderr}`),
    }
  }

  // The flip side of the import above running nothing: invoked directly, the
  // script must still check. A guard that failed that way would exit 0 having
  // checked nothing, which is the one failure a gate must never have.
  it('runs its checks when invoked directly', () => {
    const { status, output } = run()
    expect(status).toBe(1)
    expect(output).toContain('Usage: verify-bundle.mjs')
  })

  it('passes a production build whose content hash spells "msw"', () => {
    emit({
      'index-D5TFPTY5.js': 'import "./register-WvaWmSwy.js"\n',
      'register-WvaWmSwy.js': 'export {}\n',
    })

    const { status, output } = run('--mode=production', `--dist=${dist}`)
    expect(output).toContain('no MSW chunk is emitted')
    expect(status).toBe(0)
  })

  it('fails a production build that emits the MSW vendor chunk', () => {
    emit({
      'index-D5TFPTY5.js': 'export {}\n',
      'msw-vendor-e1wNtvZD.js': 'export {}\n',
    })

    const { status, output } = run('--mode=production', `--dist=${dist}`)
    expect(status).toBe(1)
    expect(output).toContain('found assets/msw-vendor-e1wNtvZD.js')
  })

  // The in-app docs ship in a production build and are published at /docs, so
  // they get no exemption: a page quoting the demo account fails the build.
  it('searches documentation chunks for demo markers in production', () => {
    emit({
      'index-D5TFPTY5.js': 'export {}\n',
      '2.auth-rbac-BWc85eAj.js': 'export default "| `demo@vuestrata.dev` | `super_admin` |"\n',
    })

    const { status, output } = run('--mode=production', `--dist=${dist}`)
    expect(status).toBe(1)
    expect(output).toContain('"demo@vuestrata.dev" found in assets/2.auth-rbac-BWc85eAj.js')
  })

  // One build serves every environment only while runtime-config.js stays a
  // file of its own that the page loads first.
  describe('the runtime configuration', () => {
    const chunks = { 'index-D5TFPTY5.js': 'export {}\n' }
    const CHECK = 'the runtime configuration is its own file, loaded before the app'

    it('passes a build that loads it as a separate script before the app', () => {
      emit(chunks)

      const { status, output } = run('--mode=production', `--dist=${dist}`)
      expect(output).toContain(CHECK)
      expect(status).toBe(0)
    })

    it.each([
      ['the file is missing from the build', { 'runtime-config.js': null }, /is missing/],
      [
        'the page does not load it',
        { 'index.html': PAGE.replace('<script src="/runtime-config.js"></script>', '') },
        /does not load runtime-config\.js/,
      ],
      [
        'it was inlined into the page',
        {
          'index.html': PAGE.replace(
            '<script src="/runtime-config.js"></script>',
            '<script>window.__VUESTRATA_RUNTIME__ ||= {}</script>',
          ),
        },
        /does not load runtime-config\.js/,
      ],
      [
        'the page also assigns the overlay inline',
        { 'index.html': PAGE.replace('<body>', '<body><script>__VUESTRATA_RUNTIME__={}</script>') },
        /assigns __VUESTRATA_RUNTIME__ inline/,
      ],
      [
        'it is loaded as a module',
        { 'index.html': PAGE.replace('<script src=', '<script type="module" src=') },
        /plain blocking script/,
      ],
      [
        'it is deferred',
        { 'index.html': PAGE.replace('<script src=', '<script defer src=') },
        /plain blocking script/,
      ],
      [
        'it comes after the app',
        {
          'index.html': PAGE.replace('<script src="/runtime-config.js"></script>', '').replace(
            '</head>',
            '<script src="/runtime-config.js"></script></head>',
          ),
        },
        /loaded after the app/,
      ],
    ])('fails when %s', (_, root, message) => {
      emit(chunks, root)

      const { status, output } = run('--mode=production', `--dist=${dist}`)
      expect(status).toBe(1)
      expect(output).toMatch(message)
    })

    it('accepts a subpath base', () => {
      emit(chunks, {
        'index.html': PAGE.replaceAll('"/runtime-config.js"', '"/console/runtime-config.js"'),
      })

      expect(run('--mode=production', `--dist=${dist}`).status).toBe(0)
    })
  })
})
