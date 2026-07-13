import { model } from '@medusajs/framework/utils'
import SuggestionRuleItem from './suggestion-rule-item'
import CartSuggestionCondition from './cart-suggestion-condition'
import SuggestionRuleSource from './suggestion-rule-source'

/**
 * SuggestionRule — SRS §5.1.
 * A rule drives which products get suggested. `type` splits product-level vs
 * cart-level; `tier` is the priority band (manual > category > behavioral).
 * Cart-level rules hang their conditions off CartSuggestionCondition.
 *
 * Tier-1 manual product-level rules bind to their source product(s) via the
 * `sources` pivot (SuggestionRuleSource) — a rule can target one product (the
 * common case) or be reused across many. Cart/category rules leave it empty.
 * (SRS §5.1 modelled this as a single `source_product_id`; team-decision widened
 * it to a pivot so one curated item set is reusable across products.)
 */
const SuggestionRule = model
  .define('suggestion_rule', {
    id: model.id().primaryKey(),
    name: model.text(),
    type: model.enum(['product', 'cart']),
    tier: model.enum(['manual', 'category', 'behavioral']),
    priority: model.number().default(0),
    is_active: model.boolean().default(true),
    valid_from: model.dateTime().nullable(),
    valid_to: model.dateTime().nullable(),
    items: model.hasMany(() => SuggestionRuleItem, { mappedBy: 'rule' }),
    conditions: model.hasMany(() => CartSuggestionCondition, { mappedBy: 'rule' }),
    sources: model.hasMany(() => SuggestionRuleSource, { mappedBy: 'rule' }),
  })
  // Serves loadActiveRules (§7.1 step 2): filter by type + is_active, order by priority.
  // Product-level lookup by source product is indexed on the pivot (SuggestionRuleSource).
  .indexes([{ on: ['type', 'is_active', 'priority'] }])
  // Soft-deleting a rule tombstones its children too (admin DELETE = soft delete).
  .cascades({ delete: ['items', 'conditions', 'sources'] })

export default SuggestionRule
