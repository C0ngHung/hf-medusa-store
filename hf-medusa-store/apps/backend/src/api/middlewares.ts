import {
  defineMiddlewares,
  validateAndTransformBody,
} from "@medusajs/framework/http";
import {
  CreateSuggestionRuleSchema,
  UpdateSuggestionRuleSchema,
} from "./admin/suggestion-rules/validators";
import { CreateVoucherSchema } from "./admin/vouchers/validators";

/**
 * API middlewares. Body validation for admin writes (SRS §6.1, §6.4):
 * validateAndTransformBody parses with the zod schema and sets req.validatedBody.
 *
 * NOTE (Day 4 handoff): the voucher rate-limit middleware
 * (api/middlewares/voucher-rate-limit.ts, 3.7.3–3.7.5) is built and unit/module
 * tested, but is wired onto the STORE voucher validate/apply endpoint — which is
 * Thức's track (3.4.x store) and does not exist yet. Attach it there when that
 * route lands; nothing to wire here for admin.
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
  ],
});
