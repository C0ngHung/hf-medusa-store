import { model } from '@medusajs/framework/utils'
import SuggestionRule from './suggestion-rule'

/**
 * CartSuggestionCondition — SRS §5.1.
 * Belongs to a cart-type rule. `condition_params` is JSON so new condition
 * shapes (e.g. { category: 'strings', threshold_pct: 15 }) don't need a migration.
 */
const CartSuggestionCondition = model.define('cart_suggestion_condition', {
  id: model.id().primaryKey(),
  condition_type: model.enum([
    'category_missing',
    'threshold_near',
    'brand_match',
    'consumable_upsell',
  ]),
  condition_params: model.json().nullable(),
  rule: model.belongsTo(() => SuggestionRule, { mappedBy: 'conditions' }),
})

export default CartSuggestionCondition
