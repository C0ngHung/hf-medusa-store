import { z } from "zod";
import { MIN_CODE_LENGTH } from "../../../modules/voucher-engine/constants";

/**
 * Zod validators for admin voucher APIs (3.4.13, SRS §6.4).
 * validateAndTransformBody (see src/api/middlewares.ts) parses the request body
 * with this schema and populates req.validatedBody. Money is integer VND (INT-01);
 * `discount_value` is basis-points for percentage, raw VND for fixed_amount.
 */
export const CreateVoucherSchema = z
  .object({
    // Optional — auto-generated when omitted. If supplied: ≥6 alphanumeric,
    // stored UPPERCASE (SEC-03; normalized in the create step).
    code: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9]+$/, "code must be alphanumeric")
      .min(MIN_CODE_LENGTH)
      .optional(),
    discount_type: z.enum(["percentage", "fixed_amount"]),
    // Must give a real discount: >= 1 (0 is meaningless, negative invalid). INT-01.
    discount_value: z.number().int().min(1, "discount_value must be >= 1"),
    min_order_value: z.number().int().nonnegative().nullish(),
    max_discount_amount: z.number().int().nonnegative().nullish(),
    applicable_product_ids: z.array(z.string().min(1)).nullish(),
    applicable_category_ids: z.array(z.string().min(1)).nullish(),
    stackable_with_promotions: z.boolean().default(true),
    per_user_limit: z.number().int().positive().default(1),
    usage_limit: z.number().int().positive().nullish(),
    user_segment_conditions: z.record(z.string(), z.any()).nullish(),
    valid_from: z.coerce.date(),
    valid_to: z.coerce.date(),
    is_active: z.boolean().default(true),
  })
  // Code-review Task 4 FIX 3 (LOW): reject unknown keys so a body carrying
  // BOTH create-only fields AND attach-only `promotion_id` errors clearly
  // instead of the union silently matching whichever member tolerates the
  // extras and dropping the rest.
  .strict()
  // V2 sanity: the window must be non-empty.
  .refine((v) => v.valid_to > v.valid_from, {
    message: "valid_to must be after valid_from",
    path: ["valid_to"],
  })
  // A percentage voucher can't exceed 100% (10000 basis-points). The global 50%
  // cap trims at apply-time (EC-03); this only rejects nonsensical config.
  .superRefine((v, ctx) => {
    if (v.discount_type === "percentage" && v.discount_value > 10000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["discount_value"],
        message:
          "percentage discount_value must be <= 10000 basis points (100%)",
      });
    }
  });

export type CreateVoucherBody = z.infer<typeof CreateVoucherSchema>;

/**
 * Attach mode (Task 4 — admin widget "enable as voucher" flow): the admin
 * already created a native Promotion; this schema carries only `promotion_id`
 * + the voucher-only fields (cap, min order, scope, stacking, per-user,
 * segment). `discount_type`/`discount_value`/`valid_from`/`valid_to`/`code`
 * are deliberately absent — the workflow derives them from the referenced
 * Promotion's snapshot (`resolvePromotionSnapshotStep`).
 */
export const AttachVoucherSchema = z
  .object({
    promotion_id: z.string().min(1),
    min_order_value: z.number().int().nonnegative().nullish(),
    max_discount_amount: z.number().int().nonnegative().nullish(),
    applicable_product_ids: z.array(z.string().min(1)).nullish(),
    applicable_category_ids: z.array(z.string().min(1)).nullish(),
    stackable_with_promotions: z.boolean().default(true),
    per_user_limit: z.number().int().positive().default(1),
    user_segment_conditions: z.record(z.string(), z.any()).nullish(),
  })
  // Code-review Task 4 FIX 3 (LOW): see CreateVoucherSchema's `.strict()`
  // comment above — same rationale, applied to the attach-mode member.
  .strict();

export type AttachVoucherBody = z.infer<typeof AttachVoucherSchema>;

/**
 * Union validated by `POST /admin/vouchers` (middlewares.ts): accepts either
 * the attach-mode body or the full create-mode body. zod tries members in
 * order and reports the closest match's errors on total failure.
 */
export const CreateOrAttachVoucherSchema = z.union([
  AttachVoucherSchema,
  CreateVoucherSchema,
]);

export type CreateOrAttachVoucherBody = z.infer<
  typeof CreateOrAttachVoucherSchema
>;

/**
 * Update mode (Task 5 — admin widget edit flow): `PUT /admin/vouchers/:id`
 * may only touch voucher-only fields (cap, min order, scope, stacking,
 * per-user, segment) — never `promotion_id` (immutable link to the backing
 * Promotion, Decision C) and never discount/window/code fields (those belong
 * to the Promotion snapshot, not editable here). Built from
 * `AttachVoucherSchema` so the field set can't drift from attach-mode; `.omit`
 * drops `promotion_id`, `.partial` makes every remaining field optional (PUT
 * is a partial patch), and `.strict()` rejects any unknown/forbidden key
 * (e.g. `discount_value`, `promotion_id`) with a 400 instead of silently
 * ignoring it.
 */
export const UpdateVoucherSchema = AttachVoucherSchema.omit({
  promotion_id: true,
})
  .partial()
  .strict();

export type UpdateVoucherBody = z.infer<typeof UpdateVoucherSchema>;
