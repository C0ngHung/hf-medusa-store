import { useMemo, useState } from "react";
import { defineRouteConfig } from "@medusajs/admin-sdk";
import { Sparkles, PencilSquare, Trash } from "@medusajs/icons";
import {
  Badge,
  Button,
  Container,
  Heading,
  IconButton,
  Prompt,
  StatusBadge,
  Table,
  Tabs,
  Text,
  toast,
} from "@medusajs/ui";
import { useDeleteRule, useSuggestionRules } from "../../lib/api";
import type { RuleType, SuggestionRule } from "../../lib/types";
import { RuleFormModal } from "../../components/rule-form-modal";

const TABS: { value: string; label: string; type?: RuleType }[] = [
  { value: "all", label: "All" },
  { value: "product", label: "Product page", type: "product" },
  { value: "cart", label: "Cart", type: "cart" },
];

const SuggestionRulesPage = () => {
  const [tab, setTab] = useState("all");
  const activeTab = TABS.find((t) => t.value === tab)!;

  const { data, isLoading } = useSuggestionRules(activeTab.type);
  const del = useDeleteRule();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SuggestionRule | null>(null);
  const [deleting, setDeleting] = useState<SuggestionRule | null>(null);

  const rules = useMemo(() => data?.suggestion_rules ?? [], [data]);

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (r: SuggestionRule) => {
    setEditing(r);
    setModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await del.mutateAsync(deleting.id);
      toast.success("Rule deleted");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to delete");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <Container className="p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading level="h1">Suggestion rules</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Product-page and cart suggestion configuration.
          </Text>
        </div>
        <Button size="small" onClick={openCreate}>
          Create rule
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="border-ui-border-base border-y px-6">
          <Tabs.List>
            {TABS.map((t) => (
              <Tabs.Trigger key={t.value} value={t.value}>
                {t.label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        </div>
      </Tabs>

      {isLoading ? (
        <div className="px-6 py-8">
          <Text className="text-ui-fg-muted">Loading…</Text>
        </div>
      ) : rules.length === 0 ? (
        <div className="px-6 py-8">
          <Text className="text-ui-fg-muted">No rules yet.</Text>
        </div>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Name</Table.HeaderCell>
              <Table.HeaderCell>Type</Table.HeaderCell>
              <Table.HeaderCell>Tier</Table.HeaderCell>
              <Table.HeaderCell>Priority</Table.HeaderCell>
              <Table.HeaderCell>Items / Conditions</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rules.map((r) => (
              <Table.Row key={r.id}>
                <Table.Cell className="font-medium">{r.name}</Table.Cell>
                <Table.Cell>
                  <Badge size="2xsmall">{r.type}</Badge>
                </Table.Cell>
                <Table.Cell>
                  <Badge size="2xsmall">{r.tier}</Badge>
                </Table.Cell>
                <Table.Cell>{r.priority}</Table.Cell>
                <Table.Cell>
                  {r.type === "cart"
                    ? `${r.conditions?.length ?? 0} cond.`
                    : `${r.items?.length ?? 0} items`}
                </Table.Cell>
                <Table.Cell>
                  <StatusBadge color={r.is_active ? "green" : "grey"}>
                    {r.is_active ? "Active" : "Inactive"}
                  </StatusBadge>
                </Table.Cell>
                <Table.Cell>
                  <div className="flex items-center justify-end gap-2">
                    <IconButton
                      size="small"
                      variant="transparent"
                      onClick={() => openEdit(r)}
                    >
                      <PencilSquare />
                    </IconButton>
                    <IconButton
                      size="small"
                      variant="transparent"
                      onClick={() => setDeleting(r)}
                    >
                      <Trash />
                    </IconButton>
                  </div>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}

      <RuleFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        rule={editing}
        defaultType={activeTab.type ?? "product"}
      />

      <Prompt open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <Prompt.Content>
          <Prompt.Header>
            <Prompt.Title>Delete rule</Prompt.Title>
            <Prompt.Description>
              Delete “{deleting?.name}”? This soft-deletes the rule and its
              items/conditions.
            </Prompt.Description>
          </Prompt.Header>
          <Prompt.Footer>
            <Prompt.Cancel>Cancel</Prompt.Cancel>
            <Prompt.Action onClick={confirmDelete}>Delete</Prompt.Action>
          </Prompt.Footer>
        </Prompt.Content>
      </Prompt>
    </Container>
  );
};

export const config = defineRouteConfig({
  label: "Suggestion rules",
  icon: Sparkles,
});

export default SuggestionRulesPage;
