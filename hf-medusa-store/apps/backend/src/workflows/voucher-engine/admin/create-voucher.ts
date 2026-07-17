import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { createPromotionsWorkflow } from "@medusajs/core-flows";
import { buildPromotionInput } from "./lib/build-promotion-input";
import { fetchVoucherByPromotionStep } from "./steps/fetch-voucher-by-promotion";

/**
 * POST /admin/vouchers (3.4.11, SRS §6.4 — Rebuild Phase 1, SRS §5.2
 * "VoucherConfig extends Promotion").
 *
 * Promotion-first: creates the real, canonical `Promotion` (+ `Campaign` for
 * the validity window) FIRST via `createPromotionsWorkflow`; the
 * `promotionsCreated` hook (`workflows/hooks/voucher-config-promotion-created.ts`)
 * then provisions the linked `VoucherConfig` row from
 * `additional_data.voucher_config`. This reverses the previous direction
 * (`VoucherConfig` created first, no Promotion ever touched — confirmed zero
 * `PromotionModule`/`IPromotionModuleService` references anywhere in the old
 * admin create path).
 *
 * No `VoucherConfig` columns are dropped by this change — `code`, `is_active`,
 * `valid_from`/`valid_to`, `discount_type`/`discount_value` remain on
 * `VoucherConfig` as the existing fields (deprecated/denormalized-cache status
 * per this rebuild's Phase 1 scope; physical removal is Phase 6 work, not
 * this one — see `.claude/specs/voucher-engine/rebuild-decisions.md`).
 */
export type CreateVoucherWorkflowInput = {
  code?: string | null;
  discount_type: "percentage" | "fixed_amount";
  discount_value: number;
  min_order_value?: number | null;
  max_discount_amount?: number | null;
  applicable_product_ids?: string[] | null;
  applicable_category_ids?: string[] | null;
  stackable_with_promotions: boolean;
  per_user_limit: number;
  usage_limit?: number | null;
  user_segment_conditions?: Record<string, unknown> | null;
  valid_from: Date;
  valid_to: Date;
  is_active: boolean;
};

export const createVoucherWorkflow = createWorkflow(
  "create-voucher",
  function (input: CreateVoucherWorkflowInput) {
    const promotionInput = transform({ input }, ({ input }) =>
      buildPromotionInput(input),
    );

    const promotions = createPromotionsWorkflow.runAsStep({
      input: promotionInput,
    });

    const promotion = transform(
      { promotions },
      ({ promotions }) => promotions[0],
    );

    const voucher = fetchVoucherByPromotionStep({
      promotion_id: promotion.id,
    });

    return new WorkflowResponse(voucher);
  },
);

export default createVoucherWorkflow;
