import { model } from '@medusajs/framework/utils'
import SuggestionRule from './suggestion-rule'

/**
 * SuggestionRuleSource — SRS SUGG-001 Tier-1 (team-decision: replaces the single
 * `SuggestionRule.source_product_id` field with a pivot).
 *
 * Each row binds one source product to a rule, so a manual-curation rule can
 * target ONE product (the common case, N=1) or be reused across MANY source
 * products that share the same suggested-item set. Mirrors SuggestionRuleItem:
 * `source_product_id` is NOT a DB FK — Product lives in another module, so the
 * relationship is expressed through the Link Module (see src/links/).
 */
const SuggestionRuleSource = model
  .define('suggestion_rule_source', {
    id: model.id().primaryKey(),
    source_product_id: model.text(),
    rule: model.belongsTo(() => SuggestionRule, { mappedBy: 'sources' }),
  })
  // Serves product-level lookup: given a viewed product, find its rules.
  .indexes([{ on: ['source_product_id'] }])

export default SuggestionRuleSource
