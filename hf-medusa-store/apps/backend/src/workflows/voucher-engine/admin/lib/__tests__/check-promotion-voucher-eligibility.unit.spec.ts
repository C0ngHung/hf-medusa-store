import { checkPromotionVoucherEligibility } from "../check-promotion-voucher-eligibility";
import { MIN_CODE_LENGTH } from "../../../../../modules/voucher-engine/constants";

const basePromotion = () => ({
  id: "promo_1",
  code: "SUMMER10",
  is_automatic: false,
  status: "active" as const,
  application_method: { target_type: "items" as const },
  campaign: null,
});

describe("checkPromotionVoucherEligibility (Admin unified model)", () => {
  it("accepts a valid non-automatic, code-based, items-scoped Promotion", () => {
    expect(checkPromotionVoucherEligibility(basePromotion())).toEqual({
      eligible: true,
    });
  });

  it("accepts target_type = order", () => {
    const promotion = {
      ...basePromotion(),
      application_method: { target_type: "order" as const },
    };
    expect(checkPromotionVoucherEligibility(promotion).eligible).toBe(true);
  });

  it("rejects an automatic Promotion", () => {
    const result = checkPromotionVoucherEligibility({
      ...basePromotion(),
      is_automatic: true,
    });
    expect(result.eligible).toBe(false);
    expect((result as any).reason).toMatch(/automatic/i);
  });

  it("rejects a Promotion with no code", () => {
    const result = checkPromotionVoucherEligibility({
      ...basePromotion(),
      code: "",
    });
    expect(result.eligible).toBe(false);
    expect((result as any).reason).toMatch(/chưa có mã/i);
  });

  it("rejects a Promotion with a whitespace-only code", () => {
    const result = checkPromotionVoucherEligibility({
      ...basePromotion(),
      code: "   ",
    });
    expect(result.eligible).toBe(false);
  });

  it("rejects a code shorter than MIN_CODE_LENGTH (2026-07-22 bug-bash fix — see OLD10)", () => {
    const shortCode = "OLD10";
    expect(shortCode.length).toBeLessThan(MIN_CODE_LENGTH);
    const result = checkPromotionVoucherEligibility({
      ...basePromotion(),
      code: shortCode,
    });
    expect(result.eligible).toBe(false);
    expect((result as any).reason).toMatch(
      new RegExp(`tối thiểu ${MIN_CODE_LENGTH}`),
    );
  });

  it(`accepts a code exactly ${MIN_CODE_LENGTH} characters long (boundary)`, () => {
    const boundaryCode = "A".repeat(MIN_CODE_LENGTH);
    const result = checkPromotionVoucherEligibility({
      ...basePromotion(),
      code: boundaryCode,
    });
    expect(result.eligible).toBe(true);
  });

  it("rejects a VEPH-* ephemeral cart-transport Promotion code (case-insensitive)", () => {
    const result = checkPromotionVoucherEligibility({
      ...basePromotion(),
      code: "veph-cart123-voucher456-abc",
    });
    expect(result.eligible).toBe(false);
    expect((result as any).reason).toMatch(/ephemeral/i);
  });

  it("rejects an unsupported shipping_methods target type", () => {
    const result = checkPromotionVoucherEligibility({
      ...basePromotion(),
      application_method: { target_type: "shipping_methods" as const },
    });
    expect(result.eligible).toBe(false);
    expect((result as any).reason).toMatch(/không được hỗ trợ/i);
  });

  it("rejects an inactive Promotion", () => {
    const result = checkPromotionVoucherEligibility({
      ...basePromotion(),
      status: "inactive",
    });
    expect(result.eligible).toBe(false);
    expect((result as any).reason).toMatch(/inactive/i);
  });

  it("allows a draft Promotion (not deliberately turned off)", () => {
    const result = checkPromotionVoucherEligibility({
      ...basePromotion(),
      status: "draft",
    });
    expect(result.eligible).toBe(true);
  });

  it("rejects a Promotion whose linked Campaign already ended", () => {
    const result = checkPromotionVoucherEligibility(
      {
        ...basePromotion(),
        campaign: { ends_at: "2020-01-01T00:00:00.000Z" },
      },
      new Date("2026-07-20T00:00:00.000Z"),
    );
    expect(result.eligible).toBe(false);
    expect((result as any).reason).toMatch(/đã kết thúc/i);
  });

  it("allows a Promotion whose linked Campaign has not yet ended", () => {
    const result = checkPromotionVoucherEligibility(
      {
        ...basePromotion(),
        campaign: { ends_at: "2030-01-01T00:00:00.000Z" },
      },
      new Date("2026-07-20T00:00:00.000Z"),
    );
    expect(result.eligible).toBe(true);
  });

  it("allows a Promotion with no linked Campaign at all", () => {
    const result = checkPromotionVoucherEligibility({
      ...basePromotion(),
      campaign: null,
    });
    expect(result.eligible).toBe(true);
  });
});
