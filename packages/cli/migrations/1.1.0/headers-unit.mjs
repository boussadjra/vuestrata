import { hashFor } from '../../src/lib/lockfile.mjs'

/**
 * The two header generators, and what the rest of the migration needs to know
 * about them.
 *
 * They are promoted as one unit (promotions.mjs): each imports what the other
 * exports. Other steps depend on how that went, and they run first, before any
 * promotion, so they cannot ask the lockfile. They ask the files.
 */

export const HEADERS_SCRIPTS = ['scripts/security/headers.mjs', 'scripts/security/sync-headers.mjs']

/** What each hashed to at 1.0.1-alpha.5 and 1.0.1-alpha.6. */
export const HEADERS_PRISTINE = {
  'scripts/security/headers.mjs': [
    'sha256-7e25459575edcad0e370a85dc717823a28a2b13736651d2efb18300a59f0676e',
  ],
  'scripts/security/sync-headers.mjs': [
    'sha256-ed898cb4ac5cfff91b2f114eaec74c707a870013cc65c4b39867becca7edcde5',
  ],
}

/**
 * Both scripts are still a release's copy, which is when this upgrade replaces
 * them. False once it has, and false when either was edited: the pair is then
 * held back, and nothing new is there to regenerate from.
 */
export function headersBeingReplaced(ws) {
  return HEADERS_SCRIPTS.every(
    (rel) =>
      ws.exists(rel) && HEADERS_PRISTINE[rel].includes(hashFor(rel, ws.read(rel), 'managed')),
  )
}

/**
 * The generator that writes the 1.1.0 nginx config is in place, or is about to
 * be: the one that knows `/healthz`. Files that assert what that config does
 * are only right beside it.
 */
export function headersGenerateTheNewConfig(ws) {
  if (headersBeingReplaced(ws)) return true
  const sync = HEADERS_SCRIPTS[1]
  return ws.exists(sync) && ws.read(sync).includes('/healthz')
}

/** The reminder that follows a replaced pair, as a sentence other notes can end on. */
export const REGENERATE_HEADERS =
  'run `vpr security:headers`: it regenerates public/_headers, docker/*.conf, the headers ' +
  'block of vercel.json and the CSP meta in index.html from the new generators, and ' +
  '`vpr lint` reports drift until you do.'
