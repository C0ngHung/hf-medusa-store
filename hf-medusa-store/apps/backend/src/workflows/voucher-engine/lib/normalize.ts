/**
 * VoucherEngine pure helpers (no I/O) — unit-testable against the spec.
 * SRS §5.2 V1: voucher codes are matched case-insensitively and trimmed;
 * they are stored and looked up in canonical UPPERCASE form.
 */

/** Canonicalize a raw voucher code: trim surrounding whitespace, uppercase. */
export function normalizeCode(raw: string | null | undefined): string {
  return (raw ?? '').trim().toUpperCase()
}
