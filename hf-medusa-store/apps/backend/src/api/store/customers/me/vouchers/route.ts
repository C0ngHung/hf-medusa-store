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
 * Optional `?cart_id=` — when supplied, each voucher additionally gets:
 *  - `eligible`/`ineligible_reason` (V5 min-order, V6 scope), computed by
 *    reusing the exact same pure `v5MinOrder`/`v6Scope` functions and
 *    `toErrorEnvelope` message-filling the real apply-time V1–V8 chain uses;
 *  - `estimated_savings` — the voucher discount (integer VND) this voucher
 *    would produce against the cart's ORIGINAL (pre-any-other-promotion)
 *    subtotal, via the SAME pure `calculateVoucherDiscount` +
 *    `resolveEligibleItems` the real apply/resolve workflows call (§10).
 *
 *    Deliberately basis = ORIGINAL subtotal, NOT the real apply-time
 *    "eligible post-promotion subtotal" (net of any OTHER item-level
 *    promotion currently on the cart). Netting those out here would make
 *    this number track a moving target for two reasons: (1) an existing
 *    promotion's own discount can itself change over time (quantity tiers,
 *    scheduling), and (2) actually attaching the voucher can retroactively
 *    SHRINK a coexisting percentage item/order promotion (documented
 *    Rule-11/CONFLICT-8 interaction, `verify-cart-totals.ts` step 4) — this
 *    preview runs before any voucher is attached, so it cannot see that
 *    shrink coming either way. Given both bases are approximations of the
 *    real apply-time result whenever another promotion is active, the
 *    original subtotal is preferred for being STABLE (same cart items →
 *    same number, independent of another promotion's internal behavior) —
 *    this is a browsing-time preview for ordering/display, not a price
 *    guarantee; the actual apply call always recalculates authoritatively
 *    server-side (SEC-01).
 * The response list is then sorted: eligible vouchers first, and within each
 * group by `estimated_savings` descending — "the voucher that saves the most
 * on this cart floats to the top." A voucher blocked by scope naturally
 * computes to 0 savings (its eligible subtotal is 0), so it already sinks to
 * the bottom of the eligible group without special-casing; min-order-blocked
 * vouchers are excluded from the top group entirely by the `eligible` sort key
 * regardless of their computed amount, so a big-but-inapplicable number can't
 * misleadingly rank above a smaller applicable one.
 *
 * V1–V4/V7/V8 are deliberately NOT run for eligibility: V1/V2 already hold
 * (the "currently active, currently valid" filter above), V3/V4 are
 * usage-based not cart-based (SPEC §9.2 revalidation-subset precedent
 * excludes them from cart-driven checks), V7 is a stub, and V8 (stacking)
 * needs the cart's current item-promotion state, which isn't relevant to
 * "does this cart qualify by category/subtotal" — matches the classic "wrong
 * product/cart too small" cases this feature targets.
 */

import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { VOUCHER_ENGINE_MODULE } from "../../../../../modules/voucher-engine";
import type VoucherEngineService from "../../../../../modules/voucher-engine/service";
import { toInt } from "../../../../../modules/voucher-engine/lib/money";
import {
  LineValue,
  calculateOriginalSubtotal,
  calculateVoucherDiscount,
  resolveEligibleItems,
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
  /** Integer VND, against the cart's ORIGINAL subtotal (not net of any other
   * item promotion currently on the cart — see file header) — only present
   * when `?cart_id=` was supplied. */
  estimated_savings?: number;
}

/** The subset of `voucher_config` this route reads. Matches the model 1:1
 * (see `modules/voucher-engine/models/voucher-config.ts`) — `listVoucherConfigs`
 * with no `select` returns every column; this only narrows the compile-time
 * view to what's actually used below. */
interface RawVoucherConfig {
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

/** Cart read for the eligibility + "estimated savings" preview: original
 * (pre-promotion) line values only. `item_promotion_discount` is fixed at 0
 * for every line here, deliberately — this preview's basis is the cart's
 * ORIGINAL subtotal, not net of whatever OTHER item-level promotion happens
 * to be on the cart right now (see the file header for why: that basis is
 * not stable). Returns null when the cart doesn't exist (never throws — an
 * unrecognized cart_id should degrade to "no eligibility info", not break
 * the list). */
async function loadPreviewLines(
  scope: MedusaRequest["scope"],
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

  return (rawCart.items ?? []).map((item) => ({
    line_id: item.id,
    unit_price: toInt(item.unit_price, `item[${item.id}].unit_price`),
    quantity: toInt(item.quantity, `item[${item.id}].quantity`),
    item_promotion_discount: 0,
    product_id: item.product_id ?? null,
    category_ids: (item.product?.categories ?? []).map((c) => c.id),
    is_eligible: false, // set per-voucher by resolveEligibleItems below.
  }));
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
  const active = (await ve.listVoucherConfigs(
    { is_active: true },
    { take: 1000 },
  )) as RawVoucherConfig[];

  const currentlyValid = active.filter((v) => {
    const from = new Date(v.valid_from as string);
    const to = new Date(v.valid_to as string);
    return from <= now && now <= to;
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
  const previewLines = cartId
    ? await loadPreviewLines(req.scope, cartId)
    : null;
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
      // V8 (stacking) is not evaluated by this preview — see file header.
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
    // "Smart order": eligible vouchers before ineligible ones (an ineligible
    // voucher's raw discount number is not something the customer can
    // actually get right now, so it must never outrank an eligible one just
    // because the formula produces a bigger figure); within each group,
    // biggest actual savings first.
    vouchers = [...vouchers].sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      return (b.estimated_savings ?? 0) - (a.estimated_savings ?? 0);
    });
  }

  res.json({ vouchers });
};
