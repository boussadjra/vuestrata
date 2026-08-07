import type { ModuleDefinition } from '../types'
import projectsI18nAr from './i18n/ar.json'
import projectsI18nEn from './i18n/en.json'
import projectsI18nFr from './i18n/fr.json'

/**
 * Projects Module
 *
 * Demonstrates the kanban pattern, built keyboard-first: cards move via a
 * labelled control on the card rather than by drag-and-drop, so the board works
 * for keyboard and screen-reader users before any pointer enhancement is added.
 */
const projectsModule: ModuleDefinition = {
  config: {
    id: 'projects',
    name: 'Projects',
    description: 'Project portfolio and task boards',
    version: '1.0.0',
    category: 'work',
    order: 10,
    enabledByDefault: true,
    permissions: ['projects:read', 'projects:manage'],
  },

  routes: [
    {
      path: '/dashboard/projects',
      name: '/dashboard/projects',
      component: () => import('./pages/index.vue'),
      meta: {
        layout: 'dashboard',
        requiresAuth: true,
        requiredPermission: 'projects:read',
        module: 'projects',
        title: 'projects_nav',
      },
    },
    {
      path: '/dashboard/projects/:id',
      name: '/dashboard/projects/:id',
      component: () => import('./pages/board.vue'),
      meta: {
        layout: 'dashboard',
        requiresAuth: true,
        requiredPermission: 'projects:read',
        module: 'projects',
        title: 'projects_board_title',
      },
    },
  ],

  navItems: [
    {
      label: 'projects_nav',
      icon: 'folder',
      to: '/dashboard/projects',
      permission: 'projects:read',
      group: 'work',
      order: 10,
    },
  ],

  ...(__VUESTRATA_DEMO__
    ? { mockHandlers: async () => (await import('./mocks/projects.handlers')).projectsHandlers }
    : {}),

  i18n: {
    en: projectsI18nEn,
    fr: projectsI18nFr,
    ar: projectsI18nAr,
  },
}

export default projectsModule

// ─── Public API barrel ──────────────────────────────────
export {
  useProjectsQuery,
  useProjectQuery,
  useTasksQuery,
  useMoveTaskMutation,
} from './composables/useProjects'
export { projectsModuleKeys, tasksModuleKeys } from './query-keys'
export { PROJECT_HEALTHS, TASK_PRIORITIES, TASK_STATUSES, projectSchema, taskSchema } from './types'
export type {
  Project,
  ProjectFilters,
  ProjectHealth,
  Task,
  TaskFilters,
  TaskPriority,
  TaskStatus,
} from './types'
