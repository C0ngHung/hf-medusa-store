import { z } from "zod";
import { MIN_CODE_LENGTH } from "../../../../../modules/voucher-engine/constants";

/**
 * Zod validators for the store voucher API — `API_CONTRACT_Suggestive_Voucher_Cart.md`
 * §1.3 (`POST`/`DELETE /store/carts/:id/voucher`). `validateAndTransformBody`
 * (see src/api/middlewares.ts) parses the request body with these schemas and
 * populates `req.validatedBody`.
 *
 * The cart id is the route's `:id` param, NOT a body field — the API contract
 * shows only `{ code }` in the POST body (no `cart_id`), and no body at all
 * for DELETE. `replace` is a query-string flag (`?replace=true`), validated by
 * `ApplyVoucherQuerySchema`, not the body schema.
 *
 * `.strict()` is the enforcement mechanism for "server-side-only discount
 * calculation" (SEC-01): any pricing, identity, or eligibility field the
 * client attempts to submit (e.g. `discount_amount`, `final_voucher_discount`,
 * any `*_total`, `promotion_id`, `voucher_id`, `customer_id`, `usage_count`,
 * `eligible_item_ids`, `min_order_value`, ...) is REJECTED at the validation
 * boundary — zod's `.strict()` throws on unrecognized keys instead of
 * silently stripping them.
 *
 * `code` normalization (trim + uppercase) happens in the workflow's
 * normalize-code step, NOT here — this schema only validates shape.
 */

export const ApplyVoucherSchema = z
  .object({
    code: z
      .string()
      .min(
        MIN_CODE_LENGTH,
        `Voucher code must be at least ${MIN_CODE_LENGTH} characters`,
      ) // SEC-03
      .regex(/^[A-Za-z0-9]+$/, "Voucher code must be alphanumeric"), // SEC-03
  })
  .strict();

export type ApplyVoucherBody = z.infer<typeof ApplyVoucherSchema>;

/**
 * Query string for `POST /store/carts/:id/voucher` — `?replace=true` confirms
 * replacing an already-active voucher (API contract: otherwise `409
 * VOUCHER_REPLACE_REQUIRED`).
 *
 * Explicit string-literal match, NOT `z.coerce.boolean()` — Zod's coercion is
 * `Boolean(value)`, and `Boolean("false")` is `true` (any non-empty string is
 * truthy), which would silently invert `?replace=false`.
 */
export const ApplyVoucherQuerySchema = z
  .object({
    replace: z
      .enum(["true", "false"])
      .optional()
      .transform((v) => v === "true"),
  })
  .strict();

export type ApplyVoucherQuery = z.infer<typeof ApplyVoucherQuerySchema>;

/**
 * `DELETE /store/carts/:id/voucher` — no request body per the API contract;
 * the cart id is the route's `:id` param. Removing when no voucher is active
 * is a 200 no-op (idempotent). Kept `.strict()` so a client can't smuggle a
 * pricing/identity field in an unexpected body.
 */
export const RemoveVoucherSchema = z.object({}).strict();

export type RemoveVoucherBody = z.infer<typeof RemoveVoucherSchema>;
