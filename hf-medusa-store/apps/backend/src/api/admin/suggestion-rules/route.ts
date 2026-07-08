import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { SUGGESTIVE_SELLING_MODULE } from '../../../modules/suggestive-selling'
import { CreateSuggestionRuleBody } from './validators'
import { invalidateSuggestionCache } from './helpers'

/**
 * GET /admin/suggestion-rules — list rules (SRS §6.1).
 * Query: type, is_active, limit, offset. Returns rules with items + conditions.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const service: any = req.scope.resolve(SUGGESTIVE_SELLING_MODULE)

  const { type, is_active, limit = '50', offset = '0' } = req.query as Record<string, string>
  const filters: Record<string, unknown> = {}
  if (type) filters.type = type
  if (is_active !== undefined) filters.is_active = is_active === 'true'

  const [suggestion_rules, count] = await service.listAndCountSuggestionRules(filters, {
    relations: ['items', 'conditions'],
    take: Number(limit),
    skip: Number(offset),
    order: { priority: 'ASC' },
  })

  res.json({ suggestion_rules, count, limit: Number(limit), offset: Number(offset) })
}

/**
 * POST /admin/suggestion-rules — create a rule with nested items + conditions.
 */
export const POST = async (
  req: MedusaRequest<CreateSuggestionRuleBody>,
  res: MedusaResponse
) => {
  const service: any = req.scope.resolve(SUGGESTIVE_SELLING_MODULE)
  const { items, conditions, ...ruleData } = req.validatedBody

  const suggestion_rule = await service.createSuggestionRules({
    ...ruleData,
    items,
    conditions,
  })

  await invalidateSuggestionCache(req.scope, suggestion_rule.id)
  res.status(201).json({ suggestion_rule })
}
