import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { SUGGESTIVE_SELLING_MODULE } from "../../../modules/suggestive-selling";
import { CreateBulkMappingBody } from "./validators";

/**
 * GET /admin/product-bulk-mappings — list single→bulk mappings (CR-04 config).
 * Flat single-table CRUD → resolve the module service directly (no nested
 * children or compensation to orchestrate, so no workflow layer is needed).
 * Query: single_product_id, is_active, limit, offset.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const {
    single_product_id,
    is_active,
    limit = "50",
    offset = "0",
  } = req.query as Record<string, string>;

  const filters: Record<string, unknown> = {};
  if (single_product_id) filters.single_product_id = single_product_id;
  if (is_active !== undefined) filters.is_active = is_active === "true";

  const service: any = req.scope.resolve(SUGGESTIVE_SELLING_MODULE);
  const [product_bulk_mappings, count] =
    await service.listAndCountProductBulkMappings(filters, {
      take: Number(limit),
      skip: Number(offset),
      order: { created_at: "DESC" },
    });

  res.json({
    product_bulk_mappings,
    count,
    limit: Number(limit),
    offset: Number(offset),
  });
};

/** POST /admin/product-bulk-mappings — create one mapping. */
export const POST = async (
  req: MedusaRequest<CreateBulkMappingBody>,
  res: MedusaResponse,
) => {
  const service: any = req.scope.resolve(SUGGESTIVE_SELLING_MODULE);
  const product_bulk_mapping = await service.createProductBulkMappings(
    req.validatedBody,
  );
  res.status(201).json({ product_bulk_mapping });
};
