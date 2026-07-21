import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { CreateVoucherBody } from "./validators";
import { createVoucherWorkflow } from "../../../workflows/voucher-engine/admin/create-voucher";

/**
 * POST /admin/vouchers — create a voucher (3.4.11, SRS §6.4). Thin route →
 * workflow (no service logic here). Body is validated by CreateVoucherSchema via
 * middlewares. Auth: /admin/* requires an authenticated admin (SEC-04, framework
 * default) — no extra guard needed here.
 *
 * Response is the created voucher itself, flat — no `{ voucher: {...} }`
 * wrapper (2026-07-21, matches SRS §6.4 literally: "Response: Voucher đã
 * tạo..."). No known frontend consumer of this route existed at the time of
 * this change (the standalone voucher-creation UI was already retired in
 * favor of the Admin unified model, `POST /admin/promotions/:id/voucher-config`).
 */
export const POST = async (
  req: MedusaRequest<CreateVoucherBody>,
  res: MedusaResponse,
) => {
  const { result } = await createVoucherWorkflow(req.scope).run({
    input: req.validatedBody,
  });
  res.status(201).json(result);
};

/**
 * GET /admin/vouchers (list) — REMOVED 2026-07-21 (code-review finding).
 * Confirmed unused: the standalone Vouchers list page was already retired in
 * favor of managing vouchers from the native Promotions list + Promotion
 * Detail page (Admin unified model, 2026-07-20), and the Promotion Detail
 * widget's own read (`useVoucherByPromotion`) calls the dedicated
 * `GET /admin/promotions/:promotion_id/voucher-config` route, never this
 * one's `?promotion_id=` filter. `POST` (voucher creation, still used as the
 * atomic-create fallback) is kept.
 */
