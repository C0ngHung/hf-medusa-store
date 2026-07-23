/**
 * GET /store/customers/me/vouchers — "My Vouchers" (task 3.4.3; API_CONTRACT
 * §1.3, Decision F). Intended auth-optional (guest -> `200 { vouchers: [] }`,
 * never 401) — but Medusa's core route registration for
 * `/store/customers/me/*` applies an unconditional `authenticate("customer")`
 * ahead of any project route handler, so a guest actually gets 401 before
 * ever reaching this code (verified; see
 * `integration-tests/http/my-vouchers.spec.ts`'s skipped guest test for the
 * full trace, and `GET /store/vouchers` — added 2026-07-21 specifically to
 * give guests a reachable "available vouchers" endpoint outside this
 * prefix). The guest branch below is kept for authenticated-but-no-identity
 * edge cases and as defense in depth, not because guests can currently reach
 * it over real HTTP.
 *
 * Filtering/DTO-building logic is shared with `GET /store/vouchers` via
 * `../../../vouchers/lib/list-available-vouchers.ts` — see that file for the
 * full V7 segment, cart-eligibility-preview, and sort-order rationale.
 */

import { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { listAvailableVouchers } from "../../../vouchers/lib/list-available-vouchers";

export const GET = async (req: MedusaStoreRequest, res: MedusaResponse) => {
  const customerId = req.auth_context?.actor_id ?? null;
  if (!customerId) {
    res.json({ vouchers: [] });
    return;
  }

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
