import { model } from '@medusajs/framework/utils'

/**
 * CategoryComplementMapping — Tier 2 backfill source (SRS SUGG-001).
 * The SRS describes the Rackets→[Strings, Grips, Bags] mapping only in prose;
 * we model it as a DB table (decision G3) so admins can edit it via API without
 * a deploy. One row per (source → complement) pair, ordered by display_order.
 */
const CategoryComplementMapping = model
  .define('category_complement_mapping', {
    id: model.id().primaryKey(),
    source_category_id: model.text(),
    complement_category_id: model.text(),
    display_order: model.number().default(0),
    is_active: model.boolean().default(true),
  })
  .indexes([{ on: ['source_category_id', 'is_active'] }])

export default CategoryComplementMapping
