import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { stripVTControlCharacters } from 'node:util'

import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'

// Importing the script must not run it: `isEntryPoint()` keeps the checks, the
// dist walk and their `process.exit()` behind a direct invocation.
import {
  chunkName,
  chunksNamed,
  eagerFiles,
  staticImports,
  // @ts-expect-error - the build scripts are plain ESM JavaScript with no type declarations.
} from '../../../scripts/build/verify-bundle.mjs'

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

describe('staticImports', () => {
  // Each form is how rolldown writes an import between two chunks, minified.
  it('reads every form of a static import between chunks', () => {
    const source =
      'import{n as e}from"./rolldown-runtime-Dd_uD5pT.js";' +
      'import"./side-effect-Ab12Cd34.js";' +
      'import t,{a as n}from"./vue-vendor-BndbH7cv.js";' +
      'import*as r from"./ns-Ab12Cd34.js";' +
      'export{i}from"./again-Ab12Cd34.js";' +
      'export*from"../up-Ab12Cd34.js";'

    expect(staticImports(source)).toEqual([
      './rolldown-runtime-Dd_uD5pT.js',
      './side-effect-Ab12Cd34.js',
      './vue-vendor-BndbH7cv.js',
      './ns-Ab12Cd34.js',
      './again-Ab12Cd34.js',
      '../up-Ab12Cd34.js',
    ])
  })

  // The difference this whole check rests on: `import()` is fetched when the
  // code reaches it, and Vite's preload helper names its files as plain strings.
  it('leaves out what is imported on demand', () => {
    const source =
      'import{t as e}from"./vue-vendor-BndbH7cv.js";' +
      'const a=()=>import("./charts-vendor-CZBo_7NZ.js");' +
      'const b=()=>e(()=>import("./echarts-setup-c60YD2B7.js"),__vite__mapDeps([0,1]));' +
      'const m=["assets/charts-vendor-CZBo_7NZ.js"];'

    expect(staticImports(source)).toEqual(['./vue-vendor-BndbH7cv.js'])
  })
})

describe('eagerFiles', () => {
  const html = (...tags: string[]) => `<html><head>${tags.join('')}</head></html>`
  const ENTRY = '<script type="module" crossorigin src="/assets/index-D5TFPTY5.js"></script>'

  it('holds what index.html references and everything those chunks import statically', () => {
    const sources = new Map([
      ['assets/index-D5TFPTY5.js', 'import"./vue-vendor-BndbH7cv.js";import("./page-Ab12Cd34.js")'],
      ['assets/vue-vendor-BndbH7cv.js', 'import"./rolldown-runtime-Dd_uD5pT.js";'],
      ['assets/rolldown-runtime-Dd_uD5pT.js', 'export{}'],
      ['assets/page-Ab12Cd34.js', 'import"./charts-vendor-CZBo_7NZ.js";'],
      ['assets/charts-vendor-CZBo_7NZ.js', 'export{}'],
    ])

    const loaded = eagerFiles(
      html(ENTRY, '<link rel="stylesheet" crossorigin href="/assets/index-Bmppji-U.css">'),
      sources,
    )

    // No modulepreload link names them, and they are loaded all the same.
    expect([...loaded.keys()]).toEqual([
      'assets/index-D5TFPTY5.js',
      'assets/index-Bmppji-U.css',
      'assets/vue-vendor-BndbH7cv.js',
      'assets/rolldown-runtime-Dd_uD5pT.js',
    ])
    expect(loaded.get('assets/index-D5TFPTY5.js')).toEqual(['index.html'])
    expect(loaded.get('assets/vue-vendor-BndbH7cv.js')).toEqual(['assets/index-D5TFPTY5.js'])
  })

  it('names every chunk that asks for a file', () => {
    const sources = new Map([
      ['assets/index-D5TFPTY5.js', 'import"./a-Ab12Cd34.js";import"./shared-Ab12Cd34.js";'],
      ['assets/a-Ab12Cd34.js', 'import"./shared-Ab12Cd34.js";'],
      ['assets/shared-Ab12Cd34.js', 'export{}'],
    ])

    const loaded = eagerFiles(
      html(ENTRY, '<link rel="modulepreload" crossorigin href="/assets/shared-Ab12Cd34.js">'),
      sources,
    )

    expect(loaded.get('assets/shared-Ab12Cd34.js')).toEqual([
      'index.html',
      'assets/index-D5TFPTY5.js',
      'assets/a-Ab12Cd34.js',
    ])
  })

  it('finds the assets of a build with a subpath base', () => {
    const loaded = eagerFiles(
      html(ENTRY.replace('/assets/', '/console/assets/')),
      new Map([['assets/index-D5TFPTY5.js', 'export{}']]),
    )

    expect([...loaded.keys()]).toEqual(['assets/index-D5TFPTY5.js'])
  })

  // A docs page is a string in a chunk, and its code samples import things.
  it('follows only imports of files the build emitted', () => {
    const sources = new Map([
      ['assets/index-D5TFPTY5.js', 'const doc="import { x } from \'./not-emitted.js\'";'],
    ])

    expect([...eagerFiles(html(ENTRY), sources).keys()]).toEqual(['assets/index-D5TFPTY5.js'])
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

  // The charting engine was preloaded on every page for as long as the size
  // budget had room for it. This check names it, so the next one cannot hide.
  describe('chunks loaded on demand', () => {
    const CHECK = 'chunks loaded on demand are not loaded with the page'
    const preload = (file: string) =>
      PAGE.replace(
        '</head>',
        `<link rel="modulepreload" crossorigin href="/assets/${file}"></head>`,
      )

    it('passes a build that reaches the charting engine through import() alone', () => {
      emit({
        'index-D5TFPTY5.js':
          'import"./vue-vendor-BndbH7cv.js";const chart=()=>import("./BaseChart-BVvfkCNw.js")\n',
        'vue-vendor-BndbH7cv.js': 'export {}\n',
        'BaseChart-BVvfkCNw.js': 'import"./charts-vendor-CZBo_7NZ.js"\n',
        'charts-vendor-CZBo_7NZ.js': 'import"./vue-vendor-BndbH7cv.js"\n',
      })

      const { status, output } = run('--mode=production', `--dist=${dist}`)
      expect(output).toContain(CHECK)
      expect(status).toBe(0)
    })

    it('fails a build whose index.html preloads the charting chunk', () => {
      emit(
        {
          'index-D5TFPTY5.js': 'export {}\n',
          'charts-vendor-B4UI2yDj.js': 'export {}\n',
        },
        { 'index.html': preload('charts-vendor-B4UI2yDj.js') },
      )

      const { status, output } = run('--mode=production', `--dist=${dist}`)
      expect(status).toBe(1)
      expect(output).toContain(CHECK)
      expect(output).toContain(
        'assets/charts-vendor-B4UI2yDj.js (the charting engine) is in index.html',
      )
    })

    // The shape of the real defect: the Vue runtime was grouped into the chart
    // chunk, so the framework chunk imported it. No preload link is needed for
    // the browser to fetch it before the page renders.
    it('fails a build whose entry reaches it through static imports', () => {
      emit({
        'index-D5TFPTY5.js': 'import"./vue-vendor-YRn28q9F.js"\n',
        'vue-vendor-YRn28q9F.js': 'import"./charts-vendor-B4UI2yDj.js"\n',
        'charts-vendor-B4UI2yDj.js': 'export {}\n',
      })

      const { status, output } = run('--mode=production', `--dist=${dist}`)
      expect(status).toBe(1)
      expect(output).toContain(
        'assets/charts-vendor-B4UI2yDj.js (the charting engine) is imported by ' +
          'assets/vue-vendor-YRn28q9F.js',
      )
      expect(output).toContain('see the codeSplitting comment in vite.config.ts')
    })

    it.each([
      ['docs-vendor-4rlSyRlv.js', 'the markdown and syntax-highlighting engine'],
      ['comark-Coo580kt.js', 'the docs renderer and its diagram engine'],
      ['axe-D-dgo05B.js', 'the accessibility checker'],
    ])('fails a build that preloads %s', (file, what) => {
      emit(
        { 'index-D5TFPTY5.js': 'export {}\n', [file]: 'export {}\n' },
        { 'index.html': preload(file) },
      )

      const { status, output } = run('--mode=production', `--dist=${dist}`)
      expect(status).toBe(1)
      expect(output).toContain(`assets/${file} (${what}) is in index.html`)
    })

    it('fails a demo build that loads the mock backend with the page', () => {
      emit(
        {
          'index-D5TFPTY5.js': 'import"./msw-vendor-e1wNtvZD.js"\n',
          'msw-vendor-e1wNtvZD.js': 'export {}\n',
        },
        { 'mockServiceWorker.js': '' },
      )

      const { status, output } = run('--mode=demo', `--dist=${dist}`)
      expect(status).toBe(1)
      expect(output).toContain('assets/msw-vendor-e1wNtvZD.js (the mock backend) is imported by')
    })

    // Matched by the whole chunk name: these two are small, eager, and merely
    // have "docs" in their names.
    it('does not mistake a chunk that only shares a word with one', () => {
      emit(
        {
          'index-D5TFPTY5.js': 'import"./useDocsSidebar-Bvmb-p7n.js"\n',
          'useDocsSidebar-Bvmb-p7n.js': 'export {}\n',
          'component-docs-BbqUMHK0.js': 'export {}\n',
        },
        { 'index.html': preload('component-docs-BbqUMHK0.js') },
      )

      expect(run('--mode=production', `--dist=${dist}`).status).toBe(0)
    })
  })

  describe('the size budgets', () => {
    /** `kb` kilobytes that gzip cannot shrink much, as a chunk. */
    const noise = (kb: number) =>
      `export default "${crypto.randomBytes(Math.ceil((kb * 1024 * 3) / 4)).toString('base64')}"\n`

    // The sizes are far past the budgets on purpose: these tests are about what
    // is measured, and should not need editing when a budget moves.
    it('counts what the entry imports statically, preloaded or not', () => {
      emit({
        'index-D5TFPTY5.js': 'import"./a-Ab12Cd34.js";import"./b-Ab12Cd34.js"\n',
        'a-Ab12Cd34.js': noise(1024),
        'b-Ab12Cd34.js': noise(1024),
      })

      const { status, output } = run('--mode=production', `--dist=${dist}`)
      expect(status).toBe(1)
      expect(output).toMatch(/KB gzipped \(2048\.\d KB raw\) across 3 files — over budget by/)
    })

    it('holds the largest chunk the page loads to its budget, and no lazy one', () => {
      emit({
        'index-D5TFPTY5.js': 'import"./ui-vendor-Cwx1-IbK.js";import("./lazy-Coo580kt.js")\n',
        'ui-vendor-Cwx1-IbK.js': `export default "${'a'.repeat(2048 * 1024)}"\n`,
        'lazy-Coo580kt.js': `export default "${'a'.repeat(4096 * 1024)}"\n`,
      })

      const { status, output } = run('--mode=production', `--dist=${dist}`)
      expect(status).toBe(1)
      expect(output).toMatch(
        /assets\/ui-vendor-Cwx1-IbK\.js is 2048\.\d KB and is loaded on every page/,
      )
      expect(output).not.toMatch(/lazy-Coo580kt\.js is/)
    })

    // The stylesheet is larger raw than any chunk the page loads. It counts
    // towards the payload, gzipped, and is not a chunk.
    it('does not hold the stylesheet to the chunk budget', () => {
      emit(
        {
          'index-D5TFPTY5.js': 'export {}\n',
          'index-Bmppji-U.css': `.a{color:red}`.repeat(50_000),
        },
        {
          'index.html': PAGE.replace(
            '</head>',
            '<link rel="stylesheet" crossorigin href="/assets/index-Bmppji-U.css"></head>',
          ),
        },
      )

      const { status, output } = run('--mode=production', `--dist=${dist}`)
      expect(output).toContain('2 files (largest chunk: assets/index-D5TFPTY5.js')
      expect(status).toBe(0)
    })
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
