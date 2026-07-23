import { z } from "zod";

/**
 * Zod validator for the admin DiscountCapConfig upsert API (SRS §5.2 —
 * "managed via admin API, single active record, history tracked via
 * updated_at"; Rebuild Phase 3A). Money-adjacent value, but this is a
 * PERCENTAGE in integer basis points (5000 = 50.00%), not a VND amount —
 * bounded to [0, 10000] (0%–100%), same convention as
 * `CreateVoucherSchema`'s percentage bound (`admin/vouchers/validators.ts`).
 *
 * `updated_by` is never accepted from the client body — the route derives it
 * server-side from the admin auth context (SEC-01: identity is never
 * client-supplied).
 */
export const UpsertDiscountCapConfigSchema = z.object({
  max_discount_percentage: z
    .number()
    .int()
    .min(0, "max_discount_percentage must be >= 0")
    .max(10000, "max_discount_percentage must be <= 10000 basis points (100%)"),
});

export type UpsertDiscountCapConfigBody = z.infer<
  typeof UpsertDiscountCapConfigSchema
>;
