/**
 * SuggestiveSelling constants — SPEC A.2 (BR-01/BR-06).
 * Centralised tuning knobs so magic numbers don't scatter across steps,
 * workflows and cache. Values trace back to SRS SUGG-001 / SUGG-004.
 */

// Cache TTLs (BR-06) — used by the cache layer (Sơn, Day 4+).
export const SUGGESTION_CACHE_TTL = 300; // 5 min
export const STOCK_SNAPSHOT_TTL = 60; // advisory stock snapshot

// Result caps (BR-01 / SRS SUGG-001, SUGG-004).
export const PRODUCT_LIMIT = 5; // product-level: 3–5 products
export const CART_LIMIT = 3; // cart-level: up to 3

// Tier-2 backfill trigger: if surviving Tier-1 candidates < this, fill from
// category complements up to PRODUCT_LIMIT (SRS SUGG-001 Tier 2, BR-01).
export const TIER1_MIN_SURVIVORS = 3;

// ── Cart-level knobs (used by Sơn's CR-01…CR-04, kept here for one source of truth) ──
// BR-02(d): consumables are exempt from the 30-day "recently purchased" filter.
export const CONSUMABLE_CATEGORIES = [
  "Strings",
  "Shuttlecocks",
  "Grips",
  "Socks",
  "Tubes",
];
export const CR02_PRICE_BAND_MULT = 2; // CR-02: remaining ≤ price ≤ remaining × 2
export const CR02_THRESHOLD_PCT = 0.15; // CR-02: within 15% of the threshold
