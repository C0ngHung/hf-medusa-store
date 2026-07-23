import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { SUGGESTIVE_SELLING_MODULE } from "../modules/suggestive-selling";

/**
 * Seed the Tier-2 top-seller snapshot (`category_top_seller`) with deterministic
 * DEMO data — run with:
 *   npx medusa exec ./src/scripts/seed-category-top-sellers.ts
 *
 * WHY (SUGG-001 Tier 2 / SPEC A.6): Tier-2 backfill and CR-01 rank
 * complement-category candidates by `sales_count`. Real counts come from the
 * scheduled job `jobs/compute-category-top-sellers`, which aggregates the last
 * 30 days of orders. A fresh dev/demo DB has no orders → the snapshot is empty →
 * the evaluator's backfill step falls back to newest-first (plan C), which is
 * non-deterministic for demos. This seed writes synthetic, stable per-(category,
 * product) counts so Tier-2 / CR-01 produce predictable ordering without needing
 * order history.
 *
 * Scope: only the Tier-2 complement categories (targets of the complement map in
 * seed-suggestive-selling.ts). Idempotent: full-refresh wipe + insert, mirroring
 * the job's snapshot rewrite. Must run AFTER the catalog seed (resolves
 * categories by name, then reads product→category via the Query graph).
 */

// Tier-2 complement categories — union of the COMPLEMENT_MAP targets in
// seed-suggestive-selling.ts (Rackets→Strings/Grips/Bags, Shoes→Socks/Insoles,
// Shuttlecocks→Tubes). Resolved by `name` (catalog seed creates categories by name).
const COMPLEMENT_CATEGORY_NAMES = [
  "Strings",
  "Grips",
  "Bags",
  "Socks",
  "Insoles",
  "Tubes",
];

const WINDOW_DAYS = 30;
// Synthetic ranking within a category: top product = BASE_SALES, each next one
// STEP lower, floored at MIN_SALES. Deterministic (products sorted by handle).
// Kept in a small 1-10 range so it stays consistent with the low-volume
// `seed-orders` fixture — after the compute-category-top-sellers job runs over
// those seeded orders it produces counts in the same order of magnitude, so the
// snapshot-only demo and the order-driven demo look coherent.
const BASE_SALES = 10;
const STEP = 1;
const MIN_SALES = 1;

export default async function seedCategoryTopSellers({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const productModule = container.resolve(Modules.PRODUCT);
  const ss: any = container.resolve(SUGGESTIVE_SELLING_MODULE);

  // Resolve complement category ids by name (match in memory — array name-filter
  // isn't reliably translated to an IN query, per seed-suggestive-selling.ts).
  const categories = await productModule.listProductCategories(
    {},
    { select: ["id", "name"], take: 1000 },
  );
  const idByName = new Map(categories.map((c: any) => [c.name, c.id]));

  const complementCatIds = new Set<string>();
  for (const name of COMPLEMENT_CATEGORY_NAMES) {
    const id = idByName.get(name);
    if (!id) {
      logger.warn(
        `[seed:top-sellers] category "${name}" not found — skip (run catalog seed first)`,
      );
      continue;
    }
    complementCatIds.add(id);
  }

  if (!complementCatIds.size) {
    logger.info(
      "[seed:top-sellers] no complement categories resolved — nothing to seed.",
    );
    return;
  }

  // Products + their categories (cross-module via Query graph, like the job).
  // Catalog is small; list all and group in memory.
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "status", "categories.id"],
    pagination: { take: 1000, skip: 0 },
  });

  // Group published products per complement category.
  const byCategory = new Map<string, { id: string; handle: string }[]>();
  for (const p of products as any[]) {
    if (p.status !== "published") continue;
    for (const c of p.categories ?? []) {
      if (!complementCatIds.has(c.id)) continue;
      const list = byCategory.get(c.id) ?? [];
      list.push({ id: p.id, handle: p.handle ?? p.id });
      byCategory.set(c.id, list);
    }
  }

  const computed_at = new Date();
  const rows: Array<{
    category_id: string;
    product_id: string;
    sales_count: number;
    window_days: number;
    computed_at: Date;
  }> = [];

  for (const [catId, list] of byCategory) {
    list.sort((a, b) => a.handle.localeCompare(b.handle));
    list.forEach((p, i) => {
      rows.push({
        category_id: catId,
        product_id: p.id,
        sales_count: Math.max(BASE_SALES - i * STEP, MIN_SALES),
        window_days: WINDOW_DAYS,
        computed_at,
      });
    });
  }

  // Idempotent full refresh (mirrors jobs/compute-category-top-sellers).
  const existing = await ss.listCategoryTopSellers({}, { select: ["id"] });
  if (existing.length) {
    await ss.deleteCategoryTopSellers(existing.map((r: any) => r.id));
  }
  if (rows.length) {
    await ss.createCategoryTopSellers(rows);
  }

  logger.info(
    `[seed:top-sellers] seeded ${rows.length} category_top_seller rows across ${byCategory.size} categories (synthetic demo counts, ${WINDOW_DAYS}d window).`,
  );
}
