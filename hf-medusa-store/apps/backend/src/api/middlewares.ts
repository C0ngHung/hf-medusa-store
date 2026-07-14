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

/**
 * API middlewares. Body validation for admin suggestion-rule writes (SRS §6.1)
 * and the store voucher apply/remove routes (SPEC §12/§23.5, Decision E):
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
  ],
});
