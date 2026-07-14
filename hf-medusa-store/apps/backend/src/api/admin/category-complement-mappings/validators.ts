import { z } from "zod";

/**
 * Zod validators for admin category-complement-mapping APIs (Tier-2 backfill,
 * SRS SUGG-001). One row per (source → complement) category pair.
 * Category ids are plain text (cross-module reference via the Link Module).
 */
export const CreateComplementMappingSchema = z.object({
  source_category_id: z.string().min(1),
  complement_category_id: z.string().min(1),
  display_order: z.number().int().default(0),
  is_active: z.boolean().default(true),
});

export const UpdateComplementMappingSchema =
  CreateComplementMappingSchema.partial();

export type CreateComplementMappingBody = z.infer<
  typeof CreateComplementMappingSchema
>;
export type UpdateComplementMappingBody = z.infer<
  typeof UpdateComplementMappingSchema
>;
