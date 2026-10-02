import { z } from 'zod'

import { AppError, ERROR_MESSAGE_KEYS } from '~/lib/errors'
import { createScopedLogger } from '~/lib/logger'
import type { User } from '~/types'

const identityLogger = createScopedLogger('auth:identity')

/** An optional field a backend may also send as `null`, which reads as absent. */
const optional = <T extends z.ZodType>(schema: T) =>
  schema.nullish().transform((value) => value ?? undefined)

/**
 * The shape of `User`, checked wherever a user enters the app: login,
 * registration, `/auth/me`, a resumed session, an OAuth code exchange.
 *
 * Identity used to be the one response the app took on trust. Every domain
 * record is validated against its zod schema, while the object that decides
 * what a visitor may see was passed straight through, so a backend whose user
 * payload drifted produced a signed-in app with no name in the header and a
 * role nothing recognised. It now fails at the boundary, as a contract
 * mismatch, like domain data does.
 *
 * It lives here and not beside the `User` type because that type is in
 * `app/types/index.ts`, which is the project's file: an upgrade cannot add an
 * export to it, and Vuestrata's own code may only read what it ships.
 *
 * Three deliberate choices:
 *
 * - **Unknown fields are kept** (`looseObject`). A project that widens `User`
 *   with, say, `tenantId` gets it through without touching this file.
 * - **`null` on an optional field reads as absent**, and **a numeric `id`
 *   becomes a string**. Both are how real backends serialise these, neither
 *   says anything about who the user is, and the result matches the type.
 * - **`role` is any non-empty string.** Which roles exist is the RBAC layer's
 *   question, and it fails closed on one it does not know.
 *
 * Anything else that does not fit — no id, no email, no name, permissions that
 * are not strings — is rejected. A backend with a different shape maps it with
 * `mapUser` in `app/config/auth.config.ts`.
 */
export const userSchema = z.looseObject({
  id: z.union([z.string().min(1), z.number().transform(String)]),
  email: z.string().min(1),
  name: z.string(),
  avatar: optional(z.string()),
  role: z.string().min(1),
  permissions: optional(z.array(z.string())),
  emailVerified: optional(z.boolean()),
  mfaEnabled: optional(z.boolean()),
  provider: optional(z.string()),
  createdAt: optional(z.string()),
  lastLoginAt: optional(z.string()),
})

/**
 * What `mapUser` may return: a `User`, or one with the looseness the schema
 * forgives — a `role` that is still a plain string, a numeric `id`. The schema
 * is what turns it into a `User`, so a mapper never needs a cast.
 */
export type UserInput = z.input<typeof userSchema>

/**
 * A response that arrived but is not what the auth contract says it is.
 *
 * `details` carries the zod messages by path; the log line carries paths and
 * issue codes only, never the body: an identity payload is personal data.
 */
export function authContractMismatch(
  what: string,
  issues: readonly { path: readonly PropertyKey[]; code?: string; message: string }[],
): AppError {
  const details: Record<string, string[]> = {}
  for (const issue of issues) {
    const path = issue.path.map(String).join('.') || '(root)'
    ;(details[path] ??= []).push(issue.message)
  }
  identityLogger.error(`${what} does not match the auth contract`, {
    issues: issues.map((issue) => ({ path: issue.path.map(String).join('.'), code: issue.code })),
  })
  return new AppError({
    message: 'The server sent a response this app could not read.',
    code: 'CONTRACT_MISMATCH',
    kind: 'contract',
    retryable: false,
    messageKey: ERROR_MESSAGE_KEYS.contract,
    details,
  })
}

/**
 * Validate `raw` as a `User`, or throw a contract mismatch.
 *
 * `source` names where it came from, for the log. A custom adapter calls this
 * on the user it builds, so an SDK's payload is held to the same contract as a
 * REST backend's.
 */
export function parseUser(raw: unknown, source = 'The user'): User {
  const result = userSchema.safeParse(raw)
  if (!result.success) throw authContractMismatch(source, result.error.issues)

  // `transform` leaves an optional field that was absent or null as an
  // explicit `undefined`. Drop those, so the user the app holds has the keys
  // the backend sent and no others.
  const user: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(result.data)) {
    if (value !== undefined) user[key] = value
  }
  // `role` and `permissions` are checked as strings; narrowing them to the
  // unions is the RBAC layer's job, and it does not trust them either.
  return user as unknown as User
}
