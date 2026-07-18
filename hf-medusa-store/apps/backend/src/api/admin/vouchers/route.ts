import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { CreateOrAttachVoucherBody } from "./validators";
import { createVoucherWorkflow } from "../../../workflows/voucher-engine/admin/create-voucher";
import { VOUCHER_ENGINE_MODULE } from "../../../modules/voucher-engine";
import type VoucherEngineService from "../../../modules/voucher-engine/service";
import { hydrateVouchersFromPromotions } from "../../../workflows/voucher-engine/lib/hydrate-voucher-from-promotion";

/**
 * POST /admin/vouchers — create a voucher (3.4.11, SRS §6.4), or attach one to
 * an existing native Promotion (Task 4, admin widget "enable as voucher" flow).
 * Thin route → workflow (no branching/service logic here) — the workflow
 * itself decides create-vs-attach based on whether `promotion_id` is present.
 * Body is validated by `CreateOrAttachVoucherSchema` via middlewares. Auth:
 * /admin/* requires an authenticated admin (SEC-04, framework default) — no
 * extra guard needed here.
 */
export const POST = async (
  req: MedusaRequest<CreateOrAttachVoucherBody>,
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
 *
 * Task 6 (read-through list, Decision I): `code`/`discount_type`/
 * `discount_value`/`valid_from`/`valid_to` now live on the linked Promotion,
 * so each row is overlaid via the shared `hydrateVouchersFromPromotions`
 * helper (batch `query.graph` for every distinct `promotion_id` in the page,
 * same helper used by `GET /store/customers/me/vouchers` — Task 6 L1 dedupe)
 * before being returned — the admin table shows the promotion-sourced values,
 * not a possibly-stale voucher_config snapshot.
 *
 * Task 7: optional `?promotion_id=` filter — used by the promotion-detail
 * "Voucher settings" widget to look up the (at most one) voucher_config
 * attached to the promotion currently being viewed. Omitted ⇒ unfiltered
 * list, unchanged behavior.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const ve = req.scope.resolve(VOUCHER_ENGINE_MODULE) as VoucherEngineService;

  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  const promotionId =
    typeof req.query.promotion_id === "string"
      ? req.query.promotion_id
      : undefined;

  const [vouchers, count] = await ve.listAndCountVoucherConfigs(
    promotionId ? { promotion_id: promotionId } : {},
    {
      select: [
        "id",
        "code",
        "discount_type",
        "discount_value",
        "min_order_value",
        "max_discount_amount",
        "applicable_product_ids",
        "applicable_category_ids",
        "stackable_with_promotions",
        "per_user_limit",
        "user_segment_conditions",
        "usage_limit",
        "usage_count",
        "is_active",
        "valid_from",
        "valid_to",
        "created_at",
        "updated_at",
        "promotion_id",
      ],
      order: { created_at: "DESC" },
      take: limit,
      skip: offset,
    },
  );

  const hydratedVouchers = await hydrateVouchersFromPromotions(
    req.scope,
    vouchers as Array<{ promotion_id: string | null }>,
  );

  res.json({ vouchers: hydratedVouchers, count, limit, offset });
};
