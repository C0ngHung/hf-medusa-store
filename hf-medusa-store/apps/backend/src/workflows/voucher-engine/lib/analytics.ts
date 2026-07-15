/**
 * VoucherEngine pure helper — voucher analytics aggregation (3.4.12, SRS §6.4).
 *
 * No I/O: the workflow reads voucher_usage_log rows + config and hands them here.
 * Money is integer VND (INT-01). Append-only usage log is the source of truth
 * for redemptions (INT-04).
 *
 * OPEN ISSUE / HANDOFF:
 *  - `capped_count` counts rows with was_capped, which the StackingEngine (Thức,
 *    VOUCH-003) writes — 0 until that lands.
 *  - `avg_order_value` and `conversion_rate` need an order-value / impressions
 *    source the SRS does not yet define; computed best-effort (0 when absent).
 */

/** The subset of a voucher_usage_log row analytics needs. */
export interface UsageLogRow {
  discount_applied: number;
  was_capped: boolean;
  /** Optional order value if the caller can join it in; absent for now. */
  order_value?: number | null;
}

export interface VoucherAnalytics {
  total_uses: number;
  total_discount_given: number;
  avg_order_value: number;
  capped_count: number;
  conversion_rate: number;
}

/**
 * Aggregate usage rows into the analytics payload. Pure + total: an empty log
 * yields all zeros (never NaN).
 */
export function computeAnalytics(rows: UsageLogRow[]): VoucherAnalytics {
  const total_uses = rows.length;
  const total_discount_given = rows.reduce(
    (sum, r) => sum + Math.floor(r.discount_applied || 0),
    0,
  );
  const capped_count = rows.reduce((n, r) => n + (r.was_capped ? 1 : 0), 0);

  // Best-effort: only rows that actually carry an order_value contribute; if
  // none do (current state — no source yet), stays 0 rather than NaN.
  const withOrderValue = rows.filter(
    (r) => typeof r.order_value === "number" && Number.isFinite(r.order_value),
  );
  const avg_order_value = withOrderValue.length
    ? Math.floor(
        withOrderValue.reduce((s, r) => s + (r.order_value as number), 0) /
          withOrderValue.length,
      )
    : 0;

  // conversion_rate needs an impressions source (undefined in SRS) → 0 for now.
  const conversion_rate = 0;

  return {
    total_uses,
    total_discount_given,
    avg_order_value,
    capped_count,
    conversion_rate,
  };
}
