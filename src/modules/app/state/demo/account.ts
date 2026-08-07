/**
 * The demo account, defined once.
 *
 * Deliberately dependency-free so it can be imported from anywhere — the login
 * page hint, the MSW login handler, the seeded user list, and the e2e helpers —
 * without dragging the IndexedDB demo layer along with it.
 *
 * Before this existed each of those had its own literal and they disagreed:
 * the login page advertised `password`, the docs said `demo1234`, and the MSW
 * handler accepted ANY non-empty string because it never compared them. Anyone
 * reading the code could not tell which was authoritative — none of them were.
 *
 * This is not a secret. It only exists in a demo build, and it authenticates
 * against handlers running inside the user's own browser.
 */
export const DEMO_ACCOUNT = {
  email: 'demo@vuestrata.dev',
  password: 'demo1234',
  name: 'Demo Admin',
} as const
