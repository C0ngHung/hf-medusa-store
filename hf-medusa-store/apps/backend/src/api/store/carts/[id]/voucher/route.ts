/**
 * POST/DELETE /store/carts/:id/voucher — apply / remove a voucher (SPEC §23.5,
 * Decision E; tasks 3.4.1, 3.4.2, 3.4.4–3.4.10, 3.4.14).
 *
 * Thin HTTP boundary: validate (already done by `validateAndTransformBody` +
 * this handler's inline query parse) → run the workflow → map result/error to
 * the API_CONTRACT §1.3/§8 envelope. Performs ZERO monetary calculation
 * (3.8.3) — `discount_amount`/`updated_cart_total`/etc. are all read straight
 * from the workflow's result, which itself only ever returns the refetched,
 * authoritative Cart total (INT-03).
 */

import {
  MedusaRequest,
  MedusaResponse,
  MedusaStoreRequest,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { ApplyVoucherBody, ApplyVoucherQuerySchema } from "./validators";
import { applyVoucherWorkflow } from "../../../../../workflows/voucher-engine/apply-voucher";
import { removeVoucherWorkflow } from "../../../../../workflows/voucher-engine/remove-voucher";
import { toErrorEnvelope } from "../../../../../workflows/voucher-engine/lib/errors";
import {
  recordFailedAttempt,
  resetFailedAttempts,
} from "../../../../../lib/voucher-rate-limit";

/**
 * Unwraps a Medusa workflow's thrown error to the real underlying cause when
 * present — `WorkflowManager`/`TransactionOrchestrator` wraps a failing
 * step's error, so `err instanceof VoucherValidationError` would otherwise
 * never match and every business error would fall through to a generic 500.
 */
function unwrapWorkflowError(err: unknown): unknown {
  const withCause = err as { cause?: unknown; errors?: unknown[] };
  if (withCause?.cause) return withCause.cause;
  if (Array.isArray(withCause?.errors) && withCause.errors.length > 0) {
    const first = withCause.errors[0] as { error?: unknown };
    return first?.error ?? first ?? err;
  }
  return err;
}

/**
 * Shared log + envelope-mapping for both POST and DELETE below — logs a
 * consistent format (this previously drifted: POST's fallback used
 * `JSON.stringify(err, Object.getOwnPropertyNames(err))`, DELETE's just
 * `String(err)`) and maps the unwrapped error to the API_CONTRACT §8 envelope.
 * Does NOT send the response itself — callers decide when (POST needs the
 * status first, to record a failed rate-limit attempt before responding).
 */
function buildVoucherErrorResponse(
  req: MedusaRequest,
  rawErr: unknown,
  cart_id: string,
  action: string,
): ReturnType<typeof toErrorEnvelope> {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);
  logger.error(
    `[voucher-engine] ${action} failed cart_id=${cart_id}: ${
      rawErr instanceof Error
        ? (rawErr.stack ?? rawErr.message)
        : JSON.stringify(rawErr, Object.getOwnPropertyNames(rawErr as object))
    }`,
  );
  return toErrorEnvelope(unwrapWorkflowError(rawErr), req.requestId);
}

export const POST = async (
  req: MedusaStoreRequest<ApplyVoucherBody>,
  res: MedusaResponse,
) => {
  const cart_id = req.params.id;
  // `replace` is a query-string flag (Decision E), not a body field — parsed
  // inline since `validateAndTransformQuery` requires a list/retrieve
  // `QueryConfig`, not suited to a single boolean flag.
  const { replace } = ApplyVoucherQuerySchema.parse(req.query);
  const customer_id = req.auth_context?.actor_id ?? null;
  const ip = req.ip || null;

  try {
    const { result } = await applyVoucherWorkflow(req.scope).run({
      input: {
        cart_id,
        code: req.validatedBody.code,
        customer_id,
        replace,
      },
    });
    await resetFailedAttempts(req.scope, customer_id, ip);
    res.json(result);
  } catch (rawErr) {
    const { status, body } = buildVoucherErrorResponse(
      req,
      rawErr,
      cart_id,
      "apply-voucher",
    );
    // Only a genuine "this code didn't work" outcome counts against the
    // brute-force counter (V1-V8 rejections -> 404/422). A 409
    // VOUCHER_REPLACE_REQUIRED means the code IS valid (just needs replace
    // confirmation) and must never count as a failed guess; a 400/500 is an
    // internal/calculation problem, not a guess (SEC-02/EC-10).
    if (status === 404 || status === 422) {
      await recordFailedAttempt(req.scope, customer_id, ip);
    }
    res.status(status).json(body);
  }
};

export const DELETE = async (req: MedusaRequest, res: MedusaResponse) => {
  const cart_id = req.params.id;

  try {
    const { result } = await removeVoucherWorkflow(req.scope).run({
      input: { cart_id },
    });
    res.json(result);
  } catch (rawErr) {
    const { status, body } = buildVoucherErrorResponse(
      req,
      rawErr,
      cart_id,
      "remove-voucher",
    );
    res.status(status).json(body);
  }
};
