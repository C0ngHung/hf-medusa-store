/**
 * attachVoucherConfigWorkflow — "Enable VoucherEngine on an existing
 * Promotion" (Admin unified model). Backs `POST
 * /admin/promotions/:promotion_id/voucher-config`. Idempotent: creates a new
 * linked `VoucherConfig` if none exists, or reactivates/updates the existing
 * one (Disable -> re-Enable reuses the same row and its history) — see
 * `upsertLinkedVoucherConfigStep`.
 *
 * The old atomic, Promotion-first `createVoucherWorkflow`
 * (`admin/create-voucher.ts`) is retired from the admin UI in this revision
 * (no admin route calls it anymore — the "Create voucher" page and legacy
 * Voucher list are removed). This workflow is now the ONLY way VoucherEngine
 * gets enabled on a Promotion: native `POST /admin/promotions` creates the
 * Promotion, then this workflow attaches VoucherEngine to it.
 *
 * Concurrency: an `acquireLockStep`/`releaseLockStep` pair (same
 * `@medusajs/core-flows` Locking Module primitives `apply-voucher.ts` already
 * uses) serializes concurrent Enable/Disable attempts for the SAME
 * `promotion_id` — `disableVoucherConfigWorkflow` uses the identical lock
 * key. The DB-level partial unique index on `voucher_config.promotion_id`
 * (Migration20260720120000) is the actual backstop if the Locking Module is
 * degraded/absent (this repo's Redis-optional convention, `REDIS_USAGE.md`).
 *
 * Product/category scope ownership: this workflow never reads or writes the
 * Promotion's own `application_method.target_rules` — scope stays the sole
 * responsibility of `VoucherConfig.applicable_product_ids`/
 * `applicable_category_ids` (this input's fields). Native `target_rules`
 * combine with AND semantics only
 * (`@medusajs/promotion/dist/utils/validations/promotion-rule.js:36`), so
 * they cannot express this SRS's product-OR-category scope (verified during
 * the rebuild's Phase 1 `target_rules` spike, `rebuild-decisions.md`).
 *
 * `usage_limit` is NOT part of this input (Admin unified model, strict
 * native-field reuse) — the native equivalent is the linked Promotion's own
 * `limit` field, read live by `upsertLinkedVoucherConfigStep`'s
 * `derivePromotionCacheFields` call and by `steps/lookup-voucher.ts` at
 * apply-time. A merchant who wants a usage limit sets it on the native
 * Promotion itself.
 *
 * `valid_from`/`valid_to` ARE part of this input (reverted 2026-07-21 —
 * `Promotion` has no native date field; only an attached `Campaign` does,
 * shared across every Promotion in it, which is the wrong granularity for a
 * per-voucher window). VoucherConfig owns and enforces these directly, but
 * ONLY at creation — `upsertLinkedVoucherConfigStep` deliberately ignores
 * them on an update/re-enable of an already-existing row (2026-07-21 form
 * validation fix): re-submitting the Enable form (or a Disable -> re-Enable
 * cycle) must never silently reset or extend a voucher's validity window.
 *
 * `max_discount_amount` is cross-field validated against the Promotion's
 * `application_method.type` and `min_order_value`
 * (`assertVoucherConfigInputValidStep` / `validateAttachVoucherConfigInput`,
 * 2026-07-21) — only meaningful for a percentage voucher, and must be
 * strictly less than `min_order_value`.
 *
 * On success, pushes an admin "feed" notification (Local Notification
 * Module Provider, `sendNotificationsStep`) so Enable actions show up in the
 * Admin Dashboard's notification panel.
 */
import {
  WorkflowResponse,
  createWorkflow,
  transform,
} from "@medusajs/framework/workflows-sdk";
import {
  acquireLockStep,
  releaseLockStep,
  sendNotificationsStep,
} from "@medusajs/core-flows";
import { loadPromotionForAttachStep } from "./steps/load-promotion-for-attach";
import { assertPromotionVoucherEligibleStep } from "./steps/assert-promotion-voucher-eligible";
import { assertVoucherConfigInputValidStep } from "./steps/assert-voucher-config-input-valid";
import { upsertLinkedVoucherConfigStep } from "./steps/upsert-linked-voucher-config";

export const attachVoucherConfigWorkflowId = "attach-voucher-config";

export interface AttachVoucherConfigWorkflowInput {
  promotion_id: string;
  min_order_value?: number | null;
  max_discount_amount?: number | null;
  applicable_product_ids?: string[] | null;
  applicable_category_ids?: string[] | null;
  per_user_limit: number;
  user_segment_conditions?: Record<string, unknown> | null;
  valid_from: Date | string;
  valid_to: Date | string;
}

export const attachVoucherConfigWorkflow = createWorkflow(
  attachVoucherConfigWorkflowId,
  (input: AttachVoucherConfigWorkflowInput) => {
    const lockKey = transform(
      { input },
      ({ input }) => `voucher-enable:promotion:${input.promotion_id}`,
    );

    acquireLockStep({ key: lockKey, ttl: 10 });

    const promotion = loadPromotionForAttachStep({
      promotion_id: input.promotion_id,
    });

    assertPromotionVoucherEligibleStep({ promotion });

    assertVoucherConfigInputValidStep({
      promotion,
      input: {
        min_order_value: input.min_order_value,
        max_discount_amount: input.max_discount_amount,
      },
    });

    const voucher = upsertLinkedVoucherConfigStep({
      promotion,
      min_order_value: input.min_order_value,
      max_discount_amount: input.max_discount_amount,
      applicable_product_ids: input.applicable_product_ids,
      applicable_category_ids: input.applicable_category_ids,
      per_user_limit: input.per_user_limit,
      user_segment_conditions: input.user_segment_conditions,
      valid_from: input.valid_from,
      valid_to: input.valid_to,
    });

    releaseLockStep({ key: lockKey });

    const notifications = transform({ voucher }, ({ voucher }) => [
      {
        to: "",
        channel: "feed",
        template: "admin-ui",
        data: {
          title: "VoucherEngine enabled",
          description: `Voucher "${voucher.code}" is now active.`,
        },
      },
    ]);
    sendNotificationsStep(notifications);

    return new WorkflowResponse(voucher);
  },
);

export default attachVoucherConfigWorkflow;
