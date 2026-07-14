import { z } from "zod";

/**
 * Zod validators for admin product-bulk-mapping APIs (CR-04 consumable upsell).
 * validateAndTransformBody (see src/api/middlewares.ts) parses the request body
 * with these and populates req.validatedBody.
 *
 * A mapping links a "single" SKU to its "bulk" counterpart (e.g. a 1-tube
 * shuttlecock → its 3-tube combo). Product ids are stored as plain text ids
 * (cross-module reference via the Link Module, never a DB FK).
 */
export const CreateBulkMappingSchema = z.object({
  single_product_id: z.string().min(1),
  bulk_product_id: z.string().min(1),
  // Display metadata only (e.g. 3 → "3-tube bundle"). Nullable in the model.
  unit_multiplier: z.number().int().positive().nullish(),
  is_active: z.boolean().default(true),
});

// All fields optional on update.
export const UpdateBulkMappingSchema = CreateBulkMappingSchema.partial();

export type CreateBulkMappingBody = z.infer<typeof CreateBulkMappingSchema>;
export type UpdateBulkMappingBody = z.infer<typeof UpdateBulkMappingSchema>;
