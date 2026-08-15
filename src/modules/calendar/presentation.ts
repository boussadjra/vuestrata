/**
 * Calendar presentation rules.
 *
 * The kind badge always carries its translated label; the variant only
 * reinforces it, so a deadline is not distinguishable by colour alone.
 */
import type { EventKind } from './types'

export type EventKindVariant = 'primary' | 'warning' | 'secondary' | 'error' | 'default'

const KIND_VARIANT: Record<EventKind, EventKindVariant> = {
  meeting: 'primary',
  deadline: 'error',
  review: 'secondary',
  maintenance: 'warning',
  holiday: 'default',
}

export function eventKindVariant(kind: EventKind): EventKindVariant {
  return KIND_VARIANT[kind]
}
