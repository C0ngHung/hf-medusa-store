import { CreateVoucherSchema } from "../validators";

/**
 * Unit tests for the admin voucher input schema (3.4.13). Guards the SRS/business
 * rules that plain zod types miss: discount_value >= 1, percentage <= 100%.
 */
const base = {
  discount_type: "percentage" as const,
  discount_value: 1000, // 10%
  valid_from: "2026-01-01T00:00:00.000Z",
  valid_to: "2026-12-31T23:59:59.000Z",
};

const parse = (o: Record<string, unknown>) =>
  CreateVoucherSchema.safeParse({ ...base, ...o });

describe("CreateVoucherSchema (3.4.13)", () => {
  it("accepts a valid percentage voucher (10%)", () => {
    expect(parse({}).success).toBe(true);
  });

  it("rejects discount_value = 0 (meaningless voucher)", () => {
    expect(parse({ discount_value: 0 }).success).toBe(false);
  });

  it("rejects negative discount_value", () => {
    expect(parse({ discount_value: -5 }).success).toBe(false);
  });

  it("rejects percentage > 100% (10000 bps) — e.g. 9999999", () => {
    expect(parse({ discount_value: 9_999_999 }).success).toBe(false);
  });

  it("accepts percentage at the 100% boundary (10000 bps)", () => {
    expect(parse({ discount_value: 10_000 }).success).toBe(true);
  });

  it("allows a large fixed_amount (> 10000 VND) — bound is percentage-only", () => {
    expect(
      parse({ discount_type: "fixed_amount", discount_value: 500_000 }).success,
    ).toBe(true);
  });

  it("still rejects an inverted validity window", () => {
    expect(
      parse({
        valid_from: "2026-12-31T00:00:00.000Z",
        valid_to: "2026-01-01T00:00:00.000Z",
      }).success,
    ).toBe(false);
  });
});
