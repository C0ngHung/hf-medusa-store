import type { MedusaContainer } from "@medusajs/framework/types";
import { cache } from "./voucher-cache";
import { VOUCHER_ENGINE_MODULE } from "../modules/voucher-engine";

/**
 * VoucherEngine usage-count foundation (3.7.6, INT-02).
 *
 * Global redemption limit (V3) is enforced against `voucher_config.usage_count`.
 * REDIS_USAGE.md §3 keeps a fast Redis counter that is synced to the DB and
 * re-checked immediately before finalizing at order.placed (anti-over-redemption,
 * EC-03/INT-02), idempotent per voucher+order.
 *
 * DAY 4 SCOPE = FOUNDATION ONLY. This module provides the read/increment helpers;
 * the atomic increment + DB sync + idempotency + V3 re-check are wired by the
 * order.placed workflow in DAY 5 (Hùng). Applying a voucher to a cart MUST NOT
 * increment usage_count — only a placed order does (3.6.11, Day 5).
 *
 * The hard guarantee is the DB (atomic UPDATE … WHERE + optimistic locking,
 * EC-04); the Redis counter here is a fast-read cache that degrades safely when
 * Redis is absent (3.7.7).
 */

/** Fast-read usage counter key for a voucher. */
export function usageCountKey(voucherId: string): string {
  return `voucher:usage:${voucherId}`;
}

/**
 * Current usage count for a voucher. Prefers the Redis fast counter, falling back
 * to the authoritative DB value (voucher_config.usage_count) on miss or when
 * caching is off. The DB is always the source of truth.
 */
export async function getUsageCount(
  container: MedusaContainer,
  voucherId: string,
): Promise<number> {
  const c = cache(container);
  if (c) {
    try {
      const v = await c.get<number>(usageCountKey(voucherId));
      if (typeof v === "number" && Number.isFinite(v)) return v;
    } catch {
      /* fall through to DB. */
    }
  }
  try {
    const service: any = container.resolve(VOUCHER_ENGINE_MODULE);
    const voucher = await service.retrieveVoucherConfig(voucherId);
    return voucher?.usage_count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Increment the fast-read Redis usage counter, seeding it from the DB on first
 * use. Returns the new count, or null when caching is off (caller then relies on
 * the DB atomic increment — Day 5). Best-effort at the cache layer; the DB
 * increment at order.placed is the real atomic guarantee (INT-02).
 */
export async function incrementUsageCount(
  container: MedusaContainer,
  voucherId: string,
): Promise<number | null> {
  const c = cache(container);
  if (!c) return null;
  try {
    const current = await getUsageCount(container, voucherId);
    const next = current + 1;
    await c.set(usageCountKey(voucherId), next);
    return next;
  } catch {
    return null;
  }
}

/** Drop the fast-read counter so the next read re-seeds from the DB. */
export async function invalidateUsageCount(
  container: MedusaContainer,
  voucherId: string,
): Promise<void> {
  const c = cache(container);
  if (!c) return;
  try {
    await c.invalidate(usageCountKey(voucherId));
  } catch {
    /* best-effort. */
  }
}
