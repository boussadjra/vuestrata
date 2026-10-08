import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  resolveConfig,
  type ConfigEnv,
  type ConfigPluginContext,
  type IndexHtmlTransformContext,
  type MinimalPluginContextWithoutEnvironment,
  type Plugin,
} from 'vite-plus'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

// @ts-expect-error - the header scripts are plain ESM JavaScript with no type declarations.
import * as sync from '../../../scripts/security/sync-headers.mjs'
import { vuestrataEnv } from '../../../scripts/vite/vuestrata-plugin.mjs'

/**
 * What a project that sets no base path gets: the app at the root of its
 * origin, exactly as before a base path could be set.
 *
 * PINNED. This file was written before `VUESTRATA_BASE_PATH` existed and its
 * assertions describe the build and the generated deployment files as they
 * were then. Serving the app under a path prefix is an opt-in, so none of
 * these may change because of it: a failure here means the default moved.
 *
 * The hashes are of the generated targets as committed, with line endings
 * normalised. A change to the POLICY (a new header, another cache rule) moves
 * them on purpose; print the new value with the `sha256` helper below and say
 * why in the commit. A change to how a base path is handled never should.
 */

const sha256 = (text: string) =>
  createHash('sha256').update(text.replaceAll('\r\n', '\n')).digest('hex')

const committed = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

const roots: string[] = []

beforeEach(() => {
  // A developer's shell may export any of these; the tests must not see them.
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('VUESTRATA_') || key === 'DEV_API_TARGET') vi.stubEnv(key, undefined)
  }
})

afterEach(() => {
  vi.unstubAllEnvs()
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

describe('the generated deployment files, with no base path set', () => {
  it.each([
    ['public/_headers', 'c4c6a6c443672c8544c5acaee6b22a22a4835334e204bfdfae4d7291013dc104'],
    ['docker/nginx.conf', '21c216781cd8126954ec8b7af9c1c5096a4b0492bcb52fea071c8105fc94a1a7'],
    [
      'docker/runtime/security-headers.conf.template',
      'a24b3ba54de8f20ee04a0b16f9a7a0006ad1d58ca611364534ccf042cf12d6a9',
    ],
    [
      'docker/runtime/api-location.conf.template',
      'cf0f1d00740edf47dc0783370f63deb57d29273d03fc846a373052e42a8fbf82',
    ],
  ])('%s is byte for byte what it was', (file, hash) => {
    expect(sha256(committed(file))).toBe(hash)
  })

  it('the vercel.json headers block is what it was', () => {
    const { headers } = JSON.parse(committed('vercel.json')) as { headers: unknown }
    expect(sha256(JSON.stringify(headers))).toBe(
      'bf18d7a21a842c954db62a67409b35a6359b2aab24a71005b4158bda63a52c30',
    )
  })

  it('the paths the image answers itself are the ones at the root', () => {
    // Only these lines: the variables listed above them belong to other
    // features, which may add one.
    const reserved = committed('docker/runtime/keys')
      .split(/\r?\n/)
      .filter((line) => line.startsWith('reserved '))
    expect(reserved).toEqual([
      'reserved /healthz',
      'reserved /index.html',
      'reserved /assets',
      'reserved /version.json',
      'reserved /runtime-config.js',
      'reserved /mockServiceWorker.js',
    ])
  })

  it('are what the generator writes when it is given nothing', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vuestrata-base-default-'))
    roots.push(root)
    for (const file of ['vercel.json', 'index.html']) {
      fs.copyFileSync(path.join(process.cwd(), file), path.join(root, file))
    }
    for (const dir of ['docker', 'public']) fs.mkdirSync(path.join(root, dir))

    const log = { success: vi.fn(), error: vi.fn(), info: vi.fn() }
    sync.syncTargets({ root, log })

    for (const file of [
      'public/_headers',
      'docker/nginx.conf',
      'docker/runtime/security-headers.conf.template',
      'docker/runtime/api-location.conf.template',
    ]) {
      expect(sha256(fs.readFileSync(path.join(root, file), 'utf8')), file).toBe(
        sha256(committed(file)),
      )
    }
    expect(sha256(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'))).toBe(
      sha256(committed('vercel.json')),
    )
    expect(sha256(fs.readFileSync(path.join(root, 'index.html'), 'utf8'))).toBe(
      sha256(committed('index.html')),
    )
  })
})

describe('the build, with no base path set', () => {
  const production = {
    VUESTRATA_RUNTIME_MODE: 'production',
    VUESTRATA_USE_MOCKS: 'false',
    VUESTRATA_AUTH_ADAPTER: 'jwt',
  }

  function project(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vuestrata-base-default-'))
    roots.push(root)
    const lines = Object.entries(production).map(([key, value]) => `${key}=${value}`)
    fs.writeFileSync(path.join(root, '.env'), `${lines.join('\n')}\n`)
    return root
  }

  it.each([
    ['vp build', { command: 'build', mode: 'production' }],
    ['vp dev', { command: 'serve', mode: 'development' }],
    ['vp preview', { command: 'serve', mode: 'production', isPreview: true }],
  ] as [string, ConfigEnv][])('%s: the plugin sets no `base`', async (_name, env) => {
    const plugin = vuestrataEnv({ deployConfig: {} })
    const hook = plugin.config
    const handler = typeof hook === 'function' ? hook : hook?.handler

    const result = await handler!.call(
      { warn: vi.fn() } as unknown as ConfigPluginContext,
      { root: project() },
      env,
    )

    expect(result).toBeTypeOf('object')
    expect(Object.keys(result ?? {})).not.toContain('base')
  })

  it('Vite resolves the app at the root, and the page loads /runtime-config.js', async () => {
    const plugin = vuestrataEnv({ deployConfig: {} }) as Plugin
    const config = await resolveConfig(
      { configFile: false, root: project(), logLevel: 'silent', plugins: [plugin] },
      'build',
      'production',
    )
    expect(config.base).toBe('/')

    const hook = plugin.transformIndexHtml
    const handler = typeof hook === 'function' ? hook : hook?.handler
    const html = (await handler!.call(
      {} as MinimalPluginContextWithoutEnvironment,
      '<!doctype html><html><head><meta charset="UTF-8" /></head><body></body></html>',
      { path: '/index.html', filename: 'index.html' } as IndexHtmlTransformContext,
    )) as string

    expect(html).toContain('<script src="/runtime-config.js"></script>')
  })
})
