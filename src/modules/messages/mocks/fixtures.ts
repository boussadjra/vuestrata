/**
 * Seeded messages and notifications.
 *
 * Threads read as real correspondence rather than lorem ipsum, because the
 * whole point of an inbox screen is to show how text of realistic length wraps,
 * truncates and stacks. Placeholder text is always suspiciously uniform.
 */
import { PEOPLE_NAMES, createRng, hoursAgo, randomInt } from '~/mocks/seed'

import {
  NOTIFICATION_KINDS,
  type AppNotification,
  type Message,
  type MessageReply,
  type NotificationKind,
} from '../types'

interface ThreadSeed {
  subject: string
  folder: 'inbox' | 'sent' | 'archived'
  messages: string[]
}

const THREADS: ThreadSeed[] = [
  {
    subject: 'Gateway firmware rollout — staged or all at once?',
    folder: 'inbox',
    messages: [
      'We have 340 gateways in the field. Do you want to stage the 3.0 rollout by region, or push to everyone once the canary is clean?',
      'Staged. Start with the 12 units in Hamburg, hold 48 hours, then the rest of EU. Osaka last — their maintenance window is Sunday only.',
      'Understood. I will set the canary group up this afternoon and send the rollback runbook for review.',
    ],
  },
  {
    subject: 'Northwind renewal — pricing question',
    folder: 'inbox',
    messages: [
      'Northwind are asking whether the anomaly detection add-on can be billed per gateway rather than per seat. Their finance team pushed back on the seat count.',
      'Per gateway works for us at this volume. Send them the revised quote and copy me — I want to see the number before it goes out.',
    ],
  },
  {
    subject: 'Accessibility audit findings',
    folder: 'inbox',
    messages: [
      'The audit came back. Two blockers: the data grid is not reachable by keyboard when it overflows, and four themes fail contrast on muted text in dark mode.',
      'Both are fixed on main. Contrast was a token problem, not a per-component one — muted-foreground was one ramp step too light against the inset surface.',
      'Confirmed on my end. Re-running the axe suite across all twelve themes now.',
    ],
  },
  {
    subject: 'Warehouse cutover — Osaka timings',
    folder: 'inbox',
    messages: [
      'Osaka can give us a four-hour window on Sunday 02:00 JST. That is tight for a full stock reconciliation. Can we split it?',
      'We can do the read-only sync first and reconcile writes the following week. I will send the sequence.',
    ],
  },
  {
    subject: 'Re: SOC 2 evidence request',
    folder: 'sent',
    messages: [
      'Attaching the access-review exports for Q1 and Q2. The Q3 review is scheduled for the 14th; I will send it as soon as it closes.',
    ],
  },
  {
    subject: 'Q2 board deck — revenue slide',
    folder: 'sent',
    messages: [
      'The revenue slide now splits recurring from services. Churn is on the same axis, which I think is clearer than the separate chart we had.',
      'Agreed, much better. One note — label the churn axis as a percentage or someone will read it as absolute.',
    ],
  },
  {
    subject: 'Legacy connector deprecation notice',
    folder: 'archived',
    messages: [
      'Confirming the on-premise connector is end-of-life on 31 March. Eleven customers are still on it; migration guides went out last week.',
      'Two have already migrated. I will chase the remaining nine individually rather than sending another blanket email.',
    ],
  },
  {
    subject: 'Incident 2024-118 post-mortem',
    folder: 'archived',
    messages: [
      'Root cause was clock skew between the gateway and the ingest service — events arrived with timestamps in the future and were dropped by the retention filter.',
      'Good write-up. The action item about bounding future timestamps is worth doing regardless of the fix.',
    ],
  },
]

export function createMessageFixtures(): Message[] {
  const rng = createRng(60_221)

  return THREADS.map((seed, index) => {
    const correspondent = PEOPLE_NAMES[index % PEOPLE_NAMES.length]!
    const threadStart = randomInt(rng, 4, 200)

    const thread: MessageReply[] = seed.messages.map((body, replyIndex) => ({
      id: `MSG-${1000 + index}-R${replyIndex + 1}`,
      // Alternating authors: the first message is from the correspondent in the
      // inbox and from the user in sent, which is what makes the thread read
      // the right way round.
      author: (seed.folder === 'sent') === (replyIndex % 2 === 0) ? 'You' : correspondent,
      body,
      // Each reply lands after the one before it. Random timestamps produce a
      // thread that appears to answer questions before they were asked.
      sentAt: hoursAgo(threadStart - replyIndex * randomInt(rng, 1, 6)),
    }))

    const last = thread.at(-1)!
    return {
      id: `MSG-${1000 + index}`,
      subject: seed.subject,
      correspondent,
      folder: seed.folder,
      // Archived threads have all been dealt with; unread archive is a
      // contradiction users notice.
      read: seed.folder === 'archived' || seed.folder === 'sent' || rng() > 0.45,
      preview: last.body.slice(0, 120),
      receivedAt: last.sentAt,
      thread,
    } satisfies Message
  })
}

const NOTIFICATIONS: {
  kind: NotificationKind
  title: string
  body: string
  link: string | null
}[] = [
  {
    kind: 'assignment',
    title: 'You were assigned a task',
    body: 'Audit colour contrast across all twelve themes — due in 4 days.',
    link: '/dashboard/projects',
  },
  {
    kind: 'mention',
    title: 'Kenji Nakamura mentioned you',
    body: 'In "Warehouse cutover — Osaka timings": can we split the window?',
    link: '/dashboard/messages',
  },
  {
    kind: 'billing',
    title: 'Invoice INV-2043 is due',
    body: 'Payment for the Scale plan is due in 3 days.',
    link: '/dashboard/billing',
  },
  {
    kind: 'security',
    title: 'New sign-in from an unrecognised device',
    body: 'A session was started from Hamburg, DE. If this was not you, review your sessions.',
    link: '/dashboard/account',
  },
  {
    kind: 'system',
    title: 'Scheduled maintenance on Sunday',
    body: 'The ingest API will be read-only between 02:00 and 04:00 UTC.',
    link: null,
  },
  {
    kind: 'assignment',
    title: 'Review requested',
    body: 'Elena Petrova asked you to review "Add a circuit breaker around the warehouse API".',
    link: '/dashboard/projects',
  },
  {
    kind: 'system',
    title: 'Export ready',
    body: 'Your audit log export for Q2 has finished and is available for download.',
    link: '/dashboard/reports',
  },
  {
    kind: 'billing',
    title: 'Plan limit approaching',
    body: 'You have used 92% of your monthly API allowance.',
    link: '/dashboard/billing',
  },
]

export function createNotificationFixtures(): AppNotification[] {
  const rng = createRng(77_003)

  return NOTIFICATIONS.map((seed, index) => ({
    id: `NTF-${1000 + index}`,
    kind: seed.kind,
    title: seed.title,
    body: seed.body,
    // Newest few unread, older ones read — the shape a real notification centre
    // has, and the one that makes the "mark all read" control meaningful.
    read: index >= 3 || rng() > 0.7,
    createdAt: hoursAgo(index * randomInt(rng, 3, 14) + 1),
    link: seed.link,
  }))
}

export const messageFixtures = createMessageFixtures()
export const notificationFixtures = createNotificationFixtures()
export const NOTIFICATION_KIND_LIST = NOTIFICATION_KINDS
