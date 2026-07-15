import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { updateShippingOptionsWorkflow } from "@medusajs/medusa/core-flows";
import { FREE_SHIPPING_THRESHOLD } from "../modules/suggestive-selling/constants";

/**
 * OI-04: wire the actual free-shipping-over-threshold discount onto the existing
 * shipping options in the current DB (the initial-data-seed already bakes this in
 * for fresh installs; this script back-fills a running/shared DB).
 *
 * Rule: once the cart subtotal (item_total) reaches FREE_SHIPPING_THRESHOLD
 * (7.000.000₫, single-sourced with the CR-02 nudge):
 *   - Standard Shipping → 0₫ (free)
 *   - Express Shipping  → 30.000₫ (standard portion waived; express premium kept:
 *                          60.000 − 30.000 = 30.000; adjustable independently later)
 *
 * Idempotent: replaces each option's VND price set with base + conditional prices,
 * so re-running produces the same result. Run:
 *   npx medusa exec ./src/scripts/add-free-shipping-threshold.ts
 */

// name → { base flat VND amount, conditional VND amount above the threshold }
const OPTION_PRICING: Record<string, { base: number; aboveThreshold: number }> =
  {
    "Standard Shipping": { base: 30_000, aboveThreshold: 0 },
    "Express Shipping": { base: 60_000, aboveThreshold: 30_000 },
  };

export default async function addFreeShippingThreshold({
  container,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const names = Object.keys(OPTION_PRICING);

  const { data: shippingOptions } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "name"],
    filters: { name: names },
  });

  if (!shippingOptions.length) {
    logger.warn(
      "[free-ship] no matching shipping options found — run the catalog seed first.",
    );
    return;
  }

  // Region-scoped prices mirror the currency-scoped ones so whichever price the
  // pricing engine selects for the cart context, its conditional counterpart
  // (with the extra item_total rule) is at least as specific and wins above the
  // threshold. Grab the VND region if one exists.
  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "currency_code"],
  });
  const vndRegion = regions.find((r: any) => r.currency_code === "vnd");

  // Shipping-option price rules are an array of { attribute, operator, value }.
  const thresholdRule = [
    {
      attribute: "item_total",
      operator: "gte",
      value: FREE_SHIPPING_THRESHOLD,
    },
  ];

  const input = shippingOptions.map((option: { id: string; name: string }) => {
    const { base, aboveThreshold } = OPTION_PRICING[option.name];

    const prices: any[] = [
      { currency_code: "vnd", amount: base },
      { currency_code: "vnd", amount: aboveThreshold, rules: thresholdRule },
    ];

    if (vndRegion) {
      prices.push(
        { region_id: vndRegion.id, amount: base },
        {
          region_id: vndRegion.id,
          amount: aboveThreshold,
          rules: thresholdRule,
        },
      );
    }

    return { id: option.id, prices };
  });

  await updateShippingOptionsWorkflow(container).run({ input });

  for (const option of shippingOptions) {
    const { base, aboveThreshold } = OPTION_PRICING[option.name];
    logger.info(
      `[free-ship] ${option.name}: ${base}₫ → ${aboveThreshold}₫ once subtotal ≥ ${FREE_SHIPPING_THRESHOLD}₫`,
    );
  }
}
