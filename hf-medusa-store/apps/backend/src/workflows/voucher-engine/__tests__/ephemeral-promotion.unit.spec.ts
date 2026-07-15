/**
 * generateEphemeralPromotionCode — unit tests (SPEC Decision G). Only needs to
 * be unique across concurrent applies (not cryptographic) and must never
 * collide across two different carts/vouchers or two rapid-fire calls for the
 * same cart+voucher (e.g. apply → immediate revalidate).
 */
import { generateEphemeralPromotionCode } from "../lib/ephemeral-promotion";

describe("generateEphemeralPromotionCode (Decision G)", () => {
  it("never equals the voucher's own code (customers must never see/reuse it)", () => {
    const code = generateEphemeralPromotionCode("cart_123", "voucher_abc");
    expect(code).not.toBe("SAVE10");
    expect(code.startsWith("VEPH-")).toBe(true);
  });

  it("produces distinct codes for two calls with the same cart+voucher (no collision on rapid re-apply)", () => {
    const a = generateEphemeralPromotionCode("cart_123", "voucher_abc");
    const b = generateEphemeralPromotionCode("cart_123", "voucher_abc");
    expect(a).not.toBe(b);
  });

  it("produces distinct codes for two different carts applying the same voucher (no shared-record corruption)", () => {
    const a = generateEphemeralPromotionCode("cart_111", "voucher_abc");
    const b = generateEphemeralPromotionCode("cart_222", "voucher_abc");
    expect(a).not.toBe(b);
  });

  it("is uppercase and free of characters Promotion codes might reject", () => {
    const code = generateEphemeralPromotionCode("cart_123", "voucher_abc");
    expect(code).toBe(code.toUpperCase());
    expect(/^[A-Z0-9-]+$/.test(code)).toBe(true);
  });
});
