/**
 * derivePromotionCacheFields — pure mapping, "Enable VoucherEngine on an
 * existing Promotion" (Admin unified model).
 *
 * `VoucherConfig` still has non-null `code`/`discount_type`/`discount_value`
 * columns and a legacy `usage_limit` column (kept as deprecated/denormalized
 * cache — not physically dropped, since no approved column-removal migration
 * exists yet). For a voucher created via Enable-on-existing-Promotion there is
 * no admin form input for these three — the whole point of the unified model
 * is that they are never re-entered — so this function derives them FROM the
 * canonical Promotion's own fields, the exact inverse of
 * `build-promotion-input.ts`'s `buildPromotionData`.
 *
 * `is_active` is deliberately NOT derived here (unlike an earlier revision
 * of this function). It is VoucherEngine's OWN persisted Enable/Disable
 * flag — a genuine VoucherEngine-only concept ("is VoucherEngine turned on
 * for this Promotion", independent of the Promotion's own native
 * `status`) — set explicitly by the Enable/Disable workflows
 * (`admin/attach-voucher-config.ts`, `admin/disable-voucher-config.ts`),
 * never overwritten by this derivation. This is also what makes V1's
 * `voucher.is_active` check in `lib/validators.ts` correctly implement
 * "reject a disabled Voucher at the cart-code endpoint" (Admin unified
 * model, cart-code behavior requirement).
 *
 * `valid_from`/`valid_to` are NO LONGER derived here (reverted 2026-07-21,
 * code-review finding): `Promotion` has no native date field at all — only
 * an attached `Campaign` has `starts_at`/`ends_at`
 * (`@medusajs/types/dist/promotion/common/campaign.d.ts`), which is a
 * SHARED window across every Promotion in that Campaign, not a per-voucher
 * one. Requiring a dedicated 1:1 Campaign per voucher just to give it its
 * own dates was heavier UX than the plain per-voucher datetime columns SRS
 * §5.2 already puts directly on `VoucherConfig`. `valid_from`/`valid_to` are
 * therefore VoucherConfig-owned, authoritative, admin-editable fields again
 * (see the Enable-VoucherEngine form/validators/workflow input) — never
 * overlaid from any Promotion/Campaign at read time.
 *
 * `usage_limit` IS derived here, from the native `Promotion.limit` field
 * (`PromotionDTO.limit`, `@medusajs/types/dist/promotion/common/promotion.d.ts`
 * — "The maximum number of times this promotion can be used across all
 * orders"), as a ONE-TIME SEED for `voucher_config.usage_limit` at
 * Enable/re-Enable time — bug-bash fix, 2026-07-21: SPEC.md (§5.4, §10 V3,
 * §11.4) is explicit that `usage_limit` is VoucherConfig-owned config, read
 * authoritatively from the column at runtime, which supersedes
 * rebuild-decisions.md's Decision 3 (2026-07-20, which had made it a live
 * runtime overlay from the Promotion instead — see
 * `resolve-voucher-native-fields.ts`'s current docstring for why that overlay
 * was removed). Seeding from `Promotion.limit` here is only a UX convenience
 * so an admin doesn't have to enter the same number twice (once on the native
 * Promotion, once for VoucherConfig) — after Enable, editing the Promotion's
 * `limit` no longer changes what V3/redemption enforce. `Promotion.used` (the
 * native counter) is NOT read anywhere — VoucherEngine never calls
 * `registerUsage` (its own adjustments always carry `code: null`, see
 * `steps/create-voucher-adjustments.ts`), so `usage_count` stays the sole
 * authoritative counter.
 *
 * `code`/`discount_type`/`discount_value` are still live-overlaid from the
 * Promotion on every read (`resolveVoucherNativeFields`, unchanged) — only
 * `usage_limit`'s ownership changed. These three still populate their
 * columns here ONLY for schema/back-compat.
 */

export interface PromotionForCacheDerivation {
  code?: string | null;
  status?: string;
  /** Native per-promotion usage cap (`PromotionDTO.limit`) — no Campaign needed. */
  limit?: number | null;
  application_method?: {
    type?: string;
    value?: number;
  } | null;
}

export interface DerivedVoucherConfigCacheFields {
  code: string;
  discount_type: "percentage" | "fixed_amount";
  discount_value: number;
  /** Native-sourced (`Promotion.limit`); `null` = unlimited (no native limit set). */
  usage_limit: number | null;
}

export function derivePromotionCacheFields(
  promotion: PromotionForCacheDerivation,
): DerivedVoucherConfigCacheFields {
  const code = (promotion.code ?? "").trim().toUpperCase();

  const isPercentage = promotion.application_method?.type === "percentage";
  const rawValue = promotion.application_method?.value ?? 0;
  const discount_type: "percentage" | "fixed_amount" = isPercentage
    ? "percentage"
    : "fixed_amount";
  // Inverse of buildPromotionData: percentage Promotion value is a plain
  // percent (e.g. 20 for 20%); VoucherConfig stores basis points (2000).
  // Fixed Promotion value is already raw VND, stored as-is.
  const discount_value = isPercentage
    ? Math.round(rawValue * 100)
    : Math.round(rawValue);

  const usage_limit = promotion.limit ?? null;

  return {
    code,
    discount_type,
    discount_value,
    usage_limit,
  };
}
