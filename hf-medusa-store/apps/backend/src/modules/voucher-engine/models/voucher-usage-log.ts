import { model } from '@medusajs/framework/utils'

/**
 * VoucherUsageLog — append-only redemption ledger (INT-04).
 *
 * Immutable: rows are created ONLY at `order.placed` (Day 4/5 usage workflow),
 * never updated or deleted. Applying a voucher to a cart MUST NOT write here.
 * Backs V4 (per-user limit) and V3 audit / anti-over-redemption. `voucher_id`,
 * `customer_id`, `order_id` are plain text (Link Module, no FKs). Money is
 * integer VND (INT-01). Indexed on (voucher_id, customer_id) for V4 counts.
 */
const VoucherUsageLog = model
  .define('voucher_usage_log', {
    id: model.id().primaryKey(),
    voucher_id: model.text(),
    customer_id: model.text(),
    order_id: model.text(),
    // Discount actually applied after the global cap (VND).
    discount_applied: model.number(),
    // True when the 50% global cap trimmed this voucher.
    was_capped: model.boolean().default(false),
    // Discount before capping (VND) — audit of what the voucher would have given.
    original_discount: model.number(),
    applied_at: model.dateTime(),
  })
  .indexes([{ on: ['voucher_id', 'customer_id'] }])

export default VoucherUsageLog
