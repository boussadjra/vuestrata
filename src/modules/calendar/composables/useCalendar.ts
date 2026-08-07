/** Calendar server state — the shared collection contract with an event schema. */
import { createCollectionApi } from '~/lib/api/collection-queries'

import { calendarModuleKeys } from '../query-keys'
import {
  calendarEventSchema,
  type CalendarEvent,
  type CalendarEventDraft,
  type CalendarFilters,
} from '../types'

const calendarApi = createCollectionApi<
  CalendarEvent,
  CalendarFilters,
  CalendarEventDraft,
  CalendarEventDraft
>({
  resource: 'events',
  schema: calendarEventSchema,
  keys: calendarModuleKeys,
})

export const useEventsQuery = calendarApi.useList
export const useEventQuery = calendarApi.useDetail
export const useCreateEventMutation = calendarApi.useCreate
export const useUpdateEventMutation = calendarApi.useUpdate
export const useDeleteEventMutation = calendarApi.useRemove
