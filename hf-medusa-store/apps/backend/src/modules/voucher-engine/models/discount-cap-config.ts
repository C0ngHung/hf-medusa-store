import { model } from "@medusajs/framework/utils";

/**
 * DiscountCapConfig — global discount cap (SRS §5.3; VOUCH-003).
 *
 * Global singleton (0..1 active row). `max_discount_percentage` is integer
 * BASIS-POINTS (5000 = 50.00%). When no active row exists, the service falls
 * back to DEFAULT_CAP_PCT (4000). The cap is enforced server-side by the
 * StackingEngine (Day 4), trimming only the voucher — never the item promotion.
 */
const DiscountCapConfig = model.define("discount_cap_config", {
  id: model.id().primaryKey(),
  max_discount_percentage: model.number().default(5000),
  is_active: model.boolean().default(true),
  updated_by: model.text().nullable(),
});

export default DiscountCapConfig;
