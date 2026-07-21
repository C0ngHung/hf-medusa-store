import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { voucherAnalyticsWorkflow } from "../../../../../workflows/voucher-engine/admin/voucher-analytics";

/**
 * GET /admin/vouchers/:id/analytics — redemption analytics (3.4.12, SRS §6.4).
 * Thin route → workflow. Auth: /admin/* requires an authenticated admin (SEC-04).
 *
 * Response is the analytics object itself, flat — no `{ analytics: {...} }`
 * wrapper (2026-07-21, matches SRS §6.4 literally:
 * `{total_uses, total_discount_given, avg_order_value, capped_count, conversion_rate}`).
 * The one frontend consumer (`useVoucherAnalytics` in `admin/lib/api.ts`,
 * used by `promotion-detail-voucher-analytics-widget.tsx`) was updated in the
 * same change.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params;
  const { result } = await voucherAnalyticsWorkflow(req.scope).run({
    input: { id },
  });
  res.json(result);
};
