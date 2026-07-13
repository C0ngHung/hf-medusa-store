import { defineLink } from '@medusajs/framework/utils'
import ProductModule from '@medusajs/medusa/product'
import SuggestiveSellingModule from '../modules/suggestive-selling'

/**
 * Read-only link: ProductBulkMapping.bulk_product_id → Product.id (CR-04).
 * The bulk/multipack product suggested for the matching single item. Cross-module,
 * so a read-only link on the existing text field — no pivot table, no migration.
 */
export default defineLink(
  {
    linkable: SuggestiveSellingModule.linkable.productBulkMapping,
    field: 'bulk_product_id',
  },
  ProductModule.linkable.product,
  {
    readOnly: true,
  }
)
