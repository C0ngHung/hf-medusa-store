/**
 * verifyCartTotalsStep — authoritative Cart-total verification (SPEC §23.4;
 * tasks 3.3.14, 3.8.4).
 *
 * Runs AFTER the voucher discount has been carried onto the Cart as a
 * `cart.credit_lines` entry (Option-B carrier — see
 * `lib/create-voucher-credit-line.ts`). Refetches the Cart and proves the Cart
 * Module's own recomputed totals match VoucherEngine's internally calculated
 * `final_voucher_discount` / `expected_final_cart_total`.
 *
 * The internally calculated numbers are used ONLY as a verification oracle —
 * this step never writes a total. The refetched `cart` (specifically
 * `cart.total`) is the single pricing truth (Rule 18, INT-03, SEC-01) and is
 * exactly what flows on to the Store API response (§23.5). If verification
 * fails, the workflow's compensation chain removes the credit line
 * (`createVoucherCreditLine`'s own compensation) so the Cart recomputes to its
 * pre-voucher state — this step performs no compensation of its own because it
 * is read-only.
 *
 * **Framework finding (still load-bearing):** `cart.total`/`discount_total`/
 * `credit_line_total` are `model.bigNumber().computed()` fields on the Cart
 * model — populated ONLY by `decorateCartTotals` inside
 * `CartModuleService.retrieveCart`/`listCarts`, and ONLY when the caller's
 * `config.select` requests a total-like field (`shouldIncludeTotals`).
 * `query.graph`/`remoteQuery` on the `"cart"` entity does NOT run this
 * decoration — every computed total reads back `0` there. So this step reads the
 * authoritative total via the Cart module service directly, not `query.graph`.
 * `cart.total` nets credit lines (verified `@medusajs/utils/dist/totals/cart/
 * index.js:112`: `total = subtotal + taxTotal − discountSubtotal − creditLinesTotal`).
 */

import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils";
import type { ICartModuleService } from "@medusajs/framework/types";
import { sumInts, toInt } from "../../../modules/voucher-engine/lib/money";
import { throwVoucherError } from "../lib/errors";

export const verifyCartTotalsStepId = "verify-cart-totals";

export interface VerifyTotalsInput {
  cart_id: string;
  /** The voucher's `cart.credit_lines` entry id — used to find its amount on the refetched cart. */
  credit_line_id: string;
  /** VoucherEngine's internally calculated final voucher discount (lib/calculate-discount.ts). */
  final_voucher_discount: number;
  /** VoucherEngine's internally calculated expected final Cart total — verification oracle ONLY. */
  expected_final_cart_total: number;
  /**
   * The VOUCHER-FREE sum of item-level promotion adjustments observed by
   * `loadCartContextStep`. Under the credit-line carrier the voucher is not an
   * adjustment, so item promotions cannot be re-compounded by attaching it —
   * this is now a DEFENSIVE INVARIANT (step 4): if item promotions ever shrink
   * versus this baseline, something is deeply wrong (it proves the Option-B
   * carrier preserved Rule 11 by construction; the former ephemeral-Promotion
   * carrier violated it, CONFLICT-8/PD-15).
   */
  pre_apply_item_promotion_discount: number;
}

export interface VerifyTotalsOutput {
  /** The refetched, authoritative Cart — the only Cart data the caller/route may return. */
  cart: RawVerifiedCart;
  verified: true;
}

/** VoucherEngine-owned shape for the subset of cart fields read here; NOT a Medusa export. */
interface RawCartAdjustment {
  amount: unknown;
  promotion_id?: string | null;
}
interface RawCartLineItem {
  id: string;
  adjustments?: RawCartAdjustment[] | null;
}
interface RawCartCreditLine {
  id: string;
  amount: unknown;
}
export interface RawVerifiedCart {
  id: string;
  total: unknown;
  discount_total: unknown;
  credit_line_total?: unknown;
  items?: RawCartLineItem[] | null;
  credit_lines?: RawCartCreditLine[] | null;
  [key: string]: unknown;
}

// Requesting a total-like field in `select` is what makes CartModuleService
// decorate computed totals (`shouldIncludeTotals`, see file header finding).
const VERIFY_TOTALS_SELECT = [
  "id",
  "total",
  "discount_total",
  "credit_line_total",
];
const VERIFY_TOTALS_RELATIONS = ["items", "items.adjustments", "credit_lines"];

export const verifyCartTotalsStep = createStep(
  verifyCartTotalsStepId,
  async (input: VerifyTotalsInput, { container }) => {
    const cartModuleService: ICartModuleService = container.resolve(
      Modules.CART,
    );

    // 1. Refetch the LATEST cart — never trust the pre-apply snapshot. Goes
    //    through the Cart module service (not query.graph — see file header)
    //    so `total`/`credit_line_total` are actually computed, not read back 0.
    let cart: RawVerifiedCart | undefined;
    try {
      cart = (await cartModuleService.retrieveCart(input.cart_id, {
        select: VERIFY_TOTALS_SELECT,
        relations: VERIFY_TOTALS_RELATIONS,
      })) as unknown as RawVerifiedCart;
    } catch {
      cart = undefined;
    }
    if (!cart) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Cart '${input.cart_id}' not found during verification`,
      );
    }

    const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

    // 2. The voucher's credit line must carry exactly what VoucherEngine
    //    computed (TOLERANCE = 0). A credit line amount is a single whole-VND
    //    value — unlike the former ephemeral `fixed`/`across` promotion, it is
    //    NOT split into fractional per-line adjustments, so a plain integer
    //    equality check is exact.
    const voucherCreditLine = (cart.credit_lines ?? []).find(
      (line) => line.id === input.credit_line_id,
    );
    const applied_credit_line_amount =
      voucherCreditLine === undefined
        ? null
        : toInt(
            voucherCreditLine.amount,
            "verify-cart-totals.credit_line.amount",
          );

    if (applied_credit_line_amount !== input.final_voucher_discount) {
      // Internal mismatch detail is logged only — never exposed to the customer (§12.5, §18.6).
      logger.error(
        `[voucher-engine] verify-cart-totals: credit-line mismatch ${JSON.stringify(
          {
            cart_id: input.cart_id,
            credit_line_id: input.credit_line_id,
            expected: input.final_voucher_discount,
            actual: applied_credit_line_amount,
          },
        )}`,
      );
      throwVoucherError("VOUCHER_CALCULATION_FAILED");
    }

    // 3. DEFENSIVE Rule-11 invariant (CONFLICT-8/PD-15 fix verification). Under
    //    the credit-line carrier the voucher is not a promotion and never enters
    //    `computeActions`, so a coexisting percentage item/order promotion CANNOT
    //    be re-sorted or re-compounded. EVERY `items.adjustments` entry is an
    //    item-level promotion; their total must not fall below the voucher-free
    //    baseline. If it ever does, the carrier's Rule-11 guarantee is broken
    //    (should be impossible) — fail loudly rather than silently ship a wrong
    //    total.
    const post_apply_item_promotion_discount = sumInts(
      (cart.items ?? [])
        .flatMap((item) => item.adjustments ?? [])
        .map((adjustment) =>
          toInt(
            adjustment.amount,
            "verify-cart-totals.item_promotion_adjustment.amount",
          ),
        ),
      "verify-cart-totals.post_apply_item_promotion_discount",
    );
    if (
      post_apply_item_promotion_discount <
      input.pre_apply_item_promotion_discount
    ) {
      logger.error(
        `[voucher-engine] verify-cart-totals: Rule-11 invariant broken under credit-line carrier ${JSON.stringify(
          {
            cart_id: input.cart_id,
            pre_apply_item_promotion_discount:
              input.pre_apply_item_promotion_discount,
            post_apply_item_promotion_discount,
          },
        )}`,
      );
      throwVoucherError("VOUCHER_STACKING_UNSUPPORTED");
    }

    // 4. Exact-equality check: the Cart Module's own recomputed total (which nets
    //    the credit line) must equal VoucherEngine's `expected_final_cart_total`.
    const authoritative_total = toInt(
      cart.total,
      "verify-cart-totals.cart.total",
    );
    if (authoritative_total !== input.expected_final_cart_total) {
      logger.error(
        `[voucher-engine] verify-cart-totals: total mismatch ${JSON.stringify({
          cart_id: input.cart_id,
          expected: input.expected_final_cart_total,
          actual: authoritative_total,
        })}`,
      );
      throwVoucherError("VOUCHER_CALCULATION_FAILED");
    }

    // 5. Success — return the REFETCHED cart. No custom total is constructed,
    //    persisted, or substituted here; `cart.total` remains the single
    //    pricing truth (task 3.8.4).
    const output: VerifyTotalsOutput = { cart, verified: true };
    return new StepResponse(output);
  },
  // Read-only step — no compensation of its own. On failure, the workflow's
  // `createVoucherCreditLine` compensation (delete the credit line) runs, so the
  // Cart recomputes to its pre-voucher state (never a stale write-back — Rule 18).
);
