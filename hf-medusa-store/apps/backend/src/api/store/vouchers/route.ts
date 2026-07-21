/**
 * GET /store/vouchers — public "available vouchers" (2026-07-21, code-review
 * finding). Auth-OPTIONAL, and NOT under `/store/customers/me/*` — deliberately,
 * since Medusa's own core route registration
 * (`@medusajs/medusa/dist/api/store/customers/middlewares.js`) applies an
 * unconditional `authenticate("customer", [...])` to every method under that
 * path prefix, 401ing a guest before any project route handler under it can
 * ever run (verified this session; not overridable via `defineMiddlewares`
 * or a route's own `AUTHENTICATE = false` export — see
 * `integration-tests/http/my-vouchers.spec.ts`'s skipped guest test for the
 * full trace). This route lives outside that prefix specifically so a guest
 * CAN reach it.
 *
 * Guests (`req.auth_context` absent/no `actor_id`) see every currently
 * valid, unrestricted (`user_segment_conditions: null`) voucher — this is
 * the literal SRS §6.2 "available to the current customer" list, which for
 * an unidentified customer is exactly "available to anyone". An
 * authenticated customer additionally sees vouchers gated to a native
 * Customer Group they belong to. Shares its filtering/DTO logic with
 * `GET /store/customers/me/vouchers` via `list-available-vouchers.ts` so the
 * two can never drift apart — see that file for the full V7/eligibility
 * rationale.
 *
 * Read-only — no workflow, per SPEC §12 ("read-only, no workflow").
 * Optional `?cart_id=` behaves identically to the `/customers/me/vouchers`
 * route (adds `eligible`/`ineligible_reason`/`estimated_savings`).
 */
import { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { listAvailableVouchers } from "./lib/list-available-vouchers";

export const GET = async (req: MedusaStoreRequest, res: MedusaResponse) => {
  const customerId = req.auth_context?.actor_id ?? null;
  const cartId =
    typeof req.query.cart_id === "string" ? req.query.cart_id : undefined;

  const result = await listAvailableVouchers({
    scope: req.scope,
    customerId,
    cartId,
  });

  res.json(result);
};

export default GET;
