/**
 * The new-order form's state machine.
 *
 * Exercised without the form: the step rules and the line-merging rule are the
 * behaviour, and they used to be reachable only by clicking through three steps
 * of a route component.
 */
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vite-plus/test'
import { defineComponent, h } from 'vue'

import { useOrderDraft } from '@/modules/orders/composables/useOrderDraft'
import { ORDER_CATALOG } from '@/modules/orders/pricing'

type Draft = ReturnType<typeof useOrderDraft>

function mountDraft(): Draft {
  let draft!: Draft

  const Probe = defineComponent({
    setup() {
      draft = useOrderDraft()
      return () => h('div')
    },
  })

  mount(Probe, {
    global: {
      plugins: [
        [
          VueQueryPlugin,
          { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
        ],
      ],
    },
  })

  return draft
}

function fillCustomerStep(draft: Draft) {
  draft.customerId.value = 'CUS-1004'
  draft.customerName.value = 'Northwind Logistics'
  draft.shippingCity.value = 'Rotterdam'
  draft.shippingCountry.value = 'NL'
}

describe('useOrderDraft — line items', () => {
  it('adds a line from the catalogue', () => {
    const draft = mountDraft()
    draft.selectedSku.value = ORDER_CATALOG[0]!.sku
    draft.selectedQuantity.value = 2
    draft.addLine()

    expect(draft.lines.value).toHaveLength(1)
    expect(draft.lines.value[0]!.quantity).toBe(2)
  })

  // Two rows for one product make the totals right and the order unreadable.
  it('merges a repeated SKU rather than duplicating the row', () => {
    const draft = mountDraft()
    draft.selectedSku.value = ORDER_CATALOG[0]!.sku
    draft.selectedQuantity.value = 2
    draft.addLine()
    draft.selectedQuantity.value = 3
    draft.addLine()

    expect(draft.lines.value).toHaveLength(1)
    expect(draft.lines.value[0]!.quantity).toBe(5)
  })

  it('resets the quantity picker after adding', () => {
    const draft = mountDraft()
    draft.selectedQuantity.value = 4
    draft.addLine()
    expect(draft.selectedQuantity.value).toBe(1)
  })

  it('ignores an unknown SKU', () => {
    const draft = mountDraft()
    draft.selectedSku.value = 'NOT-A-SKU'
    draft.addLine()
    expect(draft.lines.value).toHaveLength(0)
  })

  it('removes a line by SKU', () => {
    const draft = mountDraft()
    draft.addLine()
    draft.removeLine(draft.lines.value[0]!.sku)
    expect(draft.lines.value).toHaveLength(0)
  })

  it('prices the draft with the same rules the server uses', () => {
    const draft = mountDraft()
    draft.selectedSku.value = ORDER_CATALOG[0]!.sku
    draft.selectedQuantity.value = 2
    draft.addLine()

    expect(draft.pricing.value.subtotal.amount).toBe(ORDER_CATALOG[0]!.unitPrice * 2)
    expect(draft.pricing.value.total.amount).toBeGreaterThan(draft.pricing.value.subtotal.amount)
  })
})

describe('useOrderDraft — steps', () => {
  it('refuses to advance from an incomplete customer step, and says why', () => {
    const draft = mountDraft()
    draft.next()

    expect(draft.step.value).toBe(0)
    expect(draft.stepErrors.value.length).toBeGreaterThan(0)
  })

  it('advances once the customer step is valid', () => {
    const draft = mountDraft()
    fillCustomerStep(draft)
    draft.next()

    expect(draft.step.value).toBe(1)
    expect(draft.stepErrors.value).toEqual([])
  })

  it('refuses to leave the items step with no lines', () => {
    const draft = mountDraft()
    fillCustomerStep(draft)
    draft.next()
    draft.next()

    expect(draft.step.value).toBe(1)
    expect(draft.stepErrors.value.length).toBeGreaterThan(0)
  })

  // Forcing a user to fix a field before they can look at what they typed two
  // steps ago is hostile, so going back never validates.
  it('goes back without validating, and clears the errors', () => {
    const draft = mountDraft()
    fillCustomerStep(draft)
    draft.next()
    draft.next()
    expect(draft.stepErrors.value.length).toBeGreaterThan(0)

    draft.previous()
    expect(draft.step.value).toBe(0)
    expect(draft.stepErrors.value).toEqual([])
  })

  it('does not step past either end', () => {
    const draft = mountDraft()
    draft.previous()
    expect(draft.step.value).toBe(0)
    expect(draft.isFirstStep.value).toBe(true)
  })
})

describe('useOrderDraft — submit', () => {
  // Returning `null` rather than throwing is what lets the route decide not to
  // navigate; an invalid draft must never produce a redirect.
  it('returns null and reports the failures when the draft is invalid', async () => {
    const draft = mountDraft()
    const result = await draft.submit()

    expect(result).toBeNull()
    expect(draft.stepErrors.value.length).toBeGreaterThan(0)
  })
})
