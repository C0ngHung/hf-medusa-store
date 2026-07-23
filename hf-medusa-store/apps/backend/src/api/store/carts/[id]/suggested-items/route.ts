import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";
import { randomUUID } from "crypto";
import { addSuggestedItemWorkflow } from "../../../../../workflows/suggestive-selling/add-suggested-item";
import { isSuggestedItemError } from "../../../../../workflows/suggestive-selling/lib/suggested-item-errors";
import { PostSuggestedItemSchema } from "./validators";

/**
 * POST /store/carts/:id/suggested-items — one-tap add with attribution
 * (SUGG-003, API Contract §1.1). Thin controller: validate body → run
 * addSuggestedItemWorkflow → serialize. Public with optional customer auth
 * (SEC-04): customer_id comes from the auth context, session_id from the
 * x-session-id header — never from the body. Idempotency-Key header dedupes
 * replays (EC-03); generated server-side when the client omits it.
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);
  const cartId = req.params.id;

  const parsed = PostSuggestedItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      code: "INVALID_REQUEST",
      message: "Dữ liệu không hợp lệ.",
      details: parsed.error.flatten(),
    });
    return;
  }
  const body = parsed.data;

  const headerKey = req.headers["idempotency-key"];
  const idempotencyKey =
    typeof headerKey === "string" && headerKey.length
      ? headerKey
      : randomUUID();
  const sessionId =
    typeof req.headers["x-session-id"] === "string"
      ? req.headers["x-session-id"]
      : null;

  // Customer from auth context only (SEC-04); null for guests.
  const authContext = (
    req as unknown as {
      auth_context?: { actor_id?: string; actor_type?: string };
    }
  ).auth_context;
  const customerId =
    authContext?.actor_type === "customer"
      ? (authContext.actor_id ?? null)
      : null;

  try {
    const { result } = await addSuggestedItemWorkflow(req.scope).run({
      input: {
        cart_id: cartId,
        product_id: body.product_id,
        variant_id: body.variant_id ?? null,
        quantity: body.quantity,
        idempotency_key: idempotencyKey,
        attribution: {
          rule_id: body.attribution.rule_id ?? null,
          source_context: body.attribution.source_context,
          source_product_id: body.attribution.source_product_id ?? null,
        },
        slot: body.slot ?? null,
        customer_id: customerId,
        session_id: sessionId,
      },
    });
    res.json(result);
  } catch (err) {
    // Typed rejection from the workflow (SEC-01 / variant / inactive / stock).
    if (isSuggestedItemError(err)) {
      res.status(err.http_status).json({
        code: err.code,
        message: err.customer_message,
        details: err.details,
      });
      return;
    }
    // addToCart's authoritative inventory confirm throws on OOS → 409 (EC-07).
    // The workflow wraps that error so `err.message` is an object that
    // stringifies to "[object Object]" — matching on the message text is
    // unreliable. Key off the stable MedusaError code (INSUFFICIENT_INVENTORY)
    // instead, keeping the message regex only as a defensive fallback.
    const errCode = (err as { code?: string }).code;
    const msg = err instanceof Error ? String(err.message) : String(err);
    const isStockConflict =
      errCode === MedusaError.Codes.INSUFFICIENT_INVENTORY ||
      /stock|inventory|not enough|insufficient|quantity/i.test(msg);
    if (isStockConflict) {
      res.status(409).json({
        code: "SUGGESTION_STOCK_CONFLICT",
        message: "Sản phẩm vừa hết hàng. Gợi ý đã được cập nhật.",
      });
      return;
    }
    logger.error(
      `[suggestive] POST suggested-items failed cart_id=${cartId}: ${msg}`,
    );
    res.status(500).json({
      code: "SUGGESTION_ADD_FAILED",
      message: "Không thể thêm sản phẩm vào giỏ.",
    });
  }
};
