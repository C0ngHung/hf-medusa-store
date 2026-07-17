import { defineLink } from "@medusajs/framework/utils";
import PromotionModule from "@medusajs/medusa/promotion";
import VoucherEngineModule from "../modules/voucher-engine";

/**
 * Read-only link: VoucherConfig.promotion_id → Promotion.id.
 *
 * Rebuild Phase 1 (SRS §5.2 "VoucherConfig extends Promotion"). The canonical
 * Promotion is source of truth for code/status/dates/discount type-value as
 * reference; VoucherConfig remains owner of SRS-specific fields (cap, scope,
 * per-user limit, usage tracking). `promotion_id` is populated only by the
 * Promotion-first create/backfill workflows — never client input.
 *
 * This does not replace the per-cart ephemeral Promotion transport (still
 * required through Phase 2, tracked separately in cart.metadata.voucher).
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
