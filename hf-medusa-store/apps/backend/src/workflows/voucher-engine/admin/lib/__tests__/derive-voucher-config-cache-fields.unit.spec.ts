import { derivePromotionCacheFields } from "../derive-voucher-config-cache-fields";

describe("derivePromotionCacheFields (Admin unified model source-of-truth fix)", () => {
  it("maps a percentage application_method to basis-points discount_value", () => {
    const result = derivePromotionCacheFields({
      code: "summer10",
      status: "active",
      application_method: { type: "percentage", value: 20 },
    });
    expect(result.discount_type).toBe("percentage");
    expect(result.discount_value).toBe(2000); // 20% -> 2000 bps
  });

  it("maps a fixed application_method to a raw VND discount_value", () => {
    const result = derivePromotionCacheFields({
      code: "fixed50k",
      status: "active",
      application_method: { type: "fixed", value: 50_000 },
    });
    expect(result.discount_type).toBe("fixed_amount");
    expect(result.discount_value).toBe(50_000);
  });

  it("normalizes code to uppercase", () => {
    const result = derivePromotionCacheFields({
      code: "lowercase",
      status: "active",
      application_method: { type: "fixed", value: 1 },
    });
    expect(result.code).toBe("LOWERCASE");
  });

  it("does NOT derive is_active — it is VoucherEngine's own persisted Enable/Disable flag, never overwritten from Promotion status", () => {
    const result = derivePromotionCacheFields({
      code: "X",
      status: "active",
      application_method: { type: "fixed", value: 1 },
    }) as any;
    expect(result.is_active).toBeUndefined();
  });

  it("does NOT derive valid_from/valid_to — VoucherConfig owns these directly, no native Promotion date field exists", () => {
    const result = derivePromotionCacheFields({
      code: "X",
      status: "active",
      application_method: { type: "fixed", value: 1 },
    }) as any;
    expect(result.valid_from).toBeUndefined();
    expect(result.valid_to).toBeUndefined();
  });

  it("derives usage_limit from the native Promotion.limit field (no Campaign needed)", () => {
    const result = derivePromotionCacheFields({
      code: "X",
      status: "active",
      application_method: { type: "fixed", value: 1 },
      limit: 42,
    });
    expect(result.usage_limit).toBe(42);
  });

  it("usage_limit is null (unlimited) when Promotion.limit is unset", () => {
    expect(
      derivePromotionCacheFields({
        code: "X",
        status: "active",
        application_method: { type: "fixed", value: 1 },
      }).usage_limit,
    ).toBeNull();
    expect(
      derivePromotionCacheFields({
        code: "X",
        status: "active",
        application_method: { type: "fixed", value: 1 },
        limit: null,
      }).usage_limit,
    ).toBeNull();
  });
});
