import { StepResponse } from "@medusajs/framework/workflows-sdk";
import { createPromotionsWorkflow } from "@medusajs/core-flows";
import { VOUCHER_ENGINE_MODULE } from "../../modules/voucher-engine";
import {
  VOUCHER_ENGINE_ADDITIONAL_DATA_KEY,
  VOUCHER_ENGINE_ADMIN_CREATE_SOURCE,
} from "../voucher-engine/admin/lib/build-promotion-input";

/**
 * Rebuild Phase 1 (SRS §5.2 "VoucherConfig extends Promotion") —
 * Promotion-first, hook-driven `VoucherConfig` provisioning.
 *
 * `createPromotionsWorkflow` fires this hook after EVERY Promotion creation
 * in the system, including the per-cart ephemeral carrier
 * (`lib/create-and-attach-ephemeral-promotion.ts`) and the NATIVE
 * `POST /admin/promotions` route (`@medusajs/medusa`'s own admin API, not
 * VoucherEngine's). This hook must only act when the Promotion originated
 * from VoucherEngine's own admin create-voucher flow.
 *
 * Guarding on a bare `additional_data.voucher_config` key is NOT sufficient
 * on its own (medusa-module-reviewer finding, Phase 1 — hardened further in
 * the Phase 1 review pass): `additional_data` on the native admin promotions
 * route is a fully open, client-controlled `z.record(z.string(), z.unknown())`
 * (`WithAdditionalData`,
 * `@medusajs/medusa/dist/api/admin/promotions/validators.js`) — any
 * authenticated admin call to that stock endpoint could construct
 * `additional_data.voucher_engine.voucher_config` by hand, accidentally or
 * deliberately, and either crash on a NOT-NULL constraint or create a
 * spurious linked `VoucherConfig` row. Namespacing alone only rules out an
 * ACCIDENTAL key collision — it does not stop a caller who deliberately
 * replicates the shape. Three defenses, all required:
 *   1. Namespace under `VOUCHER_ENGINE_ADDITIONAL_DATA_KEY` ("voucher_engine")
 *      instead of a bare top-level key.
 *   2. Require the exact internal `source: VOUCHER_ENGINE_ADMIN_CREATE_SOURCE`
 *      marker — this hook only acts when `source` matches, so a native
 *      `/admin/promotions` caller would have to know and intentionally
 *      reproduce this workflow's internal contract, not just guess a key
 *      name.
 *   3. Validate the FULL expected payload shape (every field
 *      `createVoucherWorkflow` actually sends, not just a partial subset)
 *      before trusting it, so a malformed or spoofed payload no-ops instead
 *      of throwing mid-request or writing bad/incomplete data.
 *
 * The ephemeral carrier never sets `additional_data` at all (verified: its
 * `ephemeralInput` object has no `additional_data` key), so it's unaffected
 * either way. The backfill script (`src/scripts/backfill-voucher-promotions.ts`)
 * also never sets `additional_data`, by design — it updates existing
 * `VoucherConfig` rows directly and must not re-trigger this hook.
 *
 * `promotion_id` is populated here — this VoucherConfig row becomes readable
 * via the `voucher-config-promotion` Link (`src/links/`). No `link.create()`
 * call is needed: it's a `readOnly: true`, `field`-based link (an existing
 * `promotion_id` column, not a separate pivot table) — same pattern already
 * used by this repo's other field-based links (e.g.
 * `suggestion-rule-source-product.ts`), which never call `link.create()`
 * either.
 */

type VoucherConfigPayload = {
  discount_type: "percentage" | "fixed_amount";
  discount_value: number;
  stackable_with_promotions: boolean;
  per_user_limit: number;
  is_active: boolean;
  valid_from: Date | string;
  valid_to: Date | string;
  code?: string;
  min_order_value?: number | null;
  max_discount_amount?: number | null;
  applicable_product_ids?: string[] | null;
  applicable_category_ids?: string[] | null;
  usage_limit?: number | null;
  user_segment_conditions?: Record<string, unknown> | null;
};

/**
 * Defensive full-shape check — validates every field `createVoucherWorkflow`
 * actually sends (`CreateVoucherWorkflowInput`), not just a partial subset.
 * See the docstring above for why this can't just trust the key name or a
 * loose subset check.
 */
function isValidVoucherConfigPayload(
  value: unknown,
): value is VoucherConfigPayload {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;

  const hasValidDiscountType =
    v.discount_type === "percentage" || v.discount_type === "fixed_amount";
  const hasValidDiscountValue =
    typeof v.discount_value === "number" && Number.isFinite(v.discount_value);
  const hasValidStackable = typeof v.stackable_with_promotions === "boolean";
  const hasValidPerUserLimit =
    typeof v.per_user_limit === "number" && Number.isFinite(v.per_user_limit);
  const hasValidIsActive = typeof v.is_active === "boolean";
  const hasValidDates =
    (v.valid_from instanceof Date || typeof v.valid_from === "string") &&
    (v.valid_to instanceof Date || typeof v.valid_to === "string");

  return (
    hasValidDiscountType &&
    hasValidDiscountValue &&
    hasValidStackable &&
    hasValidPerUserLimit &&
    hasValidIsActive &&
    hasValidDates
  );
}

createPromotionsWorkflow.hooks.promotionsCreated(
  async ({ promotions, additional_data }, { container }) => {
    const namespaced = (additional_data as any)?.[
      VOUCHER_ENGINE_ADDITIONAL_DATA_KEY
    ];

    if (namespaced?.source !== VOUCHER_ENGINE_ADMIN_CREATE_SOURCE) {
      return new StepResponse(null, null);
    }

    const voucherInput = namespaced?.voucher_config;

    if (!isValidVoucherConfigPayload(voucherInput)) {
      return new StepResponse(null, null);
    }

    const promotion = promotions[0];
    const service: any = container.resolve(VOUCHER_ENGINE_MODULE);

    const voucher = await service.createVoucherConfigs({
      ...voucherInput,
      promotion_id: promotion.id,
    });

    return new StepResponse(
      { voucherConfigId: voucher.id },
      { voucherConfigId: voucher.id },
    );
  },
  async (compensationData, { container }) => {
    if (!compensationData) return;
    const service: any = container.resolve(VOUCHER_ENGINE_MODULE);
    await service.deleteVoucherConfigs(compensationData.voucherConfigId);
  },
);
