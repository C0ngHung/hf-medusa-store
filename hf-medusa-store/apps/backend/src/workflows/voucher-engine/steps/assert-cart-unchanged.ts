/**
 * assertCartUnchangedStep — optimistic-concurrency guard (security.md EC-04).
 *
 * Re-reads the cart's `updated_at` right before the voucher metadata write and
 * compares it to the `concurrency_marker` captured earlier in the same
 * workflow by `loadCartContextStep`. A mismatch means another operation (a
 * concurrent item add/remove, or another apply/remove request that slipped
 * past the `voucher:cart:{cart_id}` lock's TTL) mutated the cart after the
 * discount was computed but before it was committed — throw so the caller
 * gets `VOUCHER_CART_CHANGED` (409) and retries against the current cart
 * instead of silently writing a discount based on stale line items.
 */
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { throwVoucherError } from "../lib/errors";
import { isCartUnchanged } from "../lib/assert-cart-unchanged";

export const assertCartUnchangedStepId = "assert-cart-unchanged";

export interface AssertCartUnchangedInput {
  cart_id: string;
  expected_concurrency_marker: string;
}

export const assertCartUnchangedStep = createStep(
  assertCartUnchangedStepId,
  async (input: AssertCartUnchangedInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const { data } = await query.graph({
      entity: "cart",
      filters: { id: input.cart_id },
      fields: ["id", "updated_at"],
    });
    const rawCart = data?.[0] as { updated_at: string } | undefined;
    if (
      !isCartUnchanged(rawCart?.updated_at, input.expected_concurrency_marker)
    ) {
      throwVoucherError("VOUCHER_CART_CHANGED");
    }
    return new StepResponse({ unchanged: true });
  },
  // Read-only — no compensation.
);
