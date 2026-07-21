/**
 * SRS compliance review (2026-07-21) — VOUCH-001..005 (SRS §4 Functional
 * Requirements) and EC-01..10 (SRS §8 Edge Cases), re-derived directly from
 * `docs/Phan-tich-SRS-Suggestive-Selling-Voucher.md` §2.4.2/§2.4.3 rather than
 * copied from the existing suites, for independent traceability.
 *
 * Companion to, NOT a replacement for:
 *  - modules/voucher-engine/lib/__tests__/calculate-discount.unit.spec.ts (already
 *    pins both SRS VOUCH-003 worked examples and the full discount_capped matrix)
 *  - workflows/voucher-engine/__tests__/validators.unit.spec.ts (V1-V7 chain)
 *  - workflows/voucher-engine/__tests__/revalidate-voucher.unit.spec.ts (V1/V2/V5/V6 subset)
 *  - workflows/voucher-engine/__tests__/rate-limit-policy.unit.spec.ts (EC-10)
 *  - workflows/voucher-engine/__tests__/auto-remove-notice.unit.spec.ts (VOUCHER_AUTO_REMOVED wording)
 *
 * Some tests below are marked "KNOWN GAP" or "REGRESSION GUARD" — they pin the
 * CURRENT behavior of a spot this review found does not (or may not) fully
 * satisfy the SRS text, rather than asserting the SRS requirement is met. See
 * this session's review summary for the full write-up.
 */
import {
  LineValue,
  calculateVoucherDiscount,
  resolveEligibleItems,
} from "../../../modules/voucher-engine/lib/calculate-discount";
import { DEFAULT_CAP_PCT } from "../../../modules/voucher-engine/constants";
import { resolveVoucherNativeFields } from "../admin/lib/resolve-voucher-native-fields";
import { buildAutoRemoveNotice } from "../lib/auto-remove-notice";
import { revalidateVoucherOnCartChange } from "../lib/revalidate-voucher";
import type { CartSnapshot, VoucherSnapshot } from "../lib/types";
import { v4UserLimit } from "../lib/validators";

const GLOBAL_CAP_BPS = DEFAULT_CAP_PCT; // 5000 = 50%, SRS §5.2 DiscountCapConfig default

// ── VOUCH-003 (SRS §4, "business rule phức tạp nhất hệ thống") ──────────────
describe("SRS VOUCH-003 (§4) — worked numeric examples, re-derived from the SRS text", () => {
  it("happy path: racket 4,500,000 @20% promo + strings 200,000 (no promo) + SAVE10 (10%, unscoped, no own cap) -> pay 3,420,000", () => {
    const lines: LineValue[] = [
      {
        line_id: "racket",
        unit_price: 4_500_000,
        quantity: 1,
        item_promotion_discount: 900_000,
        is_eligible: true,
      },
      {
        line_id: "strings",
        unit_price: 200_000,
        quantity: 1,
        item_promotion_discount: 0,
        is_eligible: true,
      },
    ];

    const result = calculateVoucherDiscount({
      lines,
      discount_type: "percentage",
      discount_value: 1000, // 10%
      max_discount_amount: null,
      global_cap_bps: GLOBAL_CAP_BPS,
    });

    expect(result.original_subtotal).toBe(4_700_000);
    expect(result.post_promotion_subtotal).toBe(3_800_000);
    expect(result.raw_voucher_discount).toBe(380_000);
    expect(result.final_voucher_discount).toBe(380_000);
    expect(result.discount_capped).toBe(false);
    expect(result.combined_discount).toBe(1_280_000); // 27.2% of 4,700,000 < 50%
    expect(result.expected_final_cart_total).toBe(3_420_000);
  });

  it("cap-exceeded path: racket @40% promo + strings @30% promo + MEGA20 (20%) -> voucher cut to 490,000, pay 2,350,000", () => {
    const lines: LineValue[] = [
      {
        line_id: "racket",
        unit_price: 4_500_000,
        quantity: 1,
        item_promotion_discount: 1_800_000,
        is_eligible: true,
      },
      {
        line_id: "strings",
        unit_price: 200_000,
        quantity: 1,
        item_promotion_discount: 60_000,
        is_eligible: true,
      },
    ];

    const result = calculateVoucherDiscount({
      lines,
      discount_type: "percentage",
      discount_value: 2000, // 20%
      max_discount_amount: null,
      global_cap_bps: GLOBAL_CAP_BPS,
    });

    expect(result.item_promotion_discount).toBe(1_860_000);
    expect(result.raw_voucher_discount).toBe(568_000);
    expect(result.maximum_combined_discount).toBe(2_350_000);
    expect(result.final_voucher_discount).toBe(490_000);
    expect(result.discount_capped).toBe(true);
    expect(result.cap_explanation?.message_vi).toContain("568.000");
    expect(result.cap_explanation?.message_vi).toContain("490.000");
    expect(result.expected_final_cart_total).toBe(2_350_000);
  });
});

// ── VOUCH-001 (SRS §4) ───────────────────────────────────────────────────────
describe("SRS VOUCH-001 (§4) — AC worked example: SHUTTLE20 scoped 20% off Shuttlecocks, min 200k, max-discount 100k", () => {
  it("only discounts the Shuttlecocks-scoped line: Mavis 350 (150,000) + Astrox 99 Pro (4,500,000) -> 30,000 discount, pay 4,620,000", () => {
    const lines: LineValue[] = [
      {
        line_id: "mavis350",
        unit_price: 150_000,
        quantity: 1,
        item_promotion_discount: 0,
        product_id: "prod_mavis350",
        category_ids: ["cat_shuttlecocks"],
        is_eligible: false,
      },
      {
        line_id: "astrox99pro",
        unit_price: 4_500_000,
        quantity: 1,
        item_promotion_discount: 0,
        product_id: "prod_astrox99pro",
        category_ids: ["cat_rackets"],
        is_eligible: false,
      },
    ];

    const scoped = resolveEligibleItems(lines, {
      product_ids: [],
      category_ids: ["cat_shuttlecocks"],
    });

    const result = calculateVoucherDiscount({
      lines: scoped,
      discount_type: "percentage",
      discount_value: 2000, // 20%
      max_discount_amount: 100_000,
      global_cap_bps: GLOBAL_CAP_BPS,
    });

    expect(result.eligible_post_promotion_subtotal).toBe(150_000);
    expect(result.final_voucher_discount).toBe(30_000);
    expect(result.discount_capped).toBe(false); // neither the 100k own-cap nor the global cap binds
    expect(result.expected_final_cart_total).toBe(4_620_000);
  });
});

// ── EC-01 (SRS §8) ────────────────────────────────────────────────────────────
describe("SRS EC-01 (§8) — item promo + voucher approaching the 50% global cap", () => {
  it("stays under the cap when the combined discount is <= 50% -> cap does not fire", () => {
    // 1,000,000 item, 30% promo (300,000); voucher 20% on the 700,000 post-promo value = 140,000.
    // combined = 440,000 / 1,000,000 = 44% < 50% -> no cap.
    const lines: LineValue[] = [
      {
        line_id: "item",
        unit_price: 1_000_000,
        quantity: 1,
        item_promotion_discount: 300_000,
        is_eligible: true,
      },
    ];

    const result = calculateVoucherDiscount({
      lines,
      discount_type: "percentage",
      discount_value: 2000, // 20%
      max_discount_amount: null,
      global_cap_bps: GLOBAL_CAP_BPS,
    });

    expect(result.discount_capped).toBe(false);
    expect(result.final_voucher_discount).toBe(140_000);
    expect(result.combined_discount).toBe(440_000);
  });

  it("cap fires once combined crosses 50% — only the voucher is cut, the item promotion is untouched (Rule 10/11)", () => {
    // Same item, promo raised to 35% (350,000): remaining headroom to the 50%
    // cap is only 150,000. Voucher raised to 30% of the 650,000 post-promo
    // value = 195,000, which exceeds that headroom.
    const lines: LineValue[] = [
      {
        line_id: "item",
        unit_price: 1_000_000,
        quantity: 1,
        item_promotion_discount: 350_000,
        is_eligible: true,
      },
    ];

    const result = calculateVoucherDiscount({
      lines,
      discount_type: "percentage",
      discount_value: 3000, // 30%
      max_discount_amount: null,
      global_cap_bps: GLOBAL_CAP_BPS,
    });

    expect(result.item_promotion_discount).toBe(350_000); // never reduced
    expect(result.raw_voucher_discount).toBe(195_000);
    expect(result.final_voucher_discount).toBe(150_000); // cut to exactly the remaining headroom
    expect(result.discount_capped).toBe(true);
    expect(result.combined_discount).toBe(500_000); // exactly the 50% cap threshold
  });
});

// ── EC-03 (SRS §8) ────────────────────────────────────────────────────────────
describe("SRS EC-03 (§8) — cart total must stay > 0 (minimum 1 VND) once the cap is enforced", () => {
  it("holds in the SRS's own scenario: item promo alone exactly at the 50% cap boundary", () => {
    const lines: LineValue[] = [
      {
        line_id: "item",
        unit_price: 4_700_000,
        quantity: 1,
        item_promotion_discount: 2_350_000, // exactly 50%
        is_eligible: true,
      },
    ];

    const result = calculateVoucherDiscount({
      lines,
      discount_type: "percentage",
      discount_value: 5000, // 50%
      max_discount_amount: null,
      global_cap_bps: GLOBAL_CAP_BPS,
    });

    expect(result.final_voucher_discount).toBe(0); // voucher fully absorbed by the cap
    expect(result.expected_final_cart_total).toBe(2_350_000);
    expect(result.expected_final_cart_total).toBeGreaterThan(0);
  });

  it("KNOWN GAP: a single item-level automatic Promotion that alone reaches 100% of a line (e.g. a native 'buy-1-get-1-free' style adjustment) drives the total to EXACTLY 0, not the SRS's literal >=1 VND floor — Rule 10/11 forbids the cap from ever reducing the item promotion, so there is nothing left to enforce a minimum with. Tracked as `[NEEDS_VERIFICATION #13]` in calculate-discount.ts; not exercised by the existing SRS worked examples, which never push item promo alone past the cap threshold.", () => {
    const lines: LineValue[] = [
      {
        line_id: "item",
        unit_price: 1_000_000,
        quantity: 1,
        item_promotion_discount: 1_000_000, // the whole line, by the item promotion alone
        is_eligible: true,
      },
    ];

    const result = calculateVoucherDiscount({
      lines,
      discount_type: "percentage",
      discount_value: 1000, // irrelevant — will be fully zeroed by the cap either way
      max_discount_amount: null,
      global_cap_bps: GLOBAL_CAP_BPS,
    });

    expect(result.final_voucher_discount).toBe(0);
    // If a future decision adds a hard `>= 1 VND` floor, this line must change to
    // `toBeGreaterThanOrEqual(1)` and the "KNOWN GAP" framing above removed.
    expect(result.expected_final_cart_total).toBe(0);
  });
});

// ── VOUCH-005 / EC-02 (SRS §4 / §8) ──────────────────────────────────────────
describe("SRS VOUCH-005 / EC-02 (§4/§8) — voucher auto-removed when its only eligible items leave the cart", () => {
  it("full pipeline: revalidateVoucherOnCartChange fails V6, buildAutoRemoveNotice explains why", () => {
    const voucher: VoucherSnapshot = {
      code: "STRING20",
      is_active: true,
      valid_from: new Date("2026-01-01T00:00:00Z"),
      valid_to: new Date("2026-12-31T00:00:00Z"),
      usage_limit: null,
      usage_count: 0,
      per_user_limit: 1,
      min_order_value: null,
      applicable_product_ids: null,
      applicable_category_ids: ["cat_strings"],
      user_segment_conditions: null,
    };
    // The customer removed the (suggestion-added) strings item — only a
    // racket, outside the voucher's scope, remains.
    const cart: CartSnapshot = {
      original_subtotal: 4_500_000,
      items: [
        {
          product_id: "prod_racket",
          category_ids: ["cat_rackets"],
          quantity: 1,
          unit_price: 4_500_000,
        },
      ],
      has_item_promotion: false,
    };

    const revalidation = revalidateVoucherOnCartChange({
      voucher,
      now: new Date("2026-06-01T00:00:00Z"),
      cart,
      user_usage_count: 0,
    });

    expect(revalidation.ok).toBe(false);
    if (revalidation.ok) throw new Error("expected revalidation to fail V6");
    expect(revalidation.code).toBe("VOUCHER_NO_ELIGIBLE_ITEMS");

    const notice = buildAutoRemoveNotice({
      voucher_code: voucher.code,
      failure_code: revalidation.code,
    });

    expect(notice.code).toBe("VOUCHER_AUTO_REMOVED");
    expect(notice.reason_code).toBe("VOUCHER_NO_ELIGIBLE_ITEMS");
    expect(notice.customer_message).toContain("STRING20");
  });
});

// ── EC-06 (SRS §8) ────────────────────────────────────────────────────────────
describe("SRS EC-06 (§8) — apply -> remove -> re-apply in the same session, per_user_limit=1", () => {
  it("v4UserLimit never accumulates from apply/remove — only a real redemption (order.placed) increases user_usage_count", () => {
    const voucher: VoucherSnapshot = {
      code: "ONCE1",
      is_active: true,
      valid_from: new Date("2020-01-01T00:00:00Z"),
      valid_to: new Date("2999-01-01T00:00:00Z"),
      usage_limit: null,
      usage_count: 0,
      per_user_limit: 1,
      min_order_value: null,
      applicable_product_ids: null,
      applicable_category_ids: null,
      user_segment_conditions: null,
    };

    // apply (count still 0 — no VoucherUsageLog row exists yet)
    expect(v4UserLimit(voucher, 0).ok).toBe(true);
    // remove — removeVoucherWorkflow never touches usage_count/usage log (Rule 12/13)
    // re-apply, same session — count is STILL 0, so it still passes (EC-06, by design)
    expect(v4UserLimit(voucher, 0).ok).toBe(true);

    // Contrast: only once an order is actually placed does the count become 1,
    // and V4 then correctly blocks a second real redemption.
    const afterRealRedemption = v4UserLimit(voucher, 1);
    expect(afterRealRedemption.ok).toBe(false);
    if (!afterRealRedemption.ok) {
      expect(afterRealRedemption.code).toBe("VOUCHER_PER_USER_LIMIT_REACHED");
    }
  });
});

// ── Admin unified model / "My Vouchers" source-of-truth overlay ─────────────
describe("resolveVoucherNativeFields — source-of-truth overlay used by the real apply-time lookup", () => {
  it("overrides the deprecated voucher_config cache columns with the linked Promotion's live values", async () => {
    const fakePromotionService = {
      retrievePromotion: async () => ({
        code: "NEWCODE20",
        application_method: { type: "percentage", value: 25 },
        campaign: {
          starts_at: "2026-01-01T00:00:00Z",
          ends_at: "2026-12-31T00:00:00Z",
          budget: { type: "usage", limit: 500 },
        },
      }),
    };
    const fakeContainer = { resolve: () => fakePromotionService };

    const stale = {
      promotion_id: "promo_1",
      code: "OLDCODE10",
      discount_value: 1000,
    };

    const resolved = await resolveVoucherNativeFields(
      fakeContainer as never,
      stale,
    );

    // This is exactly the overlay `steps/lookup-voucher.ts` relies on for every
    // apply-time V1/V2/discount-calc read (including cache hits) — pinning it
    // here protects that guarantee. See the review note below for the route
    // that does NOT get this protection.
    expect(resolved.code).toBe("NEWCODE20");
    expect(resolved.discount_value).toBe(2500); // 25% -> 2500 bps, not the stale 1000
  });

  it("is a no-op passthrough when the row has no linked promotion_id (legacy/atomic-create vouchers)", async () => {
    const fakeContainer = {
      resolve: () => ({ retrievePromotion: async () => null }),
    };
    const standalone = { promotion_id: null, code: "STANDALONE1" };
    const resolved = await resolveVoucherNativeFields(
      fakeContainer as never,
      standalone,
    );
    expect(resolved).toEqual(standalone);
  });
});

/**
 * REVIEW FINDING (not asserted by a runtime test — see this session's summary
 * for detail): `api/store/customers/me/vouchers/route.ts` ("My Vouchers",
 * VOUCH-001b) reads `code`/`discount_type`/`discount_value`/`valid_from`/
 * `valid_to` straight off the raw `voucher_config` row and never calls
 * `resolveVoucherNativeFields` above — unlike `steps/lookup-voucher.ts` (the
 * real apply-time path) and the admin `GET .../voucher-config` route, which
 * both do. There is no promotion-UPDATED hook (only a promotion-CREATED one,
 * `workflows/hooks/voucher-config-promotion-created.ts`) to keep the cache
 * columns in sync afterwards, so any native Promotion edit made after voucher
 * creation (code rename, discount change, validity window change) can make
 * "My Vouchers" show something the real apply call will not honor. This can't
 * be pinned as a pure-function unit test without mocking the whole HTTP route
 * — see the manual test script for a concrete repro.
 */
