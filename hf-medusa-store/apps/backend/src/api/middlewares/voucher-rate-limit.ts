import type {
  MedusaRequest,
  MedusaResponse,
  MedusaNextFunction,
} from "@medusajs/framework/http";
import { isRateLimited } from "../../lib/voucher-rate-limit";

/**
 * Voucher brute-force rate-limit middleware (3.7.3–3.7.5, EC-10/SEC-02).
 *
 * Blocks a voucher validate/apply attempt with 429 while the (customer_id, IP)
 * pair is in cooldown. The failed-attempt counting + cooldown arming happens in
 * the route/workflow on each failed validation (recordFailedAttempt); this guard
 * only rejects early when a cooldown is already active. Degrades safely when Redis
 * is absent (isRateLimited returns false → never blocks a legitimate checkout,
 * 3.7.7).
 *
 * Registered on `POST /store/carts/:id/voucher` in `api/middlewares.ts`.
 */
export async function voucherRateLimitMiddleware(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction,
): Promise<void> {
  const customerId =
    (req as { auth_context?: { actor_id?: string } }).auth_context?.actor_id ??
    null;
  // Never trust a client-controlled header (X-Forwarded-For) for a
  // security-sensitive rate-limit key — `req.ip` is Express's own
  // trust-proxy-aware resolution (defaults to the raw socket address when no
  // proxy is configured), so it cannot be spoofed by an arbitrary header.
  const ip = req.ip || null;

  const blocked = await isRateLimited(req.scope, customerId, ip);
  if (blocked) {
    // Matches the shared ErrorEnvelope/VoucherErrorEnvelope contract
    // (workflows/voucher-engine/lib/errors.ts) so the storefront's
    // `customer_message`-only rendering path works for this response too.
    res.status(429).json({
      type: "rate_limited",
      code: "VOUCHER_RATE_LIMITED",
      message: "voucher validation rate limited (SEC-02/EC-10)",
      customer_message:
        "Bạn đã thử quá nhiều lần. Vui lòng thử lại sau 30 phút.",
    });
    return;
  }

  next();
}

export default voucherRateLimitMiddleware;
