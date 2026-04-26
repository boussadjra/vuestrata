// User-management domain types for the users module.
// Core User and Role types live in src/types/index.ts (cross-cutting concerns).
// This file extends them with user-management-specific shapes.

export type { User, Role, AuthProvider, PaginatedResponse } from '~/types'

export interface UserFilters extends Record<string, unknown> {
  search?: string
  role?: string
  page?: number
  pageSize?: number
}

export interface UserInvitePayload {
  email: string
  role: string
  name?: string
}

export interface UserRoleUpdatePayload {
  role: string
}
