/**
 * revalidateVoucherWorkflow — SPEC §11.3/§11.5 (tasks 3.5.1, 3.5.7, 3.5.8).
 *
 * Invoked by the `cart.updated` subscriber (`../../subscribers/voucher-cart-updated.ts`)
 * for cart mutations VoucherEngine does not own (item add/remove, qty change,
 * suggestive-selling adds). Re-runs the cart-change validation SUBSET (V1, V2,
 * V5, V6, V8 — §9.2): if still valid, recomputes and re-attaches the discount
 * at the new amount; if invalid, auto-removes the voucher with a reason
 * (VOUCHER_AUTO_REMOVED).
 *
 * No-op (nothing mutates) when the cart has no active voucher — the common
 * case for the vast majority of cart mutations. Never throws — errors are
 * caught and logged by the calling subscriber (async, non-blocking, skill
 * best-practice 2), since this path must never break an unrelated cart
 * mutation the customer is waiting on.
 *
 * Flat, non-nested `when()`: Medusa's workflow composer does not support a
 * `when().then()` call nested inside another `when().then()` callback (it
 * throws at workflow-definition/load time, breaking the whole app boot, not
 * just this workflow — verified empirically this session). So
 * `loadCartContextStep`/`lookupVoucherStep`/`revalidateStep` run
 * UNCONDITIONALLY (each is safe with a "no active voucher" input — cart_id is
 * always valid, an empty `code` resolves to `voucher: null`, and a null
 * voucher's revalidation result is simply ignored below), and the two real
 * branches are combined into two independent TOP-LEVEL booleans
 * (`shouldRecompute`, `shouldRemove`) — both require `existing.has_voucher`,
 * so neither fires when there is nothing to revalidate.
 */

import {
  WorkflowResponse,
  createWorkflow,
  transform,
  when,
} from "@medusajs/framework/workflows-sdk";
import {
  acquireLockStep,
  deletePromotionsWorkflow,
  releaseLockStep,
  updateCartPromotionsWorkflow,
} from "@medusajs/core-flows";
import { PromotionActions, Modules } from "@medusajs/framework/utils";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import type { ICartModuleService } from "@medusajs/framework/types";
import { checkVoucherExistsStep } from "./steps/check-voucher-exists";
import { loadCartContextStep } from "./steps/load-cart-context";
import { lookupVoucherStep } from "./steps/lookup-voucher";
import { revalidateStep } from "./steps/revalidate-voucher";
import { writeVoucherCartMetadataStep } from "./steps/write-voucher-cart-metadata";
import { resolveAndCalculateVoucherDiscount } from "./lib/resolve-and-calculate-discount";
import { createAndAttachEphemeralPromotion } from "./lib/create-and-attach-ephemeral-promotion";
import { VOUCHER_METADATA_KEY } from "./lib/ephemeral-promotion";
import {
  VOUCHER_NOTICE_METADATA_KEY,
  VoucherAutoRemoveNotice,
  buildAutoRemoveNotice,
} from "./lib/auto-remove-notice";

export const revalidateVoucherWorkflowId = "revalidate-voucher-on-cart-change";

export interface RevalidateVoucherWorkflowInput {
  cart_id: string;
}

/**
 * Auto-remove path (tasks 3.5.7/3.5.8/3.5.9/3.5.10): clears the `voucher`
 * snapshot from `cart.metadata` AND writes the `VOUCHER_AUTO_REMOVED`
 * notification (with the specific reason) under `cart.metadata.voucher_notice`
 * so the storefront can tell the customer WHY on its next cart refetch (§11.3
 * step 3b / §8.4; PD-09 = MVP refetch/polling, no real-time push). Both changes
 * are one merge-patch write.
 *
 * **Framework finding (Day 4 session, still load-bearing here):**
 * `CartModuleService.updateCarts`'s `metadata` patch is a MERGE-PATCH, not a
 * replace — verified via `@medusajs/utils/dist/common/merge-metadata.js`
 * (`mergeMetadata`, used by every `MedusaService`-based module's generic update
 * path, `dist/modules-sdk/medusa-internal-service.js:238`): keys absent from
 * the patch are preserved untouched; a key is DELETED only when the patch sets
 * it to the empty string `""`; any other value overwrites. So in one patch:
 * `voucher: ""` deletes the stale snapshot, `voucher_notice: <object>` writes
 * the reason, and every other metadata key is preserved. Passing `{}` or simply
 * omitting `voucher` would be a NO-OP for that key (confirmed empirically Day 4),
 * so `""` is required to actually clear it.
 */
const removeAndNotifyStepId = "remove-voucher-and-notify-auto-removed";
const removeAndNotifyStep = createStep(
  removeAndNotifyStepId,
  async (
    input: { cart_id: string; notice: VoucherAutoRemoveNotice },
    { container },
  ) => {
    const cartModuleService: ICartModuleService = container.resolve(
      Modules.CART,
    );
    await cartModuleService.updateCarts(input.cart_id, {
      metadata: {
        [VOUCHER_METADATA_KEY]: "", // merge-patch delete of the stale snapshot
        [VOUCHER_NOTICE_METADATA_KEY]: input.notice, // async reason (3.5.9/3.5.10)
      },
    });
    return new StepResponse({ cleared: true, notified: true });
  },
);

export const revalidateVoucherWorkflow = createWorkflow(
  revalidateVoucherWorkflowId,
  (input: RevalidateVoucherWorkflowInput) => {
    // Same lock namespace as applyVoucherWorkflow/removeVoucherWorkflow
    // (EC-04) — a cart mutation's revalidation must not race an in-flight
    // apply/remove request touching cart.metadata.voucher.
    const lockKey = transform(
      { input },
      ({ input }) => `voucher:cart:${input.cart_id}`,
    );
    acquireLockStep({ key: lockKey, ttl: 10 });

    const existing = checkVoucherExistsStep({ cart_id: input.cart_id });

    const cart = loadCartContextStep({
      cart_id: input.cart_id,
      voucher_promotion_id: transform(
        { existing },
        ({ existing }) => existing.active?.ephemeral_promotion_id,
      ),
    });

    const lookup = lookupVoucherStep({
      code: transform(
        { existing },
        ({ existing }) => existing.active?.code ?? "",
      ),
      customer_id: "",
    });

    const revalidation = revalidateStep({ voucher: lookup.voucher, cart });

    const shouldRecompute = transform(
      { existing, revalidation },
      ({ existing, revalidation }) =>
        existing.has_voucher && revalidation.still_valid,
    );
    const shouldRemove = transform(
      { existing, revalidation },
      ({ existing, revalidation }) =>
        existing.has_voucher && !revalidation.still_valid,
    );

    // Still valid → recompute the amount and replace the ephemeral promotion
    // (a Promotion's `value` is not mutated in place — Decision G).
    when({ shouldRecompute }, ({ shouldRecompute }) => shouldRecompute).then(
      () => {
        const discount = resolveAndCalculateVoucherDiscount({ lookup, cart });

        const newPromotion = createAndAttachEphemeralPromotion({
          cart_id: input.cart_id,
          voucher_id: transform({ lookup }, ({ lookup }) => lookup.voucher!.id),
          cart,
          discount,
          attachStepName: "add-recomputed-ephemeral-promotion",
        });

        writeVoucherCartMetadataStep({
          cart_id: input.cart_id,
          voucher: transform(
            { lookup, discount, newPromotion, existing },
            ({ lookup, discount, newPromotion, existing }) => ({
              voucher_id: lookup.voucher!.id,
              code: lookup.voucher!.code,
              ephemeral_promotion_id: newPromotion.id,
              ephemeral_code: newPromotion.code,
              discount_type: lookup.voucher!.discount_type,
              discount_value: lookup.voucher!.discount_value,
              uncapped_voucher_discount: discount.raw_voucher_discount,
              voucher_discount_after_voucher_cap:
                discount.voucher_discount_after_voucher_cap,
              discount_amount: discount.final_voucher_discount,
              discount_capped: discount.discount_capped,
              original_discount: discount.voucher_discount_after_voucher_cap,
              cap_percentage_bps: lookup.global_cap_bps,
              original_subtotal: discount.original_subtotal,
              item_promotion_discount: discount.item_promotion_discount,
              revalidation_marker: existing.active!.revalidation_marker,
            }),
          ),
          previous_metadata: existing.previous_metadata,
        });

        // Detach + delete the OLD ephemeral promotion only after the new one
        // is attached (never a window with zero or double discount applied).
        updateCartPromotionsWorkflow
          .runAsStep({
            input: transform({ input, existing }, ({ input, existing }) => ({
              cart_id: input.cart_id,
              promo_codes: [existing.active!.ephemeral_code],
              action: PromotionActions.REMOVE,
            })),
          })
          .config({ name: "remove-stale-ephemeral-promotion" });

        // `deletePromotionsWorkflow`'s declared output type is `never`,
        // which makes `.config` structurally unavailable via TS even though
        // it exists at runtime — cast past it. A unique name is REQUIRED
        // here even though `shouldRecompute`/`shouldRemove` are mutually
        // exclusive at runtime: Medusa's workflow builder statically
        // discovers every step in the composer function body regardless of
        // which `when()` branch it sits in, so two `runAsStep()` calls on
        // the SAME underlying workflow anywhere in one workflow definition
        // collide on the auto-generated step id ("Step ... is already
        // defined in workflow") unless each has an explicit unique name —
        // verified empirically this session (this crashed the whole app's
        // workflow loader, not just this workflow, until fixed).
        (
          deletePromotionsWorkflow.runAsStep({
            input: transform({ existing }, ({ existing }) => ({
              ids: [existing.active!.ephemeral_promotion_id],
            })),
          }) as any
        ).config({ name: "delete-stale-ephemeral-promotion" });
      },
    );

    // Invalid → auto-remove: detach + delete the ephemeral promotion and
    // clear the metadata snapshot (tasks 3.5.7/3.5.8, VOUCHER_AUTO_REMOVED).
    when({ shouldRemove }, ({ shouldRemove }) => shouldRemove).then(() => {
      updateCartPromotionsWorkflow
        .runAsStep({
          input: transform({ input, existing }, ({ input, existing }) => ({
            cart_id: input.cart_id,
            promo_codes: [existing.active!.ephemeral_code],
            action: PromotionActions.REMOVE,
          })),
        })
        .config({ name: "remove-invalid-ephemeral-promotion" });

      (
        deletePromotionsWorkflow.runAsStep({
          input: transform({ existing }, ({ existing }) => ({
            ids: [existing.active!.ephemeral_promotion_id],
          })),
        }) as any
      ).config({ name: "delete-invalid-ephemeral-promotion" });

      // Build the async VOUCHER_AUTO_REMOVED notice from the SPECIFIC failure
      // (min-order → 3.5.9, no-eligible-items → 3.5.10, …). `revalidation` always
      // carries `failure_code` on this branch (still_valid === false); the pure
      // builder defaults defensively if it were ever missing.
      const notice = transform(
        { existing, revalidation },
        ({ existing, revalidation }) =>
          buildAutoRemoveNotice({
            voucher_code: existing.active!.code,
            failure_code: revalidation.failure_code,
          }),
      );

      removeAndNotifyStep({ cart_id: input.cart_id, notice });
    });

    releaseLockStep({ key: lockKey });

    return new WorkflowResponse(
      transform({ existing }, ({ existing }) => ({
        revalidated: existing.has_voucher,
      })),
    );
  },
);

export default revalidateVoucherWorkflow;
