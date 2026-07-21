import {
  createWorkflow,
  WorkflowResponse,
  transform,
  when,
} from "@medusajs/framework/workflows-sdk";
import {
  createPromotionsWorkflow,
  updatePromotionsWorkflow,
} from "@medusajs/core-flows";
import {
  createVoucherStep,
  type CreateVoucherStepInput,
} from "./steps/create-voucher";
import { resolveVoucherCodeStep } from "./steps/resolve-voucher-code";
import { resolvePromotionSnapshotStep } from "./steps/resolve-promotion-snapshot";
import { buildBackingPromotion } from "./lib/build-backing-promotion";

/**
 * Workflow-level input for `POST /admin/vouchers`. Two mutually-exclusive
 * modes (Task 4):
 *  - "create" (legacy / seeds, full body): `promotion_id` absent — provisions
 *    a brand-new backing Promotion, so `discount_type`/`discount_value`/
 *    `valid_from`/`valid_to` are required, same as before.
 *  - "attach" (admin widget flow, `AttachVoucherSchema`): `promotion_id`
 *    present, referencing an EXISTING native Promotion — those 4 fields are
 *    instead derived from that Promotion's snapshot, so they're optional here.
 */
export type CreateOrAttachVoucherWorkflowInput = Omit<
  CreateVoucherStepInput,
  "discount_type" | "discount_value" | "valid_from" | "valid_to"
> & {
  discount_type?: CreateVoucherStepInput["discount_type"];
  discount_value?: CreateVoucherStepInput["discount_value"];
  valid_from?: CreateVoucherStepInput["valid_from"];
  valid_to?: CreateVoucherStepInput["valid_to"];
};

/**
 * POST /admin/vouchers (3.4.11, SRS §6.4; SPEC Decision C/H, Phase 2; attach
 * mode: Task 4).
 *
 * "Create" mode (no `promotion_id`) provisions the CANONICAL backing Medusa
 * Promotion (+ inline Campaign) for the voucher, then persists the
 * `voucher_config` row carrying its `promotion_id`/`campaign_id`. The backing
 * Promotion is the idiomatic "voucher is a real promotion" representation
 * (admin/analytics visibility) and is NEVER attached to a cart — the apply-time
 * discount rides a `cart.credit_lines` entry (Decision H).
 * `createPromotionsWorkflow` rolls back the Promotion+Campaign on any later
 * failure (its own compensation); `createVoucherStep` rolls back the config
 * row.
 *
 * "Attach" mode (`promotion_id` present — the admin widget "enable as voucher"
 * flow) skips provisioning entirely and instead resolves the EXISTING
 * Promotion's snapshot (`resolvePromotionSnapshotStep`) to fill the same
 * fields, guardrailing it with `metadata.voucher_engine=true` via
 * `updatePromotionsWorkflow` when not already set (so the block-voucher-
 * promotion / analytics guardrails, which key off that flag, also cover
 * promotions the admin created by hand — Decision C/G).
 *
 * Returns the created voucher either way.
 */
export const createVoucherWorkflow = createWorkflow(
  "create-voucher",
  (input: CreateOrAttachVoucherWorkflowInput) => {
    // ---- Attach mode — reuse an existing Promotion (Task 4). ----
    const snapshot = when(
      "attach-mode-resolve-snapshot",
      { input },
      ({ input }) => !!input.promotion_id,
    ).then(() =>
      resolvePromotionSnapshotStep({ promotion_id: input.promotion_id! }),
    );

    // Guardrail: set metadata.voucher_engine on the existing Promotion when
    // it's missing (admin-created promotions never had it). Sibling to the
    // `when()` above, NOT nested inside its `.then()` — the workflow composer
    // does not support nesting (see revalidate-voucher-on-cart-change.ts).
    when(
      "attach-mode-guardrail-metadata",
      { snapshot },
      ({ snapshot }) => !!snapshot && !snapshot.metadata_ok,
    ).then(() => {
      updatePromotionsWorkflow.runAsStep({
        input: transform({ input, snapshot }, ({ input, snapshot }) => ({
          promotionsData: [
            {
              id: input.promotion_id as string,
              metadata: { ...(snapshot!.metadata ?? {}), voucher_engine: true },
            },
          ],
        })),
      });
    });

    // ---- Create mode — provision a brand-new backing Promotion. ----
    const created = when(
      "create-mode-provision-promotion",
      { input },
      ({ input }) => !input.promotion_id,
    ).then(() => {
      // Resolve the final code once (memoized step, replay-safe) so the
      // backing Promotion and the voucher_config row share the exact same code.
      const resolved = resolveVoucherCodeStep({ code: input.code });

      const promotionsData = transform(
        { input, resolved },
        ({ input, resolved }) =>
          buildBackingPromotion(input as CreateVoucherStepInput, resolved.code),
      );

      const createdPromotions = createPromotionsWorkflow.runAsStep({
        input: transform({ promotionsData }, ({ promotionsData }) => ({
          promotionsData,
        })),
      });

      return transform(
        { input, resolved, createdPromotions },
        ({ input, resolved, createdPromotions }) => ({
          ...input,
          code: resolved.code,
          promotion_id: createdPromotions[0].id as string,
          campaign_id: (createdPromotions[0].campaign_id ??
            createdPromotions[0].campaign?.id ??
            null) as string | null,
        }),
      );
    });

    // ---- Merge both branches into createVoucherStep's uniform input. Only
    // one of `created`/`snapshot` is ever defined at runtime (mutually
    // exclusive `when()` conditions above). ----
    const voucherInput = transform(
      { input, snapshot, created },
      ({ input, snapshot, created }) =>
        (created ?? {
          ...input,
          promotion_id: input.promotion_id,
          campaign_id: snapshot!.campaign_id,
          code: snapshot!.code,
          discount_type: snapshot!.discount_type,
          discount_value: snapshot!.discount_value,
          valid_from: snapshot!.valid_from,
          valid_to: snapshot!.valid_to,
        }) as CreateVoucherStepInput,
    );

    const voucher = createVoucherStep(voucherInput);

    return new WorkflowResponse(voucher);
  },
);

export default createVoucherWorkflow;
