/**
 * Pure sales-ranking aggregation for the Tier-2 top-seller snapshot (SPEC A.6).
 * No I/O — the job fetches orders + product→category mapping and delegates the
 * reduction here so it is unit-testable.
 */

export type OrderLike = {
  items?: {
    product_id?: string | null;
    quantity?: number | null;
    // On a Medusa order line item, `quantity` is a computed field backed by the
    // `detail` (order_item) relation. Depending on the graph field selection the
    // value can arrive either directly on the item or nested under `detail`, so
    // accept both here — the aggregation reads whichever is present.
    detail?: { quantity?: number | null } | null;
  }[];
};

export type TopSellerRow = {
  category_id: string;
  product_id: string;
  sales_count: number;
};

/**
 * Sum ordered quantity per product across the given orders, then fan each
 * product out to its categories → one row per (category, product) with that
 * product's total sales count. Products with 0 sales or no categories are dropped.
 */
export function computeSalesRanking(
  orders: OrderLike[],
  productCategories: Map<string, string[]>,
): TopSellerRow[] {
  const salesByProduct = new Map<string, number>();
  for (const order of orders ?? []) {
    for (const item of order.items ?? []) {
      if (!item?.product_id) continue;
      const qty = item.quantity ?? item.detail?.quantity ?? 0;
      salesByProduct.set(
        item.product_id,
        (salesByProduct.get(item.product_id) ?? 0) + qty,
      );
    }
  }

  const rows: TopSellerRow[] = [];
  for (const [product_id, sales_count] of salesByProduct) {
    if (sales_count <= 0) continue;
    for (const category_id of productCategories.get(product_id) ?? []) {
      rows.push({ category_id, product_id, sales_count });
    }
  }
  return rows;
}
