import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { SUGGESTIVE_SELLING_MODULE } from "../../../modules/suggestive-selling";

/**
 * GET /admin/category-top-sellers — read-only view of the Tier-2 ranking
 * snapshot. Rows are written by the scheduled job
 * (`jobs/compute-category-top-sellers`), so this endpoint is list-only.
 * Query: category_id, limit, offset.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const {
    category_id,
    limit = "200",
    offset = "0",
  } = req.query as Record<string, string>;

  const filters: Record<string, unknown> = {};
  if (category_id) filters.category_id = category_id;

  const service: any = req.scope.resolve(SUGGESTIVE_SELLING_MODULE);
  const [category_top_sellers, count] =
    await service.listAndCountCategoryTopSellers(filters, {
      take: Number(limit),
      skip: Number(offset),
      order: { category_id: "ASC", sales_count: "DESC" },
    });

  res.json({
    category_top_sellers,
    count,
    limit: Number(limit),
    offset: Number(offset),
  });
};
