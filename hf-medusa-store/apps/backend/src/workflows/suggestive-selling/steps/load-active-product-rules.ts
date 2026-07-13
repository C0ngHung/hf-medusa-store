import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { SUGGESTIVE_SELLING_MODULE } from "../../../modules/suggestive-selling";

/**
 * Step 1 (SRS §7.1 resolveContext/loadActiveRules) — active product-level rules
 * for the viewed product. Read-only → no compensation. Service is resolved HERE
 * (in the step), never in the route.
 */
export const loadActiveProductRulesStep = createStep(
  "load-active-product-rules",
  async (input: { productId: string }, { container }) => {
    const service: any = container.resolve(SUGGESTIVE_SELLING_MODULE);
    const rules = await service.listActiveProductRules(input.productId);
    return new StepResponse(rules);
  },
);
