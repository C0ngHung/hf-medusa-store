import { defineLink } from '@medusajs/framework/utils'
import ProductModule from '@medusajs/medusa/product'
import SuggestiveSellingModule from '../modules/suggestive-selling'

/**
 * Read-only link: ProductBulkMapping.single_product_id → Product.id (CR-04).
 * The single/consumable product a cart line matches on. Cross-module, so a
 * read-only link on the existing text field — no pivot table, no migration.
 */
export default defineLink(
  {
    linkable: SuggestiveSellingModule.linkable.productBulkMapping,
    field: 'single_product_id',
  },
  ProductModule.linkable.product,
  {
    readOnly: true,
  }
)
