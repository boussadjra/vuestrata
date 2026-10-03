import {
  parseUser,
  type AuthAdapter,
  type AuthAdapterFactory,
  type ResumedSession,
} from '@/lib/auth'
import type { AuthResponse } from '~/types'

/**
 * A stand-in for a hosted auth SDK (the shape of Supabase's, Firebase's or
 * Clerk's client), and the adapter that puts it behind `AuthAdapter`.
 *
 * No real SDK is a dependency of the template, so the recipe
 * `docs/9.recipes/10.write-your-own-auth-adapter.md` is exercised against this
 * one. What matters is the shape such SDKs share, which is what makes them
 * different from a REST backend:
 *
 *   - the SDK keeps the session itself, in storage of its own;
 *   - it rotates the access token on its own schedule;
 *   - it announces sign-ins, rotations and sign-outs through a listener,
 *     including ones that happened in another tab.
 */

/** A session as the SDK holds it. */
export interface SdkSession {
  access_token: string
  refresh_token: string
  expires_in: number
  user: {
    id: string
    email: string
    user_metadata: { full_name: string }
    app_metadata: { role: string }
  }
}

export type SdkEvent = 'SIGNED_IN' | 'TOKEN_REFRESHED' | 'SIGNED_OUT' | 'SESSION_EXPIRED'
type SdkListener = (event: SdkEvent, session: SdkSession | null) => void

/** Where the SDK keeps its session. Its own key, not one of the app's. */
export const SDK_STORAGE_KEY = 'fake-sdk.session'

/** The accounts the SDK's backend knows, by email. Anybody else is Ada. */
const ACCOUNTS: Record<string, Omit<SdkSession['user'], 'email'>> = {
  'grace@example.test': {
    id: 'sdk-user-2',
    user_metadata: { full_name: 'Grace Hopper' },
    app_metadata: { role: 'admin' },
  },
}
const accountFor = (email: string): SdkSession['user'] => ({
  id: 'sdk-user-1',
  user_metadata: { full_name: 'Ada Lovelace' },
  app_metadata: { role: 'manager' },
  ...ACCOUNTS[email],
  email,
})

export function createFakeSdk() {
  const listeners = new Set<SdkListener>()
  const counters = { issued: 0 }

  const read = (): SdkSession | null => {
    const stored = localStorage.getItem(SDK_STORAGE_KEY)
    return stored ? (JSON.parse(stored) as SdkSession) : null
  }
  const emit = (event: SdkEvent, session: SdkSession | null) => {
    for (const listener of listeners) listener(event, session)
  }

  function issue(user: SdkSession['user']): SdkSession {
    counters.issued++
    const session = {
      access_token: `sdk-access-${counters.issued}`,
      refresh_token: `sdk-refresh-${counters.issued}`,
      expires_in: 3600,
      user,
    }
    localStorage.setItem(SDK_STORAGE_KEY, JSON.stringify(session))
    return session
  }

  function end(event: 'SIGNED_OUT' | 'SESSION_EXPIRED') {
    localStorage.removeItem(SDK_STORAGE_KEY)
    emit(event, null)
  }

  return {
    auth: {
      async signInWithPassword(credentials: { email: string; password: string }) {
        if (credentials.password !== 'pw') throw new Error('Invalid login credentials')
        const session = issue(accountFor(credentials.email))
        emit('SIGNED_IN', session)
        return session
      },
      async signOut() {
        end('SIGNED_OUT')
      },
      async getSession() {
        return read()
      },
      async refreshSession() {
        const current = read()
        if (!current) return null
        const session = issue(current.user)
        emit('TOKEN_REFRESHED', session)
        return session
      },
      onAuthStateChange(listener: SdkListener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    },

    // ── What a test does to it, standing in for time and for other tabs ────
    /** The access token the SDK's backend currently accepts, or null. */
    currentAccessToken: () => read()?.access_token ?? null,
    /** The SDK's own timer fired: a new token, announced to listeners. */
    async rotateInBackground() {
      const current = read()
      if (current) emit('TOKEN_REFRESHED', issue(current.user))
    },
    /** Somebody signed in in another tab: the SDK shares its storage, and says so. */
    signInElsewhere: (email: string) => emit('SIGNED_IN', issue(accountFor(email))),
    /**
     * Announce a session with a user record the adapter cannot map: what an
     * SDK upgrade, or a change to the project's user metadata, looks like.
     */
    announceMalformedUser() {
      const current = read()
      if (current) emit('TOKEN_REFRESHED', { ...current, user: { id: current.user.id } as never })
    },
    /** The user signed out in another tab. */
    signOutElsewhere: () => end('SIGNED_OUT'),
    /** The session was revoked, or its refresh token ran out. */
    expire: () => end('SESSION_EXPIRED'),
    listenerCount: () => listeners.size,
  }
}

export type FakeSdk = ReturnType<typeof createFakeSdk>

/**
 * The adapter, as the recipe writes it: a factory closing over a client that
 * was created once, outside it.
 *
 * `sloppy` leaves the SDK's refresh token on the sessions it returns, which an
 * adapter author might well do. The registry is what guarantees the app never
 * keeps it, so the tests run with it on.
 *
 * `lookup` stands for work the adapter does between the SDK's event and
 * telling the app, such as fetching the user's profile from the project's own
 * API. It is what makes an announcement late, and the test controls when it
 * answers.
 */
export function createSdkAdapterFactory(
  sdk: FakeSdk,
  {
    sloppy = true,
    lookup,
  }: { sloppy?: boolean; lookup?: (session: SdkSession) => Promise<void> } = {},
): AuthAdapterFactory {
  // A bearer session always has a token, which is what lets one shape serve
  // as a login answer, a resumed session and a refreshed one.
  const toSession = (session: SdkSession): ResumedSession & { token: string } => ({
    // The SDK's user is not the app's. Map it, and hold the result to the
    // same contract a REST backend's user is held to.
    user: parseUser({
      id: session.user.id,
      email: session.user.email,
      name: session.user.user_metadata.full_name,
      role: session.user.app_metadata.role,
    }),
    token: session.access_token,
    expiresIn: session.expires_in,
    ...(sloppy ? { refreshToken: session.refresh_token } : {}),
  })

  // Called more than once: the boot wiring, the session restore and
  // `useAuth()` each build an adapter. So nothing here is per-instance state;
  // the one thing there must be exactly one of, the client, is outside.
  return (): AuthAdapter => {
    return {
      name: 'fake-sdk',
      transport: 'bearer',
      // The SDK stores the session. The app holds the access token in memory.
      persistence: 'external',
      capabilities: {
        register: false,
        social: false,
        magicLink: false,
        mfa: false,
        // There is no refresh token for the app to rotate: the SDK does it.
        refresh: false,
        codeExchange: false,
      },

      async login(credentials) {
        return toSession(await sdk.auth.signInWithPassword(credentials)) as AuthResponse
      },

      async logout() {
        await sdk.auth.signOut()
      },

      async getUser() {
        const session = await sdk.auth.getSession()
        return session ? toSession(session).user : null
      },

      // A reload: the SDK still has the session it stored.
      async resumeSession() {
        const session = await sdk.auth.getSession()
        return session ? toSession(session) : null
      },

      // A 401 from the API: ask the SDK for a fresh token.
      async refreshSession() {
        const session = await sdk.auth.refreshSession()
        return session ? toSession(session) : null
      },

      subscribe(listener) {
        // The order the SDK made its changes in. One counter for all of them,
        // read as each event arrives and before anything asynchronous: it is
        // what lets a late result be recognised as late, here and by the app.
        let events = 0

        return sdk.auth.onAuthStateChange((event, session) => {
          const sequence = ++events

          if (event === 'SESSION_EXPIRED') {
            listener({ session: null, reason: 'expired', sequence })
            return
          }
          if (event === 'SIGNED_OUT') {
            // This tab's own sign-out arrives here too, and so does another
            // tab's. Neither is an expiry, and the app treats them alike.
            listener({ session: null, sequence })
            return
          }
          if (!session) return

          const announce = () => {
            // Something happened while this one was being looked up: it is
            // no longer the state of the session, and must not be announced.
            if (sequence !== events) return
            let announced: ReturnType<typeof toSession>
            try {
              announced = toSession(session)
            } catch {
              // The SDK's user stopped fitting `User`. `parseUser` has logged
              // it; throwing here would land in the SDK's own event emitter.
              return
            }
            listener({ session: announced, sequence })
          }

          if (lookup) void lookup(session).then(announce, () => {})
          else announce()
        })
      },
    }
  }
}
