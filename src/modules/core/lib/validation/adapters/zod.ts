import type { ZodSchema, ZodError } from 'zod'

import type { ValidationAdapter, ValidationResult, FieldError } from '~/types'

export const zodAdapter: ValidationAdapter = {
  validate<T>(schema: unknown, data: unknown): ValidationResult<T> {
    const zodSchema = schema as ZodSchema<T>
    const result = zodSchema.safeParse(data)
    if (result.success) {
      return { success: true, data: result.data }
    }
    const zodError = result.error as ZodError
    const errors: FieldError[] = zodError.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }))
    return { success: false, errors }
  },

  validateField(schema: unknown, field: string, value: unknown): string | true {
    const zodSchema = schema as ZodSchema
    // Create a partial object with just this field
    const result = zodSchema.safeParse({ [field]: value })
    if (result.success) return true
    const zodError = result.error as ZodError
    const fieldIssue = zodError.issues.find((i) => i.path[0] === field)
    return fieldIssue?.message ?? true
  },
}
