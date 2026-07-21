/**
 * resolveVoucherUsageLimitStep — SPEC §14.3. Re-fetches the voucher's own
 * `voucher_config.usage_limit` column immediately before redemption (rather
 * than trusting a value threaded through from an earlier step in the same
 * workflow), so the atomic redeem check always sees the current row.
 *
 * `usage_limit` is VoucherConfig-owned configuration (bug-bash fix,
 * 2026-07-21, SPEC.md §5.4/§10/§11.4 — supersedes rebuild-decisions.md
 * Decision 3, which had this re-resolve LIVE from the linked Promotion's
 * `limit`/`Campaign.budget` instead; see `resolve-voucher-native-fields.ts`'s
 * current docstring). `resolveVoucherNativeFields` no longer overlays
 * `usage_limit`, so this now simply returns the row's own column value —
 * kept as its own step (rather than inlined) so the redeem workflow always
 * re-reads fresh rather than reusing a possibly-stale value from an earlier
 * step's output.
 *
 * `voucher_id` empty (no voucher on the order) → `null` (unlimited), a safe
 * no-op default since the caller (`record-voucher-usage.ts`) only uses this
 * output inside its own `has_voucher` branch.
 */

import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { VOUCHER_ENGINE_MODULE } from "../../../modules/voucher-engine";
import type VoucherEngineService from "../../../modules/voucher-engine/service";
import { resolveVoucherNativeFields } from "../admin/lib/resolve-voucher-native-fields";

export const resolveVoucherUsageLimitStepId = "resolve-voucher-usage-limit";

export interface ResolveVoucherUsageLimitInput {
  voucher_id?: string;
}

export interface ResolveVoucherUsageLimitOutput {
  usage_limit: number | null;
}

export const resolveVoucherUsageLimitStep = createStep(
  resolveVoucherUsageLimitStepId,
  async (input: ResolveVoucherUsageLimitInput, { container }) => {
    if (!input.voucher_id) {
      return new StepResponse<ResolveVoucherUsageLimitOutput>({
        usage_limit: null,
      });
    }

    const service = container.resolve(
      VOUCHER_ENGINE_MODULE,
    ) as VoucherEngineService;

    let voucher;
    try {
      voucher = await service.retrieveVoucherConfig(input.voucher_id);
    } catch {
      voucher = null;
    }
    if (!voucher) {
      return new StepResponse<ResolveVoucherUsageLimitOutput>({
        usage_limit: null,
      });
    }

    const resolved = await resolveVoucherNativeFields(
      container,
      voucher as {
        promotion_id?: string | null;
        usage_limit?: number | null;
      },
    );

    return new StepResponse<ResolveVoucherUsageLimitOutput>({
      usage_limit: resolved.usage_limit ?? null,
    });
  },
  // Read-only — no compensation.
);
