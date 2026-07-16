/**
 * Integer-only monetary utilities for VoucherEngine — SRS INT-01, Rule 19 (SPEC §23.1).
 *
 * VND has no minor unit, so 1 = 1 VND: every monetary value in VoucherEngine is a
 * JS-safe integer. This module is the ONLY place percentage/amount arithmetic is
 * performed and is deliberately dependency-free (no Medusa imports) so it stays
 * trivially unit-testable and reusable by the pure calculation layer.
 *
 * Medusa 2.16 money fields are typed `BigNumberValue` (verified —
 * @medusajs/types `dist/totals/big-number.d.ts`):
 *   type BigNumberValue = BigNumberJS | number | string | IBigNumber
 *   IBigNumber = { numeric: number; raw?: { value: string | number }; valueOf(): number }
 * `toInt` normalizes any of these shapes to a safe integer before arithmetic.
 */

/** Integer VND amount. Doc-only alias — not a distinct runtime type. */
export type Money = number;

export const BPS_DENOMINATOR = 10000;

export class MoneyError extends Error {
  constructor(label: string, detail: string) {
    super(`[voucher-engine money] ${label}: ${detail}`);
    this.name = "MoneyError";
  }
}

/**
 * Normalize a possibly-BigNumberValue money field to a JS-safe integer.
 * Never uses parseFloat/toFixed — rejects non-finite/non-integer/unsafe values.
 */
export function toInt(value: unknown, label: string): number {
  const numeric = toRawNumber(value, label);

  if (typeof numeric !== "number" || !Number.isFinite(numeric)) {
    throw new MoneyError(
      label,
      `expected a finite numeric value, got ${JSON.stringify(value)}`,
    );
  }
  if (!Number.isInteger(numeric)) {
    throw new MoneyError(
      label,
      `expected an integer monetary value, got ${numeric}`,
    );
  }

  assertSafeInt(numeric, label);
  return numeric;
}

/** Unwrap BigNumberValue-shaped inputs to a raw JS number, without parseFloat/toFixed. */
export function toRawNumber(value: unknown, label: string): number {
  if (typeof value === "number") return value;

  if (typeof value === "string") {
    if (value.trim() === "") {
      throw new MoneyError(
        label,
        "expected a numeric string, got an empty string",
      );
    }
    return Number(value);
  }

  if (value !== null && typeof value === "object") {
    const candidate = value as Record<string, unknown>;

    // IBigNumber shape: { numeric: number, ... }
    if (typeof candidate.numeric === "number") {
      return candidate.numeric;
    }

    // BigNumberRawValue shape: { value: string | number, ... }
    if (
      "value" in candidate &&
      (typeof candidate.value === "number" ||
        typeof candidate.value === "string")
    ) {
      return toRawNumber(candidate.value, label);
    }

    // BigNumberJS-like instance duck-typed via valueOf()/toNumber()
    if (typeof candidate.toNumber === "function") {
      return (candidate.toNumber as () => number)();
    }
    if (typeof candidate.valueOf === "function") {
      const primitive = candidate.valueOf();
      if (typeof primitive === "number") return primitive;
    }
  }

  throw new MoneyError(
    label,
    `unrecognized monetary value shape: ${JSON.stringify(value)}`,
  );
}

/** Throw unless `value` is a JS safe integer (Number.isSafeInteger). */
export function assertSafeInt(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(label, `expected a safe integer, got ${value}`);
  }
}

/**
 * Basis-point percentage of an integer amount. The only percentage primitive
 * in VoucherEngine — `basisPoints` is an integer (2000 = 20.00%, §5.1).
 * Rounds DOWN (Math.floor) — favors the store, never produces fractional VND
 * (SPEC §10.2 rounding policy).
 */
export function bps(amount: number, basisPoints: number): number {
  assertSafeInt(amount, "bps.amount");
  assertSafeInt(basisPoints, "bps.basisPoints");
  if (basisPoints < 0 || basisPoints > BPS_DENOMINATOR) {
    throw new MoneyError(
      "bps.basisPoints",
      `expected 0..${BPS_DENOMINATOR}, got ${basisPoints}`,
    );
  }

  const product = amount * basisPoints;
  assertSafeInt(product, "bps.product");

  return Math.floor(product / BPS_DENOMINATOR);
}

/** Clamp a value to a minimum floor (default 0). Never lets a discount/total go negative. */
export function clampMin(value: number, floor = 0): number {
  return Math.max(floor, value);
}

/** Sum a list of integers with a running safe-integer overflow guard. */
export function sumInts(values: number[], label: string): number {
  return values.reduce((total, value, index) => {
    assertSafeInt(value, `${label}[${index}]`);
    const next = total + value;
    assertSafeInt(next, `${label} running total`);
    return next;
  }, 0);
}

/**
 * Sum possibly-fractional per-line monetary values and round the AGGREGATE to
 * the nearest integer VND. Medusa's `fixed`/`across` promotion allocation
 * spreads one whole-VND value proportionally over every discountable line, so
 * each individual line adjustment can be fractional even though the intended
 * total is a clean integer (see
 * .claude/lessons/voucher-engine/2026-07-15-scoped-voucher-across-split-fractional-adjustment.md).
 * INT-01's integer invariant applies to the aggregate, not each line — this
 * tolerates floating-point noise up to 1 VND (the repeating-decimal splits
 * never drift further than that) but still rejects a genuinely fractional
 * total, which would be a real bug rather than an allocation artifact.
 */
export function sumRawToInt(values: unknown[], label: string): number {
  const rawTotal = values.reduce<number>((total, value, index) => {
    const numeric = toRawNumber(value, `${label}[${index}]`);
    if (!Number.isFinite(numeric)) {
      throw new MoneyError(
        `${label}[${index}]`,
        `expected a finite numeric value, got ${JSON.stringify(value)}`,
      );
    }
    return total + numeric;
  }, 0);

  const rounded = Math.round(rawTotal);
  if (Math.abs(rawTotal - rounded) > 1e-6) {
    throw new MoneyError(
      label,
      `expected an integer monetary value after summation, got ${rawTotal}`,
    );
  }
  assertSafeInt(rounded, label);
  return rounded;
}
