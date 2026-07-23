import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { Modules } from "@medusajs/framework/utils";
import type { IPromotionModuleService } from "@medusajs/framework/types";
import { VOUCHER_ENGINE_MODULE } from "../../../../modules/voucher-engine";
import {
  derivePromotionCacheFields,
  type PromotionForCacheDerivation,
} from "../lib/derive-voucher-config-cache-fields";

/**
 * upsertLinkedVoucherConfigStep — "Enable VoucherEngine on an existing
 * Promotion" (Admin unified model). Idempotent create-or-reactivate-or-update:
 *
 *   - No linked VoucherConfig yet -> creates one, `is_active: true`.
 *   - A linked VoucherConfig exists (enabled OR disabled) -> reactivates it
 *     (`is_active: true`) and updates its VoucherEngine-owned fields from
 *     this call's input — reuses the SAME row (same id), preserving its
 *     `usage_count` and every `VoucherUsageLog` row referencing it (history
 *     is never lost by disable -> re-enable).
 *
 * Fields written here fall into three groups:
 *  - VoucherEngine-owned inputs, verbatim: `min_order_value`,
 *    `max_discount_amount`, scope, `per_user_limit`, `user_segment_conditions`
 *    (on create only, `valid_from`/`valid_to` — see below).
 *  - `derivePromotionCacheFields`'s output: `code`/`discount_type`/
 *    `discount_value` (deprecated cache columns, re-overlaid live from the
 *    Promotion on every read regardless — see `resolve-voucher-native-
 *    fields.ts`) PLUS `usage_limit`, which is different: `usage_limit` is
 *    VoucherConfig-owned, authoritative config (bug-bash fix, 2026-07-21,
 *    SPEC.md §5.4/§10/§11.4), and this call is the ONLY place it's ever
 *    written — a one-time seed from the linked Promotion's `limit` field, not
 *    a cache re-synced on every read.
 *  - `promotion_id`, wiring the `voucher-config-promotion` read-only Link —
 *    same "no `link.create()` call needed, it's a field-based link" pattern
 *    the `promotionsCreated` hook already uses.
 *
 * `is_active` is NOT part of `derivePromotionCacheFields` — set directly
 * below (`is_active: true`), since Enable always means "turn it on".
 * `stackable_with_promotions` is NOT written here either
 * (rebuild-decisions.md decision 2, 2026-07-20: not configurable, not part of
 * the Enable form; the legacy DB column keeps whatever value it already has,
 * never authoritative).
 *
 * `valid_from`/`valid_to` are VoucherConfig-owned inputs again (reverted
 * 2026-07-21 — no native Promotion date field exists; see
 * `derive-voucher-config-cache-fields.ts`'s docstring) — NOT part of
 * `cacheFields` (the derived-from-Promotion subset) anymore. Unlike every
 * other owned field, though, they are CREATE-ONLY (2026-07-21 form
 * validation fix): written from this call's input only when there is no
 * existing linked VoucherConfig yet. On an update/re-enable of an existing
 * row, the input's `valid_from`/`valid_to` are deliberately ignored and the
 * row's own existing values are left untouched — re-submitting the Enable
 * form (or a Disable -> re-Enable cycle) must never silently reset or extend
 * an already-configured voucher's validity window.
 *
 * Reactivating a previously-disabled row (`existing.is_active === false`)
 * also restores the linked Promotion's own `status` back to `"active"` —
 * symmetric with `disableLinkedVoucherConfigStep`'s bug-bash fix (2026-07-21)
 * that flips it to `"inactive"` on Disable to close the generic-promotion
 * fallback bypass. Only runs on that specific reactivate transition, not on
 * every Enable-form resubmit of an already-enabled voucher, so it never
 * clobbers a Promotion status a merchant set independently for unrelated
 * reasons.
 *
 * Compensatable: on create, deletes the row it created; on
 * reactivate/update, restores every field (including Promotion status) to
 * its pre-call snapshot.
 */
export const upsertLinkedVoucherConfigStepId = "upsert-linked-voucher-config";

export interface UpsertLinkedVoucherConfigInput {
  promotion: PromotionForCacheDerivation & { id: string };
  min_order_value?: number | null;
  max_discount_amount?: number | null;
  applicable_product_ids?: string[] | null;
  applicable_category_ids?: string[] | null;
  per_user_limit: number;
  user_segment_conditions?: Record<string, unknown> | null;
  valid_from: Date | string;
  valid_to: Date | string;
}

type CompensationData =
  | { mode: "created"; voucherConfigId: string }
  | {
      mode: "updated";
      previous: Record<string, unknown>;
      reactivatedPromotionId?: string;
    };

export const upsertLinkedVoucherConfigStep = createStep(
  upsertLinkedVoucherConfigStepId,
  async (input: UpsertLinkedVoucherConfigInput, { container }) => {
    const service: any = container.resolve(VOUCHER_ENGINE_MODULE);
    const cacheFields = derivePromotionCacheFields(input.promotion);
    const ownedFields = {
      min_order_value: input.min_order_value ?? null,
      max_discount_amount: input.max_discount_amount ?? null,
      applicable_product_ids: input.applicable_product_ids ?? null,
      applicable_category_ids: input.applicable_category_ids ?? null,
      per_user_limit: input.per_user_limit,
      user_segment_conditions: input.user_segment_conditions ?? null,
    };

    const [existing] = await service.listVoucherConfigs(
      { promotion_id: input.promotion.id },
      { take: 1 },
    );

    if (existing) {
      const wasDisabled = !existing.is_active;

      // valid_from/valid_to deliberately excluded — create-only, see file header.
      const voucher = await service.updateVoucherConfigs({
        id: existing.id,
        ...cacheFields,
        ...ownedFields,
        is_active: true,
      });

      if (wasDisabled) {
        const promotionService: IPromotionModuleService = container.resolve(
          Modules.PROMOTION,
        );
        await promotionService.updatePromotions({
          id: input.promotion.id,
          status: "active",
        });
      }

      const compensation: CompensationData = {
        mode: "updated",
        previous: existing,
        reactivatedPromotionId: wasDisabled ? input.promotion.id : undefined,
      };
      return new StepResponse(voucher, compensation);
    }

    const voucher = await service.createVoucherConfigs({
      promotion_id: input.promotion.id,
      ...cacheFields,
      ...ownedFields,
      valid_from: input.valid_from,
      valid_to: input.valid_to,
      is_active: true,
    });
    const compensation: CompensationData = {
      mode: "created",
      voucherConfigId: voucher.id,
    };
    return new StepResponse(voucher, compensation);
  },
  async (compensationData: CompensationData | undefined, { container }) => {
    if (!compensationData) return;
    const service: any = container.resolve(VOUCHER_ENGINE_MODULE);

    if (compensationData.mode === "created") {
      await service.deleteVoucherConfigs(compensationData.voucherConfigId);
      return;
    }

    const prev = compensationData.previous as Record<string, unknown>;
    await service.updateVoucherConfigs({
      id: prev.id,
      code: prev.code,
      discount_type: prev.discount_type,
      discount_value: prev.discount_value,
      min_order_value: prev.min_order_value,
      max_discount_amount: prev.max_discount_amount,
      applicable_product_ids: prev.applicable_product_ids,
      applicable_category_ids: prev.applicable_category_ids,
      per_user_limit: prev.per_user_limit,
      usage_limit: prev.usage_limit,
      user_segment_conditions: prev.user_segment_conditions,
      valid_from: prev.valid_from,
      valid_to: prev.valid_to,
      is_active: prev.is_active,
    });

    if (compensationData.reactivatedPromotionId) {
      const promotionService: IPromotionModuleService = container.resolve(
        Modules.PROMOTION,
      );
      await promotionService.updatePromotions({
        id: compensationData.reactivatedPromotionId,
        status: "inactive",
      });
    }
  },
);

export default upsertLinkedVoucherConfigStep;
