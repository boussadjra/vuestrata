import type { ValidationAdapter, ValidationResult, FieldError } from '~/types'

export const arktypeAdapter: ValidationAdapter = {
  validate<T>(schema: unknown, data: unknown): ValidationResult<T> {
    // ArkType schema is a callable: schema(data) returns data or ArkErrors
    const typeFn = schema as (
      data: unknown,
    ) => T | { problems?: Array<{ path: string[]; message: string }> }
    const result = typeFn(data)
    if (result && typeof result === 'object' && 'problems' in result) {
      const errors: FieldError[] = (result.problems ?? []).map(
        (p: { path: string[]; message: string }) => ({
          path: p.path.join('.'),
          message: p.message,
        }),
      )
      return { success: false, errors }
    }
    return { success: true, data: result as T }
  },

  validateField(schema: unknown, field: string, value: unknown): string | true {
    // ArkType returns either the validated data or an object with problems
    type ArkResult = { problems?: Array<{ path: string[]; message: string }> }
    const typeFn = schema as (data: unknown) => ArkResult
    const result = typeFn({ [field]: value })
    if (result && typeof result === 'object' && 'problems' in result) {
      const problems = (result as { problems: Array<{ path: string[]; message: string }> }).problems
      const fieldProblem = problems.find((p) => p.path.includes(field))
      return fieldProblem?.message ?? true
    }
    return true
  },
}
