/**
 * verifyCartTotalsStep — authoritative Cart-total verification (SPEC §23.4;
 * tasks 3.3.14, 3.8.4).
 *
 * Runs AFTER the voucher Promotion has been applied to the Cart (§11.1 step 9,
 * §14.2-A — out of scope this session, applyVoucherPromotionStep). Refetches
 * the Cart and proves the Cart Module's own recomputed totals match
 * VoucherEngine's internally calculated `final_voucher_discount` /
 * `expected_final_cart_total`.
 *
 * The internally calculated numbers are used ONLY as a verification oracle —
 * this step never writes a total. The refetched `cart` (specifically
 * `cart.total`) is the single pricing truth (Rule 18, INT-03, SEC-01) and is
 * exactly what flows on to the Store API response (§23.5). If verification
 * fails, the workflow's compensation chain removes the voucher Promotion via
 * `updateCartPromotionsWorkflow REMOVE` (applyVoucherPromotionStep's own
 * compensation, §14.2-A) so the Cart recomputes to its pre-voucher state —
 * this step performs no compensation of its own because it is read-only.
 *
 * **Framework finding (this session, corrects the prior session's mis-diagnosis):**
 * `cart.total`/`discount_total` are `model.bigNumber().computed()` fields on
 * the Cart model (`@medusajs/cart/dist/models/cart.js`) — they are populated
 * ONLY by `decorateCartTotals` inside `CartModuleService.retrieveCart`/
 * `listCarts` (verified: `@medusajs/cart/dist/services/cart-module.js`), and
 * ONLY when the caller's `config.select` requests a total-like field
 * (`shouldIncludeTotals`). `query.graph`/`remoteQuery` on the `"cart"` entity
 * reads the generic remote-query data loader, which does NOT run this
 * decoration — every computed total field reads back `0` there regardless of
 * whether the cart went through standard checkout workflows. Verified
 * empirically: `remoteQueryObjectFromString` (the exact mechanism the shipped
 * `refetchCart` helper in `@medusajs/medusa/dist/api/store/carts/helpers.js`
 * uses) also returns `total: 0` for a cart with a real, correctly-persisted
 * Promotion adjustment, while `cartModuleService.retrieveCart(id, { select:
 * [...totalFields], relations: ["items", "items.adjustments"] })` on the same
 * cart correctly returns `total: 900000`. This step therefore reads the
 * authoritative total via the Cart module service directly, not `query.graph`.
 */

import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils";
import type { ICartModuleService } from "@medusajs/framework/types";
import {
  sumInts,
  sumRawToInt,
  toInt,
} from "../../../modules/voucher-engine/lib/money";
import { throwVoucherError } from "../lib/errors";

export const verifyCartTotalsStepId = "verify-cart-totals";

export interface VerifyTotalsInput {
  cart_id: string;
  /** The voucher's backing Promotion id — used to find its adjustment(s) on the refetched cart. */
  promotion_id: string;
  /** VoucherEngine's internally calculated final voucher discount (lib/calculate-discount.ts). */
  final_voucher_discount: number;
  /** VoucherEngine's internally calculated expected final Cart total — verification oracle ONLY. */
  expected_final_cart_total: number;
  /**
   * CONFLICT-8/PD-15 (2026-07-15): the VOUCHER-FREE sum of non-voucher item
   * adjustments, observed by `loadCartContextStep` BEFORE the ephemeral
   * voucher Promotion was attached. Used only to detect (never to fix) a
   * Rule-11 violation — see the step-4 shrink guard below. On first apply
   * this is a pre-ADD `loadCartContextStep` read; on any replace/revalidate
   * path it MUST be captured AFTER the old ephemeral promotion is removed/
   * deleted (SPEC §11.3), never while an old ephemeral is still attached.
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
export interface RawVerifiedCart {
  id: string;
  total: unknown;
  discount_total: unknown;
  items?: RawCartLineItem[] | null;
  [key: string]: unknown;
}

// Requesting a total-like field in `select` is what makes CartModuleService
// decorate computed totals (`shouldIncludeTotals`, see file header finding).
const VERIFY_TOTALS_SELECT = ["id", "total", "discount_total"];
const VERIFY_TOTALS_RELATIONS = ["items", "items.adjustments"];

export const verifyCartTotalsStep = createStep(
  verifyCartTotalsStepId,
  async (input: VerifyTotalsInput, { container }) => {
    const cartModuleService: ICartModuleService = container.resolve(
      Modules.CART,
    );

    // 1. Refetch the LATEST cart — never trust the pre-apply snapshot. Goes
    //    through the Cart module service (not query.graph — see file header)
    //    so `total`/`discount_total` are actually computed, not read back 0.
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

    // 2. Sum the adjustment(s) that belong to the voucher's backing Promotion.
    //    NOTE: each individual adjustment can be FRACTIONAL — Medusa's
    //    `fixed`/`across` allocation spreads the ephemeral promotion's whole-VND
    //    value proportionally over every discountable line (not only the
    //    voucher-eligible ones), so only the AGGREGATE is guaranteed integer
    //    (see 2026-07-15-scoped-voucher-across-split-fractional-adjustment.md).
    //    `sumRawToInt` sums at full precision and rounds/validates the total.
    const appliedAdjustmentRawAmounts = (cart.items ?? [])
      .flatMap((item) => item.adjustments ?? [])
      .filter((adjustment) => adjustment.promotion_id === input.promotion_id)
      .map((adjustment) => adjustment.amount);
    const applied_adjustment_total = sumRawToInt(
      appliedAdjustmentRawAmounts,
      "verify-cart-totals.applied_adjustment_total",
    );

    const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

    // 3. Exact-equality check: the recorded voucher adjustment must equal what
    //    VoucherEngine computed (TOLERANCE = 0, no rounding slack).
    if (applied_adjustment_total !== input.final_voucher_discount) {
      // Internal mismatch detail is logged only — never exposed to the customer (§12.5, §18.6).
      logger.error(
        `[voucher-engine] verify-cart-totals: adjustment mismatch ${JSON.stringify(
          {
            cart_id: input.cart_id,
            promotion_id: input.promotion_id,
            expected: input.final_voucher_discount,
            actual: applied_adjustment_total,
          },
        )}`,
      );
      throwVoucherError("VOUCHER_CALCULATION_FAILED");
    }

    // 4. MANDATORY Rule-11-shrink guard (CONFLICT-8/PD-15, SPEC §10.2/§23.4).
    //    Medusa's promotion engine processes active promotions in
    //    `application_method.value DESC` order over one shared
    //    `appliedPromotionsMap` — the ephemeral voucher's fixed money value
    //    ~always sorts before a coexisting percentage item/order promotion's
    //    rate, so that promotion's OWN adjustment can silently shrink. This
    //    step detects (does not fix — the carrier is BLOCKED under PD-15)
    //    any decrease in the non-voucher adjustment total vs. the
    //    voucher-free baseline the caller observed before attaching the
    //    voucher.
    const nonVoucherAdjustmentAmounts = (cart.items ?? [])
      .flatMap((item) => item.adjustments ?? [])
      .filter((adjustment) => adjustment.promotion_id !== input.promotion_id)
      .map((adjustment) =>
        toInt(
          adjustment.amount,
          "verify-cart-totals.non_voucher_adjustment.amount",
        ),
      );
    const post_apply_item_promotion_discount = sumInts(
      nonVoucherAdjustmentAmounts,
      "verify-cart-totals.post_apply_item_promotion_discount",
    );
    if (
      post_apply_item_promotion_discount <
      input.pre_apply_item_promotion_discount
    ) {
      logger.error(
        `[voucher-engine] verify-cart-totals: Rule-11 shrink detected (CONFLICT-8/PD-15) ${JSON.stringify(
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

    // 5. Exact-equality check: the Cart Module's own recomputed total must equal
    //    VoucherEngine's internal `expected_final_cart_total`.
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

    // 6. Success — return the REFETCHED cart. No custom total is constructed,
    //    persisted, or substituted here; `cart.total` remains the single
    //    pricing truth (task 3.8.4).
    const output: VerifyTotalsOutput = { cart, verified: true };
    return new StepResponse(output);
  },
  // Read-only step — no compensation of its own. On failure, the workflow's
  // earlier applyVoucherPromotionStep compensation (REMOVE the Promotion) runs
  // instead, so the Cart recomputes to its pre-voucher state (never a stale
  // write-back — Rule 18).
);
