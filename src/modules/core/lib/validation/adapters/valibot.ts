import type { BaseSchema, BaseIssue } from 'valibot'

import type { ValidationAdapter, ValidationResult, FieldError } from '~/types'

// The shared `ValidationAdapter` interface accepts `unknown` as the schema
// because each adapter (zod / valibot / yup / arktype) carries its own
// schema shape. Inside this module we narrow once via `assertValibotSchema`
// rather than peppering `as AnySchema` casts at every call site.
type AnySchema = BaseSchema<unknown, unknown, BaseIssue<unknown>>

function assertValibotSchema(schema: unknown): AnySchema {
  // valibot schemas are plain objects with a `kind: 'schema'` discriminator.
  if (
    typeof schema === 'object' &&
    schema !== null &&
    (schema as { kind?: unknown }).kind === 'schema'
  ) {
    return schema as AnySchema
  }
  throw new TypeError('valibotAdapter: expected a valibot schema')
}

export const valibotAdapter: ValidationAdapter = {
  validate<T>(schema: unknown, data: unknown): ValidationResult<T> {
    const v = require('valibot') as typeof import('valibot')
    const result = v.safeParse(assertValibotSchema(schema), data)
    if (result.success) {
      return { success: true, data: result.output as T }
    }
    const errors: FieldError[] = (result.issues ?? []).map((issue) => ({
      path: (issue.path ?? []).map((p) => String((p as { key: unknown }).key)).join('.'),
      message: issue.message,
    }))
    return { success: false, errors }
  },

  validateField(schema: unknown, field: string, value: unknown): string | true {
    const v = require('valibot') as typeof import('valibot')
    const result = v.safeParse(assertValibotSchema(schema), { [field]: value })
    if (result.success) return true
    const fieldIssue = (result.issues ?? []).find((i) =>
      (i.path ?? []).some((p) => String((p as { key: unknown }).key) === field),
    )
    return fieldIssue?.message ?? true
  },
}
