/**
 * VoucherEngine pure helper — rate-limit decision (3.7.4, 3.7.5).
 *
 * No I/O. Given the current failed-attempt count for a (customer, IP), decide
 * whether the next voucher validation is blocked and whether the caller should
 * arm the cooldown. The Redis-backed counter lives in
 * src/lib/voucher-rate-limit.ts; this file holds only the policy so it is
 * unit-testable without Redis. Unifies EC-10 + SEC-02 (REDIS_USAGE.md §3):
 * count over 15 min, penalize for 30 min.
 */
import { FAIL_THRESHOLD } from "../../../modules/voucher-engine/constants";

export interface RateLimitDecision {
  /** true ⇒ the attempt must be rejected with 429 (threshold reached). */
  blocked: boolean;
  /** true ⇒ the caller should set the 30-min cooldown key (idempotently). */
  shouldSetCooldown: boolean;
}

/**
 * Decide from the post-increment fail count. Blocked at exactly FAIL_THRESHOLD
 * (5) and beyond; cooldown should be armed on the same condition (the Redis
 * helper only writes it if not already present, so it never extends silently).
 */
export function decideRateLimit(failCount: number): RateLimitDecision {
  const blocked = failCount >= FAIL_THRESHOLD;
  return { blocked, shouldSetCooldown: blocked };
}
