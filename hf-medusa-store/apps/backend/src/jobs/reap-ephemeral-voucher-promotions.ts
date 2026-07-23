import { MedusaContainer } from "@medusajs/framework/types";
import { reapStaleEphemeralPromotions } from "../workflows/voucher-engine/lib/reap-ephemeral-promotions";

/**
 * Scheduled job — Backend-5B-2. Reaps `VEPH-*` ephemeral Promotions from
 * abandoned carts (applied, then never checked out, removed, or revalidated)
 * once they're older than `EPHEMERAL_PROMOTION_MAX_AGE_DAYS`. See
 * `lib/reap-ephemeral-promotions.ts` for the actual logic — this wrapper is
 * intentionally thin, same convention as `compute-category-top-sellers.ts`.
 */
export default async function reapEphemeralVoucherPromotions(
  container: MedusaContainer,
) {
  await reapStaleEphemeralPromotions(container);
}

export const config = {
  name: "reap-ephemeral-voucher-promotions",
  schedule: "0 3 * * *", // daily at 03:00 — low-urgency cleanup, off-peak
};
