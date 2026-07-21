/**
 * lookupVoucherStep — real DB voucher + usage + cap lookup (SPEC §11.10
 * `lookupVoucherStep`, adapted; Phase-3 items 3/4/7/8/9).
 *
 * Resolves `VoucherEngineService` from the container and reads everything the
 * V1-V8 validation chain and the discount calculator need in one round trip:
 * the voucher row itself (V1, by code — `findByCode`), how many times this
 * customer has already redeemed it (V4 — `countUserUsage`), and the active
 * global discount cap in basis points, already falling back to
 * `DEFAULT_CAP_PCT` (5000 bps) server-side when no active `DiscountCapConfig`
 * row exists (`getActiveCap`, task 3.3.10 / Phase-3 item 8).
 *
 * Admin unified-model fix — source-of-truth ownership. `VoucherConfig`'s own
 * `code`/`discount_type`/`discount_value` columns are kept only as a
 * deprecated/denormalized cache (not physically dropped — no approved
 * column-removal migration exists yet); the canonical linked Promotion is
 * authoritative for these three fields via the shared
 * `resolveVoucherNativeFields` overlay (also used by the admin
 * `GET .../voucher-config` route, so the two can never disagree). This
 * overlay re-resolves them on EVERY lookup call — including cache hits,
 * since the cache (`lib/voucher-cache.ts`) stores the raw `VoucherConfig`
 * row unchanged — so an edit made later via the native Promotion UI (code
 * rename, discount value change) takes effect immediately and drift in
 * `VoucherConfig`'s own cached columns can never silently affect V1-V8
 * validation or discount calculation.
 *
 * `usage_limit`/`valid_from`/`valid_to` are NOT part of that overlay —
 * VoucherConfig-owned, authoritative columns read as-is (bug-bash fix,
 * 2026-07-21 for `usage_limit`, matching SPEC.md §5.4/§10/§11.4; see
 * `resolve-voucher-native-fields.ts`'s docstring for why the overlay was
 * removed for that field specifically).
 *
 * `is_active` is DELIBERATELY excluded from that overlay — it is
 * VoucherEngine's own persisted Enable/Disable flag (a genuine
 * VoucherEngine-only concept, not derived from the Promotion's native
 * `status`), so `voucher.is_active` always reflects whatever the
 * Enable/Disable workflow last set, regardless of Promotion status. This is
 * what makes V1 (`lib/validators.ts`'s `v1Exists`) correctly reject a
 * disabled Voucher at the cart-code endpoint (Admin unified model, cart-code
 * behavior requirement) — automatic Promotions can never reach this path at
 * all (they can never have a linked VoucherConfig, per
 * `assert-promotion-voucher-eligible.ts`), and a non-automatic Promotion with
 * VoucherEngine disabled fails here exactly like a nonexistent code.
 */

import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { VOUCHER_ENGINE_MODULE } from "../../../modules/voucher-engine";
import type VoucherEngineService from "../../../modules/voucher-engine/service";
import type { PersistedVoucherConfig } from "../lib/mappers";
import {
  getCachedVoucherConfig,
  setCachedVoucherConfig,
} from "../../../lib/voucher-cache";
import { resolveVoucherNativeFields } from "../admin/lib/resolve-voucher-native-fields";

export const lookupVoucherStepId = "lookup-voucher";

export interface LookupVoucherInput {
  code: string;
  customer_id: string;
}

export interface LookupVoucherOutput {
  /** null -> V1 NOT_FOUND (voucher code has no matching row). */
  voucher: PersistedVoucherConfig | null;
  /** V4 — this customer's prior redemption count for this voucher (0 when voucher is null). */
  user_usage_count: number;
  /** VOUCH-003 — active global cap in basis points, defaulted server-side (task 3.3.10). */
  global_cap_bps: number;
}

export const lookupVoucherStep = createStep(
  lookupVoucherStepId,
  async (input: LookupVoucherInput, { container }) => {
    const service = container.resolve(
      VOUCHER_ENGINE_MODULE,
    ) as VoucherEngineService;

    // 3.7.1/3.7.2 — cache ONLY the cart-independent config row; usage count
    // and cap stay live/uncached (cart/customer-dependent).
    let voucher = await getCachedVoucherConfig<PersistedVoucherConfig>(
      container,
      input.code,
    );
    if (!voucher) {
      voucher = (await service.findByCode(
        input.code,
      )) as PersistedVoucherConfig | null;
      if (voucher) {
        await setCachedVoucherConfig(container, input.code, voucher);
      }
    }

    if (voucher) {
      voucher = await resolveVoucherNativeFields(container, voucher);
    }

    const [user_usage_count, global_cap_bps] = await Promise.all([
      voucher
        ? service.countUserUsage(voucher.id, input.customer_id)
        : Promise.resolve(0),
      service.getActiveCap(),
    ]);

    const output: LookupVoucherOutput = {
      voucher,
      user_usage_count,
      global_cap_bps,
    };
    return new StepResponse(output);
  },
  // Read-only step — no compensation.
);
