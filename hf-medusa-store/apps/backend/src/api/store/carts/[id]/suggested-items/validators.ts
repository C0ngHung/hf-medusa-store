import { z } from "zod";

/**
 * Body schema for POST /store/carts/:id/suggested-items (SUGG-003, one-tap add).
 * Attribution is required (SEC-01 validates it server-side); the client never
 * supplies customer_id/session_id in the body — those come from auth / headers.
 */
export const PostSuggestedItemSchema = z.object({
  product_id: z.string().min(1),
  variant_id: z.string().min(1).optional(),
  quantity: z.number().int().positive().max(99).default(1),
  slot: z.number().int().nonnegative().optional(),
  attribution: z.object({
    rule_id: z.string().min(1).nullish(),
    source_context: z.enum(["product_view", "cart"]),
    source_product_id: z.string().min(1).nullish(),
  }),
});

export type PostSuggestedItemBody = z.infer<typeof PostSuggestedItemSchema>;
