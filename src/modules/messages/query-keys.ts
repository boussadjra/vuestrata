import { defineQueryKeys } from '~/lib/query-keys'

/** Messages module query keys. Notifications are a sibling collection. */
export const messagesModuleKeys = defineQueryKeys('messages')
export const notificationsModuleKeys = defineQueryKeys('notifications')
