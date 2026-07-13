import { model } from "@medusajs/framework/utils";

/**
 * CategoryTopSeller — Tier-2 ranking snapshot (SRS SUGG-001 Tier 2 / SPEC A.6).
 *
 * SRS wants Tier-2 backfill to use "top-selling products from complementary
 * categories". Aggregating orders on every request is too slow (NFR p95), so a
 * scheduled job (`jobs/compute-category-top-sellers`) precomputes sales counts
 * over a trailing window and writes one row per (category, product). The
 * evaluator reads this table ordered by `sales_count` desc; when it's empty
 * (cold start / no orders) the backfill step falls back to newest-first.
 *
 * `category_id` / `product_id` are plain text (cross-module → no DB FK).
 */
const CategoryTopSeller = model
  .define("category_top_seller", {
    id: model.id().primaryKey(),
    category_id: model.text(),
    product_id: model.text(),
    sales_count: model.number().default(0),
    window_days: model.number().default(30),
    computed_at: model.dateTime().nullable(),
  })
  // Read path: top sellers within a category, highest sales first.
  .indexes([{ on: ["category_id", "sales_count"] }]);

export default CategoryTopSeller;
