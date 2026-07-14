/**
 * recordVoucherUsageWorkflow — SPEC §11.4 (tasks 3.6.1, 3.6.4, 3.6.5, 3.6.7).
 *
 * Invoked by the `order.placed` subscriber (`../../subscribers/voucher-order-placed.ts`).
 * `completeCartWorkflow` exposes no supported "after order created" hook that
 * receives the order id (verified against installed @medusajs/core-flows
 * 2.16.0 — only a pre-execution `validate` hook exists), so per SPEC §13.3's
 * own documented contingency ("if NV#6a shows no usable hook, the subscriber
 * becomes primary"), the `order.placed` subscriber IS the primary (only)
 * redemption trigger this session — not a fallback to a sync hook that
 * doesn't exist.
 *
 * No-op when the order carries no voucher (most orders). Idempotent: safe to
 * run twice for the same order (duplicate event delivery) via the
 * pre-check + the durable unique `(voucher_id, order_id)` DB index (§14.3).
 *
 * Flat, non-nested `when()`: Medusa's workflow composer does not support a
 * `when().then()` call nested inside another `when().then()` callback (it
 * throws at workflow-definition/load time, breaking the whole app boot, not
 * just this workflow — verified empirically this session). `idempotencyCheckStep`
 * therefore runs unconditionally (safe with an empty `voucher_id` — it just
 * finds zero matching rows) and the two conditions are combined into ONE
 * top-level boolean.
 */

import {
  WorkflowResponse,
  createWorkflow,
  transform,
  when,
} from "@medusajs/framework/workflows-sdk";
import { assertOrderHasVoucherStep } from "./steps/assert-order-has-voucher";
import { idempotencyCheckStep } from "./steps/idempotency-check";
import { atomicRedeemStep } from "./steps/atomic-redeem";

export const recordVoucherUsageWorkflowId = "record-voucher-usage";

export interface RecordVoucherUsageWorkflowInput {
  order_id: string;
}

export const recordVoucherUsageWorkflow = createWorkflow(
  recordVoucherUsageWorkflowId,
  (input: RecordVoucherUsageWorkflowInput) => {
    const orderVoucher = assertOrderHasVoucherStep({
      order_id: input.order_id,
    });

    const idempotency = idempotencyCheckStep({
      voucher_id: transform(
        { orderVoucher },
        ({ orderVoucher }) => orderVoucher.snapshot?.voucher_id ?? "",
      ),
      order_id: input.order_id,
    });

    const shouldRedeem = transform(
      { orderVoucher, idempotency },
      ({ orderVoucher, idempotency }) =>
        orderVoucher.has_voucher && !idempotency.already_processed,
    );

    when({ shouldRedeem }, ({ shouldRedeem }) => shouldRedeem).then(() => {
      atomicRedeemStep({
        voucher_id: transform(
          { orderVoucher },
          ({ orderVoucher }) => orderVoucher.snapshot!.voucher_id,
        ),
        log_entry: transform(
          { input, orderVoucher },
          ({ input, orderVoucher }) => {
            const snapshot = orderVoucher.snapshot!;
            return {
              voucher_id: snapshot.voucher_id,
              customer_id: orderVoucher.customer_id ?? "",
              order_id: input.order_id,
              currency_code: orderVoucher.currency_code ?? "vnd",
              voucher_code: snapshot.code,
              discount_type: snapshot.discount_type,
              discount_value: snapshot.discount_value,
              raw_voucher_discount: snapshot.raw_voucher_discount,
              voucher_discount_after_voucher_cap:
                snapshot.voucher_discount_after_voucher_cap,
              final_voucher_discount: snapshot.discount_amount,
              discount_applied: snapshot.discount_amount,
              original_discount: snapshot.original_discount,
              was_capped: snapshot.discount_capped,
              cap_percentage_bps: snapshot.cap_percentage_bps,
              original_subtotal: snapshot.original_subtotal,
              item_promotion_discount: snapshot.item_promotion_discount,
              applied_at: new Date(),
            };
          },
        ),
      });
    });

    return new WorkflowResponse(
      transform({ orderVoucher }, ({ orderVoucher }) => ({
        processed: orderVoucher.has_voucher,
      })),
    );
  },
);

export default recordVoucherUsageWorkflow;
