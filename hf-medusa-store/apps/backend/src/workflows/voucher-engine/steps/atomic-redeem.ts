/**
 * atomicRedeemStep — SPEC §11.4 steps 3+4 combined / §14.3 (tasks 3.6.5,
 * 3.6.7). Wraps `VoucherEngineService.redeemVoucherAtomic`: a conditional
 * `usage_count += 1` (fails closed when capacity is exhausted) and the
 * immutable `VoucherUsageLog` insert, in ONE DB transaction.
 *
 * Capacity-exhausted is NOT a thrown error (§14.3 "Capacity-exhausted
 * recovery — RESOLVED"): the order already stands (the customer already
 * paid the discounted total — reversing at redemption would be worse), so
 * this step logs-and-flags for manual review instead of failing the
 * workflow. A genuine unique-constraint race on `(voucher_id, order_id)` at
 * the insert (a duplicate slipping past `idempotencyCheckStep`) is caught and
 * treated as idempotent success, not a failure.
 */

import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import type { INotificationModuleService } from "@medusajs/framework/types";
import { VOUCHER_ENGINE_MODULE } from "../../../modules/voucher-engine";
import type VoucherEngineService from "../../../modules/voucher-engine/service";
import type { UsageLogEntry } from "../../../modules/voucher-engine/service";

export const atomicRedeemStepId = "atomic-redeem";

export interface AtomicRedeemInput {
  voucher_id: string;
  /** `voucher_config.usage_limit`'s own column value, freshly re-fetched by `resolve-voucher-usage-limit.ts` right before this step runs (VoucherConfig-owned config, SPEC.md §5.4/§10/§11.4). */
  usage_limit: number | null;
  log_entry: UsageLogEntry;
}

export interface AtomicRedeemOutput {
  incremented: boolean;
  usage_log_id?: string;
}

export const atomicRedeemStep = createStep(
  atomicRedeemStepId,
  async (input: AtomicRedeemInput, { container }) => {
    const service = container.resolve(
      VOUCHER_ENGINE_MODULE,
    ) as VoucherEngineService;
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

    try {
      const result = await service.redeemVoucherAtomic(
        input.voucher_id,
        input.usage_limit,
        input.log_entry,
      );

      if (!result.incremented) {
        // Capacity exhausted at redemption (§14.3) — order stands, flagged
        // for manual review, no usage log written, no throw.
        logger.warn(
          `[voucher-engine] usage_limit exhausted at redemption — no log written ${JSON.stringify(
            {
              voucher_id: input.voucher_id,
              order_id: input.log_entry.order_id,
            },
          )}`,
        );
        // Admin feed alert (2026-07-21) — this is exactly the "needs manual
        // review" case §14.3 calls for; a passive log alone is easy to miss.
        try {
          const notificationService: INotificationModuleService =
            container.resolve(Modules.NOTIFICATION);
          await notificationService.createNotifications({
            to: "",
            channel: "feed",
            template: "admin-ui",
            data: {
              title: "Voucher usage limit exhausted",
              description: `Order ${input.log_entry.order_id} redeemed voucher_id ${input.voucher_id} after its usage limit was already reached — no usage log was written for this order. Review manually.`,
            },
          });
        } catch (notifyErr) {
          // Never let a notification failure affect redemption itself.
          logger.warn(
            `[voucher-engine] failed to send usage-limit-exhausted admin notification: ${
              notifyErr instanceof Error ? notifyErr.message : String(notifyErr)
            }`,
          );
        }
      }

      const output: AtomicRedeemOutput = {
        incremented: result.incremented,
        usage_log_id: result.usage_log_id,
      };
      return new StepResponse(output);
    } catch (err) {
      // A duplicate (voucher_id, order_id) unique-constraint violation is a
      // genuine race past `idempotencyCheckStep` — treat as idempotent
      // success (§14.3), not a failure. Any other error is a real failure.
      const message = err instanceof Error ? err.message : String(err);
      if (/unique|duplicate/i.test(message)) {
        logger.info(
          `[voucher-engine] redemption race on (voucher_id, order_id) treated as idempotent success: ${message}`,
        );
        const output: AtomicRedeemOutput = { incremented: false };
        return new StepResponse(output);
      }
      throw err;
    }
  },
  // No compensation — a committed transaction (increment + log) must never
  // be rolled back by a later step's failure (Rule 15/INT-04 append-only);
  // this is intentionally the LAST mutating step in the workflow.
);
