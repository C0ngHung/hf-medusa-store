/**
 * lookupVoucherStep — real DB voucher + usage + cap lookup (SPEC §11.10
 * `lookupVoucherStep`, adapted; Phase-3 items 3/4/7/8/9).
 *
 * Resolves `VoucherEngineService` from the container and reads everything the
 * V1-V8 validation chain and the discount calculator need in one round trip:
 * the voucher row itself (V1, by code — `findByCode`), how many times this
 * customer has already redeemed it (V4 — `countUserUsage`), and the active
 * global discount cap in basis points, already falling back to
 * `DEFAULT_CAP_PCT` (5000 bps) server-side when no active `DiscountCapConfig`
 * row exists (`getActiveCap`, task 3.3.10 / Phase-3 item 8).
 */

import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { VOUCHER_ENGINE_MODULE } from "../../../modules/voucher-engine";
import type VoucherEngineService from "../../../modules/voucher-engine/service";
import type { PersistedVoucherConfig } from "../lib/mappers";

export const lookupVoucherStepId = "lookup-voucher";

export interface LookupVoucherInput {
  code: string;
  customer_id: string;
}

export interface LookupVoucherOutput {
  /** null -> V1 NOT_FOUND (voucher code has no matching row). */
  voucher: PersistedVoucherConfig | null;
  /** V4 — this customer's prior redemption count for this voucher (0 when voucher is null). */
  user_usage_count: number;
  /** VOUCH-003 — active global cap in basis points, defaulted server-side (task 3.3.10). */
  global_cap_bps: number;
}

export const lookupVoucherStep = createStep(
  lookupVoucherStepId,
  async (input: LookupVoucherInput, { container }) => {
    const service = container.resolve(
      VOUCHER_ENGINE_MODULE,
    ) as VoucherEngineService;

    const voucher = (await service.findByCode(
      input.code,
    )) as PersistedVoucherConfig | null;

    const [user_usage_count, global_cap_bps] = await Promise.all([
      voucher
        ? service.countUserUsage(voucher.id, input.customer_id)
        : Promise.resolve(0),
      service.getActiveCap(),
    ]);

    const output: LookupVoucherOutput = {
      voucher,
      user_usage_count,
      global_cap_bps,
    };
    return new StepResponse(output);
  },
  // Read-only step — no compensation.
);
