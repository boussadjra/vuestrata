import { defineQueryModel, param, type QueryParamDefinitions } from '@queryweave/core'

/** Shareable collection state; API dialects still own request serialization. */
export interface ListQueryValues extends Record<string, unknown> {
  page: number
  pageSize: number
  search: string
  sortBy?: string
  sortOrder: 'asc' | 'desc'
}

export function defineListQueryModel<const TFields extends QueryParamDefinitions = {}>(options: {
  sortBy: readonly string[]
  pageSize?: number
  pageSizes?: readonly number[]
  fields?: TFields
}) {
  const pageSize = options.pageSize ?? 10
  const sizes = options.pageSizes ?? [10, 25, 50, 100]
  if (!sizes.includes(pageSize)) throw new Error('Unsupported default table page size')
  const reserved = ['page', 'pageSize', 'search', 'sortBy', 'sortOrder']
  for (const key of Object.keys(options.fields ?? {})) {
    if (reserved.includes(key)) throw new Error(`List query field ${key} is reserved`)
  }
  return defineQueryModel({
    page: param.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }).default(1),
    pageSize: param
      .integer()
      .refine({
        refine: (value) =>
          sizes.includes(value)
            ? { ok: true, value }
            : { ok: false, issues: [{ message: 'Unsupported table page size' }] },
      })
      .default(pageSize),
    search: param.text({ allowEmpty: true, trim: true, maxLength: 200 }).default(''),
    sortBy: param.choice(options.sortBy).optional(),
    sortOrder: param.choice(['asc', 'desc']).default('asc'),
    ...options.fields,
  })
}
