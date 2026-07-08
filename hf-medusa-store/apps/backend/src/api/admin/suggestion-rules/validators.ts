import { z } from 'zod'

/**
 * Zod validators for admin suggestion-rule APIs (SRS §6.1).
 * validateAndTransformBody (see src/api/middlewares.ts) parses the request body
 * with these and populates req.validatedBody.
 */

const RuleItemInput = z.object({
  suggested_product_id: z.string().min(1),
  display_order: z.number().int().default(0),
  custom_label: z.string().nullish(),
})

const CartConditionInput = z.object({
  condition_type: z.enum([
    'category_missing',
    'threshold_near',
    'brand_match',
    'consumable_upsell',
  ]),
  condition_params: z.record(z.string(), z.any()).nullish(),
})

export const CreateSuggestionRuleSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['product', 'cart']),
  tier: z.enum(['manual', 'category', 'behavioral']).default('manual'),
  // Source product for Tier-1 manual product-level rules (null for cart/category).
  source_product_id: z.string().nullish(),
  priority: z.number().int().default(0),
  is_active: z.boolean().default(true),
  valid_from: z.coerce.date().nullish(),
  valid_to: z.coerce.date().nullish(),
  items: z.array(RuleItemInput).default([]),
  conditions: z.array(CartConditionInput).default([]),
})

// All fields optional on update; items/conditions (if provided) replace existing.
export const UpdateSuggestionRuleSchema = CreateSuggestionRuleSchema.partial()

export type CreateSuggestionRuleBody = z.infer<typeof CreateSuggestionRuleSchema>
export type UpdateSuggestionRuleBody = z.infer<typeof UpdateSuggestionRuleSchema>
