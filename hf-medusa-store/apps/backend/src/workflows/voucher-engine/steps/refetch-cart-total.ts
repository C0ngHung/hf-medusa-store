/**
 * refetchCartTotalStep — reads the CURRENT authoritative `cart.total` after a
 * mutation with nothing to verify against (e.g. remove — there's no expected
 * value to compare, unlike `verifyCartTotalsStep`'s post-apply check).
 *
 * Uses `CartModuleService.retrieveCart` with a totals field in `select`, NOT
 * `query.graph` — `total`/`discount_total` are `model.bigNumber().computed()`
 * fields that `query.graph`/`remoteQuery` never decorate (see
 * `.claude/lessons/voucher-engine/2026-07-14-cart-totals-computed-fields.md`).
 */

import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { Modules, MedusaError } from "@medusajs/framework/utils";
import type { ICartModuleService } from "@medusajs/framework/types";
import { toInt } from "../../../modules/voucher-engine/lib/money";

export const refetchCartTotalStepId = "refetch-cart-total";

export interface RefetchCartTotalInput {
  cart_id: string;
}

export interface RefetchCartTotalOutput {
  cart_total: number;
}

export const refetchCartTotalStep = createStep(
  refetchCartTotalStepId,
  async (input: RefetchCartTotalInput, { container }) => {
    const cartModuleService: ICartModuleService = container.resolve(
      Modules.CART,
    );

    const cart = await cartModuleService.retrieveCart(input.cart_id, {
      select: ["id", "total"],
    });
    if (!cart) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Cart '${input.cart_id}' not found`,
      );
    }

    const output: RefetchCartTotalOutput = {
      cart_total: toInt(cart.total, "refetch-cart-total.cart.total"),
    };
    return new StepResponse(output);
  },
  // Read-only — no compensation.
);
