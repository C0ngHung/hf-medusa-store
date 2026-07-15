import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { voucherAnalyticsStep } from "./steps/voucher-analytics";

/**
 * GET /admin/vouchers/:id/analytics (3.4.12, SRS §6.4). Read-only aggregation of
 * the voucher_usage_log into {total_uses, total_discount_given, avg_order_value,
 * capped_count, conversion_rate}.
 */
export const voucherAnalyticsWorkflow = createWorkflow(
  "voucher-analytics",
  (input: { id: string }) => {
    const analytics = voucherAnalyticsStep(input);
    return new WorkflowResponse(analytics);
  },
);

export default voucherAnalyticsWorkflow;
