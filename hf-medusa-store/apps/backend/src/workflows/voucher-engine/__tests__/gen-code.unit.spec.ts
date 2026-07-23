import { generateVoucherCode } from "../lib/gen-code";
import { MIN_CODE_LENGTH } from "../../../modules/voucher-engine/constants";

/**
 * Unit tests for the pure voucher-code generator (3.4.11, SEC-03). RNG injected
 * so assertions are deterministic (no hidden Math.random in the test).
 */
describe("generateVoucherCode (3.4.11)", () => {
  it("matches the accepted format /^[A-Z0-9]{6,}$/", () => {
    const code = generateVoucherCode();
    expect(code).toMatch(/^[A-Z0-9]{6,}$/);
  });

  it("is at least MIN_CODE_LENGTH chars, even if a shorter length is asked", () => {
    expect(generateVoucherCode(3).length).toBe(MIN_CODE_LENGTH);
    expect(generateVoucherCode(10).length).toBe(10);
  });

  it("is deterministic for a given RNG stub", () => {
    const rng = () => 0; // always first alphabet char → 'A'
    expect(generateVoucherCode(8, rng)).toBe("AAAAAAAA");
  });

  it("maps the RNG range across the alphabet (uppercase alphanumeric)", () => {
    // rng just below 1 → last char of the 36-char alphabet ('9').
    const rng = () => 0.999999;
    expect(generateVoucherCode(6, rng)).toBe("999999");
  });
});
