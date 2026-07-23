import { Modules } from "@medusajs/framework/utils";
import type { IPromotionModuleService } from "@medusajs/framework/types";
import { derivePromotionCacheFields } from "./derive-voucher-config-cache-fields";

/**
 * resolveVoucherNativeFields — shared source-of-truth overlay (Admin unified
 * model, strict native-field reuse). Given any persisted `VoucherConfig`-like
 * row with a `promotion_id`, re-resolves `code`/`discount_type`/
 * `discount_value` from the linked canonical Promotion (+`application_method`),
 * overriding the row's own deprecated cache columns for those fields.
 * `valid_from`/`valid_to` are NOT part of this overlay (reverted 2026-07-21)
 * — they are VoucherConfig-owned, admin-editable fields again (no native
 * Promotion date field exists to derive them from; see
 * `derive-voucher-config-cache-fields.ts`'s docstring).
 *
 * `usage_limit` is likewise EXCLUDED from this overlay (bug-bash fix,
 * 2026-07-21 — supersedes rebuild-decisions.md Decision 3, which had made it
 * live-Promotion-derived here): SPEC.md (§5.4 table, §10 V3 row, §11.4 atomic
 * pseudocode) is explicit that `usage_limit` is VoucherConfig-owned
 * configuration, read authoritatively from the column — not overlaid from
 * the Promotion at read time. `derivePromotionCacheFields` still computes a
 * `usage_limit` value (from `Promotion.limit`), but it is used ONLY to SEED
 * `voucher_config.usage_limit` once, at Enable/re-Enable time
 * (`upsert-linked-voucher-config.ts`) — never to override the column
 * afterward. This function drops it from what gets spread onto `voucher`, so
 * the row's own `usage_limit` (already loaded from the DB) survives
 * untouched.
 *
 * Used by BOTH `steps/lookup-voucher.ts` (the cart-apply/validation path)
 * and the admin `GET /admin/promotions/:promotion_id/voucher-config` route
 * (the Promotion Detail widget's read), so the two can never disagree about
 * what's authoritative. `is_active` (VoucherEngine's own persisted
 * Enable/Disable flag) is deliberately never touched here — see
 * `derive-voucher-config-cache-fields.ts`'s docstring.
 */
export async function resolveVoucherNativeFields<
  T extends { promotion_id?: string | null },
>(container: { resolve: (key: string) => any }, voucher: T): Promise<T> {
  if (!voucher.promotion_id) return voucher;

  const promotionService: IPromotionModuleService = container.resolve(
    Modules.PROMOTION,
  );

  let promotion;
  try {
    promotion = await promotionService.retrievePromotion(voucher.promotion_id, {
      relations: ["application_method"],
    });
  } catch {
    return voucher;
  }
  if (!promotion) return voucher;

  // usage_limit deliberately dropped — see docstring above (Enable-time seed
  // only, never a runtime overlay).
  const { usage_limit: _usageLimit, ...derived } = derivePromotionCacheFields(
    promotion as any,
  );
  return { ...voucher, ...derived };
}

export default resolveVoucherNativeFields;
