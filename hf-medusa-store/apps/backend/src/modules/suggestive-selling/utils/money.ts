/**
 * Money util — INT-01 / D1.
 *
 * All monetary values are integer VND (1 = 1₫); never floating point in
 * discount/price math. When a calculation can produce a fraction (e.g. a %
 * price), round through this single helper. Decision D1: floor (round down) —
 * safe for caps, favours the shop by never over-crediting a fractional đồng.
 *
 * Pure function, no I/O — shared by the suggestion price enrichment now and by
 * the VoucherEngine stacking math later (SPEC C.2).
 */
export function roundMoney(value: number): number {
  return Math.floor(value);
}
