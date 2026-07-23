import { defineLink } from '@medusajs/framework/utils'
import ProductModule from '@medusajs/medusa/product'
import SuggestiveSellingModule from '../modules/suggestive-selling'

/**
 * Read-only link: SuggestionRuleSource.source_product_id → Product.id.
 *
 * Tier-1 manual product-level rules bind to their source product(s) through the
 * SuggestionRuleSource pivot; this lets Query fetch that Product graph without a
 * cross-module FK. One link row per pivot row (rule × source product).
 */
export default defineLink(
  {
    linkable: SuggestiveSellingModule.linkable.suggestionRuleSource,
    field: 'source_product_id',
  },
  ProductModule.linkable.product,
  {
    readOnly: true,
  }
)
