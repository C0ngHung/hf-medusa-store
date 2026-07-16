import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { CreateVoucherBody } from "./validators";
import { createVoucherWorkflow } from "../../../workflows/voucher-engine/admin/create-voucher";
import { VOUCHER_ENGINE_MODULE } from "../../../modules/voucher-engine";
import type VoucherEngineService from "../../../modules/voucher-engine/service";

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

/**
 * GET /admin/vouchers — list VoucherConfig rows for the admin table. Read-only
 * (`ve.listAndCountVoucherConfigs`), no workflow — same "read-only, no
 * workflow" convention as `GET /store/customers/me/vouchers` (SPEC §12).
 * Reads `voucher_config` directly: NEVER the native Promotion list (a
 * VoucherConfig's backing/ephemeral Promotions are internal transport, not
 * admin-visible voucher rows — SPEC Decision C/G).
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const ve = req.scope.resolve(VOUCHER_ENGINE_MODULE) as VoucherEngineService;

  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;

  const [vouchers, count] = await ve.listAndCountVoucherConfigs(
    {},
    {
      select: [
        "id",
        "code",
        "discount_type",
        "discount_value",
        "min_order_value",
        "max_discount_amount",
        "usage_limit",
        "usage_count",
        "is_active",
        "valid_from",
        "valid_to",
        "created_at",
        "updated_at",
      ],
      order: { created_at: "DESC" },
      take: limit,
      skip: offset,
    },
  );

  res.json({ vouchers, count, limit, offset });
};
