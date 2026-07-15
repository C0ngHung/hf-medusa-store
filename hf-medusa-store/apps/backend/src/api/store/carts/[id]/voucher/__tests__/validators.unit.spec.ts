import {
  ApplyVoucherQuerySchema,
  ApplyVoucherSchema,
  RemoveVoucherSchema,
} from '../validators'

// SEC-01 / API_CONTRACT §1.3 — the Store API must reject any client-supplied
// pricing, identity, or eligibility field. The cart id comes from the route's
// `:id` param, not the body (see validators.ts header).
describe('store cart voucher validators', () => {
  describe('ApplyVoucherSchema', () => {
    const validBody = { code: 'SHUTTLE20' }

    it('accepts a minimal valid apply body', () => {
      const result = ApplyVoucherSchema.safeParse(validBody)
      expect(result.success).toBe(true)
    })

    it('rejects a code shorter than 6 characters (SEC-03)', () => {
      const result = ApplyVoucherSchema.safeParse({ code: 'AB1' })
      expect(result.success).toBe(false)
    })

    it('rejects a non-alphanumeric code (SEC-03)', () => {
      const result = ApplyVoucherSchema.safeParse({ code: 'SHUTTLE-20' })
      expect(result.success).toBe(false)
    })

    it('rejects a missing code', () => {
      const result = ApplyVoucherSchema.safeParse({})
      expect(result.success).toBe(false)
    })

    it('rejects a cart_id in the body (belongs in the route param)', () => {
      const result = ApplyVoucherSchema.safeParse({
        ...validBody,
        cart_id: 'cart_01ABC',
      })
      expect(result.success).toBe(false)
    })

    it.each([
      'discount_amount',
      'final_voucher_discount',
      'original_discount',
      'expected_final_cart_total',
      'cart_total',
      'eligible_post_promotion_subtotal',
      'post_promotion_subtotal',
      'item_promotion_discount',
      'promotion_id',
      'voucher_id',
      'eligible_item_ids',
      'customer_id',
      'usage_count',
      'min_order_value',
      'discount_capped',
      'confirm_replace',
    ])(
      'rejects a client-supplied pricing/identity/eligibility field: %s',
      (forbiddenField) => {
        const result = ApplyVoucherSchema.safeParse({
          ...validBody,
          [forbiddenField]: 1,
        })
        expect(result.success).toBe(false)
      },
    )
  })

  describe('ApplyVoucherQuerySchema', () => {
    it('accepts an empty query (replace defaults to falsy)', () => {
      const result = ApplyVoucherQuerySchema.safeParse({})
      expect(result.success).toBe(true)
    })

    it('accepts ?replace=true coerced from a query string', () => {
      const result = ApplyVoucherQuerySchema.safeParse({ replace: 'true' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.replace).toBe(true)
      }
    })

    it('rejects an unrecognized query field', () => {
      const result = ApplyVoucherQuerySchema.safeParse({ voucher_id: 'v_1' })
      expect(result.success).toBe(false)
    })
  })

  describe('RemoveVoucherSchema', () => {
    it('accepts an empty body', () => {
      const result = RemoveVoucherSchema.safeParse({})
      expect(result.success).toBe(true)
    })

    it('rejects a client-supplied pricing field', () => {
      const result = RemoveVoucherSchema.safeParse({
        final_voucher_discount: 1,
      })
      expect(result.success).toBe(false)
    })

    it('rejects a cart_id in the body (belongs in the route param)', () => {
      const result = RemoveVoucherSchema.safeParse({ cart_id: 'cart_01ABC' })
      expect(result.success).toBe(false)
    })
  })
})
