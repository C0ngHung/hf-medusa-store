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
 */

import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import { VOUCHER_ENGINE_MODULE } from "../../../../../modules/voucher-engine";
import type VoucherEngineService from "../../../../../modules/voucher-engine/service";

interface StoreVoucherDTO {
  code: string;
  description: string;
  discount_type: "percentage" | "fixed_amount";
  discount_value: number;
  valid_to: string;
  min_order: number | null;
  applicable_categories: string[];
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

export const GET = async (_req: MedusaRequest, res: MedusaResponse) => {
  // Guests get the same public list — there is no per-customer assignment to
  // gate on yet (see file header). `auth_context` is read defensively for
  // when a real assignment mechanism is added later.
  const ve = _req.scope.resolve(VOUCHER_ENGINE_MODULE) as VoucherEngineService;

  const now = new Date();
  const active = (await ve.listVoucherConfigs(
    { is_active: true },
    { take: 1000 },
  )) as Array<{
    code: string;
    discount_type: "percentage" | "fixed_amount";
    discount_value: number;
    min_order_value: number | null;
    applicable_category_ids: string[] | null;
    valid_from: unknown;
    valid_to: unknown;
  }>;

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
    const productModule = _req.scope.resolve(Modules.PRODUCT);
    const categories = await productModule.listProductCategories(
      { id: allCategoryIds },
      { select: ["id", "name"], take: allCategoryIds.length },
    );
    for (const category of categories as Array<{ id: string; name: string }>) {
      categoryNameById.set(category.id, category.name);
    }
  }

  const vouchers: StoreVoucherDTO[] = currentlyValid.map((v) => ({
    code: v.code,
    description: describeVoucher(v),
    discount_type: v.discount_type,
    discount_value: v.discount_value,
    valid_to: new Date(v.valid_to as string).toISOString(),
    min_order: v.min_order_value,
    applicable_categories: (v.applicable_category_ids ?? [])
      .map((id) => categoryNameById.get(id))
      .filter((name): name is string => !!name),
  }));

  res.json({ vouchers });
};
