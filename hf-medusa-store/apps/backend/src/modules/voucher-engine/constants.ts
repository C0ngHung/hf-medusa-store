/**
 * VoucherEngine tuning constants (SRS §5.2, §5.3).
 * Money/percentages are integer basis-points (5000 = 50.00%).
 */

// Global discount cap fallback when no active discount_cap_config row exists (50%).
export const DEFAULT_CAP_PCT = 5000;

// Minimum voucher code length accepted by validation (Day 3).
export const MIN_CODE_LENGTH = 6;

// ── Day 4: Redis cache + rate-limit tuning (REDIS_USAGE.md §2/§3) ──

/**
 * Positive-integer env override with a fallback (SEC-02 rate-limit tuning,
 * REDIS_USAGE.md §3). Lets ops/demo tune the brute-force limiter WITHOUT a code
 * change (e.g. a short `VOUCHER_RL_COOLDOWN_SEC=30` for a live demo) while the
 * committed DEFAULTS stay at the SEC-02-mandated production values. Any missing,
 * blank, non-numeric, or non-positive value falls back to the default.
 */
function envPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

// 3.7.1 — TTL (seconds) for the cart-INDEPENDENT voucher config cache
// (`voucher:{code}:config`). Short on purpose: voucher state changes fast (§2).
export const VOUCHER_CONFIG_CACHE_TTL = 30;

// 3.7.4 — brute-force threshold: this many failed validations trips the limiter.
export const FAIL_THRESHOLD = envPositiveInt("VOUCHER_RL_THRESHOLD", 5);

// 3.7.4 — window (seconds) the failed attempts are counted over (SEC-02: 15 min).
export const FAIL_WINDOW_S = envPositiveInt("VOUCHER_RL_WINDOW_SEC", 15 * 60);

// 3.7.5 — cooldown (seconds) applied once the threshold is exceeded (SEC-02: 30 min).
// Default corrected from the prior 60s stopgap to the SEC-02-mandated 30 min.
export const COOLDOWN_S = envPositiveInt("VOUCHER_RL_COOLDOWN_SEC", 30 * 60);
