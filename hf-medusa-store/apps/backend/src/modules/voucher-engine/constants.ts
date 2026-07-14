/**
 * VoucherEngine tuning constants (SRS §5.2, §5.3).
 * Money/percentages are integer basis-points (5000 = 50.00%).
 */

// Global discount cap fallback when no active discount_cap_config row exists (50%).
export const DEFAULT_CAP_PCT = 5000

// Minimum voucher code length accepted by validation (Day 3).
export const MIN_CODE_LENGTH = 6
