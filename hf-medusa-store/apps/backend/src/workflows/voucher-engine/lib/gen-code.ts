/**
 * VoucherEngine pure helper — voucher code generation (3.4.11, SEC-03).
 *
 * No I/O. The RNG is injected so the generator is deterministic under test
 * (workflow/pure layer must never read a hidden global directly in assertions).
 * Output is canonical UPPERCASE alphanumeric — same shape validateCodeFormat
 * (Day 3) accepts: /^[A-Z0-9]{6,}$/.
 */
import { MIN_CODE_LENGTH } from "../../../modules/voucher-engine/constants";

/** Unambiguous alphanumeric alphabet (A-Z0-9); already uppercase (SEC-03). */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/**
 * Generate a random voucher code of at least MIN_CODE_LENGTH chars (SEC-03).
 * `rng` returns a float in [0, 1) (default Math.random) — pass a stub in tests.
 */
export function generateVoucherCode(
  length: number = MIN_CODE_LENGTH,
  rng: () => number = Math.random,
): string {
  const len = Math.max(MIN_CODE_LENGTH, Math.floor(length));
  let out = "";
  for (let i = 0; i < len; i++) {
    // Math.floor keeps the index integer and in-range (INT-01 discipline).
    out += ALPHABET[Math.floor(rng() * ALPHABET.length)];
  }
  return out;
}
