/** Messages and notifications mock backend — demo builds only. */
import { z } from 'zod'

import { createCollectionMock } from '~/mocks/collection'

import { MESSAGE_FOLDERS, type AppNotification, type Message } from '../types'
import { messageFixtures, notificationFixtures } from './fixtures'

// Read state and folder are the only fields a client may change. A PATCH that
// could rewrite `thread` would let the reader edit what the other party said.
const messagePatchSchema = z.object({
  read: z.boolean().optional(),
  folder: z.enum(MESSAGE_FOLDERS).optional(),
})

const notificationPatchSchema = z.object({ read: z.boolean().optional() })

const messagesMock = createCollectionMock<Message>({
  resource: 'messages',
  seed: messageFixtures,
  searchFields: ['subject', 'correspondent', 'preview'],
  filterFields: ['folder', 'read'],
  defaultSort: { by: 'receivedAt', order: 'desc' },

  update: (record, body) => {
    const parsed = messagePatchSchema.safeParse(body)
    if (!parsed.success) return null
    return { ...record, ...parsed.data }
  },
})

const notificationsMock = createCollectionMock<AppNotification>({
  resource: 'notifications',
  seed: notificationFixtures,
  searchFields: ['title', 'body'],
  filterFields: ['kind', 'read'],
  defaultSort: { by: 'createdAt', order: 'desc' },

  update: (record, body) => {
    const parsed = notificationPatchSchema.safeParse(body)
    if (!parsed.success) return null
    return { ...record, ...parsed.data }
  },
})

export const messagesHandlers = [...messagesMock.handlers, ...notificationsMock.handlers]
export const resetMessagesMock = () => {
  messagesMock.reset()
  notificationsMock.reset()
}
