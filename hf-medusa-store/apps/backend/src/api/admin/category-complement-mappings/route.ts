import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { SUGGESTIVE_SELLING_MODULE } from "../../../modules/suggestive-selling";
import { CreateComplementMappingBody } from "./validators";

/**
 * GET /admin/category-complement-mappings — list Tier-2 complement pairs.
 * Flat single-table CRUD → resolve the module service directly (no workflow).
 * Query: source_category_id, is_active, limit, offset.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const {
    source_category_id,
    is_active,
    limit = "100",
    offset = "0",
  } = req.query as Record<string, string>;

  const filters: Record<string, unknown> = {};
  if (source_category_id) filters.source_category_id = source_category_id;
  if (is_active !== undefined) filters.is_active = is_active === "true";

  const service: any = req.scope.resolve(SUGGESTIVE_SELLING_MODULE);
  const [category_complement_mappings, count] =
    await service.listAndCountCategoryComplementMappings(filters, {
      take: Number(limit),
      skip: Number(offset),
      order: { source_category_id: "ASC", display_order: "ASC" },
    });

  res.json({
    category_complement_mappings,
    count,
    limit: Number(limit),
    offset: Number(offset),
  });
};

/** POST /admin/category-complement-mappings — create one mapping. */
export const POST = async (
  req: MedusaRequest<CreateComplementMappingBody>,
  res: MedusaResponse,
) => {
  const service: any = req.scope.resolve(SUGGESTIVE_SELLING_MODULE);
  const category_complement_mapping =
    await service.createCategoryComplementMappings(req.validatedBody);
  res.status(201).json({ category_complement_mapping });
};
