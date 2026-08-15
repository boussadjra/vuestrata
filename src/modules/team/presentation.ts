/**
 * Team presentation rules.
 *
 * The directory and the profile page render the same two facts about a person —
 * their availability and what time it is where they are — and both used to
 * carry their own copy of the logic.
 */
import type { TeamMember } from './types'

export type TeamStatusVariant = 'success' | 'warning' | 'default'

const STATUS_VARIANT: Record<TeamMember['status'], TeamStatusVariant> = {
  available: 'success',
  busy: 'warning',
  away: 'default',
  on_leave: 'default',
}

export function teamStatusVariant(status: TeamMember['status']): TeamStatusVariant {
  return STATUS_VARIANT[status]
}

export interface MemberLocalTimeOptions {
  /** Include the zone abbreviation ("14:05 CET"). The profile page does. */
  withZoneName?: boolean
}

/**
 * The member's current local time, or `null` if the zone is unknown.
 *
 * The single most useful thing a distributed-team directory can show, and one
 * `Intl` call: it answers "can I ping them now" without any mental arithmetic.
 * An unrecognised IANA zone throws — falling back to nothing is right, because
 * a wrong time is worse than no time.
 */
export function memberLocalTime(
  timezone: string,
  locale: string,
  options: MemberLocalTimeOptions = {},
): string | null {
  try {
    return new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      ...(options.withZoneName ? { timeZoneName: 'short' as const } : {}),
      timeZone: timezone,
    }).format(new Date())
  } catch {
    return null
  }
}
