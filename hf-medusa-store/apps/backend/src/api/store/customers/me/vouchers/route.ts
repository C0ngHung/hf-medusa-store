/**
 * GET /store/customers/me/vouchers — "My Vouchers" (task 3.4.3; API_CONTRACT
 * §1.3, Decision F). Auth-optional: guest (no `auth_context`) → `200
 * { vouchers: [] }`, never 401 — this is a store-facing convenience list, not
 * an authenticated-only resource.
 *
 * MVP scope note: there is no customer-voucher assignment/CRM data model in
 * this codebase (segment/CRM assignment is explicitly deferred — SRS V7/PD-06
 * is a stub pass-through). Absent that, "my vouchers" lists every currently
 * active, currently-valid voucher — the same set any customer could discover
 * by entering a code — rather than a per-customer assignment. This is an
 * intentional MVP simplification, not a bug: there is nothing in scope to
 * assign vouchers to specific customers yet.
 *
 * Read-only (`query.graph` + a Product-category name lookup) — no workflow,
 * per SPEC §12 ("read-only, no workflow").
 *
 * Optional `?cart_id=` — when supplied, each voucher additionally gets
 * `eligible`/`ineligible_reason` computed against that cart's CURRENT
 * contents (V5 min-order, V6 scope) so the storefront can show/disable an
 * "Apply" button per voucher without re-implementing any validation itself.
 * Reuses the exact same pure `v5MinOrder`/`v6Scope` functions and
 * `toErrorEnvelope` message-filling the real apply-time V1–V8 chain uses —
 * zero duplicated business logic, just an earlier look at the same checks.
 * V1–V4/V7/V8 are deliberately NOT run here: V1/V2 already hold (the
 * "currently active, currently valid" filter above), V3/V4 are usage-based
 * not cart-based (SPEC §9.2 revalidation-subset precedent excludes them from
 * cart-driven checks), V7 is a stub, and V8 (stacking) needs the cart's
 * current item-promotion state, which isn't relevant to "does this cart
 * qualify by category/subtotal" — matches the classic "wrong product/cart
 * too small" cases this feature targets.
 *
 * Task 6 (read-through list): shared fields (code/discount_type/discount_value/
 * is_active/window/usage_limit) now live on the linked Promotion (Decision I),
 * so every voucher_config row is batch-hydrated via the shared
 * `hydrateVouchersFromPromotions` helper (also used by `GET /admin/vouchers`
 * — Task 6 L1 dedupe) before building the DTO — the exact same overlay
 * `lookupVoucherStep` applies at apply-time
 * (workflows/voucher-engine/steps/lookup-voucher.ts), just batched over the
 * whole list instead of a single code. M1 fix: the list is read WITHOUT a DB
 * `is_active` pre-filter (that column can be stale relative to the linked
 * Promotion) — the post-hydration filter below is what actually gates on
 * is_active + validity window, using the hydrated (promotion-sourced) values.
 * When `?cart_id=` is supplied,
 * each voucher also gets an `estimated_savings` (ported/adapted from a
 * colleague's branch feature) computed via the same pure
 * `resolveEligibleItems`/`calculateVoucherDiscount` the real apply-time
 * discount math uses (global cap included, INT-01/security.md), and the list
 * is sorted eligible-first, then by `estimated_savings` descending.
 */

import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { VOUCHER_ENGINE_MODULE } from "../../../../../modules/voucher-engine";
import type VoucherEngineService from "../../../../../modules/voucher-engine/service";
import {
  sumInts,
  toInt,
} from "../../../../../modules/voucher-engine/lib/money";
import {
  calculateVoucherDiscount,
  resolveEligibleItems,
  type LineValue,
} from "../../../../../modules/voucher-engine/lib/calculate-discount";
import {
  v5MinOrder,
  v6Scope,
} from "../../../../../workflows/voucher-engine/lib/validators";
import {
  VoucherValidationError,
  toErrorEnvelope,
} from "../../../../../workflows/voucher-engine/lib/errors";
import type {
  CartLineSnapshot,
  CartSnapshot,
  VoucherSnapshot,
} from "../../../../../workflows/voucher-engine/lib/types";
import { hydrateVouchersFromPromotions } from "../../../../../workflows/voucher-engine/lib/hydrate-voucher-from-promotion";

interface StoreVoucherDTO {
  code: string;
  description: string;
  discount_type: "percentage" | "fixed_amount";
  discount_value: number;
  valid_to: string;
  min_order: number | null;
  applicable_categories: string[];
  /** Only present when `?cart_id=` was supplied. */
  eligible?: boolean;
  ineligible_reason?: string;
  /** Only present when `?cart_id=` was supplied (Task 6, ported feature). */
  estimated_savings?: number;
}

/** The subset of `voucher_config` this route reads. Matches the model 1:1
 * (see `modules/voucher-engine/models/voucher-config.ts`) — `listVoucherConfigs`
 * with no `select` returns every column; this only narrows the compile-time
 * view to what's actually used below. `id`/`promotion_id` are read so the
 * batch Promotion hydration (Task 6, Decision I) can look up each voucher's
 * linked Promotion. */
interface RawVoucherConfig {
  id: string;
  code: string;
  discount_type: "percentage" | "fixed_amount";
  discount_value: number;
  min_order_value: number | null;
  max_discount_amount: number | null;
  applicable_product_ids: string[] | null;
  applicable_category_ids: string[] | null;
  stackable_with_promotions: boolean;
  per_user_limit: number;
  usage_limit: number | null;
  usage_count: number;
  user_segment_conditions: Record<string, unknown> | null;
  is_active: boolean;
  valid_from: unknown;
  valid_to: unknown;
  promotion_id: string | null;
}

/**
 * Task 6 (ported feature, adapted to read-through) — the discount this
 * voucher WOULD produce against the cart's current contents, using the exact
 * same pure calculation the real apply-time flow uses
 * (`resolveEligibleItems` + `calculateVoucherDiscount`). `item_promotion_discount`
 * is 0 for every line (this preview is basis-agnostic of any item promo
 * currently on the cart, matching V5's ORIGINAL-subtotal basis, decision D3)
 * and `global_cap_bps` is the live active cap (security.md — the 50% cap
 * always applies, even to an estimate). `line_id` is synthetic (index-based):
 * it's only used for error-message context inside the pure calculator, never
 * for identity/persistence.
 */
function estimateVoucherSavings(
  voucher: RawVoucherConfig,
  cart: CartSnapshot,
  globalCapBps: number,
): number {
  const lines: LineValue[] = cart.items.map((item, index) => ({
    line_id: `line-${index}`,
    unit_price: item.unit_price,
    quantity: item.quantity,
    item_promotion_discount: 0,
    is_eligible: false,
    product_id: item.product_id,
    category_ids: item.category_ids,
  }));

  const scopedLines = resolveEligibleItems(lines, {
    product_ids: voucher.applicable_product_ids ?? [],
    category_ids: voucher.applicable_category_ids ?? [],
  });

  const { final_voucher_discount } = calculateVoucherDiscount({
    lines: scopedLines,
    discount_type: voucher.discount_type,
    discount_value: voucher.discount_value,
    max_discount_amount: voucher.max_discount_amount,
    global_cap_bps: globalCapBps,
  });

  return final_voucher_discount;
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

/** Minimal cart read for the V5/V6 eligibility preview — original (pre-promotion)
 * subtotal + per-line product/category ids. No adjustments/promotion data needed:
 * V5 uses the ORIGINAL subtotal (decision D3), and V6 is pure product/category
 * matching. Returns null when the cart doesn't exist (never throws — an
 * unrecognized cart_id should degrade to "no eligibility info", not break the list). */
async function loadEligibilityCartSnapshot(
  scope: MedusaRequest["scope"],
  cartId: string,
): Promise<CartSnapshot | null> {
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
        }> | null;
      }
    | undefined;
  if (!rawCart) return null;

  const items: CartLineSnapshot[] = (rawCart.items ?? []).map((item) => ({
    product_id: item.product_id ?? "",
    category_ids: (item.product?.categories ?? []).map((c) => c.id),
    quantity: toInt(item.quantity, `item[${item.id}].quantity`),
    unit_price: toInt(item.unit_price, `item[${item.id}].unit_price`),
  }));

  const original_subtotal = sumInts(
    items.map((i) => i.unit_price * i.quantity),
    "eligibility.original_subtotal",
  );

  return {
    original_subtotal,
    items,
    // V8 (stacking) is not evaluated by this preview — see file header.
    has_item_promotion: false,
  };
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
    stackable_with_promotions: voucher.stackable_with_promotions,
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

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  // Guests get the same public list — there is no per-customer assignment to
  // gate on yet (see file header). `auth_context` is read defensively for
  // when a real assignment mechanism is added later.
  const ve = req.scope.resolve(VOUCHER_ENGINE_MODULE) as VoucherEngineService;

  const now = new Date();
  // Task 6 / M1 fix (Decision I): do NOT pre-filter on the DB's `is_active`
  // column here — it can be stale relative to the linked Promotion (the
  // actual source of truth for is_active per Decision I). Filtering on it
  // before hydration could wrongly HIDE a voucher whose Promotion is active.
  // List every config row, hydrate from the Promotion, THEN filter below on
  // the hydrated is_active + validity window.
  const all = (await ve.listVoucherConfigs(
    {},
    { take: 1000 },
  )) as RawVoucherConfig[];

  // Task 6 (Decision I) — overlay each voucher's linked Promotion BEFORE the
  // validity-window filter below, so `valid_from`/`valid_to`/`is_active`
  // reflect the promotion (the source of truth), not a possibly-stale
  // voucher_config snapshot.
  const hydrated = await hydrateVouchersFromPromotions(req.scope, all);

  const currentlyValid = hydrated.filter((v) => {
    const from = new Date(v.valid_from as string);
    const to = new Date(v.valid_to as string);
    return v.is_active && from <= now && now <= to;
  });

  // Resolve category ids -> names for display (API_CONTRACT §1.3 `applicable_categories`).
  const allCategoryIds = Array.from(
    new Set(currentlyValid.flatMap((v) => v.applicable_category_ids ?? [])),
  );
  const categoryNameById = new Map<string, string>();
  if (allCategoryIds.length > 0) {
    const productModule = req.scope.resolve(Modules.PRODUCT);
    const categories = await productModule.listProductCategories(
      { id: allCategoryIds },
      { select: ["id", "name"], take: allCategoryIds.length },
    );
    for (const category of categories as Array<{ id: string; name: string }>) {
      categoryNameById.set(category.id, category.name);
    }
  }

  const cartId =
    typeof req.query.cart_id === "string" ? req.query.cart_id : undefined;
  const cartSnapshot = cartId
    ? await loadEligibilityCartSnapshot(req.scope, cartId)
    : null;
  // Only resolved when a cart is present — no need to touch DiscountCapConfig
  // for the cart-less list.
  const globalCapBps = cartSnapshot ? await ve.getActiveCap() : 0;

  const vouchers: StoreVoucherDTO[] = currentlyValid.map((v) => {
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
    if (!cartSnapshot) return base;
    return {
      ...base,
      ...checkCartEligibility(v, cartSnapshot),
      estimated_savings: estimateVoucherSavings(v, cartSnapshot, globalCapBps),
    };
  });

  // Task 6 (ported/adapted) — eligible-first, then biggest-savings-first.
  const sorted = cartSnapshot
    ? [...vouchers].sort((a, b) => {
        if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
        return (b.estimated_savings ?? 0) - (a.estimated_savings ?? 0);
      })
    : vouchers;

  res.json({ vouchers: sorted });
};
