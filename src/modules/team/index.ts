import type { ModuleDefinition } from '../types'
import teamI18nAr from './i18n/ar.json'
import teamI18nEn from './i18n/en.json'
import teamI18nFr from './i18n/fr.json'

/**
 * Team Module
 *
 * The people directory, deliberately separate from `users`. `users` is access
 * administration — who may do what; this is who someone is, what they work on
 * and when they are awake. Merging them puts a permission matrix on a profile
 * page and a phone number in an access review.
 *
 * Read-only: in a real deployment the directory is sourced from an HR system,
 * and offering an edit form the backend will reject teaches the wrong pattern.
 */
const teamModule: ModuleDefinition = {
  config: {
    id: 'team',
    origin: 'demo',
    name: 'Team',
    description: 'People directory, departments, and availability',
    version: '1.0.0',
    category: 'organization',
    order: 10,
    enabledByDefault: true,
    permissions: ['team:read'],
  },

  routes: [
    {
      path: '/dashboard/team',
      name: '/dashboard/team',
      component: () => import('./pages/index.vue'),
      meta: {
        layout: 'dashboard',
        requiresAuth: true,
        requiredPermission: 'team:read',
        module: 'team',
        title: 'team_nav',
      },
    },
    {
      path: '/dashboard/team/:id',
      name: '/dashboard/team/:id',
      component: () => import('./pages/profile.vue'),
      meta: {
        layout: 'dashboard',
        requiresAuth: true,
        requiredPermission: 'team:read',
        module: 'team',
        title: 'team_nav',
      },
    },
  ],

  navItems: [
    {
      label: 'team_nav',
      icon: 'users',
      to: '/dashboard/team',
      permission: 'team:read',
      group: 'organization',
      order: 5,
    },
  ],

  ...(__VUESTRATA_DEMO__
    ? { mockHandlers: async () => (await import('./mocks/team.handlers')).teamHandlers }
    : {}),

  i18n: {
    en: teamI18nEn,
    fr: teamI18nFr,
    ar: teamI18nAr,
  },
}

export default teamModule

// ─── Public API barrel ──────────────────────────────────
export { useTeamQuery, useTeamMemberQuery } from './composables/useTeam'
export { teamModuleKeys } from './query-keys'
export { TEAM_DEPARTMENTS, memberSchema } from './types'
export type { TeamDepartment, TeamFilters, TeamMember } from './types'
