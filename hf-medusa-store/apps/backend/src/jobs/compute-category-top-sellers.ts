import { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { SUGGESTIVE_SELLING_MODULE } from "../modules/suggestive-selling";
import { computeSalesRanking } from "../lib/compute-sales-ranking";

const WINDOW_DAYS = 30;

/**
 * Scheduled job — precompute the Tier-2 top-seller snapshot (SRS SUGG-001 Tier 2
 * / SPEC A.6, plan B). Aggregates order line items over a trailing window into
 * per-(category, product) sales counts and rewrites `category_top_seller`. The
 * evaluator's backfill step reads that table; when empty it falls back to
 * newest-first (plan C), so this job never blocks suggestions.
 */
export default async function computeCategoryTopSellers(
  container: MedusaContainer,
) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const suggestive: any = container.resolve(SUGGESTIVE_SELLING_MODULE);

  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // Orders in window + their line items.
  // NOTE: on an order line item `quantity` is a COMPUTED field backed by the
  // `detail` (order_item) relation — it only resolves when `items.detail` is
  // requested. Asking for `items.quantity` alone returns undefined, which would
  // make every product aggregate to 0 and silently produce an empty snapshot.
  // computeSalesRanking reads `detail.quantity`, so request it here.
  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id", "items.product_id", "items.detail.quantity"],
    filters: { created_at: { $gte: since } },
  });

  // Map each sold product → its categories (cross-module via Query graph).
  const productIds = [
    ...new Set(
      orders.flatMap((o: any) =>
        (o.items ?? []).map((i: any) => i.product_id).filter(Boolean),
      ),
    ),
  ] as string[];

  const productCategories = new Map<string, string[]>();
  if (productIds.length) {
    const { data: products } = await query.graph({
      entity: "product",
      fields: ["id", "categories.id"],
      filters: { id: productIds },
    });
    for (const p of products) {
      productCategories.set(
        p.id,
        (p.categories ?? []).map((c: any) => c.id),
      );
    }
  }

  const rows = computeSalesRanking(orders as any, productCategories);
  const computed_at = new Date();

  // Idempotent snapshot rewrite (full refresh over the window).
  const existing = await suggestive.listCategoryTopSellers(
    {},
    { select: ["id"] },
  );
  if (existing.length) {
    await suggestive.deleteCategoryTopSellers(existing.map((r: any) => r.id));
  }
  if (rows.length) {
    await suggestive.createCategoryTopSellers(
      rows.map((r) => ({ ...r, window_days: WINDOW_DAYS, computed_at })),
    );
  }

  logger.info(
    `[job:top-sellers] ${rows.length} category-top-seller rows from ${orders.length} orders (${WINDOW_DAYS}d window).`,
  );
}

export const config = {
  name: "compute-category-top-sellers",
  schedule: "* * * * *", // every minute
};