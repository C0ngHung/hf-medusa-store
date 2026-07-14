import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { SUGGESTIVE_SELLING_MODULE } from "../../../../modules/suggestive-selling";
import { UpdateComplementMappingBody } from "../validators";

/** GET /admin/category-complement-mappings/:id — retrieve one mapping. */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const service: any = req.scope.resolve(SUGGESTIVE_SELLING_MODULE);
  const category_complement_mapping =
    await service.retrieveCategoryComplementMapping(req.params.id);
  res.json({ category_complement_mapping });
};

/** PUT /admin/category-complement-mappings/:id — update fields. */
export const PUT = async (
  req: MedusaRequest<UpdateComplementMappingBody>,
  res: MedusaResponse,
) => {
  const service: any = req.scope.resolve(SUGGESTIVE_SELLING_MODULE);
  const category_complement_mapping =
    await service.updateCategoryComplementMappings({
      id: req.params.id,
      ...req.validatedBody,
    });
  res.json({ category_complement_mapping });
};

/** DELETE /admin/category-complement-mappings/:id — soft delete. */
export const DELETE = async (req: MedusaRequest, res: MedusaResponse) => {
  const service: any = req.scope.resolve(SUGGESTIVE_SELLING_MODULE);
  await service.deleteCategoryComplementMappings(req.params.id);
  res.json({
    id: req.params.id,
    object: "category_complement_mapping",
    deleted: true,
  });
};
