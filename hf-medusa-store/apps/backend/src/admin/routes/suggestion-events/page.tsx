import { useMemo, useState } from "react";
import { defineRouteConfig } from "@medusajs/admin-sdk";
import { ListBullet } from "@medusajs/icons";
import { Badge, Container, Heading, Select, Table, Text } from "@medusajs/ui";
import { useSuggestionEvents, type EventFilters } from "../../lib/api";
import { EVENT_ACTIONS, EVENT_CONTEXTS } from "../../lib/types";
import { useProductTitles } from "../../lib/use-products";

const ANY = "__any__";

const actionColor = (
  a: string,
): "green" | "blue" | "orange" | "grey" | "red" => {
  switch (a) {
    case "add_to_cart":
      return "green";
    case "tap":
      return "blue";
    case "impression":
      return "grey";
    case "dismiss":
      return "orange";
    default:
      return "grey";
  }
};

const fmtDate = (v?: string | null) => (v ? new Date(v).toLocaleString() : "—");

const SuggestionEventsPage = () => {
  const [filters, setFilters] = useState<EventFilters>({});
  const { data, isLoading } = useSuggestionEvents(filters);
  const rows = useMemo(() => data?.suggestion_events ?? [], [data]);

  const { data: products = {} } = useProductTitles(
    rows.flatMap((r) => [r.suggested_product_id, r.source_product_id ?? ""]),
  );
  const titleOf = (id?: string | null) =>
    id ? (products[id]?.title ?? id) : "—";

  const setFilter = (key: keyof EventFilters, value: string) =>
    setFilters((f) => ({
      ...f,
      [key]: value === ANY ? undefined : value,
    }));

  return (
    <Container className="p-0">
      <div className="flex flex-col gap-4 px-6 py-4">
        <div>
          <Heading level="h1">Suggestion events</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Read-only analytics feed (impressions, taps, add-to-cart, dismiss).
            Append-only — written by the storefront.
          </Text>
        </div>
        <div className="flex gap-3">
          <div style={{ width: 200 }}>
            <Select
              value={filters.source_context ?? ANY}
              onValueChange={(v) => setFilter("source_context", v)}
            >
              <Select.Trigger>
                <Select.Value placeholder="Context: any" />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value={ANY}>Context: any</Select.Item>
                {EVENT_CONTEXTS.map((c) => (
                  <Select.Item key={c} value={c}>
                    {c}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
          <div style={{ width: 200 }}>
            <Select
              value={filters.action ?? ANY}
              onValueChange={(v) => setFilter("action", v)}
            >
              <Select.Trigger>
                <Select.Value placeholder="Action: any" />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value={ANY}>Action: any</Select.Item>
                {EVENT_ACTIONS.map((a) => (
                  <Select.Item key={a} value={a}>
                    {a}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="px-6 py-8">
          <Text className="text-ui-fg-muted">Loading…</Text>
        </div>
      ) : rows.length === 0 ? (
        <div className="px-6 py-8">
          <Text className="text-ui-fg-muted">No events match.</Text>
        </div>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Time</Table.HeaderCell>
              <Table.HeaderCell>Action</Table.HeaderCell>
              <Table.HeaderCell>Context</Table.HeaderCell>
              <Table.HeaderCell>Tier</Table.HeaderCell>
              <Table.HeaderCell>Slot</Table.HeaderCell>
              <Table.HeaderCell>Source</Table.HeaderCell>
              <Table.HeaderCell>Suggested</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((e) => (
              <Table.Row key={e.id}>
                <Table.Cell className="text-ui-fg-subtle whitespace-nowrap">
                  {fmtDate(e.created_at)}
                </Table.Cell>
                <Table.Cell>
                  <Badge size="2xsmall" color={actionColor(e.action)}>
                    {e.action}
                  </Badge>
                </Table.Cell>
                <Table.Cell>{e.source_context}</Table.Cell>
                <Table.Cell>{e.tier ?? "—"}</Table.Cell>
                <Table.Cell>{e.slot ?? "—"}</Table.Cell>
                <Table.Cell>{titleOf(e.source_product_id)}</Table.Cell>
                <Table.Cell className="font-medium">
                  {titleOf(e.suggested_product_id)}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
    </Container>
  );
};

export const config = defineRouteConfig({
  label: "Suggestion events",
  icon: ListBullet,
});

export default SuggestionEventsPage;
