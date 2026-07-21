import {
  defineMiddlewares,
  validateAndTransformBody,
} from "@medusajs/framework/http";
import {
  CreateSuggestionRuleSchema,
  UpdateSuggestionRuleSchema,
} from "./admin/suggestion-rules/validators";
import {
  CreateOrAttachVoucherSchema,
  UpdateVoucherSchema,
} from "./admin/vouchers/validators";
import {
  ApplyVoucherSchema,
  RemoveVoucherSchema,
} from "./store/carts/[id]/voucher/validators";
import { voucherRateLimitMiddleware } from "./middlewares/voucher-rate-limit";
import { blockVoucherPromotionMiddleware } from "./middlewares/block-voucher-promotion";
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
 * The voucher rate-limit middleware (api/middlewares/voucher-rate-limit.ts,
 * 3.7.3–3.7.5, EC-10/SEC-02) runs before body validation on the apply route —
 * SPEC §14.1 step 1 requires the cooldown check to gate the request before any
 * validation runs — a request already in cooldown must 429 regardless of
 * whether its payload is well-formed. DELETE is not rate-limited: removing a
 * voucher carries no code-guessing risk. Admin writes need only body validation
 * below.
 *
 * `blockVoucherPromotionMiddleware` (api/middlewares/block-voucher-promotion.ts,
 * Task 3, spec §5) guards Medusa's NATIVE `POST /store/carts/:id/promotions`
 * route: a voucher is backed by a real Promotion (metadata.voucher_engine),
 * so without this guard a client could attach the code directly there,
 * bypassing V1–V8/cap/rate-limit and reviving the Rule-11 stacking bug.
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
      middlewares: [validateAndTransformBody(CreateOrAttachVoucherSchema)],
    },
    {
      matcher: "/admin/vouchers/:id",
      method: "PUT",
      middlewares: [validateAndTransformBody(UpdateVoucherSchema)],
    },
    {
      matcher: "/store/carts/:id/voucher",
      method: "POST",
      middlewares: [
        voucherRateLimitMiddleware,
        validateAndTransformBody(ApplyVoucherSchema),
      ],
    },
    {
      matcher: "/store/carts/:id/voucher",
      method: "DELETE",
      middlewares: [validateAndTransformBody(RemoveVoucherSchema)],
    },
    {
      matcher: "/store/carts/:id/promotions",
      method: "POST",
      middlewares: [blockVoucherPromotionMiddleware],
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
