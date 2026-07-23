/**
 * VoucherEngine tuning constants (SRS §5.2, §5.3).
 * Money/percentages are integer basis-points (5000 = 50.00%).
 */

// Global discount cap fallback when no active discount_cap_config row exists (40%).
export const DEFAULT_CAP_PCT = 4000;

// Minimum voucher code length accepted by validation (Day 3).
export const MIN_CODE_LENGTH = 6;

// ── Day 4: Redis cache + rate-limit tuning (REDIS_USAGE.md §2/§3) ──

// 3.7.1 — TTL (seconds) for the cart-INDEPENDENT voucher config cache
// (`voucher:{code}:config`). Short on purpose: voucher state changes fast (§2).
export const VOUCHER_CONFIG_CACHE_TTL = 30;

// 3.7.4 — brute-force threshold: this many failed validations trips the limiter.
export const FAIL_THRESHOLD = 5;

// 3.7.4 — window (seconds) the failed attempts are counted over (15 min).
export const FAIL_WINDOW_S = 15 * 60;

// 3.7.5 — cooldown (seconds) applied once the threshold is exceeded (30 min).
export const COOLDOWN_S = 30 * 60;

// ── Backend-5B-2: abandoned-cart ephemeral Promotion reaper ──

// Minimum age (days) a `VEPH-*` ephemeral Promotion must reach before the
// scheduled reaper considers it stale. No existing env-override pattern for
// VoucherEngine tunables in this codebase (verified: no `process.env` reads
// anywhere under modules/voucher-engine or workflows/voucher-engine) — kept
// as a plain constant, consistent with every other tunable in this file.
export const EPHEMERAL_PROMOTION_MAX_AGE_DAYS = 7;
