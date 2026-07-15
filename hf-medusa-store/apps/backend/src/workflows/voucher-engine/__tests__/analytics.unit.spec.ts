import { computeAnalytics, type UsageLogRow } from "../lib/analytics";

/**
 * Unit tests for the pure analytics aggregation (3.4.12, SRS §6.4). Integer VND
 * (INT-01); append-only usage log is the source of truth (INT-04).
 */
describe("computeAnalytics (3.4.12)", () => {
  it("returns all-zero (not NaN) for an empty log", () => {
    expect(computeAnalytics([])).toEqual({
      total_uses: 0,
      total_discount_given: 0,
      avg_order_value: 0,
      capped_count: 0,
      conversion_rate: 0,
    });
  });

  it("sums discount, counts uses and capped rows", () => {
    const rows: UsageLogRow[] = [
      { discount_applied: 100_000, was_capped: false },
      { discount_applied: 250_000, was_capped: true },
      { discount_applied: 50_000, was_capped: true },
    ];
    const a = computeAnalytics(rows);
    expect(a.total_uses).toBe(3);
    expect(a.total_discount_given).toBe(400_000);
    expect(a.capped_count).toBe(2);
  });

  it("keeps discount totals integer (Math.floor, INT-01)", () => {
    const rows: UsageLogRow[] = [
      { discount_applied: 10_000.9, was_capped: false },
      { discount_applied: 20_000.9, was_capped: false },
    ];
    expect(computeAnalytics(rows).total_discount_given).toBe(30_000);
  });

  it("avg_order_value: 0 when no row carries an order value (open issue)", () => {
    const rows: UsageLogRow[] = [
      { discount_applied: 100_000, was_capped: false },
    ];
    expect(computeAnalytics(rows).avg_order_value).toBe(0);
  });

  it("avg_order_value: integer mean of rows that do carry order_value", () => {
    const rows: UsageLogRow[] = [
      { discount_applied: 0, was_capped: false, order_value: 1_000_000 },
      { discount_applied: 0, was_capped: false, order_value: 3_000_001 },
    ];
    // floor((1_000_000 + 3_000_001) / 2) = 2_000_000
    expect(computeAnalytics(rows).avg_order_value).toBe(2_000_000);
  });
});
