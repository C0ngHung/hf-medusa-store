import { validateAttachVoucherConfigInput } from "../validate-attach-voucher-config-input";

describe("validateAttachVoucherConfigInput (2026-07-21 form validation fix)", () => {
  it("passes when max_discount_amount is not set at all", () => {
    const result = validateAttachVoucherConfigInput(
      { application_method: { type: "fixed" } },
      { min_order_value: null, max_discount_amount: null },
    );
    expect(result.ok).toBe(true);
  });

  it("rejects max_discount_amount on a non-percentage (fixed) Promotion", () => {
    const result = validateAttachVoucherConfigInput(
      { application_method: { type: "fixed" } },
      { min_order_value: 200_000, max_discount_amount: 50_000 },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe("max_discount_amount");
  });

  it("passes max_discount_amount on a percentage Promotion with no min_order_value (bug-bash fix, e.g. MEGA40: 40% capped at 500,000, no min order)", () => {
    const result = validateAttachVoucherConfigInput(
      { application_method: { type: "percentage" } },
      { min_order_value: null, max_discount_amount: 500_000 },
    );
    expect(result.ok).toBe(true);
  });

  it("passes max_discount_amount equal to min_order_value (no cross-field relation required)", () => {
    const result = validateAttachVoucherConfigInput(
      { application_method: { type: "percentage" } },
      { min_order_value: 200_000, max_discount_amount: 200_000 },
    );
    expect(result.ok).toBe(true);
  });

  it("passes max_discount_amount greater than min_order_value (bug-bash fix, 2026-07-21: no basis in SRS for this rule)", () => {
    const result = validateAttachVoucherConfigInput(
      { application_method: { type: "percentage" } },
      { min_order_value: 200_000, max_discount_amount: 250_000 },
    );
    expect(result.ok).toBe(true);
  });

  it("passes for a percentage Promotion with max_discount_amount strictly less than min_order_value", () => {
    const result = validateAttachVoucherConfigInput(
      { application_method: { type: "percentage" } },
      { min_order_value: 200_000, max_discount_amount: 100_000 },
    );
    expect(result.ok).toBe(true);
  });
});
