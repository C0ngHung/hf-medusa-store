import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { VOUCHER_ENGINE_MODULE } from "../../../../modules/voucher-engine";
import type VoucherEngineService from "../../../../modules/voucher-engine/service";
import type { UpdateVoucherBody } from "../validators";

/**
 * PUT /admin/vouchers/:id — edit voucher-only fields (Task 5, admin widget
 * edit flow). Body is validated by `UpdateVoucherSchema` via middlewares.ts —
 * only cap/min-order/scope/stacking/per-user/segment fields are accepted;
 * `promotion_id` and discount/window/code fields are rejected upstream by
 * `.strict()`, so this handler never needs to guard against them. Thin route
 * → generated service CRUD (no workflow: no compensation/side-effects needed
 * for a plain field patch). Auth: /admin/* requires an authenticated admin
 * (SEC-04, framework default).
 */
/**
 * `VoucherConfig.applicable_product_ids` / `applicable_category_ids` are DML
 * `model.json()` columns (see `models/voucher-config.ts`); Medusa's generated
 * `updateVoucherConfigs` DTO types EVERY `model.json()` field as
 * `Record<string, unknown>` (the DML `JSONProperty` class is hardcoded to
 * that shape — `@medusajs/utils/dist/dml/properties/json.d.ts`), even though
 * the real value here is a `string[] | null` (see `validators.ts`). That
 * mismatch is what makes the plain `{ id, ...req.validatedBody }` call below
 * fail every overload. The cast only re-types those two known-mismatched
 * fields to what the generated signature expects — it does not change the
 * object being sent, so the update still patches exactly the validated
 * partial body by id, same as before.
 */
type UpdateVoucherConfigInput = {
  id: string;
} & Omit<
  UpdateVoucherBody,
  "applicable_product_ids" | "applicable_category_ids"
> & {
    applicable_product_ids?: Record<string, unknown> | null;
    applicable_category_ids?: Record<string, unknown> | null;
  };

export const PUT = async (
  req: MedusaRequest<UpdateVoucherBody>,
  res: MedusaResponse,
) => {
  const ve = req.scope.resolve(VOUCHER_ENGINE_MODULE) as VoucherEngineService;
  const voucher = await ve.updateVoucherConfigs({
    id: req.params.id,
    ...req.validatedBody,
  } as UpdateVoucherConfigInput);
  res.json({ voucher });
};

/**
 * DELETE /admin/vouchers/:id — soft-delete a voucher (Task 5). Generated
 * `deleteVoucherConfigs` sets `deleted_at` (the model's soft-delete column,
 * see migrations) rather than removing the row — GET /admin/vouchers filters
 * `deleted_at IS NULL` so the voucher disappears from the admin list while
 * the audit trail (voucher_usage_log) and history remain intact.
 */
export const DELETE = async (req: MedusaRequest, res: MedusaResponse) => {
  const ve = req.scope.resolve(VOUCHER_ENGINE_MODULE) as VoucherEngineService;
  await ve.deleteVoucherConfigs(req.params.id);
  res.json({ id: req.params.id, deleted: true });
};
