/**
 * Project presentation rules.
 *
 * Health is a worded badge rather than the red/amber/green dot this kind of
 * table usually gets — RAG status is the canonical example of information
 * carried entirely by colour. The variant only reinforces the label.
 */
import type { ProjectHealth, TaskPriority } from './types'

export type ProjectHealthVariant = 'success' | 'warning' | 'error'
export type TaskPriorityVariant = 'default' | 'secondary' | 'warning' | 'error'

const HEALTH_VARIANT: Record<ProjectHealth, ProjectHealthVariant> = {
  on_track: 'success',
  at_risk: 'warning',
  off_track: 'error',
}

const PRIORITY_VARIANT: Record<TaskPriority, TaskPriorityVariant> = {
  low: 'default',
  medium: 'secondary',
  high: 'warning',
  urgent: 'error',
}

export function projectHealthVariant(health: ProjectHealth): ProjectHealthVariant {
  return HEALTH_VARIANT[health]
}

export function taskPriorityVariant(priority: TaskPriority): TaskPriorityVariant {
  return PRIORITY_VARIANT[priority]
}
