import { defineLink } from '@medusajs/framework/utils'
import ProductModule from '@medusajs/medusa/product'
import SuggestiveSellingModule from '../modules/suggestive-selling'

/**
 * Read-only link: SuggestionRule.source_product_id → Product.id.
 *
 * A Tier-1 manual product-level rule targets a source product; this lets Query
 * fetch that Product graph without a cross-module FK. Nullable field (cart /
 * category rules leave it null) — no link row is created when null.
 */
export default defineLink(
  {
    linkable: SuggestiveSellingModule.linkable.suggestionRule,
    field: 'source_product_id',
  },
  ProductModule.linkable.product,
  {
    readOnly: true,
  }
)
