/**
 * VoucherEngine V1–V8 validation chain unit tests (VOUCH-002; T-VOUCH-02..06).
 * Pure — no Medusa runtime, no DB. Fixtures built via local factories; assertions
 * check pass/fail, error code, verbatim Vietnamese message, details, and boundaries.
 */
import { VOUCHER_ERRORS } from "../lib/errors";
import type {
  CartSnapshot,
  VoucherSnapshot,
  VoucherValidationContext,
} from "../lib/types";
import { validateVoucher } from "../lib/validate-voucher";
import {
  CODE_FORMAT,
  v1Exists,
  v2Window,
  v3GlobalLimit,
  v4UserLimit,
  v5MinOrder,
  v6Scope,
  v7Segment,
  v8Stacking,
  validateCodeFormat,
} from "../lib/validators";

// ── Fixtures ───────────────────────────────────────────────────────────────
const NOW = new Date("2026-07-14T00:00:00.000Z");

function voucher(overrides: Partial<VoucherSnapshot> = {}): VoucherSnapshot {
  return {
    code: "SAVE10",
    is_active: true,
    valid_from: new Date("2026-01-01T00:00:00.000Z"),
    valid_to: new Date("2026-12-31T23:59:59.000Z"),
    usage_limit: null,
    usage_count: 0,
    per_user_limit: 1,
    min_order_value: null,
    applicable_product_ids: null,
    applicable_category_ids: null,
    user_segment_conditions: null,
    stackable_with_promotions: true,
    ...overrides,
  };
}

function cart(overrides: Partial<CartSnapshot> = {}): CartSnapshot {
  return {
    original_subtotal: 1_000_000,
    items: [
      {
        product_id: "prod_A",
        category_ids: ["cat_racket"],
        quantity: 1,
        unit_price: 1_000_000,
      },
    ],
    has_item_promotion: false,
    ...overrides,
  };
}

function context(
  overrides: Partial<VoucherValidationContext> = {},
): VoucherValidationContext {
  return {
    voucher: voucher(),
    now: NOW,
    cart: cart(),
    user_usage_count: 0,
    ...overrides,
  };
}

// ── Code format (3.2.2) ──────────────────────────────────────────────────────
describe("VoucherEngine · code format (3.2.2)", () => {
  it("accepts 6+ uppercase alphanumerics after normalize", () => {
    expect(validateCodeFormat(" save10 ")).toEqual({ ok: true });
    expect(CODE_FORMAT.test("SHUTTLE20")).toBe(true);
  });

  it("rejects too-short / non-alnum, collapsing to VOUCHER_NOT_FOUND", () => {
    const r = validateCodeFormat("AB1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("VOUCHER_NOT_FOUND");
    expect(validateCodeFormat("SAVE-10").ok).toBe(false);
    expect(validateCodeFormat("").ok).toBe(false);
  });
});

// ── V1 exists+active (3.2.4) ─────────────────────────────────────────────────
describe("VoucherEngine · V1 exists+active (3.2.4)", () => {
  it("null voucher ⇒ NOT_FOUND (404)", () => {
    const r = v1Exists(null);
    expect(r).toMatchObject({
      ok: false,
      code: "VOUCHER_NOT_FOUND",
      http_status: 404,
    });
  });

  it("inactive voucher ⇒ INACTIVE (422), same message as NOT_FOUND", () => {
    const r = v1Exists(voucher({ is_active: false }));
    expect(r).toMatchObject({
      ok: false,
      code: "VOUCHER_INACTIVE",
      http_status: 422,
    });
    if (!r.ok) {
      expect(r.customer_message).toBe(
        "Mã giảm giá không đúng. Bạn kiểm tra lại giúp nhé!",
      );
      expect(r.customer_message).toBe(
        VOUCHER_ERRORS.VOUCHER_NOT_FOUND.customer_message,
      );
    }
  });

  it("active voucher passes", () => {
    expect(v1Exists(voucher())).toEqual({ ok: true });
  });
});

// ── V2 date window (3.2.5) ───────────────────────────────────────────────────
describe("VoucherEngine · V2 date window (3.2.5)", () => {
  it("before valid_from ⇒ NOT_YET_VALID", () => {
    const v = voucher({ valid_from: new Date("2026-08-01T00:00:00.000Z") });
    expect(v2Window(v, NOW)).toMatchObject({
      ok: false,
      code: "VOUCHER_NOT_YET_VALID",
    });
  });

  it("after valid_to ⇒ EXPIRED", () => {
    const v = voucher({ valid_to: new Date("2026-07-13T00:00:00.000Z") });
    expect(v2Window(v, NOW)).toMatchObject({
      ok: false,
      code: "VOUCHER_EXPIRED",
    });
  });

  it("inclusive boundaries: now == valid_from and now == valid_to both pass", () => {
    expect(v2Window(voucher({ valid_from: NOW }), NOW)).toEqual({ ok: true });
    expect(v2Window(voucher({ valid_to: NOW }), NOW)).toEqual({ ok: true });
  });
});

// ── V3 global limit (3.2.6) ──────────────────────────────────────────────────
describe("VoucherEngine · V3 global usage limit (3.2.6)", () => {
  it("usage_count >= usage_limit ⇒ USAGE_LIMIT_REACHED", () => {
    expect(
      v3GlobalLimit(voucher({ usage_limit: 100, usage_count: 100 })),
    ).toMatchObject({
      ok: false,
      code: "VOUCHER_USAGE_LIMIT_REACHED",
    });
  });

  it("null usage_limit ⇒ unlimited ⇒ pass", () => {
    expect(
      v3GlobalLimit(voucher({ usage_limit: null, usage_count: 9999 })),
    ).toEqual({ ok: true });
  });

  it("under limit passes", () => {
    expect(
      v3GlobalLimit(voucher({ usage_limit: 100, usage_count: 99 })),
    ).toEqual({ ok: true });
  });
});

// ── V4 per-user limit (3.2.7) ────────────────────────────────────────────────
describe("VoucherEngine · V4 per-user limit (3.2.7)", () => {
  it("user_usage >= per_user_limit ⇒ PER_USER_LIMIT_REACHED with details", () => {
    const r = v4UserLimit(voucher({ per_user_limit: 1 }), 1);
    expect(r).toMatchObject({
      ok: false,
      code: "VOUCHER_PER_USER_LIMIT_REACHED",
    });
    if (!r.ok) expect(r.details).toEqual({ count: 1, limit: 1 });
  });

  it("under per-user limit passes", () => {
    expect(v4UserLimit(voucher({ per_user_limit: 3 }), 2)).toEqual({
      ok: true,
    });
  });
});

// ── V5 min order (3.2.8) ─────────────────────────────────────────────────────
describe("VoucherEngine · V5 min order value (3.2.8)", () => {
  it("subtotal < min ⇒ MIN_ORDER_NOT_MET with integer remaining", () => {
    const r = v5MinOrder(
      voucher({ min_order_value: 200_000 }),
      cart({ original_subtotal: 150_000 }),
    );
    expect(r).toMatchObject({ ok: false, code: "VOUCHER_MIN_ORDER_NOT_MET" });
    if (!r.ok)
      expect(r.details).toEqual({
        remaining: 50_000,
        min_order_value: 200_000,
      });
  });

  it("subtotal == min ⇒ pass (boundary)", () => {
    expect(
      v5MinOrder(
        voucher({ min_order_value: 200_000 }),
        cart({ original_subtotal: 200_000 }),
      ),
    ).toEqual({ ok: true });
  });

  it("null min_order_value ⇒ pass", () => {
    expect(
      v5MinOrder(
        voucher({ min_order_value: null }),
        cart({ original_subtotal: 1 }),
      ),
    ).toEqual({
      ok: true,
    });
  });
});

// ── V6 scope (3.2.9) ─────────────────────────────────────────────────────────
describe("VoucherEngine · V6 item scope (3.2.9)", () => {
  it("unscoped (both null) ⇒ all eligible ⇒ pass", () => {
    expect(v6Scope(voucher(), cart())).toEqual({ ok: true });
  });

  it("category scope match ⇒ pass", () => {
    const v = voucher({ applicable_category_ids: ["cat_racket"] });
    expect(v6Scope(v, cart())).toEqual({ ok: true });
  });

  it("product scope match ⇒ pass", () => {
    const v = voucher({ applicable_product_ids: ["prod_A"] });
    expect(v6Scope(v, cart())).toEqual({ ok: true });
  });

  it("scoped but no matching item ⇒ NO_ELIGIBLE_ITEMS", () => {
    const v = voucher({ applicable_category_ids: ["cat_shuttlecock"] });
    const r = v6Scope(v, cart());
    expect(r).toMatchObject({ ok: false, code: "VOUCHER_NO_ELIGIBLE_ITEMS" });
    if (!r.ok)
      expect(r.details).toEqual({ applicable_categories: ["cat_shuttlecock"] });
  });
});

// ── V7 segment (3.2.10) — stub ───────────────────────────────────────────────
describe("VoucherEngine · V7 segment (3.2.10, stub)", () => {
  it("always passes in Day 3 (segment source undefined)", () => {
    expect(
      v7Segment(voucher({ user_segment_conditions: { loyalty_tier: "gold" } })),
    ).toEqual({
      ok: true,
    });
    expect(v7Segment(voucher({ user_segment_conditions: null }))).toEqual({
      ok: true,
    });
  });
});

// ── V8 stacking (3.2.11) ─────────────────────────────────────────────────────
describe("VoucherEngine · V8 stacking conflict (3.2.11)", () => {
  it("non-stackable + cart has promo ⇒ STACKING_CONFLICT", () => {
    const v = voucher({ stackable_with_promotions: false });
    expect(v8Stacking(v, cart({ has_item_promotion: true }))).toMatchObject({
      ok: false,
      code: "VOUCHER_STACKING_CONFLICT",
    });
  });

  it("non-stackable but no promo ⇒ pass", () => {
    const v = voucher({ stackable_with_promotions: false });
    expect(v8Stacking(v, cart({ has_item_promotion: false }))).toEqual({
      ok: true,
    });
  });

  it("stackable ⇒ pass even with promo", () => {
    expect(
      v8Stacking(
        voucher({ stackable_with_promotions: true }),
        cart({ has_item_promotion: true }),
      ),
    ).toEqual({
      ok: true,
    });
  });
});

// ── Fail-fast chain (3.2.12) ─────────────────────────────────────────────────
describe("VoucherEngine · validateVoucher fail-fast (3.2.12)", () => {
  it("all rules pass ⇒ ok", () => {
    expect(validateVoucher(context())).toEqual({ ok: true });
  });

  it("null voucher ⇒ NOT_FOUND (format+V1)", () => {
    const r = validateVoucher(context({ voucher: null }));
    expect(r).toMatchObject({ ok: false, code: "VOUCHER_NOT_FOUND" });
  });

  it("returns only the FIRST failure: expired (V2) wins over min-order (V5)", () => {
    const v = voucher({
      valid_to: new Date("2026-07-13T00:00:00.000Z"), // V2 fails
      min_order_value: 999_999_999, // V5 would also fail
    });
    const r = validateVoucher(
      context({ voucher: v, cart: cart({ original_subtotal: 1 }) }),
    );
    expect(r).toMatchObject({ ok: false, code: "VOUCHER_EXPIRED" });
  });

  it("V1 short-circuits before V3: inactive wins over usage-limit", () => {
    const v = voucher({ is_active: false, usage_limit: 1, usage_count: 5 });
    const r = validateVoucher(context({ voucher: v }));
    expect(r).toMatchObject({ ok: false, code: "VOUCHER_INACTIVE" });
  });
});
