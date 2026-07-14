import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { evaluateCartSuggestionsWorkflow } from "../../../../../workflows/evaluate-cart-suggestions";
import { CART_LIMIT } from "../../../../../modules/suggestive-selling/constants";

/**
 * GET /store/carts/:id/suggestions — cart-level "You Might Also Need"
 * (SUGG-004, API Contract §1.1). Thin controller: parse/validate query → run the
 * evaluateCartSuggestions workflow → serialize. Public with optional customer auth
 * (SEC-04): customer is derived from the auth context, never from the body.
 *
 * Query:   limit? (default/max CART_LIMIT)
 * Headers: x-session-id (dismissal/analytics scope)
 *
 * Response: { suggestions, count, threshold_info }. threshold_info is non-null
 * only when CR-02 fired AND there is ≥1 suggestion (2.4.9/2.4.10). On ANY failure
 * return 200 with an empty list + null threshold so the frontend hides the section
 * (BR-10 / §4.3) — the suggestion path never emits a 5xx.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);
  const cartId = req.params.id;

  try {
    const limit = parseLimit(req.query.limit);
    const sessionId =
      typeof req.headers["x-session-id"] === "string"
        ? req.headers["x-session-id"]
        : null;

    // Customer from auth context only (SEC-04) — undefined for guests (BR-08).
    const authContext = (
      req as unknown as {
        auth_context?: { actor_id?: string; actor_type?: string };
      }
    ).auth_context;
    const customerId =
      authContext?.actor_type === "customer"
        ? (authContext.actor_id ?? null)
        : null;

    const { result } = await evaluateCartSuggestionsWorkflow(req.scope).run({
      input: { cartId, request: { limit, customerId, sessionId } },
    });

    res.json({
      suggestions: result.candidates,
      count: result.candidates.length,
      threshold_info: result.threshold_info,
    });
  } catch (err) {
    logger.error(
      `[suggestive] GET cart suggestions failed cart_id=${cartId}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    res.json({ suggestions: [], count: 0, threshold_info: null });
  }
};

/** Clamp `limit` to [1, CART_LIMIT]; default to CART_LIMIT when absent/invalid (BR-01). */
function parseLimit(raw: unknown): number {
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isFinite(value) || value <= 0) return CART_LIMIT;
  return Math.min(Math.floor(value), CART_LIMIT);
}
