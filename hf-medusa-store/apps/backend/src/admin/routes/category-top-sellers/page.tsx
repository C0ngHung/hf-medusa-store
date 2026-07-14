import { useMemo } from "react";
import { defineRouteConfig } from "@medusajs/admin-sdk";
import { ChartBar } from "@medusajs/icons";
import { Badge, Container, Heading, Table, Text } from "@medusajs/ui";
import { useCategoryTopSellers } from "../../lib/api";
import { useProductTitles } from "../../lib/use-products";
import { useCategoryNames } from "../../lib/use-categories";

const fmtDate = (v?: string | null) => (v ? new Date(v).toLocaleString() : "—");

const CategoryTopSellersPage = () => {
  const { data, isLoading } = useCategoryTopSellers();
  const rows = useMemo(() => data?.category_top_sellers ?? [], [data]);

  const { data: products = {} } = useProductTitles(
    rows.map((r) => r.product_id),
  );
  const { data: categories = {} } = useCategoryNames(
    rows.map((r) => r.category_id),
  );

  return (
    <Container className="p-0">
      <div className="px-6 py-4">
        <Heading level="h1">Category top sellers</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Read-only Tier-2 ranking snapshot, precomputed by the scheduled job.
          The evaluator reads this to order category-backfill suggestions.
        </Text>
      </div>

      {isLoading ? (
        <div className="px-6 py-8">
          <Text className="text-ui-fg-muted">Loading…</Text>
        </div>
      ) : rows.length === 0 ? (
        <div className="px-6 py-8">
          <Text className="text-ui-fg-muted">
            No snapshot rows yet. The ranking job hasn’t run or there are no
            orders in the window — the backfill falls back to newest-first.
          </Text>
        </div>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Category</Table.HeaderCell>
              <Table.HeaderCell>Product</Table.HeaderCell>
              <Table.HeaderCell>Sales</Table.HeaderCell>
              <Table.HeaderCell>Window</Table.HeaderCell>
              <Table.HeaderCell>Computed at</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((r) => (
              <Table.Row key={r.id}>
                <Table.Cell>
                  {categories[r.category_id]?.name ?? r.category_id}
                </Table.Cell>
                <Table.Cell className="font-medium">
                  {products[r.product_id]?.title ?? r.product_id}
                </Table.Cell>
                <Table.Cell>
                  <Badge size="2xsmall">{r.sales_count}</Badge>
                </Table.Cell>
                <Table.Cell>{r.window_days}d</Table.Cell>
                <Table.Cell>{fmtDate(r.computed_at)}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
    </Container>
  );
};

export const config = defineRouteConfig({
  label: "Category top sellers",
  icon: ChartBar,
});

export default CategoryTopSellersPage;
