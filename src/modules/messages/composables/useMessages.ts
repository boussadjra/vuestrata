/**
 * Messages and notifications server state.
 *
 * Two collections, because they answer different questions: a message is a
 * conversation the user participates in, a notification is something the system
 * told them. Merging them into one feed loses the distinction that decides
 * whether a reply box makes sense.
 */
import { createCollectionApi } from '~/lib/api/collection-queries'

import { messagesModuleKeys, notificationsModuleKeys } from '../query-keys'
import {
  messageSchema,
  notificationSchema,
  type AppNotification,
  type Message,
  type MessageFilters,
  type NotificationFilters,
} from '../types'

const messagesApi = createCollectionApi<
  Message,
  MessageFilters,
  Partial<Message>,
  { read?: boolean; folder?: string }
>({
  resource: 'messages',
  schema: messageSchema,
  keys: messagesModuleKeys,
})

const notificationsApi = createCollectionApi<
  AppNotification,
  NotificationFilters,
  Partial<AppNotification>,
  { read?: boolean }
>({
  resource: 'notifications',
  schema: notificationSchema,
  keys: notificationsModuleKeys,
})

export const useMessagesQuery = messagesApi.useList
export const useMessageQuery = messagesApi.useDetail
export const useUpdateMessageMutation = messagesApi.useUpdate
export const useNotificationsQuery = notificationsApi.useList
export const useUpdateNotificationMutation = notificationsApi.useUpdate
