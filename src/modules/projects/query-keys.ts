import { defineQueryKeys } from '~/lib/query-keys'

/** Projects module query keys. Tasks are a nested collection under projects. */
export const projectsModuleKeys = {
  ...defineQueryKeys('projects'),
  tasks: (params?: Record<string, unknown>) => ['projects', 'tasks', params] as const,
}

export const tasksModuleKeys = defineQueryKeys('tasks')
