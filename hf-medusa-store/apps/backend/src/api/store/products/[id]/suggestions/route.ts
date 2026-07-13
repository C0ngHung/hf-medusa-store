import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { evaluateSuggestionsWorkflow } from "../../../../../workflows/evaluate-suggestions";
import { PRODUCT_LIMIT } from "../../../../../modules/suggestive-selling/constants";

/**
 * GET /store/products/:id/suggestions — product-level suggestions (SUGG-001,
 * API Contract §1.1). Thin controller: parse/validate query → run the
 * evaluateSuggestions workflow → serialize. Public with optional customer auth
 * (SEC-04): customer is derived from the auth context, never from the body.
 *
 * Query:   cart_id? (in-cart filter + pricing context), limit? (default/max PRODUCT_LIMIT)
 * Headers: x-session-id (dismissal/analytics scope)
 *
 * Degrade contract (BR-10 / §4.3): on ANY failure return 200 with an empty list
 * so the frontend hides the section — the suggestion path never emits a 5xx.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);
  const productId = req.params.id;

  try {
    const limit = parseLimit(req.query.limit);
    const cartId =
      typeof req.query.cart_id === "string" ? req.query.cart_id : null;
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

    const { result } = await evaluateSuggestionsWorkflow(req.scope).run({
      input: { productId, request: { limit, cartId, customerId, sessionId } },
    });

    res.json({ suggestions: result, count: result.length });
  } catch (err) {
    logger.error(
      `[suggestive] GET product suggestions failed product_id=${productId}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    res.json({ suggestions: [], count: 0 });
  }
};

/** Clamp `limit` to [1, PRODUCT_LIMIT]; default to PRODUCT_LIMIT when absent/invalid (BR-01). */
function parseLimit(raw: unknown): number {
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isFinite(value) || value <= 0) return PRODUCT_LIMIT;
  return Math.min(Math.floor(value), PRODUCT_LIMIT);
}
