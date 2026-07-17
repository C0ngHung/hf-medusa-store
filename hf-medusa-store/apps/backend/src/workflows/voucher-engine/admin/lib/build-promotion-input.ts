import { normalizeCode } from "../../lib/normalize";
import { generateVoucherCode } from "../../lib/gen-code";
import type { CreateVoucherWorkflowInput } from "../create-voucher";

/**
 * Namespace key for VoucherEngine's payload inside a Promotion's
 * `additional_data` bag. `additional_data` is a framework-owned, fully open
 * `z.record(z.string(), z.unknown())` on the NATIVE `POST /admin/promotions`
 * route too (`@medusajs/medusa/dist/api/admin/promotions/validators.js`,
 * `WithAdditionalData`) — any admin caller of that stock endpoint could
 * include an arbitrary top-level key. A bare `voucher_config` key risked
 * collision with that unrelated, framework-shared bag (medusa-module-reviewer
 * finding, Phase 1). Namespacing under `voucher_engine` makes an accidental
 * or spoofed collision astronomically unlikely without requiring changes to
 * core Medusa's validator.
 */
export const VOUCHER_ENGINE_ADDITIONAL_DATA_KEY = "voucher_engine" as const;

/**
 * Internal marker proving `additional_data.voucher_engine` originated from
 * THIS workflow, not merely from something shaped like it. Namespacing alone
 * (`VOUCHER_ENGINE_ADDITIONAL_DATA_KEY`) only prevents an ACCIDENTAL key
 * collision — since the native `POST /admin/promotions` route accepts any
 * `additional_data` shape from an authenticated admin caller, a caller could
 * still deliberately construct `additional_data.voucher_engine.voucher_config`
 * by hand to trigger the `promotionsCreated` hook's `VoucherConfig` creation
 * without going through `createVoucherWorkflow` at all. Requiring this exact
 * `source` value (checked by the hook alongside full payload shape
 * validation) closes that gap: a caller would have to know and intentionally
 * replicate this internal contract, not just guess a key name.
 */
export const VOUCHER_ENGINE_ADMIN_CREATE_SOURCE =
  "voucher-engine-admin-create" as const;

/**
 * Builds the single `CreatePromotionDTO`-shaped object (no `additional_data`
 * wrapper). Reused by both `buildPromotionInput` (admin create, hook-driven)
 * and the backfill script (`src/scripts/backfill-voucher-promotions.ts`),
 * which must NOT trigger the `promotionsCreated` hook's `VoucherConfig`
 * creation — the backfill's `VoucherConfig` rows already exist; only the
 * `promotion_id` needs to be set on them, via a plain update after the
 * Promotion is created without `additional_data.voucher_config`.
 */
export function buildPromotionData(
  input: Pick<
    CreateVoucherWorkflowInput,
    | "code"
    | "discount_type"
    | "discount_value"
    | "applicable_product_ids"
    | "applicable_category_ids"
    | "is_active"
    | "valid_from"
    | "valid_to"
  >,
) {
  const code = normalizeCode(input.code || generateVoucherCode());
  const isPercentage = input.discount_type === "percentage";
  const hasScope = Boolean(
    input.applicable_product_ids?.length ||
    input.applicable_category_ids?.length,
  );

  return {
    code,
    type: "standard" as const,
    status: (input.is_active ? "active" : "inactive") as "active" | "inactive",
    is_automatic: false,
    application_method: {
      type: (isPercentage ? "percentage" : "fixed") as "percentage" | "fixed",
      target_type: (hasScope ? "items" : "order") as "items" | "order",
      allocation: "across" as const,
      // Reference-only value: percentage stored in basis points on
      // VoucherConfig (2000 = 20.00%), Promotion expects a plain number.
      value: isPercentage ? input.discount_value / 100 : input.discount_value,
      currency_code: "vnd",
    },
    campaign: {
      campaign_identifier: code,
      name: code,
      starts_at: input.valid_from,
      ends_at: input.valid_to,
    },
  };
}

/**
 * Pure builder (no I/O) — Rebuild Phase 1, Promotion-first `createVoucherWorkflow`.
 *
 * Converts the admin's voucher-shaped input into a `createPromotionsWorkflow`
 * input. The canonical Promotion's `code`/`status`/`application_method`/
 * `campaign` are reference/display fields only — VoucherEngine's own V1–V8 +
 * `calculate-discount` pipeline stays the actual authority on validation and
 * discount math (see `.claude/skills/rebuild-voucher-engine/references/keep-remove-map.md`
 * Keep table). No `target_rules` are set: the OR-across-attributes spike
 * (2026-07-17) confirmed native `target_rules` combine with AND semantics
 * (`@medusajs/promotion/dist/utils/validations/promotion-rule.js:36`, `.every()`),
 * which cannot express `applicable_product_ids`/`applicable_category_ids`'
 * product-OR-category scope — those stay plain JSON on `VoucherConfig`, unchanged.
 *
 * The full original input (plus the normalized code) is threaded through
 * under the namespaced `additional_data.voucher_engine.voucher_config` key,
 * alongside `source: VOUCHER_ENGINE_ADMIN_CREATE_SOURCE` (see both constants
 * above), so the `promotionsCreated` hook
 * (`src/workflows/hooks/voucher-config-promotion-created.ts`) can provision
 * the linked `VoucherConfig` row with every field, including the ones kept as
 * a deprecated/denormalized cache on `VoucherConfig` per this rebuild's
 * Phase 1 scope (no columns dropped yet — see `rebuild-decisions.md`). The
 * hook requires BOTH the namespaced key AND the exact `source` marker before
 * trusting the payload — namespacing alone only guards against accidental
 * collision with the native `/admin/promotions` route's client-controlled
 * `additional_data`, not a caller deliberately spoofing the shape.
 *
 * `min_order_value` is explicitly NOT mapped to a native Promotion rule here —
 * it stays custom VoucherConfig-owned for now (Phase 1 review decision, see
 * `rebuild-decisions.md`'s "min_order_value mapping" entry): no native
 * cart/order-subtotal rule attribute was verified against the installed
 * 2.16.0 source this session, and V5 must independently re-check this value
 * regardless of where it's sourced from, so moving it would add mapping risk
 * without removing any custom validation work. Deferred, not ruled out.
 */
export function buildPromotionInput(input: CreateVoucherWorkflowInput) {
  const promotionData = buildPromotionData(input);

  return {
    promotionsData: [promotionData],
    additional_data: {
      [VOUCHER_ENGINE_ADDITIONAL_DATA_KEY]: {
        source: VOUCHER_ENGINE_ADMIN_CREATE_SOURCE,
        voucher_config: { ...input, code: promotionData.code },
      },
    },
  };
}
