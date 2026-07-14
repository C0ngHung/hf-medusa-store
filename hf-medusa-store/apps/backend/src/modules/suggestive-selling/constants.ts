/**
 * SuggestiveSelling constants — SPEC A.2 (BR-01/BR-06).
 *
 * Centralised tuning knobs so magic numbers don't scatter across steps, workflows
 * and cache. Values trace back to SRS SUGG-001 / SUGG-004. No I/O, no Medusa
 * imports — safe to import from the pure (unit-tested) evaluator pipeline.
 */

// ── Cache TTLs (BR-06) — used by the cache layer ──
export const SUGGESTION_CACHE_TTL = 300; // 5 min raw-suggestion buffer
export const STOCK_SNAPSHOT_TTL = 60; // advisory stock snapshot; authoritative re-check at add-time

// ── Result caps (BR-01 / SRS SUGG-001, SUGG-004) ──
export const PRODUCT_LIMIT = 5; // product-level: 3–5 products
export const CART_LIMIT = 3; // cart-level: up to 3

/**
 * Minimum suggestions we aim to show on the product page (BR-01 "3–5"). This is a
 * DISPLAY floor / intent, NOT a pre-filter gate: whether Tier-2 backfill is fetched
 * is decided by RAW_CANDIDATE_CAP (see below), because the survivor count that
 * matters is only known AFTER the runtime BR-02 filter (SUGG-002 / SPEC A.5).
 */
export const TIER1_MIN_SURVIVORS = 3;

/**
 * How many enriched candidates we cache per product BEFORE per-customer filtering
 * (D7). One cache key serves every customer; in-cart / dismissed / recently-bought
 * / out-of-stock filters run at request time against this buffer, so it must hold
 * more than PRODUCT_LIMIT to still yield a full list after filtering. The buffer is
 * always topped up with Tier-2 to this size so dropped Tier-1 slots have material to
 * backfill from (Tier-2 only surfaces when a Tier-1 slot is emptied — SPEC A.5).
 */
export const RAW_CANDIDATE_CAP = 15;

/** Recent-purchase window for the durable-goods filter — BR-02(d). */
export const RECENT_PURCHASE_WINDOW_DAYS = 30;

/**
 * Consumable categories are EXEMPT from the "already bought in 30 days" filter
 * (BR-02(d)) — you rebuy strings/shuttles often. ⚠️ Confirm list with client
 * (OI-03/D-A1). Matched by category name (case-insensitive).
 */
export const CONSUMABLE_CATEGORIES = [
  "Strings",
  "Shuttlecocks",
  "Grips",
  "Socks",
  "Tubes",
];

// ── Cart-level knobs (used by CR-01…CR-04; kept here for one source of truth) ──
/** CR-02 price band: remaining ≤ price ≤ remaining × MULT (D4). */
export const CR02_PRICE_BAND_MULT = 2;
/** CR-02 "within 15% of threshold" (D5). */
export const CR02_THRESHOLD_PCT = 0.15;

/**
 * Free-shipping threshold used by CR-02 (SPEC A.6 / API Contract §1.1). Phase-1
 * fallback constant — the SRS says the real value lives in the Promotion subsystem
 * (OI-04); until that is wired, CR-02 fires against this fixed 7.000.000₫ ceiling.
 * Integer VND (INT-01).
 */
export const FREE_SHIPPING_THRESHOLD = 7_000_000;

/** Default CR-02 badge when a threshold_near rule doesn't override it (SPEC A.6). */
export const CR02_DEFAULT_BADGE = "Mua thêm để được MIỄN PHÍ vận chuyển!";

/**
 * CR-04 default trigger quantity (SUGG-004): a consumable line at qty ≤ this many
 * nudges its bulk/multipack. Overridable per-rule via condition_params.max_quantity.
 */
export const CR04_DEFAULT_MAX_QUANTITY = 1;

/** Suggestion tiers in priority order (highest first) — Tier 1 > Tier 2 > Tier 3 (BR-01). */
export const SUGGESTION_TIER_ORDER = [
  "manual",
  "category",
  "behavioral",
] as const;

/**
 * Tier 3 Behavioral is Phase 2 (SUGG-001): the data model already supports it
 * (rule.tier / event.tier accept 'behavioral'), but the runtime evaluator must
 * NOT produce behavioral candidates yet. Flip to true when Phase 2 lands.
 */
export const TIER3_BEHAVIORAL_ENABLED = false;
