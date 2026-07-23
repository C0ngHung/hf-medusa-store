import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import type {
  MedusaContainer,
  INotificationModuleService,
} from "@medusajs/framework/types";
import {
  cache,
  failKey,
  cooldownKey,
  FAIL_WINDOW_S,
  COOLDOWN_S,
} from "./voucher-cache";
import { decideRateLimit } from "../workflows/voucher-engine/lib/rate-limit-policy";

/**
 * VoucherEngine failed-attempt counter + brute-force cooldown (3.7.3–3.7.5, 3.7.8).
 *
 * Unifies EC-10 + SEC-02 (REDIS_USAGE.md §3): count failed validations over a
 * 15-min window; at 5 fails → 429 + a 30-min cooldown. Keyed by customer_id + IP.
 *
 * Redis is OPTIONAL (3.7.7 / REDIS_USAGE.md §4): when `Modules.CACHE` is absent
 * we fall back to a per-process in-memory counter (best-effort; weaker across
 * multiple instances — documented). A missing Redis must never block checkout.
 *
 * NOTE on atomicity: the cache module exposes only get/set/invalidate (same
 * contract lib/suggestion-cache.ts uses for its counters), so the increment is
 * read-modify-write, not a raw Redis INCR. That is acceptable for rate limiting
 * (a rare lost increment only makes the limiter slightly more lenient); the
 * hard anti-over-redemption guarantee lives at the DB layer (INT-02, see
 * `VoucherEngineService.redeemVoucherAtomic` + the order.placed workflow,
 * Day 5).
 */

/** Structural logger view (Medusa Logger). */
interface RateLimitLogger {
  warn(message: string): void;
  info(message: string): void;
}

function logger(container: MedusaContainer): RateLimitLogger | null {
  try {
    return container.resolve(
      ContainerRegistrationKeys.LOGGER,
    ) as RateLimitLogger;
  } catch {
    return null;
  }
}

/**
 * Admin feed alert for a newly-armed cooldown (2026-07-21) — EC-10/SEC-02's
 * "log IP + customer_id for security monitoring" deserves more visibility
 * than a passive log line. Called only at the moment a cooldown is newly
 * armed (never on every subsequent blocked attempt during an already-active
 * cooldown — that would spam the feed for as long as the attacker keeps
 * retrying against the 429).
 */
async function notifyBruteForceAlert(
  container: MedusaContainer,
  fk: string,
  count: number,
): Promise<void> {
  try {
    const notificationService: INotificationModuleService = container.resolve(
      Modules.NOTIFICATION,
    );
    await notificationService.createNotifications({
      to: "",
      channel: "feed",
      template: "admin-ui",
      data: {
        title: "Voucher brute-force attempt detected",
        description: `${count} failed voucher attempts (key=${fk}) within 15 minutes — cooldown armed for 30 minutes.`,
      },
    });
  } catch {
    // Never let a notification failure affect rate limiting itself.
  }
}

// ── In-memory fallback (3.7.7) — per-process, best-effort ──
interface MemEntry {
  value: number;
  expiresAt: number;
}
const memFail = new Map<string, MemEntry>();
const memCooldown = new Map<string, number>(); // key → expiresAt (ms)

function memGet(map: Map<string, MemEntry>, key: string): number {
  const e = map.get(key);
  if (!e) return 0;
  if (e.expiresAt <= Date.now()) {
    map.delete(key);
    return 0;
  }
  return e.value;
}

export interface RecordResult {
  blocked: boolean;
  count: number;
}

/**
 * Is this (customer, IP) currently in cooldown? Presence of the cooldown key ⇒
 * blocked (3.7.5). Safe-false when caching is off / on any error.
 */
export async function isRateLimited(
  container: MedusaContainer,
  customerId?: string | null,
  ip?: string | null,
): Promise<boolean> {
  const key = cooldownKey(customerId, ip);
  const c = cache(container);
  if (!c) {
    const exp = memCooldown.get(key);
    if (exp && exp > Date.now()) return true;
    if (exp) memCooldown.delete(key);
    return false;
  }
  try {
    const v = await c.get(key);
    return v != null;
  } catch {
    return false;
  }
}

/**
 * Record one failed voucher validation for (customer, IP): increment the 15-min
 * counter (3.7.3/3.7.4), arm the 30-min cooldown once the threshold is hit
 * (3.7.5), and log for monitoring/evidence (3.7.8). Returns whether the caller
 * should now block (429) and the current count.
 */
export async function recordFailedAttempt(
  container: MedusaContainer,
  customerId?: string | null,
  ip?: string | null,
): Promise<RecordResult> {
  const fk = failKey(customerId, ip);
  const ck = cooldownKey(customerId, ip);
  const log = logger(container);

  const c = cache(container);
  if (!c) {
    // In-memory fallback (3.7.7).
    const count = memGet(memFail, fk) + 1;
    memFail.set(fk, {
      value: count,
      expiresAt: Date.now() + FAIL_WINDOW_S * 1000,
    });
    const decision = decideRateLimit(count);
    if (decision.shouldSetCooldown && !memCooldown.has(ck)) {
      memCooldown.set(ck, Date.now() + COOLDOWN_S * 1000);
      await notifyBruteForceAlert(container, fk, count);
    }
    log?.warn(
      `[voucher] failed attempt (in-memory) key=${fk} count=${count} blocked=${decision.blocked}`,
    );
    return { blocked: decision.blocked, count };
  }

  try {
    const current = (await c.get<number>(fk)) ?? 0;
    const count = current + 1;
    await c.set(fk, count, FAIL_WINDOW_S);

    const decision = decideRateLimit(count);
    if (decision.shouldSetCooldown) {
      // Only arm if not already present so the 30-min penalty isn't extended by
      // every subsequent failure (idempotent cooldown).
      const existing = await c.get(ck);
      if (existing == null) {
        await c.set(ck, 1, COOLDOWN_S);
        await notifyBruteForceAlert(container, fk, count);
      }
    }
    log?.warn(
      `[voucher] failed attempt key=${fk} count=${count} blocked=${decision.blocked}`,
    );
    return { blocked: decision.blocked, count };
  } catch {
    // Degrade safe: never let a rate-limit bookkeeping error block the user.
    return { blocked: false, count: 0 };
  }
}

/**
 * Reset the failed-attempt counter after a successful validation (3.7.3). Leaves
 * any active cooldown intact (a legitimate success mid-cooldown is impossible —
 * the request would have been blocked first).
 */
export async function resetFailedAttempts(
  container: MedusaContainer,
  customerId?: string | null,
  ip?: string | null,
): Promise<void> {
  const fk = failKey(customerId, ip);
  const c = cache(container);
  if (!c) {
    memFail.delete(fk);
    return;
  }
  try {
    await c.invalidate(fk);
  } catch {
    /* best-effort. */
  }
}
