import { http, HttpResponse, delay } from 'msw'

import { PLANS } from '~/modules/billing'

import { mockInvoices, mockPaymentMethods, mockSubscription, mockUsage } from '../fixtures'
import { isValidToken } from '../utils'

export const billingHandlers = [
  http.get('*/billing', async ({ request }) => {
    await delay(300)
    if (!isValidToken(request)) {
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }
    return HttpResponse.json({
      plan: PLANS[2], // Pro
      subscription: mockSubscription,
      invoices: mockInvoices,
      paymentMethods: mockPaymentMethods,
      usage: mockUsage,
    })
  }),

  http.post('*/billing/subscribe', async ({ request }) => {
    await delay(500)
    if (!isValidToken(request)) {
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }
    const body = (await request.json()) as { planId: string; interval: string }
    return HttpResponse.json({
      ...mockSubscription,
      planId: body.planId,
      status: 'active',
    })
  }),

  http.post('*/billing/cancel', async ({ request }) => {
    await delay(300)
    if (!isValidToken(request)) {
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }
    return HttpResponse.json({
      ...mockSubscription,
      cancelAtPeriodEnd: true,
    })
  }),

  http.put('*/billing/payment-methods', async ({ request }) => {
    await delay(200)
    if (!isValidToken(request)) {
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }
    return HttpResponse.json(mockPaymentMethods)
  }),
]
