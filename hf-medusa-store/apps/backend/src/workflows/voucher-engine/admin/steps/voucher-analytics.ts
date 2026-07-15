import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { VOUCHER_ENGINE_MODULE } from "../../../../modules/voucher-engine";
import { computeAnalytics, type UsageLogRow } from "../../lib/analytics";

/**
 * Aggregate one voucher's redemption analytics (3.4.12, SRS §6.4). Read-only:
 * loads the append-only voucher_usage_log (INT-04) and delegates the math to the
 * pure computeAnalytics helper. Throws when the voucher does not exist so the
 * route can surface 404.
 */
export const voucherAnalyticsStep = createStep(
  "voucher-analytics",
  async (input: { id: string }, { container }) => {
    const service: any = container.resolve(VOUCHER_ENGINE_MODULE);

    // 404 if missing (retrieve throws a MedusaError the framework maps to 404).
    const voucher = await service.retrieveVoucherConfig(input.id);

    const rows: UsageLogRow[] = await service.listVoucherUsageLogs(
      { voucher_id: input.id },
      { take: null },
    );

    const analytics = computeAnalytics(rows ?? []);
    return new StepResponse({ voucher_id: voucher.id, ...analytics });
  },
);
