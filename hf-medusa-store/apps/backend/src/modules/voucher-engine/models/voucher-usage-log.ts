import { model } from "@medusajs/framework/utils";

/**
 * VoucherUsageLog — append-only redemption ledger (INT-04).
 *
 * Immutable: rows are created ONLY at order-placed usage recording (§11.4),
 * never updated or deleted. Applying a voucher to a cart MUST NOT write here.
 * Backs V4 (per-user limit) and V3 audit / anti-over-redemption. `voucher_id`,
 * `customer_id`, `order_id` are plain text (Link Module, no FKs). Money is
 * integer VND (INT-01).
 *
 * SPEC Decision D (approved) — full point-in-time audit snapshot, not just the
 * legacy discount_applied/was_capped/original_discount subset. Every field below
 * is copied from the §10 discount pipeline at redemption time so this row stays
 * correct even after the parent VoucherConfig is later edited/deactivated
 * (Solution Flow §7.6 step 4). Unique (voucher_id, order_id) is the durable
 * idempotency guard for redemption (§14.3) — a duplicate order.placed either
 * short-circuits at the pre-check or fails this unique insert; both are treated
 * as idempotent success.
 */
const VoucherUsageLog = model
  .define("voucher_usage_log", {
    id: model.id().primaryKey(),
    voucher_id: model.text(),
    customer_id: model.text(),
    order_id: model.text(),
    // Snapshot — order/cart currency (e.g. "vnd"); makes every monetary field
    // self-describing for analytics and multi-currency safety.
    currency_code: model.text(),
    // Snapshot — code as applied (survives rename/deactivation).
    voucher_code: model.text(),
    // Snapshot — the rule kind used.
    discount_type: model.enum(["percentage", "fixed_amount"]),
    // Snapshot — bps or fixed amount used at redemption.
    discount_value: model.number(),
    // §10 raw_voucher_discount — voucher rule on eligible post-promotion
    // subtotal, before any cap.
    raw_voucher_discount: model.number(),
    // §10 voucher_discount_after_voucher_cap — after the voucher's own
    // max_discount_amount, before the global cap.
    voucher_discount_after_voucher_cap: model.number(),
    // §10 final_voucher_discount — amount actually charged (after global cap);
    // equals the applied Promotion adjustment total.
    final_voucher_discount: model.number(),
    // Retained alias — DEFINED AS = final_voucher_discount (SRS §5.2 field name;
    // single canonical value, no drift).
    discount_applied: model.number(),
    // Retained alias — DEFINED AS = voucher_discount_after_voucher_cap (the
    // pre-global-cap voucher discount the UI compares against for the cap
    // explanation).
    original_discount: model.number(),
    // True iff the global cap (not the voucher's own max_discount_amount)
    // reduced the voucher ⇔ final_voucher_discount < voucher_discount_after_voucher_cap.
    was_capped: model.boolean().default(false),
    // Snapshot of DiscountCapConfig.max_discount_percentage in force at redemption.
    cap_percentage_bps: model.number().nullable(),
    // Snapshot — cart original subtotal (audit basis for the cap calc, §10).
    original_subtotal: model.number(),
    // Snapshot — item-level promo total at redemption (proves cap arithmetic, Rule 11).
    item_promotion_discount: model.number().default(0),
    // Redemption timestamp (distinct from created_at; set explicitly at insert).
    applied_at: model.dateTime(),
  })
  .indexes([
    { on: ["voucher_id", "order_id"], unique: true },
    { on: ["voucher_id", "customer_id"] },
    { on: ["order_id"] },
  ]);

export default VoucherUsageLog;
