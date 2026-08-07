import { z } from 'zod'

import type { CollectionFilters } from '~/lib/api/collection-queries'

/** Message and notification contract. */

export const MESSAGE_FOLDERS = ['inbox', 'sent', 'archived'] as const
export type MessageFolder = (typeof MESSAGE_FOLDERS)[number]

export const NOTIFICATION_KINDS = [
  'mention',
  'assignment',
  'system',
  'billing',
  'security',
] as const
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]

export const messageReplySchema = z.object({
  id: z.string(),
  author: z.string(),
  body: z.string(),
  sentAt: z.string(),
})
export type MessageReply = z.infer<typeof messageReplySchema>

export const messageSchema = z.object({
  id: z.string(),
  subject: z.string(),
  /** Display name of the other party. */
  correspondent: z.string(),
  folder: z.enum(MESSAGE_FOLDERS),
  /**
   * Read state lives on the message, not on a separate table, because the only
   * consumer is the current user's own view of their own mailbox.
   */
  read: z.boolean(),
  preview: z.string(),
  receivedAt: z.string(),
  /** The full thread, oldest first. Always at least one entry. */
  thread: z.array(messageReplySchema).min(1),
})
export type Message = z.infer<typeof messageSchema>

export const notificationSchema = z.object({
  id: z.string(),
  kind: z.enum(NOTIFICATION_KINDS),
  title: z.string(),
  body: z.string(),
  read: z.boolean(),
  createdAt: z.string(),
  /** In-app destination, or `null` when the notification is purely informational. */
  link: z.string().nullable(),
})
export type AppNotification = z.infer<typeof notificationSchema>

export interface MessageFilters extends CollectionFilters {
  folder?: MessageFolder
  read?: 'true' | 'false' | 'all'
}

export interface NotificationFilters extends CollectionFilters {
  kind?: NotificationKind | 'all'
  read?: 'true' | 'false' | 'all'
}
