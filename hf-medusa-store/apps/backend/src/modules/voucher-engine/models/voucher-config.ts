import { model } from "@medusajs/framework/utils";

/**
 * VoucherConfig — voucher definition (SPEC §B.1 D-B1; SRS §5.2 V1–V8).
 *
 * Standalone model, NOT a Promotion extension (D-B1). Covers every field the
 * V1–V8 validation chain (Day 3) needs to read. Money is integer VND (INT-01);
 * `discount_value` and the cap are integer BASIS-POINTS (2000 = 20.00%), while
 * `discount_type = fixed_amount` stores raw VND in `discount_value`.
 *
 * Scope (V6): `applicable_product_ids` / `applicable_category_ids` are
 * denormalized JSON arrays of ids (Medusa has no native array type). Cross-module
 * ids are plain text — wired via Link Module later, never DB FKs. Both null ⇒
 * every cart item is eligible.
 */
const VoucherConfig = model
  .define("voucher_config", {
    id: model.id().primaryKey(),
    // V1 — stored UPPERCASE + trimmed (see workflows/voucher-engine/lib/normalize).
    code: model.text(),
    // SPEC Decision C — CANONICAL backing Medusa Promotion for this voucher,
    // provisioned by the admin create workflow (Phase 2). Under Decision H the
    // discount carrier is a cart credit line, so this Promotion is NEVER attached
    // to a cart — it exists for admin/analytics visibility + the "voucher is a
    // real promotion" representation. Cross-module ref via read-only Link
    // (src/links/voucher-config-promotion.ts), never a DB FK. Client input never
    // trusted. Null until provisioned.
    promotion_id: model.text().nullable(),
    // SPEC Decision H / Phase 2 — the backing Promotion's Campaign, provisioned
    // alongside it (validity window V2 + per-user `use_by_attribute` budget V4).
    // Advisory/reference only (the Promotion is never cart-attached, so the
    // budget never increments). Null until provisioned.
    campaign_id: model.text().nullable(),
    discount_type: model.enum(["percentage", "fixed_amount"]),
    // basis-points when percentage (2000 = 20%); raw VND when fixed_amount.
    discount_value: model.number(),
    // V5 — minimum order value (VND) to qualify; null ⇒ no minimum.
    min_order_value: model.number().nullable(),
    // Cap on the discount this voucher alone may produce (VND); null ⇒ uncapped.
    max_discount_amount: model.number().nullable(),
    // V6 — scope arrays (json); both null ⇒ all items eligible.
    applicable_product_ids: model.json().nullable(),
    applicable_category_ids: model.json().nullable(),
    // V7 — may this voucher stack on top of item-level promotions?
    stackable_with_promotions: model.boolean().default(true),
    // V4 — per-user redemption limit (counted against voucher_usage_log).
    per_user_limit: model.number().default(1),
    // V3 — global redemption limit; null ⇒ unlimited.
    usage_limit: model.number().nullable(),
    // V3 — atomic counter (Redis INCR synced to DB, INT-02); incremented only at order.placed.
    usage_count: model.number().default(0),
    // V8 — user-segment gating rules (logic deferred).
    user_segment_conditions: model.json().nullable(),
    // V2 — validity window.
    valid_from: model.dateTime(),
    valid_to: model.dateTime(),
    is_active: model.boolean().default(true),
  })
  .indexes([{ on: ["code"], unique: true }, { on: ["is_active"] }]);

export default VoucherConfig;
