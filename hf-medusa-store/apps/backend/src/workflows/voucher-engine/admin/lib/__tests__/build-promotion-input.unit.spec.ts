import {
  buildPromotionData,
  buildPromotionInput,
  VOUCHER_ENGINE_ADMIN_CREATE_SOURCE,
} from "../build-promotion-input";
import type { CreateVoucherWorkflowInput } from "../../create-voucher";

/**
 * Unit tests for the pure `createPromotionsWorkflow` input builders (Rebuild
 * Phase 1, SRS §5.2 "VoucherConfig extends Promotion"). No I/O — asserts the
 * exact shape handed to `createPromotionsWorkflow.runAsStep` / the backfill
 * script, since the Promotion row's fields (code/status/application_method/
 * campaign) are reference/display data derived one-way from the admin input.
 */
describe("buildPromotionData (Rebuild Phase 1)", () => {
  const baseInput = (): Pick<
    CreateVoucherWorkflowInput,
    | "code"
    | "discount_type"
    | "discount_value"
    | "applicable_product_ids"
    | "applicable_category_ids"
    | "is_active"
    | "valid_from"
    | "valid_to"
    | "usage_limit"
  > => ({
    code: "spring24",
    discount_type: "percentage",
    discount_value: 2000, // 20.00% in basis points
    applicable_product_ids: null,
    applicable_category_ids: null,
    is_active: true,
    valid_from: new Date("2026-01-01T00:00:00.000Z"),
    valid_to: new Date("2026-12-31T23:59:59.000Z"),
    usage_limit: null,
  });

  it("normalizes a supplied code to UPPERCASE (V1) instead of generating one", () => {
    const data = buildPromotionData(baseInput());
    expect(data.code).toBe("SPRING24");
  });

  it("auto-generates an UPPERCASE code matching the accepted format when none is supplied", () => {
    const data = buildPromotionData({ ...baseInput(), code: null });
    expect(data.code).toMatch(/^[A-Z0-9]{6,}$/);
  });

  it("converts a round basis-points percentage to a plain percentage value (2000 -> 20)", () => {
    const data = buildPromotionData({
      ...baseInput(),
      discount_type: "percentage",
      discount_value: 2000,
    });
    expect(data.application_method.type).toBe("percentage");
    expect(data.application_method.value).toBe(20);
  });

  it("converts a non-round basis-points percentage without flooring (2550 -> 25.5, reference-only field)", () => {
    const data = buildPromotionData({
      ...baseInput(),
      discount_type: "percentage",
      discount_value: 2550,
    });
    // This is a percentage passed to the (display/reference-only) Promotion
    // application_method, not a VND amount — INT-01's integer-money rule does
    // not apply here, so a fractional value is the correct, intended output.
    expect(data.application_method.value).toBe(25.5);
  });

  it("passes a fixed_amount discount_value through unchanged (raw VND, no /100)", () => {
    const data = buildPromotionData({
      ...baseInput(),
      discount_type: "fixed_amount",
      discount_value: 50_000,
    });
    expect(data.application_method.type).toBe("fixed");
    expect(data.application_method.value).toBe(50_000);
  });

  it("selects target_type 'items' when applicable_product_ids is non-empty", () => {
    const data = buildPromotionData({
      ...baseInput(),
      applicable_product_ids: ["prod_racket"],
      applicable_category_ids: null,
    });
    expect(data.application_method.target_type).toBe("items");
  });

  it("selects target_type 'items' when applicable_category_ids is non-empty", () => {
    const data = buildPromotionData({
      ...baseInput(),
      applicable_product_ids: null,
      applicable_category_ids: ["cat_badminton"],
    });
    expect(data.application_method.target_type).toBe("items");
  });

  it("selects target_type 'order' when both scope arrays are null (unscoped voucher)", () => {
    const data = buildPromotionData({
      ...baseInput(),
      applicable_product_ids: null,
      applicable_category_ids: null,
    });
    expect(data.application_method.target_type).toBe("order");
  });

  it("selects target_type 'order' when both scope arrays are present but empty", () => {
    const data = buildPromotionData({
      ...baseInput(),
      applicable_product_ids: [],
      applicable_category_ids: [],
    });
    expect(data.application_method.target_type).toBe("order");
  });

  it("maps is_active to status active/inactive", () => {
    expect(buildPromotionData({ ...baseInput(), is_active: true }).status).toBe(
      "active",
    );
    expect(
      buildPromotionData({ ...baseInput(), is_active: false }).status,
    ).toBe("inactive");
  });

  it("always sets type 'standard', is_automatic false, and allocation 'across'", () => {
    const data = buildPromotionData(baseInput());
    expect(data.type).toBe("standard");
    expect(data.is_automatic).toBe(false);
    expect(data.application_method.allocation).toBe("across");
  });

  it("maps valid_from/valid_to to campaign starts_at/ends_at, keyed by the normalized code", () => {
    const input = baseInput();
    const data = buildPromotionData(input);
    expect(data.campaign.campaign_identifier).toBe("SPRING24");
    expect(data.campaign.name).toBe("SPRING24");
    expect(data.campaign.starts_at).toBe(input.valid_from);
    expect(data.campaign.ends_at).toBe(input.valid_to);
  });

  it("always sets currency_code 'vnd' on application_method", () => {
    const data = buildPromotionData(baseInput());
    expect(data.application_method.currency_code).toBe("vnd");
  });

  it("maps usage_limit to the native Promotion.limit field (2026-07-21 fix — was previously unset, silently nulling any admin-specified usage_limit at read time)", () => {
    expect(buildPromotionData({ ...baseInput(), usage_limit: 500 }).limit).toBe(
      500,
    );
    expect(
      buildPromotionData({ ...baseInput(), usage_limit: null }).limit,
    ).toBeNull();
  });
});

describe("buildPromotionInput (Rebuild Phase 1)", () => {
  const fullInput = (): CreateVoucherWorkflowInput => ({
    code: "spring24",
    discount_type: "percentage",
    discount_value: 2000,
    min_order_value: 100_000,
    max_discount_amount: 200_000,
    applicable_product_ids: null,
    applicable_category_ids: null,
    per_user_limit: 1,
    usage_limit: 500,
    user_segment_conditions: null,
    valid_from: new Date("2026-01-01T00:00:00.000Z"),
    valid_to: new Date("2026-12-31T23:59:59.000Z"),
    is_active: true,
  });

  it("wraps a single buildPromotionData() result into promotionsData[0]", () => {
    const input = fullInput();
    const wrapped = buildPromotionInput(input);
    const single = buildPromotionData(input);

    expect(wrapped.promotionsData).toHaveLength(1);
    expect(wrapped.promotionsData[0]).toEqual(single);
  });

  it("carries the FULL original input plus the normalized code in additional_data.voucher_engine.voucher_config", () => {
    const input = fullInput();
    const wrapped = buildPromotionInput(input);

    expect(wrapped.additional_data.voucher_engine.voucher_config).toEqual({
      ...input,
      code: "SPRING24",
    });
  });

  it("normalizes additional_data.voucher_engine.voucher_config.code even when the admin supplied lowercase input", () => {
    const wrapped = buildPromotionInput({ ...fullInput(), code: "lower99" });
    expect(wrapped.additional_data.voucher_engine.voucher_config.code).toBe(
      "LOWER99",
    );
  });

  it("generates and threads through an auto-generated code when none was supplied", () => {
    const wrapped = buildPromotionInput({ ...fullInput(), code: null });
    const generated = wrapped.promotionsData[0].code;

    expect(generated).toMatch(/^[A-Z0-9]{6,}$/);
    expect(wrapped.additional_data.voucher_engine.voucher_config.code).toBe(
      generated,
    );
  });

  it("sets the internal source marker the promotionsCreated hook requires (Phase 1 review hardening)", () => {
    const wrapped = buildPromotionInput(fullInput());
    expect(wrapped.additional_data.voucher_engine.source).toBe(
      VOUCHER_ENGINE_ADMIN_CREATE_SOURCE,
    );
  });
});
