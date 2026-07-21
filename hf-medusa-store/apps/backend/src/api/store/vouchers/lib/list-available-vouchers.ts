/**
 * listAvailableVouchers — shared read-only logic behind BOTH
 * `GET /store/vouchers` (public, auth-optional — 2026-07-21) and
 * `GET /store/customers/me/vouchers` ("My Vouchers", auth-required by
 * Medusa's own core `/store/customers/me/*` middleware). Factored out so the
 * two routes can never drift on filtering/DTO-building logic — only on
 * whether a missing customer identity short-circuits to an empty list.
 *
 * V7 segment gating and the cart-eligibility preview are identical to the
 * original `GET /store/customers/me/vouchers` (task 3.4.3; API_CONTRACT
 * §1.3, Decision F) — see that route's file header (still present) for the
 * full rationale on `estimated_savings`' basis, sort order, and which V-rules
 * are deliberately not run here. `customerId: null` (guest) is fully
 * supported: `resolveCustomerSegment` resolves a guest to
 * `{ customer_id: null, group_ids: [] }` and `v7Segment` still passes any
 * unrestricted voucher (`user_segment_conditions: null`) for that snapshot —
 * only segment-gated vouchers correctly stay hidden from a guest.
 */
import { MedusaStoreRequest } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { VOUCHER_ENGINE_MODULE } from "../../../../modules/voucher-engine";
import type VoucherEngineService from "../../../../modules/voucher-engine/service";
import { sumInts, toInt } from "../../../../modules/voucher-engine/lib/money";
import {
  LineValue,
  calculateOriginalSubtotal,
  calculateVoucherDiscount,
  resolveEligibleItems,
} from "../../../../modules/voucher-engine/lib/calculate-discount";
import {
  v5MinOrder,
  v6Scope,
  v7Segment,
} from "../../../../workflows/voucher-engine/lib/validators";
import { resolveCustomerSegment } from "../../../../workflows/voucher-engine/lib/customer-segment";
import { resolveVoucherNativeFields } from "../../../../workflows/voucher-engine/admin/lib/resolve-voucher-native-fields";
import {
  VoucherValidationError,
  toErrorEnvelope,
} from "../../../../workflows/voucher-engine/lib/errors";
import type {
  CartLineSnapshot,
  CartSnapshot,
  VoucherSnapshot,
} from "../../../../workflows/voucher-engine/lib/types";

export interface StoreVoucherDTO {
  code: string;
  description: string;
  discount_type: "percentage" | "fixed_amount";
  discount_value: number;
  valid_to: string;
  min_order: number | null;
  applicable_categories: string[];
  /** Only present when `cartId` was supplied. */
  eligible?: boolean;
  ineligible_reason?: string;
  /** Integer VND, against the cart's ORIGINAL subtotal — only present when
   * `cartId` was supplied. */
  estimated_savings?: number;
}

/** The subset of `voucher_config` this route reads. Matches the model 1:1
 * (see `modules/voucher-engine/models/voucher-config.ts`) — `listVoucherConfigs`
 * with no `select` returns every column; this only narrows the compile-time
 * view to what's actually used below. */
interface RawVoucherConfig {
  promotion_id?: string | null;
  code: string;
  discount_type: "percentage" | "fixed_amount";
  discount_value: number;
  min_order_value: number | null;
  max_discount_amount: number | null;
  applicable_product_ids: string[] | null;
  applicable_category_ids: string[] | null;
  per_user_limit: number;
  usage_limit: number | null;
  usage_count: number;
  user_segment_conditions: Record<string, unknown> | null;
  is_active: boolean;
  valid_from: unknown;
  valid_to: unknown;
}

function describeVoucher(voucher: {
  discount_type: "percentage" | "fixed_amount";
  discount_value: number;
}): string {
  if (voucher.discount_type === "percentage") {
    const pct = voucher.discount_value / 100; // bps -> percent (2000 -> 20)
    return `Giảm ${Number.isInteger(pct) ? pct : pct.toFixed(2)}%`;
  }
  return `Giảm ${new Intl.NumberFormat("vi-VN").format(voucher.discount_value)}₫`;
}

/** Cart read for the eligibility + "estimated savings" preview. Mirrors
 * `steps/load-cart-context.ts`'s line mapping (Rule 11 / SPEC §10.7): only a
 * genuine Promotion-backed adjustment (non-null `promotion_id`) counts as
 * `item_promotion_discount` — VoucherEngine's own adjustments always carry
 * `promotion_id: null`. Bug-bash fix, 2026-07-21: this previously hardcoded
 * `item_promotion_discount: 0`, so a cart that already had an automatic
 * Promotion applied got an `estimated_savings` computed against the FULL
 * original subtotal instead of the post-promotion one — overstating what the
 * voucher would actually contribute once real V-chain calc runs the fixed
 * "item promo first, then voucher on the remainder" order
 * (`calculateVoucherDiscount`). Returns null when the cart doesn't exist
 * (never throws — an unrecognized cart_id should degrade to "no eligibility
 * info", not break the list). */
async function loadPreviewLines(
  scope: MedusaStoreRequest["scope"],
  cartId: string,
): Promise<LineValue[] | null> {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "cart",
    filters: { id: cartId },
    fields: [
      "id",
      "items.id",
      "items.unit_price",
      "items.quantity",
      "items.product_id",
      "items.product.categories.id",
      "items.adjustments.id",
      "items.adjustments.amount",
      "items.adjustments.promotion_id",
      "items.adjustments.code",
    ],
  });

  const rawCart = data?.[0] as
    | {
        id: string;
        items?: Array<{
          id: string;
          unit_price: unknown;
          quantity: unknown;
          product_id?: string | null;
          product?: { categories?: { id: string }[] } | null;
          adjustments?: Array<{
            amount: unknown;
            promotion_id?: string | null;
          }> | null;
        }> | null;
      }
    | undefined;
  if (!rawCart) return null;

  return (rawCart.items ?? []).map((item) => {
    // Rule 11: a non-null promotion_id is a genuine Promotion-backed
    // adjustment; VoucherEngine's own would be promotion_id: null (never
    // present here anyway, since this preview runs BEFORE any voucher apply).
    const nativePromotionAdjustments = (item.adjustments ?? []).filter(
      (adjustment) => adjustment.promotion_id != null,
    );
    const item_promotion_discount = sumInts(
      nativePromotionAdjustments.map((adjustment) =>
        toInt(adjustment.amount, `item[${item.id}].adjustment.amount`),
      ),
      `item[${item.id}].item_promotion_discount`,
    );

    return {
      line_id: item.id,
      unit_price: toInt(item.unit_price, `item[${item.id}].unit_price`),
      quantity: toInt(item.quantity, `item[${item.id}].quantity`),
      item_promotion_discount,
      product_id: item.product_id ?? null,
      category_ids: (item.product?.categories ?? []).map((c) => c.id),
      is_eligible: false, // set per-voucher by resolveEligibleItems below.
    };
  });
}

/** V5 + V6 only, fail-fast in that order (matches the real V1→V8 ordering). */
function checkCartEligibility(
  voucher: RawVoucherConfig,
  cart: CartSnapshot,
): { eligible: boolean; ineligible_reason?: string } {
  const snapshot: VoucherSnapshot = {
    code: voucher.code,
    is_active: voucher.is_active,
    valid_from: new Date(voucher.valid_from as string),
    valid_to: new Date(voucher.valid_to as string),
    usage_limit: voucher.usage_limit,
    usage_count: voucher.usage_count,
    per_user_limit: voucher.per_user_limit,
    min_order_value: voucher.min_order_value,
    applicable_product_ids: voucher.applicable_product_ids,
    applicable_category_ids: voucher.applicable_category_ids,
    user_segment_conditions: voucher.user_segment_conditions,
  };

  for (const check of [v5MinOrder, v6Scope]) {
    const result = check(snapshot, cart);
    if (!result.ok) {
      const { body } = toErrorEnvelope(new VoucherValidationError(result));
      return { eligible: false, ineligible_reason: body.customer_message };
    }
  }
  return { eligible: true };
}

export interface ListAvailableVouchersInput {
  scope: MedusaStoreRequest["scope"];
  /** null/undefined = guest — resolves to no Customer Group membership, so
   * only unrestricted (`user_segment_conditions: null`) vouchers are visible. */
  customerId: string | null | undefined;
  cartId?: string;
}

export async function listAvailableVouchers(
  input: ListAvailableVouchersInput,
): Promise<{ vouchers: StoreVoucherDTO[] }> {
  const { scope, customerId, cartId } = input;

  const ve = scope.resolve(VOUCHER_ENGINE_MODULE) as VoucherEngineService;
  const customerSegment = await resolveCustomerSegment(scope, customerId);

  const now = new Date();
  const activeRaw = (await ve.listVoucherConfigs(
    { is_active: true },
    { take: 1000 },
  )) as RawVoucherConfig[];

  // Source-of-truth overlay (same one `steps/lookup-voucher.ts` and the admin
  // `GET .../voucher-config` route use) — without this, a voucher whose
  // linked Promotion was edited natively after creation (code rename,
  // discount change) would show STALE cached `voucher_config` columns here.
  const active = await Promise.all(
    activeRaw.map((voucher) => resolveVoucherNativeFields(scope, voucher)),
  );

  const currentlyValid = active
    .filter((v) => {
      const from = new Date(v.valid_from as string);
      const to = new Date(v.valid_to as string);
      return from <= now && now <= to;
    })
    // V7 — unrestricted vouchers are visible to anyone (including guests);
    // gated vouchers only to customers in one of the configured native
    // Customer Groups.
    .filter(
      (v) =>
        v7Segment(
          { user_segment_conditions: v.user_segment_conditions },
          customerSegment,
        ).ok,
    );

  // Resolve category ids -> names for display (API_CONTRACT §1.3 `applicable_categories`).
  const allCategoryIds = Array.from(
    new Set(currentlyValid.flatMap((v) => v.applicable_category_ids ?? [])),
  );
  const categoryNameById = new Map<string, string>();
  if (allCategoryIds.length > 0) {
    const productModule = scope.resolve(Modules.PRODUCT);
    const categories = await productModule.listProductCategories(
      { id: allCategoryIds },
      { select: ["id", "name"], take: allCategoryIds.length },
    );
    for (const category of categories as Array<{ id: string; name: string }>) {
      categoryNameById.set(category.id, category.name);
    }
  }

  const previewLines = cartId ? await loadPreviewLines(scope, cartId) : null;
  const globalCapBps = previewLines ? await ve.getActiveCap() : null;

  let vouchers: StoreVoucherDTO[] = currentlyValid.map((v) => {
    const base: StoreVoucherDTO = {
      code: v.code,
      description: describeVoucher(v),
      discount_type: v.discount_type,
      discount_value: v.discount_value,
      valid_to: new Date(v.valid_to as string).toISOString(),
      min_order: v.min_order_value,
      applicable_categories: (v.applicable_category_ids ?? [])
        .map((id) => categoryNameById.get(id))
        .filter((name): name is string => !!name),
    };
    if (!previewLines || globalCapBps == null) return base;

    const cartSnapshot: CartSnapshot = {
      original_subtotal: calculateOriginalSubtotal(previewLines),
      items: previewLines.map(
        (line): CartLineSnapshot => ({
          product_id: line.product_id ?? "",
          category_ids: line.category_ids ?? [],
          quantity: line.quantity,
          unit_price: line.unit_price,
        }),
      ),
      // V8 (stacking) is not evaluated by this preview.
      has_item_promotion: false,
    };

    const scopedLines = resolveEligibleItems(previewLines, {
      product_ids: v.applicable_product_ids ?? [],
      category_ids: v.applicable_category_ids ?? [],
    });
    const { final_voucher_discount } = calculateVoucherDiscount({
      lines: scopedLines,
      discount_type: v.discount_type,
      discount_value: v.discount_value,
      max_discount_amount: v.max_discount_amount,
      global_cap_bps: globalCapBps,
    });

    return {
      ...base,
      ...checkCartEligibility(v, cartSnapshot),
      estimated_savings: final_voucher_discount,
    };
  });

  if (previewLines) {
    // "Smart order": eligible vouchers before ineligible ones; within each
    // group, biggest actual savings first.
    vouchers = [...vouchers].sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      return (b.estimated_savings ?? 0) - (a.estimated_savings ?? 0);
    });
  }

  return { vouchers };
}

export default listAvailableVouchers;
