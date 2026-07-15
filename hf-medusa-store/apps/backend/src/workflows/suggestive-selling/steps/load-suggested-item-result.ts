import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { Modules } from "@medusajs/framework/utils";

/**
 * Final step of addSuggestedItemWorkflow. addToCartWorkflow returns void, so
 * re-read the cart to return the resulting line item (matched by its
 * idempotency_key metadata — works for both a fresh add and a replay) plus the
 * authoritative cart total (INT-03). Read-only → no compensation.
 */
export type SuggestedItemResult = {
  line_item: {
    id: string;
    variant_id: string | null;
    quantity: number;
    metadata: Record<string, unknown> | null;
  } | null;
  updated_cart_total: number;
  is_idempotent_replay: boolean;
};

export const loadSuggestedItemResultStep = createStep(
  "load-suggested-item-result",
  async (
    input: { cart_id: string; idempotency_key: string; is_replay: boolean },
    { container },
  ): Promise<StepResponse<SuggestedItemResult>> => {
    const cartModule = container.resolve(Modules.CART);

    const items = await cartModule.listLineItems(
      { cart_id: input.cart_id },
      { select: ["id", "variant_id", "quantity", "metadata"] },
    );
    const li = items.find(
      (i: any) => i.metadata?.idempotency_key === input.idempotency_key,
    );

    const cart = await cartModule.retrieveCart(input.cart_id, {
      select: ["id", "total", "item_total"],
    });
    const total = Number((cart as any).total ?? (cart as any).item_total ?? 0);

    return new StepResponse({
      line_item: li
        ? {
            id: li.id,
            variant_id: (li as any).variant_id ?? null,
            quantity: Number(li.quantity),
            metadata: (li.metadata as Record<string, unknown>) ?? null,
          }
        : null,
      updated_cart_total: total,
      is_idempotent_replay: input.is_replay,
    });
  },
);
