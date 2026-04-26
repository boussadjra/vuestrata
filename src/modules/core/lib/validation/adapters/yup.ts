import type { ValidationAdapter, ValidationResult, FieldError } from '~/types'

export const yupAdapter: ValidationAdapter = {
  validate<T>(schema: unknown, data: unknown): ValidationResult<T> {
    const yupSchema = schema as {
      validateSync: (data: unknown, opts: Record<string, boolean>) => T
    }
    try {
      const result = yupSchema.validateSync(data, { abortEarly: false })
      return { success: true, data: result }
    } catch (err: unknown) {
      const yupError = err as {
        inner?: Array<{ path?: string; message: string }>
      }
      const errors: FieldError[] = (yupError.inner ?? []).map((e) => ({
        path: e.path ?? '',
        message: e.message,
      }))
      return { success: false, errors }
    }
  },

  validateField(schema: unknown, field: string, value: unknown): string | true {
    const yupSchema = schema as {
      validateSyncAt: (path: string, data: unknown) => unknown
    }
    try {
      yupSchema.validateSyncAt(field, { [field]: value })
      return true
    } catch (err: unknown) {
      return (err as { message?: string }).message ?? 'Validation failed'
    }
  },
}
