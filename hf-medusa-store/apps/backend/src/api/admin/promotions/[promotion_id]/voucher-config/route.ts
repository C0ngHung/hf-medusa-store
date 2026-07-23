import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { AttachVoucherConfigBody } from "./validators";
import { attachVoucherConfigWorkflow } from "../../../../../workflows/voucher-engine/admin/attach-voucher-config";
import { disableVoucherConfigWorkflow } from "../../../../../workflows/voucher-engine/admin/disable-voucher-config";
import { resolveVoucherNativeFields } from "../../../../../workflows/voucher-engine/admin/lib/resolve-voucher-native-fields";
import { VOUCHER_ENGINE_MODULE } from "../../../../../modules/voucher-engine";
import type VoucherEngineService from "../../../../../modules/voucher-engine/service";

/**
 * POST /admin/promotions/:promotion_id/voucher-config — "Enable VoucherEngine"
 * on an existing native Promotion (Admin unified model). Idempotent:
 * creates a new linked VoucherConfig, or reactivates/updates the existing
 * one (Disable -> re-Enable). Thin route -> workflow. Body is validated by
 * `AttachVoucherConfigSchema` via middleware (see `api/middlewares.ts`).
 * Auth: /admin/* requires an authenticated admin (SEC-04, framework default).
 */
export const POST = async (
  req: MedusaRequest<AttachVoucherConfigBody>,
  res: MedusaResponse,
) => {
  const { promotion_id } = req.params;
  const { result } = await attachVoucherConfigWorkflow(req.scope).run({
    input: { promotion_id, ...req.validatedBody },
  });
  res.status(201).json({ voucher: result });
};

/**
 * DELETE /admin/promotions/:promotion_id/voucher-config — "Disable
 * VoucherEngine" (Admin unified model). Reversible, idempotent: sets
 * `is_active: false` on the linked VoucherConfig without deleting the
 * Promotion, the row, its usage history, or analytics. A no-op success (not
 * an error) when nothing is linked or it's already disabled.
 */
export const DELETE = async (req: MedusaRequest, res: MedusaResponse) => {
  const { promotion_id } = req.params;
  const { result } = await disableVoucherConfigWorkflow(req.scope).run({
    input: { promotion_id },
  });
  res.status(200).json({ voucher: result });
};

/**
 * GET /admin/promotions/:promotion_id/voucher-config — read-only lookup of
 * the VoucherConfig linked to this Promotion, if any. Returns `{ voucher:
 * null }` (not 404) when the Promotion has no linked VoucherConfig — an
 * ordinary, non-voucher Promotion is not an error state.
 *
 * Overlays the SAME native-field resolution `steps/lookup-voucher.ts` uses
 * (`resolveVoucherNativeFields`) before returning, so the Promotion Detail
 * widget's display of `usage_limit` (and any other native-derived field)
 * can never disagree with what the cart-apply path actually enforces —
 * strict native-field reuse applies to what's DISPLAYED, not only to what's
 * validated. `is_active` (VoucherEngine's own persisted Enable/Disable
 * flag) is never touched by this overlay — it always reflects the VoucherConfig
 * row's own value, which is exactly the "persisted Enable Voucher toggle"
 * state the widget renders.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { promotion_id } = req.params;
  const ve = req.scope.resolve(VOUCHER_ENGINE_MODULE) as VoucherEngineService;

  const [voucher] = await ve.listVoucherConfigs({ promotion_id }, { take: 1 });

  if (!voucher) {
    res.json({ voucher: null });
    return;
  }

  const resolved = await resolveVoucherNativeFields(req.scope, voucher);
  res.json({ voucher: resolved });
};
