import { defineLink } from '@medusajs/framework/utils'
import ProductModule from '@medusajs/medusa/product'
import SuggestiveSellingModule from '../modules/suggestive-selling'

/**
 * Read-only link: SuggestionRuleItem.suggested_product_id → Product.id.
 *
 * SuggestionRuleItem already stores the product id (SRS §5.1), so we declare a
 * read-only link on that existing field instead of a pivot table. This keeps the
 * modules decoupled (no cross-module FK) while letting Query fetch the linked
 * Product graph in one shot — no extra migration/table is created.
 */
export default defineLink(
  {
    linkable: SuggestiveSellingModule.linkable.suggestionRuleItem,
    field: 'suggested_product_id',
  },
  ProductModule.linkable.product,
  {
    readOnly: true,
  }
)
