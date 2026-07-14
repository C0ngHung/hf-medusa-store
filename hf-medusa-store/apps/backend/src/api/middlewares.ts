import {
  defineMiddlewares,
  validateAndTransformBody,
} from "@medusajs/framework/http";
import {
  CreateSuggestionRuleSchema,
  UpdateSuggestionRuleSchema,
} from "./admin/suggestion-rules/validators";
import {
  CreateBulkMappingSchema,
  UpdateBulkMappingSchema,
} from "./admin/product-bulk-mappings/validators";
import {
  CreateComplementMappingSchema,
  UpdateComplementMappingSchema,
} from "./admin/category-complement-mappings/validators";

/**
 * API middlewares. Body validation for admin config writes (SRS §6.1):
 * validateAndTransformBody parses with the zod schema and sets req.validatedBody.
 */
export default defineMiddlewares({
  routes: [
    {
      matcher: "/admin/suggestion-rules",
      method: "POST",
      middlewares: [validateAndTransformBody(CreateSuggestionRuleSchema)],
    },
    {
      matcher: "/admin/suggestion-rules/:id",
      method: "PUT",
      middlewares: [validateAndTransformBody(UpdateSuggestionRuleSchema)],
    },
    {
      matcher: "/admin/product-bulk-mappings",
      method: "POST",
      middlewares: [validateAndTransformBody(CreateBulkMappingSchema)],
    },
    {
      matcher: "/admin/product-bulk-mappings/:id",
      method: "PUT",
      middlewares: [validateAndTransformBody(UpdateBulkMappingSchema)],
    },
    {
      matcher: "/admin/category-complement-mappings",
      method: "POST",
      middlewares: [validateAndTransformBody(CreateComplementMappingSchema)],
    },
    {
      matcher: "/admin/category-complement-mappings/:id",
      method: "PUT",
      middlewares: [validateAndTransformBody(UpdateComplementMappingSchema)],
    },
  ],
});
