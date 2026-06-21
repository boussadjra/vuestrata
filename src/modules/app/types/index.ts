import type { Role, Permission, BuiltinPermission, RoleDefinition } from '~/lib/rbac/types'

// ─── Icon System ─────────────────────────────────────────
export type IconProvider = 'solar' | 'lucide' | 'phosphor' | (string & {})

export type IconName =
  | 'bolt'
  | 'shield-check'
  | 'palette'
  | 'lock'
  | 'widget'
  | 'chart'
  | 'rocket'
  | 'menu'
  | 'sun'
  | 'moon'
  | 'login'
  | 'logout'
  | 'users'
  | 'card'
  | 'document'
  | 'database'
  | 'graph'
  | 'settings'
  | 'sidebar'
  | 'search'
  | 'close'
  | 'close-circle'
  | 'check'
  | 'check-circle'
  | 'info-circle'
  | 'danger-triangle'
  | 'arrow-left'
  | 'arrow-right'
  | 'arrow-up'
  | 'arrow-down'
  | 'chevron-down'
  | 'chevron-right'
  | 'refresh'
  | 'spinner'
  | 'download'
  | 'tuning'
  | 'star'
  | 'file'
  | 'home'
  | 'user-plus'
  | 'shield-user'
  | 'code'
  | 'monitor'
  | 'letter'
  | 'bell'
  | 'minus-circle'
  | 'trend-up'
  | 'dots-menu'
  | 'folder'
  | 'dollar'
  | 'emoji'
  | 'shield-warning'
  | 'zoom-in'
  | 'zoom-out'
  | 'document-add'
  | 'palette-round'
  | 'layers'
  | 'grid'
  | 'edit'
  | 'list'
  | 'clock'
  | 'send'
  | 'shopping-cart'
  | 'truck'

export type IconMap = Record<IconName, string>

// ─── Theme System ────────────────────────────────────────
export type ThemeName =
  | 'default'
  | 'brutalist'
  | 'ghibli'
  | 'ocean'
  | 'sunset'
  | 'forest'
  | 'rose'
  | 'terminal'
  | 'blueprint'
  | 'febin'
  | (string & {})

export interface ThemeConfig {
  name: string
  label: string
  cssClass: string
  isDarkDefault?: boolean
}

export interface ColorScale {
  50: string
  100: string
  200: string
  300: string
  400: string
  500: string
  600: string
  700: string
  800: string
  900: string
  950: string
}

export interface ThemeTokens {
  colors?: {
    primary?: Partial<ColorScale>
    secondary?: Partial<ColorScale>
    accent?: Partial<ColorScale>
    surface?: Partial<ColorScale>
  }
  typography?: {
    fontSans?: string
    fontMono?: string
  }
  radius?: {
    sm?: string
    md?: string
    lg?: string
    xl?: string
    '2xl'?: string
    full?: string
  }
  shadows?: {
    soft?: string
    elevated?: string
    card?: string
    'card-hover'?: string
  }
}

// ─── Validation System ───────────────────────────────────
export type ValidationAdapterName = 'zod'

export interface FieldError {
  path: string
  message: string
}

export type ValidationResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; errors: FieldError[] }

export interface ValidationAdapter {
  validate<T = unknown>(schema: unknown, data: unknown): ValidationResult<T>
  validateField(schema: unknown, field: string, value: unknown): string | true
}

// ─── Form Builder ────────────────────────────────────────
export type {
  FormFieldType,
  BaseFieldProps,
  SelectFieldOptions,
  DateFieldOptions,
  NumberFieldOptions,
  SliderFieldOptions,
  FileFieldOptions,
  OtpFieldOptions,
  TagsFieldOptions,
  RatingFieldOptions,
  FormFieldConfig,
  FormFieldDefinition,
  FormProps,
  FormGroupProps,
  FormRepeaterProps,
} from './forms'

// ─── App Config ──────────────────────────────────────────
export interface AppConfig {
  title: string
  apiUrl: string
  useMocks: boolean
  authProvider: 'jwt' | 'oauth' | 'mock'
  iconProvider: IconProvider
  demoAuth: {
    retentionHours: number
  }
}

// ─── RBAC ────────────────────────────────────────────────
// Canonical definitions live in src/modules/core/lib/rbac/types.ts (framework-agnostic lib layer).
// Re-exported here so the rest of the app can import from ~/types as before.
export type { Role, Permission, BuiltinPermission, RoleDefinition }

// ─── Auth ────────────────────────────────────────────────
export type AuthProvider = 'credentials' | 'google' | 'github' | 'microsoft'
export type AuthStrategy = 'jwt' | 'oauth' | 'magic-link' | 'mock'

export interface User {
  id: string
  email: string
  name: string
  avatar?: string
  role: Role
  permissions?: Permission[]
  emailVerified?: boolean
  mfaEnabled?: boolean
  provider?: AuthProvider
  createdAt?: string
  lastLoginAt?: string
}

export interface AuthCredentials {
  email: string
  password: string
}

export interface AuthResponse {
  user: User
  token: string
  refreshToken: string
  expiresIn: number
  /** When true, login is incomplete — the client must present the MFA challenge. */
  mfaRequired?: boolean
  /** Temporary token used to complete the MFA challenge. */
  mfaToken?: string
}

export interface MfaSetupResponse {
  secret: string
  qrCodeUrl: string
  backupCodes: string[]
}

export interface MfaVerifyRequest {
  mfaToken: string
  code: string
}

export interface OAuthState {
  provider: AuthProvider
  redirectUrl: string
  codeVerifier?: string
}

export interface MagicLinkRequest {
  email: string
}

// ─── Billing ─────────────────────────────────────────────
export type {
  PlanTier,
  BillingInterval,
  SubscriptionStatus,
  InvoiceStatus,
  Plan,
  Subscription,
  Invoice,
  PaymentMethod,
  UsageMetrics,
} from './billing'

// ─── UI & Layout ─────────────────────────────────────────
export interface Notification {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title?: string
  message: string
  duration?: number
}

export interface SidebarItem {
  label: string
  icon: string
  to?: string
  permission?: Permission
  children?: SidebarItem[]
}

export interface BreadcrumbItem {
  label: string
  to?: string
  icon?: string
  disabled?: boolean
}

export interface AccordionItemData {
  value: string
  title: string
  content?: string
  disabled?: boolean
}

export interface CommandItem {
  id: string
  label: string
  hint?: string
}

export interface StepperItem {
  label: string
  description?: string
}

export interface TabItem {
  value: string
  label: string
  disabled?: boolean
}

// ─── API & Errors ────────────────────────────────────────
export interface ApiError {
  status: number
  code: string
  message: string
  details?: Record<string, string[]>
  requestId?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  meta: {
    total: number
    page: number
    pageSize: number
    totalPages: number
  }
}

// ─── Audit ───────────────────────────────────────────────
export interface AuditLogEntry {
  id: string
  userId: string
  userName: string
  action: string
  resource: string
  resourceId?: string
  details?: Record<string, unknown>
  ip?: string
  userAgent?: string
  createdAt: string
}
