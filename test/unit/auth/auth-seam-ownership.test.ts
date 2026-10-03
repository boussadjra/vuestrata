import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vite-plus/test'

/**
 * Who may import what, around the auth seam.
 *
 * `vuestrata upgrade` replaces Vuestrata's files in a project and leaves the
 * project's own alone. The auth module's barrel (`src/modules/auth/index.ts`)
 * is the project's: an export added to it in the template never reaches a
 * project that upgrades. So a file an upgrade DOES deliver must not need one.
 * If `bootstrap/seams.ts` imported `installAuthConfig` from that barrel, the
 * template would build and every upgraded project would not.
 *
 * Nothing else catches this. The template's own barrel always has the export,
 * so types, lint and every other test pass.
 */

const ROOT = process.cwd()
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

/** Every `.ts` file under `dir`, repo-relative. */
function sources(dir: string): string[] {
  return fs
    .readdirSync(path.join(ROOT, dir), { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? sources(`${dir}/${entry.name}`)
        : entry.name.endsWith('.ts')
          ? [`${dir}/${entry.name}`]
          : [],
    )
}

/** The names `source` imports from `specifier`, with or without `type`. */
function importedFrom(source: string, specifier: RegExp): string[] {
  const names: string[] = []
  const pattern = /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'([^']+)'/g
  for (const [, list, from] of source.matchAll(pattern)) {
    if (!specifier.test(from!)) continue
    for (const entry of list!.split(',')) {
      const name = entry
        .trim()
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)[0]
      if (name) names.push(name)
    }
  }
  return names
}

const AUTH_BARREL = /^[@~]\/modules\/auth$/

/**
 * What the barrel exported in the releases projects were created from. A name
 * may be added here only once every supported project has it, which is to say
 * after a release whose migration added it to their barrel.
 */
const RELEASED_BARREL_EXPORTS = [
  'useAuth',
  'exchangeOAuthCode',
  'getAuthAdapter',
  'createAuthAdapter',
  'isJwtExpired',
  'OAuthRedirectError',
  'requireCapability',
  'resolveAuthAdapterName',
  'SUPPORTED_AUTH_ADAPTERS',
  'UnsupportedAuthCapabilityError',
  'AuthAdapter',
  'AuthCapabilities',
  'AuthTransport',
  'SupportedAuthAdapter',
  'generateCodeVerifier',
  'generateCodeChallenge',
  'generateState',
]

describe('what Vuestrata’s own files import from the auth barrel', () => {
  it('is nothing the barrel did not already export: the bootstrap', () => {
    for (const file of sources('src/modules/app/bootstrap')) {
      const unreleased = importedFrom(read(file), AUTH_BARREL).filter(
        (name) => !RELEASED_BARREL_EXPORTS.includes(name),
      )
      expect(unreleased, `${file} imports ${unreleased.join(', ')} from the auth barrel`).toEqual(
        [],
      )
    }
  })

  it('is nothing the barrel did not already export: the layout components', () => {
    // The header asks the adapter whether it can register; the user menu signs
    // out. Both are replaced by an upgrade, beside a barrel that is not.
    const layout = 'src/modules/app/components/layout'
    for (const name of fs.readdirSync(path.join(ROOT, layout))) {
      if (!name.endsWith('.vue')) continue
      const unreleased = importedFrom(read(`${layout}/${name}`), AUTH_BARREL).filter(
        (imported) => !RELEASED_BARREL_EXPORTS.includes(imported),
      )
      expect(unreleased, `${name} imports ${unreleased.join(', ')} from the auth barrel`).toEqual(
        [],
      )
    }
  })

  it('is nothing at all: core/lib, which the auth module depends on and not the reverse', () => {
    for (const file of sources('src/modules/core/lib/auth')) {
      expect(read(file), file).not.toMatch(/from '[@~]\/modules\//)
    }
  })

  it('still exports those names, so the bootstrap of an older release keeps building', () => {
    const barrel = read('src/modules/auth/index.ts')
    for (const name of RELEASED_BARREL_EXPORTS) {
      expect(barrel, `the auth barrel no longer exports ${name}`).toMatch(
        new RegExp(`\\b${name}\\b`),
      )
    }
  })
})

describe('the seeded auth.config.ts', () => {
  it('imports only from core/lib, never from a module barrel', () => {
    const source = read('src/modules/app/config/auth.config.ts')
    const specifiers = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1])

    // A project gets this file from an upgrade, beside a barrel that predates it.
    expect(specifiers).toEqual(['~/lib/auth'])
  })

  it('finds everything a configuration and an adapter are written with at ~/lib/auth', async () => {
    const lib = await import('@/lib/auth')

    for (const name of [
      'defineAuthConfig',
      'endpointPresets',
      'authResponseMappers',
      'authRefreshBodies',
      'createAuthEndpoints',
      'parseUser',
      'resolveAuthConfig',
      'installAuthConfig',
      'loadAuthAdapter',
      'getAuthProviders',
    ] as const) {
      expect(typeof lib[name], name).not.toBe('undefined')
    }
  })
})
