import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { VOUCHER_ENGINE_MODULE } from "../../../../modules/voucher-engine";
import { normalizeCode } from "../../lib/normalize";
import { generateVoucherCode } from "../../lib/gen-code";

/**
 * Create a voucher_config row (3.4.11, SRS §6.4). Code is auto-generated when the
 * admin omits it, then normalized to canonical UPPERCASE (SEC-03). Compensation
 * deletes the created voucher so a later step failure rolls back.
 */
export type CreateVoucherStepInput = {
  code?: string | null;
  discount_type: "percentage" | "fixed_amount";
  discount_value: number;
  min_order_value?: number | null;
  max_discount_amount?: number | null;
  applicable_product_ids?: string[] | null;
  applicable_category_ids?: string[] | null;
  stackable_with_promotions?: boolean;
  per_user_limit?: number;
  usage_limit?: number | null;
  user_segment_conditions?: Record<string, unknown> | null;
  valid_from: Date;
  valid_to: Date;
  is_active?: boolean;
  /** Canonical backing Promotion id (Decision C/H) — provisioned earlier in the workflow. */
  promotion_id?: string | null;
  /** Backing Promotion's Campaign id (Phase 2) — provisioned earlier in the workflow. */
  campaign_id?: string | null;
};

export const createVoucherStep = createStep(
  "create-voucher",
  async (input: CreateVoucherStepInput, { container }) => {
    const service: any = container.resolve(VOUCHER_ENGINE_MODULE);

    // Code is normally resolved up front by `resolveVoucherCodeStep` (so the
    // backing Promotion and this row share it); the `|| generateVoucherCode()`
    // fallback keeps this step correct if ever called standalone. Always store
    // canonical UPPERCASE (SEC-03, V1).
    const code = normalizeCode(input.code || generateVoucherCode());

    const voucher = await service.createVoucherConfigs({
      ...input,
      code,
    });
    return new StepResponse(voucher, voucher.id);
  },
  async (voucherId, { container }) => {
    if (!voucherId) return;
    const service: any = container.resolve(VOUCHER_ENGINE_MODULE);
    await service.deleteVoucherConfigs(voucherId);
  },
);
