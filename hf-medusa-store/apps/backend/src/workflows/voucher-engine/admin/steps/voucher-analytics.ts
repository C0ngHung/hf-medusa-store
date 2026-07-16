import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { VOUCHER_ENGINE_MODULE } from "../../../../modules/voucher-engine";
import type { UsageAnalyticsAggregate } from "../../../../modules/voucher-engine/service";

/**
 * Aggregate one voucher's redemption analytics (3.4.12, SRS §6.4). Read-only.
 * Throws when the voucher does not exist so the route can surface 404.
 *
 * Code-review Task 7.2: `total_uses`/`total_discount_given`/`capped_count`
 * are computed at the DB layer (`getUsageAnalyticsAggregate` —
 * `COUNT`/`SUM`/`COUNT ... FILTER`) instead of fetching every
 * `voucher_usage_log` row via `listVoucherUsageLogs` and reducing them in JS
 * (the old `computeAnalytics` helper, still kept in
 * `workflows/voucher-engine/lib/analytics.ts` for its documented open-issue
 * `avg_order_value`/`order_value` handling, just no longer called from here).
 * `avg_order_value`/`conversion_rate` are hardcoded 0 below, not fetched —
 * `voucher_usage_log` has no `order_value` column and no impressions source
 * exists yet, so both were already a constant 0 for every real row before
 * this change; see the OPEN ISSUE note in `lib/analytics.ts`.
 */
export const voucherAnalyticsStep = createStep(
  "voucher-analytics",
  async (input: { id: string }, { container }) => {
    const service: any = container.resolve(VOUCHER_ENGINE_MODULE);

    // Independent reads — run concurrently. If the voucher doesn't exist,
    // retrieveVoucherConfig throws a MedusaError the framework maps to 404;
    // Promise.all rejects with that same error regardless of what the
    // aggregate query returned for the (about-to-404) id.
    const [voucher, aggregate]: [{ id: string }, UsageAnalyticsAggregate] =
      await Promise.all([
        service.retrieveVoucherConfig(input.id),
        service.getUsageAnalyticsAggregate(input.id),
      ]);

    return new StepResponse({
      voucher_id: voucher.id,
      total_uses: aggregate.total_uses,
      total_discount_given: aggregate.total_discount_given,
      capped_count: aggregate.capped_count,
      avg_order_value: 0,
      conversion_rate: 0,
    });
  },
);
