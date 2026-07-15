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
  createPromotionsWorkflow,
  deletePromotionsWorkflow,
  updateCartPromotionsWorkflow,
} from "@medusajs/core-flows";
import { PromotionActions, Modules } from "@medusajs/framework/utils";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import type { ICartModuleService } from "@medusajs/framework/types";
import { checkVoucherExistsStep } from "./steps/check-voucher-exists";
import { loadCartContextStep } from "./steps/load-cart-context";
import { lookupVoucherStep } from "./steps/lookup-voucher";
import { resolveEligibleItemsStep } from "./steps/resolve-eligible-items";
import { calculateVoucherDiscountStep } from "./steps/calculate-voucher-discount";
import { revalidateStep } from "./steps/revalidate-voucher";
import { writeVoucherCartMetadataStep } from "./steps/write-voucher-cart-metadata";
import { toVoucherScope } from "./lib/mappers";
import {
  VOUCHER_METADATA_KEY,
  generateEphemeralPromotionCode,
} from "./lib/ephemeral-promotion";

export const revalidateVoucherWorkflowId = "revalidate-voucher-on-cart-change";

export interface RevalidateVoucherWorkflowInput {
  cart_id: string;
}

/**
 * Clears the `voucher` key from `cart.metadata` (auto-remove path).
 *
 * **Framework finding (this session):** `CartModuleService.updateCarts`'s
 * `metadata` patch is a MERGE-PATCH, not a replace — verified via
 * `@medusajs/utils/dist/common/merge-metadata.js` (`mergeMetadata`, used by
 * every `MedusaService`-based module's generic update path, `dist/modules-sdk/
 * medusa-internal-service.js:238`): keys absent from the patch are preserved
 * from the existing metadata untouched. Passing `{}` (or any object simply
 * omitting the `voucher` key) is therefore a NO-OP for that key, not a clear
 * — confirmed empirically: an update with `metadata: {}` left
 * `cart.metadata.voucher` completely unchanged. Per `mergeMetadata`'s own
 * documented rule, a key is deleted ONLY when the patch explicitly sets it to
 * the empty string `""` — so the key must be set to `""`, never just omitted.
 */
const clearVoucherMetadataOnAutoRemoveStepId =
  "clear-voucher-metadata-on-auto-remove";
const clearVoucherMetadataOnAutoRemoveStep = createStep(
  clearVoucherMetadataOnAutoRemoveStepId,
  async (input: { cart_id: string }, { container }) => {
    const cartModuleService: ICartModuleService = container.resolve(
      Modules.CART,
    );
    await cartModuleService.updateCarts(input.cart_id, {
      metadata: { [VOUCHER_METADATA_KEY]: "" },
    });
    return new StepResponse({ cleared: true });
  },
);

export const revalidateVoucherWorkflow = createWorkflow(
  revalidateVoucherWorkflowId,
  (input: RevalidateVoucherWorkflowInput) => {
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
        const scope = transform({ lookup }, ({ lookup }) =>
          toVoucherScope(
            lookup.voucher ?? {
              applicable_product_ids: null,
              applicable_category_ids: null,
            },
          ),
        );

        const resolved = resolveEligibleItemsStep({
          lines: cart.lines,
          scope,
        });

        const voucherTerms = transform({ lookup }, ({ lookup }) => ({
          discount_type: lookup.voucher!.discount_type,
          discount_value: lookup.voucher!.discount_value,
          max_discount_amount: lookup.voucher!.max_discount_amount,
        }));

        const discount = calculateVoucherDiscountStep({
          lines: resolved.lines,
          voucher: voucherTerms,
          global_cap_bps: lookup.global_cap_bps,
        });

        const newPromotionInput = transform(
          { input, cart, discount, lookup },
          ({ input, cart, discount, lookup }) => ({
            promotionsData: [
              {
                code: generateEphemeralPromotionCode(
                  input.cart_id,
                  lookup.voucher!.id,
                ),
                type: "standard" as const,
                status: "active" as const,
                is_automatic: false,
                application_method: {
                  type: "fixed" as const,
                  target_type: "items" as const,
                  allocation: "across" as const,
                  value: discount.final_voucher_discount,
                  currency_code: cart.currency_code,
                },
              },
            ],
          }),
        );

        const created = createPromotionsWorkflow.runAsStep({
          input: newPromotionInput,
        });

        const newPromotion = transform({ created }, ({ created }) => ({
          id: created[0].id,
          code: created[0].code as string,
        }));

        updateCartPromotionsWorkflow
          .runAsStep({
            input: transform(
              { input, newPromotion },
              ({ input, newPromotion }) => ({
                cart_id: input.cart_id,
                promo_codes: [newPromotion.code],
                action: PromotionActions.ADD,
              }),
            ),
          })
          .config({ name: "add-recomputed-ephemeral-promotion" });

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
              raw_voucher_discount: discount.raw_voucher_discount,
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

      clearVoucherMetadataOnAutoRemoveStep({ cart_id: input.cart_id });
    });

    return new WorkflowResponse(
      transform({ existing }, ({ existing }) => ({
        revalidated: existing.has_voucher,
      })),
    );
  },
);

export default revalidateVoucherWorkflow;
