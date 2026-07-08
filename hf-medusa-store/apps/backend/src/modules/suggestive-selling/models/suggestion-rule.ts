import { model } from '@medusajs/framework/utils'
import SuggestionRuleItem from './suggestion-rule-item'
import CartSuggestionCondition from './cart-suggestion-condition'

/**
 * SuggestionRule — SRS §5.1 (+ source_product_id, see note).
 * A rule drives which products get suggested. `type` splits product-level vs
 * cart-level; `tier` is the priority band (manual > category > behavioral).
 * Cart-level rules hang their conditions off CartSuggestionCondition.
 *
 * `source_product_id`: the product a Tier-1 manual product-level rule applies to
 * (e.g. viewing "Astrox 99 Pro" → suggest its items). Nullable — cart-level and
 * category rules leave it null. Stored as text + read-only link to Product
 * (SRS §5.1 omitted this field; added so Tier-1 manual curation is expressible).
 */
const SuggestionRule = model
  .define('suggestion_rule', {
    id: model.id().primaryKey(),
    name: model.text(),
    type: model.enum(['product', 'cart']),
    tier: model.enum(['manual', 'category', 'behavioral']),
    source_product_id: model.text().nullable(),
    priority: model.number().default(0),
    is_active: model.boolean().default(true),
    valid_from: model.dateTime().nullable(),
    valid_to: model.dateTime().nullable(),
    items: model.hasMany(() => SuggestionRuleItem, { mappedBy: 'rule' }),
    conditions: model.hasMany(() => CartSuggestionCondition, { mappedBy: 'rule' }),
  })
  // Serves loadActiveRules (§7.1 step 2): filter by type + is_active, order by priority;
  // second index for product-level lookup by source product.
  .indexes([
    { on: ['type', 'is_active', 'priority'] },
    { on: ['source_product_id', 'is_active'] },
  ])
  // Soft-deleting a rule tombstones its children too (admin DELETE = soft delete).
  .cascades({ delete: ['items', 'conditions'] })

export default SuggestionRule
