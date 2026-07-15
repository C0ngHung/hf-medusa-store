import { Modules } from "@medusajs/framework/utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import {
  VOUCHER_CONFIG_CACHE_TTL,
  FAIL_WINDOW_S,
  COOLDOWN_S,
} from "../modules/voucher-engine/constants";
import { normalizeCode } from "../workflows/voucher-engine/lib/normalize";

/**
 * VoucherEngine cache helpers (3.7.1, 3.7.2) — mirror lib/suggestion-cache.ts.
 *
 * Redis is OPTIONAL (D11 / REDIS_USAGE.md §4): Medusa always registers a cache
 * module (Redis when REDIS_URL is set, in-memory otherwise), but every helper
 * degrades to a safe NO-OP when `Modules.CACHE` cannot be resolved — a missing
 * cache must never block voucher validation or checkout.
 *
 * SCOPE-SAFETY (3.7.2, REDIS_USAGE.md §2) — CRITICAL: cache ONLY the
 * cart-INDEPENDENT parts of validation (V1 exists/active, V2 date window, static
 * config = VoucherSnapshot from findByCode). Cart-DEPENDENT checks — V3/V4 usage,
 * V5 min order, V6 eligible items, V8 stacking — are ALWAYS evaluated live against
 * the current cart, never served from cache. This is why callers cache the config
 * only and still run the full validateVoucher chain per request.
 *
 * Key catalogue (REDIS_USAGE.md §2/§3):
 *   voucher:{code}:config          cart-independent config,  TTL 30s   (3.7.1)
 *   voucher:fail:{cus}:{ip}        failed-attempt counter,   TTL 15m   (3.7.3)
 *   voucher:cooldown:{cus}:{ip}    brute-force cooldown,      TTL 30m   (3.7.5)
 */

/**
 * Minimal structural view of Medusa's cache service (`Modules.CACHE`). We depend
 * only on these three methods so callers need not import the full ICacheService.
 */
export interface VoucherCache {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, data: unknown, ttl?: number): Promise<void>;
  invalidate(key: string): Promise<void>;
}

/**
 * Resolve the cache module, or `null` when it is not registered/resolvable (D11).
 * Callers treat `null` as "caching disabled" and proceed without it. Shared by all
 * VoucherEngine Redis helpers (rate-limit, usage-counter).
 */
export function cache(container: MedusaContainer): VoucherCache | null {
  try {
    return container.resolve(Modules.CACHE) as VoucherCache;
  } catch {
    return null;
  }
}

// ── Key builders ──

/** Cart-independent voucher config key (3.7.1). Code normalized so hits are stable. */
export function voucherConfigCacheKey(code: string): string {
  return `voucher:${normalizeCode(code)}:config`;
}

/** Failed-attempt counter key (3.7.3). */
export function failKey(
  customerId?: string | null,
  ip?: string | null,
): string {
  return `voucher:fail:${customerId ?? "anon"}:${ip ?? "unknown"}`;
}

/** Brute-force cooldown key (3.7.5). */
export function cooldownKey(
  customerId?: string | null,
  ip?: string | null,
): string {
  return `voucher:cooldown:${customerId ?? "anon"}:${ip ?? "unknown"}`;
}

// Re-export TTLs so callers wire them from one source (SPEC discipline).
export { VOUCHER_CONFIG_CACHE_TTL, FAIL_WINDOW_S, COOLDOWN_S };

// ── Cart-independent config cache (3.7.1, 3.7.2) ──

/**
 * Read a cached voucher config snapshot (cart-independent only). Returns null on
 * miss or when caching is off — caller then loads from DB and validates live.
 */
export async function getCachedVoucherConfig<T = unknown>(
  container: MedusaContainer,
  code: string,
): Promise<T | null> {
  const c = cache(container);
  if (!c) return null;
  try {
    return await c.get<T>(voucherConfigCacheKey(code));
  } catch {
    return null;
  }
}

/**
 * Cache a voucher config snapshot for 30s (3.7.1). Callers MUST only pass
 * cart-independent data (config/V1/V2) — never a full cart-dependent result (3.7.2).
 */
export async function setCachedVoucherConfig(
  container: MedusaContainer,
  code: string,
  config: unknown,
): Promise<void> {
  const c = cache(container);
  if (!c) return;
  try {
    await c.set(voucherConfigCacheKey(code), config, VOUCHER_CONFIG_CACHE_TTL);
  } catch {
    /* best-effort — a cache write must never break the request (D11). */
  }
}

/** Drop a voucher's cached config (e.g. after an admin edit). */
export async function invalidateVoucherConfig(
  container: MedusaContainer,
  code: string,
): Promise<void> {
  const c = cache(container);
  if (!c) return;
  try {
    await c.invalidate(voucherConfigCacheKey(code));
  } catch {
    /* best-effort. */
  }
}
