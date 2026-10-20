export type FoundationLayer = 'page' | 'feature' | 'core'
export type SyntaxKind =
  | 'plain'
  | 'keyword'
  | 'string'
  | 'function'
  | 'comment'
  | 'type'
  | 'operator'
  | 'tag'
  | 'attribute'

export interface SyntaxToken {
  readonly kind: SyntaxKind
  readonly text: string
}

interface FoundationSnippet {
  readonly sourcePath: string
  readonly startLine: number
  readonly lines: readonly (readonly SyntaxToken[])[]
}

const token = (kind: SyntaxKind, text: string): SyntaxToken => ({ kind, text })
const plain = (text: string): SyntaxToken => token('plain', text)

/** Verbatim contiguous source excerpts, checked against the files in the parity test. */
export const foundationSnippets = {
  page: {
    sourcePath: 'src/modules/customers/pages/detail.vue',
    startLine: 25,
    lines: [
      [
        token('keyword', 'const'),
        plain(' id '),
        token('operator', '='),
        plain(' '),
        token('function', 'useRouteParam'),
        plain('('),
        token('string', "'id'"),
        plain(')'),
      ],
      [
        token('keyword', 'const'),
        plain(' { item: customer, isPending, isError, error, refetch } '),
        token('operator', '='),
        plain(' '),
        token('function', 'useCustomerQuery'),
        plain('(id)'),
      ],
    ],
  },
  feature: {
    sourcePath: 'src/modules/customers/composables/useCustomers.ts',
    startLine: 19,
    lines: [
      [
        token('keyword', 'export const'),
        plain(' useCustomersQuery '),
        token('operator', '='),
        plain(' customersApi.'),
        token('function', 'useList'),
      ],
      [
        token('keyword', 'export const'),
        plain(' useCustomerQuery '),
        token('operator', '='),
        plain(' customersApi.'),
        token('function', 'useDetail'),
      ],
    ],
  },
  core: {
    sourcePath: 'src/modules/core/lib/money.ts',
    startLine: 30,
    lines: [
      [
        token('keyword', 'export function'),
        plain(' '),
        token('function', 'money'),
        plain('(amount: '),
        token('type', 'number'),
        plain(', currency '),
        token('operator', '='),
        plain(' '),
        token('string', "'USD'"),
        plain('): '),
        token('type', 'Money'),
        plain(' {'),
      ],
      [
        plain('  '),
        token('keyword', 'return'),
        plain(' { amount: Math.'),
        token('function', 'round'),
        plain('(amount), currency }'),
      ],
      [plain('}')],
    ],
  },
} satisfies Record<FoundationLayer, FoundationSnippet>
