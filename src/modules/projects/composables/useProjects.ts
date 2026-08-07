/**
 * Projects and tasks server state.
 *
 * Two collections rather than one nested resource: the board fetches tasks
 * filtered by `projectId`, and the list fetches projects. Embedding tasks in the
 * project payload would mean refetching every project to move one card.
 */
import { createCollectionApi } from '~/lib/api/collection-queries'

import { projectsModuleKeys, tasksModuleKeys } from '../query-keys'
import {
  projectSchema,
  taskSchema,
  type Project,
  type ProjectFilters,
  type Task,
  type TaskFilters,
  type TaskMove,
} from '../types'

const projectsApi = createCollectionApi<Project, ProjectFilters>({
  resource: 'projects',
  schema: projectSchema,
  keys: projectsModuleKeys,
})

const tasksApi = createCollectionApi<Task, TaskFilters, Partial<Task>, TaskMove>({
  resource: 'tasks',
  schema: taskSchema,
  keys: tasksModuleKeys,
})

export const useProjectsQuery = projectsApi.useList
export const useProjectQuery = projectsApi.useDetail
export const useTasksQuery = tasksApi.useList
export const useMoveTaskMutation = tasksApi.useUpdate
