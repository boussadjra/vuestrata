// User-management domain types for the users module.
// Core User and Role types live in src/types/index.ts (cross-cutting concerns).
// This file extends them with user-management-specific shapes.

import { z } from 'zod'

import type { Role, User } from '~/types'

export type { User, Role, AuthProvider, PaginatedResponse } from '~/types'

export interface UserFilters extends Record<string, unknown> {
  search?: string
  role?: string
  page?: number
  pageSize?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface UserInvitePayload {
  email: string
  role: string
  name?: string
}

export interface UserRoleUpdatePayload {
  role: string
}

/**
 * What a user endpoint has to answer with for this module to work on it: who
 * the user is and which role they hold. The optional rest of `User` is passed
 * on as the backend sent it.
 *
 * The cast says only that: the four fields below are checked, the others are
 * not, and a role is whatever string the backend names (roles are extensible
 * through `rbac.overrides.ts`, so a closed list here would be wrong).
 */
export const userRecordSchema = z.looseObject({
  id: z.string().min(1),
  email: z.string(),
  name: z.string(),
  role: z.string().min(1),
}) as z.ZodType<unknown> as z.ZodType<User>

/** The body of `PATCH /users/{id}/role`. */
export const userRoleUpdateSchema = z.object({
  role: z.custom<Role>((value) => typeof value === 'string' && value !== ''),
})
