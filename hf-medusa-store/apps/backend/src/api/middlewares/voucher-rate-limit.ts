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
 * HANDOFF (Day 4): this is wired onto the STORE voucher validate/apply endpoint,
 * which belongs to Thức's track (3.4.x store) and does not exist yet. Register it
 * in api/middlewares.ts against that route's matcher when it lands. Exported here,
 * unit/module tested via the counter helpers, ready to attach.
 */
export async function voucherRateLimitMiddleware(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction,
): Promise<void> {
  const customerId =
    (req as { auth_context?: { actor_id?: string } }).auth_context?.actor_id ??
    null;
  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.ip ||
    null;

  const blocked = await isRateLimited(req.scope, customerId, ip);
  if (blocked) {
    // Verbatim customer-facing VI message (aligns with EC-10 / API_CONTRACT).
    res.status(429).json({
      code: "VOUCHER_RATE_LIMITED",
      message: "Bạn đã thử quá nhiều lần. Vui lòng thử lại sau 30 phút.",
    });
    return;
  }

  next();
}

export default voucherRateLimitMiddleware;
