import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { SUGGESTIVE_SELLING_MODULE } from '../../../../modules/suggestive-selling'
import { UpdateSuggestionRuleBody } from '../validators'
import { invalidateSuggestionCache } from '../helpers'

/**
 * GET /admin/suggestion-rules/:id — retrieve one rule with items + conditions.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const service: any = req.scope.resolve(SUGGESTIVE_SELLING_MODULE)
  const suggestion_rule = await service.retrieveSuggestionRule(req.params.id, {
    relations: ['items', 'conditions'],
  })
  res.json({ suggestion_rule })
}

/**
 * PUT /admin/suggestion-rules/:id — update scalar fields; if items/conditions
 * are provided, they REPLACE the existing sets.
 */
export const PUT = async (
  req: MedusaRequest<UpdateSuggestionRuleBody>,
  res: MedusaResponse
) => {
  const service: any = req.scope.resolve(SUGGESTIVE_SELLING_MODULE)
  const { id } = req.params
  const { items, conditions, ...ruleData } = req.validatedBody

  if (Object.keys(ruleData).length) {
    await service.updateSuggestionRules({ id, ...ruleData })
  }

  if (items) {
    const existing = await service.listSuggestionRuleItems({ rule_id: id }, { select: ['id'] })
    if (existing.length) {
      await service.deleteSuggestionRuleItems(existing.map((i: any) => i.id))
    }
    if (items.length) {
      await service.createSuggestionRuleItems(items.map((i: any) => ({ ...i, rule_id: id })))
    }
  }

  if (conditions) {
    const existing = await service.listCartSuggestionConditions({ rule_id: id }, { select: ['id'] })
    if (existing.length) {
      await service.deleteCartSuggestionConditions(existing.map((c: any) => c.id))
    }
    if (conditions.length) {
      await service.createCartSuggestionConditions(
        conditions.map((c: any) => ({ ...c, rule_id: id }))
      )
    }
  }

  const suggestion_rule = await service.retrieveSuggestionRule(id, {
    relations: ['items', 'conditions'],
  })
  await invalidateSuggestionCache(req.scope, id)
  res.json({ suggestion_rule })
}

/**
 * DELETE /admin/suggestion-rules/:id — soft delete (SRS §6.1: sets is_active=false
 * semantics via soft-delete; children cascade per model definition).
 */
export const DELETE = async (req: MedusaRequest, res: MedusaResponse) => {
  const service: any = req.scope.resolve(SUGGESTIVE_SELLING_MODULE)
  const { id } = req.params

  await service.softDeleteSuggestionRules(id)
  await invalidateSuggestionCache(req.scope, id)

  res.json({ id, object: 'suggestion_rule', deleted: true })
}
