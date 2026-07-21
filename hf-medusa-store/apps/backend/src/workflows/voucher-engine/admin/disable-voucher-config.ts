/**
 * disableVoucherConfigWorkflow — "Disable VoucherEngine" (Admin unified
 * model). Backs `DELETE /admin/promotions/:promotion_id/voucher-config`.
 * Reversible and idempotent — never deletes the Promotion, VoucherConfig
 * row, usage history, or analytics; re-enabling later
 * (`attachVoucherConfigWorkflow`) reuses the same row. Uses the SAME lock
 * key as `attachVoucherConfigWorkflow` so Enable/Disable on the same
 * Promotion are mutually serialized.
 *
 * On success (a real disable happened, not the already-disabled/never-linked
 * no-op), pushes an admin "feed" notification (Local Notification Module
 * Provider, `sendNotificationsStep`, 2026-07-21) so Disable actions show up
 * in the Admin Dashboard's notification panel.
 */
import {
  WorkflowResponse,
  createWorkflow,
  transform,
  when,
} from "@medusajs/framework/workflows-sdk";
import {
  acquireLockStep,
  releaseLockStep,
  sendNotificationsStep,
} from "@medusajs/core-flows";
import { disableLinkedVoucherConfigStep } from "./steps/disable-linked-voucher-config";

export const disableVoucherConfigWorkflowId = "disable-voucher-config";

export interface DisableVoucherConfigWorkflowInput {
  promotion_id: string;
}

export const disableVoucherConfigWorkflow = createWorkflow(
  disableVoucherConfigWorkflowId,
  (input: DisableVoucherConfigWorkflowInput) => {
    const lockKey = transform(
      { input },
      ({ input }) => `voucher-enable:promotion:${input.promotion_id}`,
    );

    acquireLockStep({ key: lockKey, ttl: 10 });

    const result = disableLinkedVoucherConfigStep({
      promotion_id: input.promotion_id,
    });

    releaseLockStep({ key: lockKey });

    when({ result }, ({ result }) => result.didDisable).then(() => {
      const notifications = transform({ result }, ({ result }) => [
        {
          to: "",
          channel: "feed",
          template: "admin-ui",
          data: {
            title: "VoucherEngine disabled",
            description: `Voucher "${result.voucher!.code}" has been disabled.`,
          },
        },
      ]);
      sendNotificationsStep(notifications);
    });

    const voucher = transform({ result }, ({ result }) => result.voucher);

    return new WorkflowResponse(voucher);
  },
);

export default disableVoucherConfigWorkflow;
