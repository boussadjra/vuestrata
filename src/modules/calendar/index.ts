import type { ModuleDefinition } from '../types'
import calendarI18nAr from './i18n/ar.json'
import calendarI18nEn from './i18n/en.json'
import calendarI18nFr from './i18n/fr.json'

/**
 * Calendar Module
 *
 * Demonstrates the month-grid pattern: a real table with weekday headers,
 * roving-tabindex arrow navigation that respects writing direction, and a
 * server-side date-range query rather than fetching every event and filtering
 * in the browser.
 */
const calendarModule: ModuleDefinition = {
  config: {
    id: 'calendar',
    origin: 'demo',
    name: 'Calendar',
    description: 'Team calendar, deadlines, and maintenance windows',
    version: '1.0.0',
    category: 'work',
    order: 20,
    enabledByDefault: true,
    permissions: ['calendar:read', 'calendar:manage'],
  },

  routes: [
    {
      path: '/dashboard/calendar',
      name: '/dashboard/calendar',
      component: () => import('./pages/index.vue'),
      meta: {
        layout: 'dashboard',
        requiresAuth: true,
        requiredPermission: 'calendar:read',
        module: 'calendar',
        title: 'calendar_nav',
      },
    },
  ],

  navItems: [
    {
      label: 'calendar_nav',
      icon: 'clock',
      to: '/dashboard/calendar',
      permission: 'calendar:read',
      group: 'work',
      order: 20,
    },
  ],

  ...(__VUESTRATA_DEMO__
    ? { mockHandlers: async () => (await import('./mocks/calendar.handlers')).calendarHandlers }
    : {}),

  i18n: {
    en: calendarI18nEn,
    fr: calendarI18nFr,
    ar: calendarI18nAr,
  },
}

export default calendarModule

// ─── Public API barrel ──────────────────────────────────
export {
  useEventsQuery,
  useEventQuery,
  useCreateEventMutation,
  useUpdateEventMutation,
  useDeleteEventMutation,
} from './composables/useCalendar'
export { buildMonthGrid, monthRange, toDateKey, weekdayLabels } from './composables/useMonthGrid'
export { calendarModuleKeys } from './query-keys'
export { EVENT_KINDS, calendarEventSchema, calendarEventDraftSchema } from './types'
export type { CalendarEvent, CalendarEventDraft, CalendarFilters, EventKind } from './types'
