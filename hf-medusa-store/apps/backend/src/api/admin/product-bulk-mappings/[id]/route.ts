import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { SUGGESTIVE_SELLING_MODULE } from "../../../../modules/suggestive-selling";
import { UpdateBulkMappingBody } from "../validators";

/** GET /admin/product-bulk-mappings/:id — retrieve one mapping. */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const service: any = req.scope.resolve(SUGGESTIVE_SELLING_MODULE);
  const product_bulk_mapping = await service.retrieveProductBulkMapping(
    req.params.id,
  );
  res.json({ product_bulk_mapping });
};

/** PUT /admin/product-bulk-mappings/:id — update fields. */
export const PUT = async (
  req: MedusaRequest<UpdateBulkMappingBody>,
  res: MedusaResponse,
) => {
  const service: any = req.scope.resolve(SUGGESTIVE_SELLING_MODULE);
  const product_bulk_mapping = await service.updateProductBulkMappings({
    id: req.params.id,
    ...req.validatedBody,
  });
  res.json({ product_bulk_mapping });
};

/** DELETE /admin/product-bulk-mappings/:id — soft delete. */
export const DELETE = async (req: MedusaRequest, res: MedusaResponse) => {
  const service: any = req.scope.resolve(SUGGESTIVE_SELLING_MODULE);
  await service.deleteProductBulkMappings(req.params.id);
  res.json({
    id: req.params.id,
    object: "product_bulk_mapping",
    deleted: true,
  });
};
