import { Modules } from "@medusajs/framework/utils";
import type { MedusaContainer } from "@medusajs/framework/types";

/**
 * Shared cache-module resolver — factored out of `lib/voucher-cache.ts`
 * (`suggestion-cache.ts`, owned by the suggestive-selling track, has an
 * identical resolver that could migrate here too as a follow-up; not
 * touched by this change to stay within the VoucherEngine track).
 *
 * Redis is OPTIONAL (project convention / D11): Medusa always registers a
 * cache module (Redis when REDIS_URL is set, in-memory otherwise), but
 * `resolveCache` degrades to `null` when `Modules.CACHE` cannot be resolved
 * — callers treat that as "caching disabled" and proceed without it.
 */
export interface CacheClient {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, data: unknown, ttl?: number): Promise<void>;
  invalidate(key: string): Promise<void>;
}

export function resolveCache(container: MedusaContainer): CacheClient | null {
  try {
    return container.resolve(Modules.CACHE) as CacheClient;
  } catch {
    return null;
  }
}
