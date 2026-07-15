import {
  defineMiddlewares,
  validateAndTransformBody,
} from "@medusajs/framework/http";
import {
  CreateSuggestionRuleSchema,
  UpdateSuggestionRuleSchema,
} from "./admin/suggestion-rules/validators";
import { CreateVoucherSchema } from "./admin/vouchers/validators";
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
 * API middlewares. Body validation for admin config writes (SRS §6.1, §6.4) and
 * the store voucher apply/remove routes (SPEC §12/§23.5, Decision E):
 * validateAndTransformBody parses with the zod schema and sets req.validatedBody.
 * The `?replace=true` query flag is validated inline in the route handler
 * (validateAndTransformQuery needs a list/retrieve QueryConfig, not suited to
 * a single boolean flag).
 *
 * NOTE (Day 4/5): the voucher rate-limit middleware
 * (api/middlewares/voucher-rate-limit.ts, 3.7.3–3.7.5) is built and unit/module
 * tested. The store voucher route (/store/carts/:id/voucher) now exists, so wire
 * the rate-limiter onto it in Day 5 (reconcile with SEC-02/EC-10). Admin writes
 * need only body validation below.
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
      matcher: "/admin/vouchers",
      method: "POST",
      middlewares: [validateAndTransformBody(CreateVoucherSchema)],
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
