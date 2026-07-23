import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { MedusaError } from "@medusajs/framework/utils";
import { VOUCHER_ENGINE_MODULE } from "../../../../modules/voucher-engine";

/**
 * Rebuild Phase 1 — reads back the `VoucherConfig` row the `promotionsCreated`
 * hook (`workflows/hooks/voucher-config-promotion-created.ts`) provisioned for
 * a just-created canonical Promotion. Hooks run in-band/synchronously within
 * the child workflow's own execution (verified:
 * `@medusajs/workflows-sdk/dist/utils/composer/create-workflow.js:156-194`,
 * `runAsStep` awaits the full child `workflow.run()`, hooks included, before
 * returning), so by the time this step runs the row is guaranteed to exist —
 * no retry/poll needed.
 */
export type FetchVoucherByPromotionStepInput = {
  promotion_id: string;
};

export const fetchVoucherByPromotionStep = createStep(
  "fetch-voucher-by-promotion",
  async (input: FetchVoucherByPromotionStepInput, { container }) => {
    const service: any = container.resolve(VOUCHER_ENGINE_MODULE);

    const [voucher] = await service.listVoucherConfigs(
      { promotion_id: input.promotion_id },
      { take: 1 },
    );

    if (!voucher) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `No VoucherConfig was provisioned for promotion ${input.promotion_id} — the promotionsCreated hook did not run or failed silently.`,
      );
    }

    return new StepResponse(voucher);
  },
);
