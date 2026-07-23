/**
 * reapStaleEphemeralPromotions — Backend-5B-2 (SPEC Decision G, §14.2-A).
 *
 * Finds `VEPH-*` ephemeral Promotions older than
 * `EPHEMERAL_PROMOTION_MAX_AGE_DAYS` and soft-deletes them. Covers the one
 * gap Backend-5B-1 (post-redemption cleanup) and the existing remove/
 * replace/revalidate cleanup don't: a cart whose voucher was applied and
 * then simply abandoned — never checked out, never explicitly removed,
 * never mutated again (a cart mutation would have triggered
 * `revalidateVoucherOnCartChange`, which replaces the ephemeral Promotion
 * with a fresh one — so an ephemeral Promotion's own `created_at` age IS an
 * accurate proxy for "this cart hasn't been touched since," and a separate
 * cart-activity check is not needed).
 *
 * Deliberate scope tradeoff — soft-delete only, no cart detach: an earlier
 * version of this function tried to find and detach the referencing cart
 * first (mirroring `removeVoucherWorkflow`'s pattern) via
 * `query.graph({entity:"cart", filters:{promotions:{id:[...]}}})`. That
 * throws at runtime — "Trying to query by not existing property
 * Cart.promotions" (confirmed empirically against the installed
 * `@medusajs/cart`/query layer this session) — the remote-query layer does
 * not support filtering Cart by its linked Promotions this way, and finding
 * an alternative (e.g. a raw `cart_promotion` link-table query) is a deeper
 * investigation than this slice's scope. Per the task's own documented
 * fallback for exactly this situation, this function only soft-deletes the
 * stale Promotion; it does not touch the cart. Residual effect: if a
 * customer somehow returns to a cart abandoned for >
 * `EPHEMERAL_PROMOTION_MAX_AGE_DAYS`, `cart.metadata.voucher` still points
 * at a now-deleted Promotion — the cart's own total recompute simply won't
 * find that adjustment anymore (the discount silently stops applying), not
 * a data-integrity problem, just a stale pointer a future slice could clean
 * up once the cart-by-promotion query is solved.
 *
 * Every row is handled independently and non-fatally: one row's delete
 * failure is logged and does not stop the rest of the batch. Safe to
 * re-run — an already-deleted Promotion is simply absent from the next
 * run's query (nothing to no-op against).
 */

import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { deletePromotionsWorkflow } from "@medusajs/core-flows";
import type { MedusaContainer } from "@medusajs/framework/types";
import { EPHEMERAL_PROMOTION_MAX_AGE_DAYS } from "../../../modules/voucher-engine/constants";

const EPHEMERAL_CODE_PREFIX = "VEPH-";
const BATCH_SIZE = 200;

export interface ReapEphemeralPromotionsResult {
  scanned: number;
  deleted: number;
  skipped: number;
  failed: number;
}

interface StalePromotion {
  id: string;
  code: string;
}

export async function reapStaleEphemeralPromotions(
  container: MedusaContainer,
  maxAgeDays: number = EPHEMERAL_PROMOTION_MAX_AGE_DAYS,
): Promise<ReapEphemeralPromotionsResult> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);

  // `created_at` is not part of the Promotion module service's own
  // `FilterablePromotionProps` type (verified: `@medusajs/types`
  // `promotion/common/promotion.d.ts` — no `created_at` field at all), but
  // it IS a universally-supported filter through the remote query layer —
  // same pattern already used in `jobs/compute-category-top-sellers.ts`
  // (`query.graph({..., filters: { created_at: { $gte } } })`). Only
  // `VEPH-*` rows, only older than the cutoff — never a canonical voucher
  // Promotion (arbitrary merchant-chosen code) or a normal one.
  const { data: staleData } = await query.graph({
    entity: "promotion",
    filters: {
      code: { $like: `${EPHEMERAL_CODE_PREFIX}%` },
      created_at: { $lt: cutoff },
    } as Record<string, unknown>,
    fields: ["id", "code"],
    pagination: { take: BATCH_SIZE, skip: 0 },
  });
  const stale = staleData as StalePromotion[];

  const result: ReapEphemeralPromotionsResult = {
    scanned: stale.length,
    deleted: 0,
    skipped: 0,
    failed: 0,
  };

  if (stale.length === 0) {
    logger.info(
      `[voucher-engine] ephemeral Promotion reap: 0 stale rows (>${maxAgeDays}d, prefix "${EPHEMERAL_CODE_PREFIX}")`,
    );
    return result;
  }

  for (const promotion of stale) {
    try {
      await deletePromotionsWorkflow(container).run({
        input: { ids: [promotion.id] },
      });
      result.deleted += 1;
    } catch (err) {
      // Non-fatal: one row's failure (e.g. already deleted by a concurrent
      // run, or an unexpected error) must never stop the rest of the batch.
      result.failed += 1;
      logger.warn(
        `[voucher-engine] ephemeral Promotion reap: delete failed for promotion_id=${promotion.id} (non-fatal, continuing batch) ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  logger.info(
    `[voucher-engine] ephemeral Promotion reap: scanned=${result.scanned} deleted=${result.deleted} skipped=${result.skipped} failed=${result.failed} (>${maxAgeDays}d, prefix "${EPHEMERAL_CODE_PREFIX}")`,
  );

  return result;
}
