import { model } from '@medusajs/framework/utils'

/**
 * ProductBulkMapping — cart-level rule CR-04 (SRS SUGG-004; team-decision, like G3).
 *
 * CR-04 suggests a bulk/multipack of the SAME item when the cart holds a
 * consumable with qty=1 (e.g. 1 tube of shuttlecocks → the matching 3-tube box).
 * Brand/category matching is not precise enough here — it would surface a
 * different product line in the same category — so we map the exact single→bulk
 * pair explicitly. Admin-editable via API without a deploy.
 *
 * `single_product_id` / `bulk_product_id` are NOT DB FKs — Product lives in
 * another module, wired through the Link Module (see src/links/).
 * `unit_multiplier` is display metadata (e.g. 3 → "3-tube bundle").
 */
const ProductBulkMapping = model
  .define('product_bulk_mapping', {
    id: model.id().primaryKey(),
    single_product_id: model.text(),
    bulk_product_id: model.text(),
    unit_multiplier: model.number().nullable(),
    is_active: model.boolean().default(true),
  })
  // CR-04 lookup: given a cart line's product, find its designated bulk product.
  .indexes([{ on: ['single_product_id', 'is_active'] }])

export default ProductBulkMapping
