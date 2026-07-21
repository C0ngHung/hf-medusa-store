import { model } from "@medusajs/framework/utils";

/**
 * VoucherConfig — voucher definition (SPEC §5.2 "VoucherConfig extends
 * Promotion" — Admin unified model, rebuild Phase 1). Covers every field the
 * V1–V8 validation chain needs to read. Money is integer VND (INT-01);
 * `discount_value` and the cap are integer BASIS-POINTS (2000 = 20.00%), while
 * `discount_type = fixed_amount` stores raw VND in `discount_value`.
 *
 * NOT a standalone model (superseded, bug-bash fix 2026-07-21 — this
 * docstring previously said the opposite, from before the rebuild): every row
 * is linked to a canonical Medusa Promotion via `promotion_id`
 * (`links/voucher-config-promotion.ts`), which is the live, authoritative
 * source for `code`/`discount_type`/`discount_value` (re-resolved on every
 * read — `admin/lib/resolve-voucher-native-fields.ts`). What genuinely
 * remains VoucherConfig-owned: scope (`applicable_product_ids`/
 * `applicable_category_ids`), `min_order_value`, `max_discount_amount`,
 * `per_user_limit`, `user_segment_conditions`, `valid_from`/`valid_to`,
 * `usage_limit`, `usage_count`, and `is_active` (VoucherEngine's own
 * Enable/Disable flag) — see each column's own comment below for which
 * category it falls into.
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
    // References the long-lived CANONICAL Medusa Promotion (read-only Link,
    // `links/voucher-config-promotion.ts`). The canonical Promotion exists for
    // Promotion/Campaign management, admin visibility, and as the live source
    // of `code`/`discount_type`/`discount_value`/`usage_limit`-seed (see this
    // model's own docstring and `admin/lib/resolve-voucher-native-fields.ts`)
    // — it is NEVER attached to a cart and NEVER mutated with a cart-specific
    // value. Apply/remove/revalidate carry the actual capped discount amount
    // via raw `LineItemAdjustment` rows instead (Decision-4 carrier rewrite,
    // 2026-07-20 — superseded an earlier per-cart EPHEMERAL Promotion carrier
    // this comment used to describe; there is no ephemeral Promotion anymore,
    // see `workflows/voucher-engine/steps/create-voucher-adjustments.ts`).
    // Populated only by the admin Enable workflow; client input is never
    // trusted for this value. Null until a backing Promotion exists for this
    // voucher.
    promotion_id: model.text().nullable(),
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
    // LEGACY/deprecated (rebuild-decisions.md decision 2, 2026-07-20): not
    // configurable — item-level Promotions and the Voucher always stack, per
    // the fixed SRS calculation order
    // (modules/voucher-engine/lib/calculate-discount.ts). This column is kept
    // only for schema/back-compat with rows written before that change; it
    // is never read as authoritative (no V8 check reads it anymore — see
    // workflows/voucher-engine/lib/validators.ts) and is no longer collected
    // by the Enable form.
    stackable_with_promotions: model.boolean().default(true),
    // V4 — per-user redemption limit (counted against voucher_usage_log).
    per_user_limit: model.number().default(1),
    // V3 — global redemption limit. VoucherConfig-owned, authoritative
    // config (SPEC §5.4/§10/§11.4) — read directly by the V3 pre-check and
    // the atomic redeem step, never overlaid from the linked Promotion at
    // runtime (bug-bash fix, 2026-07-21, supersedes an earlier revision that
    // read this live from `Promotion.limit`/Campaign budget instead — see
    // `admin/lib/resolve-voucher-native-fields.ts`'s docstring). Seeded from
    // the linked Promotion's `limit` field at Enable/re-Enable time only
    // (`admin/lib/derive-voucher-config-cache-fields.ts`) as a UX convenience
    // so an admin doesn't enter the same number twice; not re-synced after
    // that, and not independently editable in the Enable form.
    usage_limit: model.number().nullable(),
    // V3 — atomic counter (Redis INCR synced to DB, INT-02); incremented only at order.placed.
    usage_count: model.number().default(0),
    // V7 — user-segment gating, implemented via native Customer Groups (not
    // deferred — see `workflows/voucher-engine/lib/customer-segment.ts` and
    // `lib/validators.ts`'s `v7Segment`). Shape is `{ customer_group_ids:
    // string[] } | null`; null/no matching group ⇒ unrestricted. Configured
    // in the admin Enable form via `CustomerGroupMultiSelect`.
    user_segment_conditions: model.json().nullable(),
    // VoucherConfig-owned, authoritative validity window (reverted
    // 2026-07-21 — no native Promotion date field exists to derive these
    // from; only an attached Campaign has `starts_at`/`ends_at`, which is a
    // shared window across every Promotion in it, the wrong granularity for
    // a per-voucher window). Admin-editable only at creation — see
    // `admin/lib/derive-voucher-config-cache-fields.ts`'s docstring.
    valid_from: model.dateTime(),
    valid_to: model.dateTime(),
    // VoucherEngine's OWN persisted Enable/Disable flag (Admin unified
    // model) — NOT derived from the linked Promotion's native `status`.
    // Toggling VoucherEngine off sets this to false without deleting the
    // row, preserving usage history/analytics; re-enabling sets it back to
    // true and reuses the same row. `lookupVoucherStep` never overlays this
    // field from the Promotion (see that step's docstring) — it is the sole
    // gate V1 (`lib/validators.ts`) uses to reject a disabled Voucher at the
    // cart-code endpoint.
    is_active: model.boolean().default(true),
  })
  .indexes([{ on: ["code"], unique: true }, { on: ["is_active"] }]);

export default VoucherConfig;
