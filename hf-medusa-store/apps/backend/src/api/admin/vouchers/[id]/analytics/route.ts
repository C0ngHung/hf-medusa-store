import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { voucherAnalyticsWorkflow } from "../../../../../workflows/voucher-engine/admin/voucher-analytics";

/**
 * GET /admin/vouchers/:id/analytics — redemption analytics (3.4.12, SRS §6.4).
 * Thin route → workflow. Auth: /admin/* requires an authenticated admin (SEC-04).
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params;
  const { result } = await voucherAnalyticsWorkflow(req.scope).run({
    input: { id },
  });
  res.json({ analytics: result });
};
