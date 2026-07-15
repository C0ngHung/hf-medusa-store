import type { MedusaContainer } from "@medusajs/framework/types";
import { cache } from "./voucher-cache";
import { VOUCHER_ENGINE_MODULE } from "../modules/voucher-engine";

/**
 * ⚠️ DEPRECATED / NOT WIRED (Day 5 reconciliation, 2026-07-15) — do NOT use for
 * anti-over-redemption. Kept for history + a documented future optimization
 * path only.
 *
 * This Day-4 foundation implemented the "Redis fast counter synced to DB"
 * branch of SRS INT-02 (which allows *either* "Redis INCR **or** UPDATE…WHERE").
 * The APPROVED design in SPEC §14.3 selected the OTHER branch: the sole
 * authoritative over-redemption guard is the DB conditional
 * `UPDATE voucher_config SET usage_count = usage_count + 1 WHERE
 * usage_count < usage_limit` inside one transaction, plus the unique
 * `(voucher_id, order_id)` index for idempotency — "Redis never authoritative …
 * needs no Redis". That path shipped as
 * `VoucherEngineService.redeemVoucherAtomic` (`modules/voucher-engine/
 * service.ts`), invoked by `recordVoucherUsageWorkflow` on `order.placed`.
 *
 * These helpers are therefore **dead code**: nothing imports them, and wiring
 * them in would create a SECOND source of truth for `usage_count` that
 * contradicts §14.3. Use `redeemVoucherAtomic` for the real guarantee.
 *
 * **Forward-looking (only if flash-sale scale is ever hit):** a hot single
 * voucher whose redemption rate exceeds what one Postgres row can serialize
 * could add a Redis pre-filter — a NON-authoritative "probably-full → reject
 * early" fast check IN FRONT of the DB conditional UPDATE, which stays the final
 * authority. That is an additive change (it never replaces the DB guard, so it
 * cannot reintroduce the double-source-of-truth risk) and does not exist today
 * because the DB path handles current and foreseeable load. Redemption runs at
 * order-placement rate (not a hot read path), so the row hotspot is not a real
 * bottleneck at this scale.
 *
 * Rule reminder (still enforced by the shipped path): applying a voucher to a
 * cart MUST NOT increment usage_count — only a placed order does (Rule 12/13,
 * 3.6.11).
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
