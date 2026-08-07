import { z } from 'zod'

import type { CollectionFilters } from '~/lib/api/collection-queries'

/** Project and task contract. */

/**
 * Board columns, in workflow order.
 *
 * The array order IS the column order — deriving the board from the same
 * constant the schema validates against means a new status cannot appear in the
 * data without appearing on the board, silently hiding every task in it.
 */
export const TASK_STATUSES = ['backlog', 'in_progress', 'review', 'done'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

export const PROJECT_HEALTHS = ['on_track', 'at_risk', 'off_track'] as const
export type ProjectHealth = (typeof PROJECT_HEALTHS)[number]

export const taskSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  status: z.enum(TASK_STATUSES),
  priority: z.enum(TASK_PRIORITIES),
  /** Display name. `null` is a real state — an unassigned task needs an owner. */
  assignee: z.string().nullable(),
  dueAt: z.string().nullable(),
  /** Ordering within a column. Sparse, so a card can be inserted between two others. */
  position: z.number().int(),
})
export type Task = z.infer<typeof taskSchema>

export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  health: z.enum(PROJECT_HEALTHS),
  lead: z.string(),
  startedAt: z.string(),
  dueAt: z.string(),
  /** 0–100, derived by the server from completed tasks. */
  progress: z.number().int().min(0).max(100),
  taskCount: z.number().int().nonnegative(),
  openTaskCount: z.number().int().nonnegative(),
})
export type Project = z.infer<typeof projectSchema>

export interface ProjectFilters extends CollectionFilters {
  health?: ProjectHealth | 'all'
}

export interface TaskFilters extends CollectionFilters {
  projectId?: string
  status?: TaskStatus | 'all'
}

/** Fields a board interaction may change. Position and status move together. */
export const taskMoveSchema = z.object({
  status: z.enum(TASK_STATUSES),
  position: z.number().int(),
})
export type TaskMove = z.infer<typeof taskMoveSchema>
