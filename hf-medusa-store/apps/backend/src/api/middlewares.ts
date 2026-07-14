import {
  defineMiddlewares,
  validateAndTransformBody,
} from "@medusajs/framework/http";
import {
  CreateSuggestionRuleSchema,
  UpdateSuggestionRuleSchema,
} from "./admin/suggestion-rules/validators";
import {
  ApplyVoucherSchema,
  RemoveVoucherSchema,
} from "./store/carts/[id]/voucher/validators";
import {
  CreateBulkMappingSchema,
  UpdateBulkMappingSchema,
} from "./admin/product-bulk-mappings/validators";
import {
  CreateComplementMappingSchema,
  UpdateComplementMappingSchema,
} from "./admin/category-complement-mappings/validators";

/**
 * API middlewares. Body validation for admin config writes (SRS §6.1) and the
 * store voucher apply/remove routes (SPEC §12/§23.5, Decision E):
 * validateAndTransformBody parses with the zod schema and sets req.validatedBody.
 * The `?replace=true` query flag is validated inline in the route handler
 * (validateAndTransformQuery needs a list/retrieve QueryConfig, not suited to
 * a single boolean flag).
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
      matcher: "/store/carts/:id/voucher",
      method: "POST",
      middlewares: [validateAndTransformBody(ApplyVoucherSchema)],
    },
    {
      matcher: "/store/carts/:id/voucher",
      method: "DELETE",
      middlewares: [validateAndTransformBody(RemoveVoucherSchema)],
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
