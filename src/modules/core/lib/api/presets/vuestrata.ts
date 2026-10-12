import type { ApiBackendPreset } from '../integration'

/**
 * A backend built to Vuestrata's own contract: a JSON 401 for an expired
 * session, `{ message, code, details, requestId }` for an error, the CSRF token
 * in `<meta name="csrf-token">`.
 *
 * Those are the client's built-in defaults, so this preset adds nothing. It
 * exists to be named: `backend: presets.vuestrata` says the contract was a
 * choice, where an empty overrides file says nobody has looked yet.
 */
export const vuestrata: ApiBackendPreset = { name: 'vuestrata' }
