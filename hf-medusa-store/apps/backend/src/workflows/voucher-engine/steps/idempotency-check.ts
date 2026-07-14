/**
 * idempotencyCheckStep — SPEC §11.4 step 2 / §14.3 (task 3.6.4). First of two
 * independent idempotency guards for redemption: a pre-check against the
 * append-only `VoucherUsageLog` for an existing `(voucher_id, order_id)` row.
 * The second, durable guard is the unique DB index on that same pair (§5.2) —
 * a genuine race that slips past this pre-check still fails safely at the
 * insert, which `atomicRedeemStep` treats as idempotent success (not an
 * error).
 */

import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { VOUCHER_ENGINE_MODULE } from "../../../modules/voucher-engine";
import type VoucherEngineService from "../../../modules/voucher-engine/service";

export const idempotencyCheckStepId = "idempotency-check";

export interface IdempotencyCheckInput {
  voucher_id: string;
  order_id: string;
}

export interface IdempotencyCheckOutput {
  already_processed: boolean;
}

export const idempotencyCheckStep = createStep(
  idempotencyCheckStepId,
  async (input: IdempotencyCheckInput, { container }) => {
    const service = container.resolve(
      VOUCHER_ENGINE_MODULE,
    ) as VoucherEngineService;

    const [, count] = await service.listAndCountVoucherUsageLogs({
      voucher_id: input.voucher_id,
      order_id: input.order_id,
    });

    const output: IdempotencyCheckOutput = { already_processed: count > 0 };
    return new StepResponse(output);
  },
  // Read-only — no compensation.
);
