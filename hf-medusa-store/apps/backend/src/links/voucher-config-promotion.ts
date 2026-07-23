import { defineLink } from "@medusajs/framework/utils";
import PromotionModule from "@medusajs/medusa/promotion";
import VoucherEngineModule from "../modules/voucher-engine";

/**
 * Read-only link: VoucherConfig.promotion_id → Promotion.id.
 *
 * Rebuild Phase 1 (SRS §5.2 "VoucherConfig extends Promotion"). The canonical
 * Promotion is the live source of truth for `code`/`discount_type`/
 * `discount_value` only (re-resolved on every read —
 * `workflows/voucher-engine/admin/lib/resolve-voucher-native-fields.ts`); its
 * `limit` additionally seeds `VoucherConfig.usage_limit` once at Enable time
 * (not a runtime overlay — bug-bash fix, 2026-07-21, `usage_limit` is
 * VoucherConfig-owned config per SPEC §5.4/§10/§11.4). `status` and the
 * validity window are NOT derived from the Promotion/Campaign — VoucherConfig
 * owns `is_active` (its own Enable/Disable flag) and `valid_from`/`valid_to`
 * directly. VoucherConfig also remains owner of every other SRS-specific
 * field (cap, scope, per-user limit, segment conditions, usage tracking).
 * `promotion_id` is populated only by the admin Enable/backfill workflows —
 * never client input.
 *
 * The canonical Promotion here is NEVER attached to a cart. VoucherEngine's
 * actual cart-side discount carrier is raw `LineItemAdjustment` rows
 * (Decision-4 carrier rewrite, 2026-07-20,
 * `workflows/voucher-engine/steps/create-voucher-adjustments.ts`) — there is
 * no ephemeral per-cart Promotion anymore (superseded; this comment
 * previously described that now-removed design).
 */
export default defineLink(
  {
    linkable: VoucherEngineModule.linkable.voucherConfig,
    field: "promotion_id",
  },
  PromotionModule.linkable.promotion,
  {
    readOnly: true,
  },
);
