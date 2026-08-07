import type { ModuleDefinition } from '../types'
import messagesI18nAr from './i18n/ar.json'
import messagesI18nEn from './i18n/en.json'
import messagesI18nFr from './i18n/fr.json'

/**
 * Messages Module
 *
 * Two related but deliberately separate surfaces: a master/detail inbox with
 * the selected thread held in the URL, and a notification centre. Messages are
 * conversations; notifications are things the system said. Merging them would
 * lose the distinction that decides whether a reply box makes sense.
 */
const messagesModule: ModuleDefinition = {
  config: {
    id: 'messages',
    name: 'Messages',
    description: 'Inbox, threads, and the notification centre',
    version: '1.0.0',
    category: 'work',
    order: 30,
    enabledByDefault: true,
    permissions: ['messages:read'],
  },

  routes: [
    {
      path: '/dashboard/messages',
      name: '/dashboard/messages',
      component: () => import('./pages/index.vue'),
      meta: {
        layout: 'dashboard',
        requiresAuth: true,
        requiredPermission: 'messages:read',
        module: 'messages',
        title: 'messages_nav',
      },
    },
    {
      path: '/dashboard/notifications',
      name: '/dashboard/notifications',
      component: () => import('./pages/notifications.vue'),
      meta: {
        layout: 'dashboard',
        requiresAuth: true,
        requiredPermission: 'messages:read',
        module: 'messages',
        title: 'notifications_nav',
      },
    },
  ],

  navItems: [
    {
      label: 'messages_nav',
      icon: 'letter',
      to: '/dashboard/messages',
      permission: 'messages:read',
      group: 'work',
      order: 30,
      exact: true,
      children: [
        {
          label: 'messages_nav_inbox',
          icon: 'letter',
          to: '/dashboard/messages',
          permission: 'messages:read',
          exact: true,
        },
        {
          label: 'notifications_nav',
          icon: 'bell',
          to: '/dashboard/notifications',
          permission: 'messages:read',
        },
      ],
    },
  ],

  ...(__VUESTRATA_DEMO__
    ? { mockHandlers: async () => (await import('./mocks/messages.handlers')).messagesHandlers }
    : {}),

  i18n: {
    en: messagesI18nEn,
    fr: messagesI18nFr,
    ar: messagesI18nAr,
  },
}

export default messagesModule

// ─── Public API barrel ──────────────────────────────────
export {
  useMessagesQuery,
  useMessageQuery,
  useUpdateMessageMutation,
  useNotificationsQuery,
  useUpdateNotificationMutation,
} from './composables/useMessages'
export { messagesModuleKeys, notificationsModuleKeys } from './query-keys'
export { MESSAGE_FOLDERS, NOTIFICATION_KINDS, messageSchema, notificationSchema } from './types'
export type {
  AppNotification,
  Message,
  MessageFilters,
  MessageFolder,
  NotificationFilters,
  NotificationKind,
} from './types'
