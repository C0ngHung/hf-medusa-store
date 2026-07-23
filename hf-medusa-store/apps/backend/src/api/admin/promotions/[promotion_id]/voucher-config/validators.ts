import { z } from "zod";

/**
 * Zod validator for `POST /admin/promotions/:promotion_id/voucher-config`
 * ("Enable VoucherEngine" — Admin unified model). VoucherEngine-owned fields
 * only — deliberately excludes `code`/`discount_type`/`discount_value`/
 * `status`/campaign/application method, which stay exclusively owned and
 * edited via the native Promotion/Campaign UI (the whole point of the
 * unified model is that this form never re-asks for them).
 *
 * `usage_limit` is also deliberately excluded, but NOT because the native
 * Promotion is authoritative for it — `usage_limit` IS VoucherConfig-owned
 * configuration (bug-bash fix, 2026-07-21, supersedes an earlier revision
 * that made it live-Promotion-derived; SPEC.md §5.4/§10/§11.4 — see
 * `admin/lib/resolve-voucher-native-fields.ts`'s docstring). It is excluded
 * from THIS form specifically because SPEC.md §5.4 says it "may be editable
 * in the VoucherConfig widget only after an update API/workflow is
 * explicitly approved" — no such approval exists yet, so the Enable
 * workflow only seeds it once from the linked Promotion's `limit` field as a
 * UX convenience (`admin/lib/derive-voucher-config-cache-fields.ts`), and it
 * is not independently re-editable here.
 *
 * Mirrors the VoucherEngine-owned subset of `CreateVoucherSchema`
 * (`api/admin/vouchers/validators.ts`) minus every native-owned field.
 *
 * `valid_from`/`valid_to` ARE included (reverted 2026-07-21 — `Promotion` has
 * no native date field; only an attached `Campaign` does, shared across
 * every Promotion in it, the wrong granularity for a per-voucher window).
 * VoucherConfig owns and enforces these directly, same validation as
 * `CreateVoucherSchema`'s window-inverted check.
 *
 * `stackable_with_promotions` is also deliberately excluded
 * (rebuild-decisions.md decision 2, 2026-07-20): not configurable — item
 * promotions and the Voucher always stack per the fixed SRS calculation
 * order.
 */
export const AttachVoucherConfigSchema = z
  .object({
    min_order_value: z.number().int().nonnegative().nullish(),
    max_discount_amount: z.number().int().nonnegative().nullish(),
    applicable_product_ids: z.array(z.string().min(1)).nullish(),
    applicable_category_ids: z.array(z.string().min(1)).nullish(),
    per_user_limit: z.number().int().positive().default(1),
    user_segment_conditions: z.record(z.string(), z.any()).nullish(),
    valid_from: z.coerce.date(),
    valid_to: z.coerce.date(),
  })
  // V2 sanity: the window must be non-empty (mirrors CreateVoucherSchema).
  .refine((v) => v.valid_to > v.valid_from, {
    message: "valid_to must be after valid_from",
    path: ["valid_to"],
  });

export type AttachVoucherConfigBody = z.infer<typeof AttachVoucherConfigSchema>;
