import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { CreateVoucherBody } from "./validators";
import { createVoucherWorkflow } from "../../../workflows/voucher-engine/admin/create-voucher";

/**
 * POST /admin/vouchers — create a voucher (3.4.11, SRS §6.4). Thin route →
 * workflow (no service logic here). Body is validated by CreateVoucherSchema via
 * middlewares. Auth: /admin/* requires an authenticated admin (SEC-04, framework
 * default) — no extra guard needed here.
 */
export const POST = async (
  req: MedusaRequest<CreateVoucherBody>,
  res: MedusaResponse,
) => {
  const { result } = await createVoucherWorkflow(req.scope).run({
    input: req.validatedBody,
  });
  res.status(201).json({ voucher: result });
};
