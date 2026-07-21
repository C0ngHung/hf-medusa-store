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
  deleteCartCreditLinesWorkflow,
  releaseLockStep,
} from "@medusajs/core-flows";
import { Modules } from "@medusajs/framework/utils";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import type { ICartModuleService } from "@medusajs/framework/types";
import { checkVoucherExistsStep } from "./steps/check-voucher-exists";
import { loadCartContextStep } from "./steps/load-cart-context";
import { lookupVoucherStep } from "./steps/lookup-voucher";
import { revalidateStep } from "./steps/revalidate-voucher";
import { writeVoucherCartMetadataStep } from "./steps/write-voucher-cart-metadata";
import { resolveAndCalculateVoucherDiscount } from "./lib/resolve-and-calculate-discount";
import { createVoucherCreditLine } from "./lib/create-voucher-credit-line";
import { VOUCHER_METADATA_KEY } from "./lib/voucher-cart-metadata";
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

    // Credit lines never appear in `items.adjustments`, so the item-promotion
    // baseline is voucher-free without excluding any old carrier.
    const cart = loadCartContextStep({ cart_id: input.cart_id });

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

    // Still valid → recompute the amount and replace the voucher credit line
    // (a credit line's amount is not mutated in place — delete + recreate).
    when({ shouldRecompute }, ({ shouldRecompute }) => shouldRecompute).then(
      () => {
        const discount = resolveAndCalculateVoucherDiscount({ lookup, cart });

        const newCreditLine = createVoucherCreditLine({
          cart_id: input.cart_id,
          voucher_id: transform({ lookup }, ({ lookup }) => lookup.voucher!.id),
          code: transform({ lookup }, ({ lookup }) => lookup.voucher!.code),
          discount,
        });

        writeVoucherCartMetadataStep({
          cart_id: input.cart_id,
          voucher: transform(
            { lookup, discount, newCreditLine, existing },
            ({ lookup, discount, newCreditLine, existing }) => ({
              voucher_id: lookup.voucher!.id,
              code: lookup.voucher!.code,
              credit_line_id: newCreditLine.credit_line_id,
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

        // Delete the OLD credit line only after the new one is created (final
        // state carries exactly one voucher credit line). A unique step name is
        // REQUIRED: Medusa's workflow builder statically discovers every step in
        // the composer body regardless of which `when()` branch it sits in, so
        // the two `deleteCartCreditLinesWorkflow` calls (this branch + the
        // auto-remove branch) collide on the auto-generated step id unless each
        // is named. `.config` is cast past its `undefined` workflow-output type.
        (
          deleteCartCreditLinesWorkflow.runAsStep({
            input: transform({ existing }, ({ existing }) => ({
              id: [existing.active!.credit_line_id],
            })),
          }) as any
        ).config({ name: "delete-stale-voucher-credit-line" });
      },
    );

    // Invalid → auto-remove: detach + delete the ephemeral promotion and
    // clear the metadata snapshot (tasks 3.5.7/3.5.8, VOUCHER_AUTO_REMOVED).
    when({ shouldRemove }, ({ shouldRemove }) => shouldRemove).then(() => {
      // Delete the voucher credit line (carrier). Distinct step name from the
      // recompute branch's delete (see that branch's note on static step-id
      // discovery across `when()` branches).
      (
        deleteCartCreditLinesWorkflow.runAsStep({
          input: transform({ existing }, ({ existing }) => ({
            id: [existing.active!.credit_line_id],
          })),
        }) as any
      ).config({ name: "delete-invalid-voucher-credit-line" });

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
