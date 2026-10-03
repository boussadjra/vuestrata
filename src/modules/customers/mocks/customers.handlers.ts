import { http, HttpResponse, type HttpHandler } from 'msw'

import { money } from '~/lib/money'
/**
 * Customers mock backend — demo builds only.
 *
 * Loaded through the module's `mockHandlers` factory, which is a dynamic
 * `import()`. A static import here would pull `msw` into the module barrel's
 * graph and therefore into real production bundles.
 */
import { createCollectionMock } from '~/mocks/collection'
import { isValidToken, mockApiUrl } from '~/mocks/utils'

import { customerDraftSchema, type Customer } from '../types'
import { customerFixtures } from './fixtures'

const customersMock = createCollectionMock<Customer>({
  resource: 'customers',
  seed: customerFixtures,
  searchFields: ['company', 'contactName', 'email', 'city'],
  filterFields: ['status', 'plan', 'country'],
  defaultSort: { by: 'company', order: 'asc' },

  create: (body, existing) => {
    // Validated with the same schema the form uses, so the mock rejects exactly
    // what a correct backend would rather than accepting anything and letting
    // the bug surface later as a malformed row.
    const parsed = customerDraftSchema.safeParse(body)
    if (!parsed.success) return null

    const now = new Date().toISOString()
    return {
      ...parsed.data,
      id: `CUS-${1000 + existing.length}`,
      owner: parsed.data.contactName,
      mrr: money(0),
      lifetimeValue: money(0),
      openOrders: 0,
      since: now,
      lastContactAt: now,
    }
  },

  update: (record, body) => {
    const parsed = customerDraftSchema.partial().safeParse(body)
    if (!parsed.success) return null
    return { ...record, ...parsed.data }
  },
})

/**
 * The one rule only a server can check: two customers cannot share an email.
 *
 * A schema cannot know what is already stored, so this is the demo's example
 * of a save the form believed valid and the backend refused. The answer is the
 * shape `AppError.details` is read from, keyed by the field it is about, which
 * is what lets the form show it under that field. Try it: create a customer
 * with the email of one that exists.
 *
 * The message follows `Accept-Language`, which the API client sends with the
 * language the user is reading, as a backend that localizes its messages would.
 */
const EMAIL_TAKEN: Record<string, string> = {
  en: 'A customer with this email already exists.',
  fr: 'Un client avec cette adresse e-mail existe déjà.',
  ar: 'يوجد عميل بهذا البريد الإلكتروني بالفعل.',
}

const VALIDATION_FAILED: Record<string, string> = {
  en: 'The customer could not be saved.',
  fr: "Le client n'a pas pu être enregistré.",
  ar: 'تعذّر حفظ العميل.',
}

function localized(messages: Record<string, string>, request: Request): string {
  const language = (request.headers.get('Accept-Language') ?? 'en').slice(0, 2).toLowerCase()
  return messages[language] ?? messages.en!
}

/**
 * Answers only when the email is taken. Returning nothing hands the request to
 * the collection's own handler below, which also owns the 401 for a request
 * with no session.
 */
async function refuseTakenEmail(request: Request, ownId?: string) {
  if (!isValidToken(request)) return undefined

  const body = (await request.clone().json()) as { email?: unknown }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email) return undefined

  const taken = customersMock
    .peek()
    .some((customer) => customer.id !== ownId && customer.email.toLowerCase() === email)
  if (!taken) return undefined

  return HttpResponse.json(
    {
      message: localized(VALIDATION_FAILED, request),
      code: 'VALIDATION_FAILED',
      details: { email: [localized(EMAIL_TAKEN, request)] },
    },
    { status: 422 },
  )
}

// Listed first: MSW asks the handlers in order, and the first to answer wins.
export const customersHandlers: HttpHandler[] = [
  http.post(mockApiUrl('/customers'), ({ request }) => refuseTakenEmail(request)),
  http.patch(mockApiUrl('/customers/:id'), ({ request, params }) =>
    refuseTakenEmail(request, String(params.id)),
  ),
  ...customersMock.handlers,
]
export const resetCustomersMock = customersMock.reset
