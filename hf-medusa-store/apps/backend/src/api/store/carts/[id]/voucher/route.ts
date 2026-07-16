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

/** Same derivation as `voucherRateLimitMiddleware` (EC-10/SEC-02 identity). */
function extractIp(req: MedusaRequest): string | null {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.ip ||
    null
  );
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
  const ip = extractIp(req);

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
    const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);
    logger.error(
      `[voucher-engine] apply-voucher failed cart_id=${cart_id}: ${
        rawErr instanceof Error
          ? (rawErr.stack ?? rawErr.message)
          : JSON.stringify(rawErr, Object.getOwnPropertyNames(rawErr as object))
      }`,
    );
    const { status, body } = toErrorEnvelope(
      unwrapWorkflowError(rawErr),
      req.requestId,
    );
    // SPEC §9.3: only VOUCHER_NOT_FOUND is a guessing signal — every other
    // rejection means the code is known, so it must not count toward the
    // brute-force counter.
    if (body.code === "VOUCHER_NOT_FOUND") {
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
    const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);
    logger.error(
      `[voucher-engine] remove-voucher failed cart_id=${cart_id}: ${
        rawErr instanceof Error
          ? (rawErr.stack ?? rawErr.message)
          : String(rawErr)
      }`,
    );
    const { status, body } = toErrorEnvelope(
      unwrapWorkflowError(rawErr),
      req.requestId,
    );
    res.status(status).json(body);
  }
};
