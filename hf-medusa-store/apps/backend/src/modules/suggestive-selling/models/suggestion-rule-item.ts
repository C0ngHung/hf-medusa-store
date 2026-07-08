import { model } from '@medusajs/framework/utils'
import SuggestionRule from './suggestion-rule'

/**
 * SuggestionRuleItem — SRS §5.1.
 * One suggested product inside a rule. `suggested_product_id` is NOT a DB FK:
 * Product lives in another module, so the relationship is expressed through the
 * Link Module (see src/links/) — we store the id as text here.
 */
const SuggestionRuleItem = model.define('suggestion_rule_item', {
  id: model.id().primaryKey(),
  suggested_product_id: model.text(),
  display_order: model.number().default(0),
  custom_label: model.text().nullable(),
  rule: model.belongsTo(() => SuggestionRule, { mappedBy: 'items' }),
})

export default SuggestionRuleItem
