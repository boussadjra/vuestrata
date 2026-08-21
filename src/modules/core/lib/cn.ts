import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Compose class lists so the caller's classes win.
 *
 * Vue merges a fallthrough `class` onto the root, but which of two conflicting
 * utilities applies is decided by the order Tailwind emitted them into the
 * stylesheet, not by their order on the element — so a wrapper's `px-4` beats a
 * caller's `px-6` about half the time, invisibly. `twMerge` drops the earlier
 * class from the same group, making "last one passed wins" true.
 *
 * Put the incoming `class` last:
 *
 *     :class="cn('px-4 py-2 rounded-md', attrs.class)"
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export type { ClassValue }
