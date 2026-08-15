/**
 * The new-order form's state machine.
 *
 * Three steps: who the order is for, what is on it, and a review. Split because
 * the line-item step is a repeater whose length is unknown, and putting it on
 * the same screen as eight scalar fields produces a form nobody can see the end
 * of.
 *
 * All of it — the draft, the per-step validation, the line-merging rule, the
 * running total — is the orders feature's own workflow. It knows nothing about
 * routing: `submit()` returns the created order and lets the caller decide
 * where to go next, because *that* is the routing decision.
 */
import { money } from '~/lib/money'

import { ORDER_CATALOG, priceOrder } from '../pricing'
import { orderDraftSchema, type Order, type OrderChannel, type OrderLine } from '../types'
import { useCreateOrderMutation } from './useOrders'

/**
 * Each step validates the slice of the real schema it owns, so an error
 * surfaces next to the field that caused it rather than at the end, three steps
 * away from where it can be fixed — and the rules cannot drift from what the
 * server will accept.
 *
 * The review step has no slice of its own: it is checked against the whole
 * schema on submit.
 */
const STEP_SCHEMAS = [
  orderDraftSchema.pick({
    customerId: true,
    customerName: true,
    channel: true,
    shippingCity: true,
    shippingCountry: true,
  }),
  orderDraftSchema.pick({ lines: true }),
] as const

export const ORDER_DRAFT_STEP_COUNT = 3

export function useOrderDraft() {
  const createOrder = useCreateOrderMutation()

  const step = ref(0)
  const stepErrors = ref<string[]>([])

  const customerId = ref('')
  const customerName = ref('')
  const channel = ref<OrderChannel>('web')
  const shippingCity = ref('')
  const shippingCountry = ref('')
  const notes = ref('')
  const lines = ref<OrderLine[]>([])

  const selectedSku = ref<string>(ORDER_CATALOG[0]!.sku)
  const selectedQuantity = ref(1)

  const pricing = computed(() => priceOrder(lines.value))
  const isFirstStep = computed(() => step.value === 0)
  const isLastStep = computed(() => step.value === ORDER_DRAFT_STEP_COUNT - 1)

  function draft() {
    return {
      customerId: customerId.value,
      customerName: customerName.value,
      channel: channel.value,
      shippingCity: shippingCity.value,
      shippingCountry: shippingCountry.value,
      lines: lines.value,
      notes: notes.value,
    }
  }

  function addLine() {
    const product = ORDER_CATALOG.find((entry) => entry.sku === selectedSku.value)
    if (!product || selectedQuantity.value < 1) return

    const existing = lines.value.find((line) => line.sku === product.sku)
    if (existing) {
      // Adding the same SKU twice merges rather than duplicating. Two rows for
      // one product make the totals right and the order impossible to read.
      existing.quantity += selectedQuantity.value
    } else {
      lines.value.push({
        sku: product.sku,
        name: product.name,
        quantity: selectedQuantity.value,
        unitPrice: money(product.unitPrice),
      })
    }
    selectedQuantity.value = 1
  }

  function removeLine(sku: string) {
    lines.value = lines.value.filter((line) => line.sku !== sku)
  }

  function validateStep(index: number): boolean {
    const schema = STEP_SCHEMAS[index]
    if (!schema) return true

    const result = schema.safeParse(draft())
    stepErrors.value = result.success ? [] : result.error.issues.map((issue) => issue.message)
    return result.success
  }

  function next() {
    if (!validateStep(step.value)) return
    step.value = Math.min(step.value + 1, ORDER_DRAFT_STEP_COUNT - 1)
  }

  function previous() {
    // No validation going backwards: forcing a user to fix a field before they
    // can look at what they typed two steps ago is hostile.
    stepErrors.value = []
    step.value = Math.max(step.value - 1, 0)
  }

  /**
   * Create the order, or report which fields still fail.
   *
   * Returns the created order so the caller can navigate to it, and `null` when
   * the draft was rejected — navigating on a failed submit is the bug this
   * return value exists to make impossible.
   */
  async function submit(): Promise<Order | null> {
    const parsed = orderDraftSchema.safeParse(draft())
    if (!parsed.success) {
      stepErrors.value = parsed.error.issues.map((issue) => issue.message)
      return null
    }

    stepErrors.value = []
    return await createOrder.mutateAsync(parsed.data)
  }

  return {
    step,
    stepErrors,
    isFirstStep,
    isLastStep,
    customerId,
    customerName,
    channel,
    shippingCity,
    shippingCountry,
    notes,
    lines,
    selectedSku,
    selectedQuantity,
    pricing,
    addLine,
    removeLine,
    validateStep,
    next,
    previous,
    submit,
    isSubmitting: createOrder.isPending,
    submitError: createOrder.error,
  }
}
