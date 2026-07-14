import { useEffect, useMemo, useState } from "react";
import { defineRouteConfig } from "@medusajs/admin-sdk";
import { SquaresPlus, PencilSquare, Trash, ArrowRight } from "@medusajs/icons";
import {
  Button,
  Container,
  Drawer,
  Heading,
  IconButton,
  Input,
  Label,
  Prompt,
  StatusBadge,
  Switch,
  Table,
  Text,
  toast,
} from "@medusajs/ui";
import {
  useComplementMappings,
  useCreateComplement,
  useDeleteComplement,
  useUpdateComplement,
} from "../../lib/api";
import type { CategoryComplementMapping } from "../../lib/types";
import { CategorySelect } from "../../components/category-select";
import { useCategoryNames } from "../../lib/use-categories";

const ComplementMappingsPage = () => {
  const { data, isLoading } = useComplementMappings();
  const del = useDeleteComplement();

  const mappings = useMemo(
    () => data?.category_complement_mappings ?? [],
    [data],
  );

  const ids = useMemo(
    () =>
      mappings.flatMap((m) => [m.source_category_id, m.complement_category_id]),
    [mappings],
  );
  const { data: names = {} } = useCategoryNames(ids);
  const nameOf = (id: string) => names[id]?.name ?? id;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryComplementMapping | null>(
    null,
  );
  const [deleting, setDeleting] = useState<CategoryComplementMapping | null>(
    null,
  );

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await del.mutateAsync(deleting.id);
      toast.success("Mapping deleted");
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
          <Heading level="h1">Category complements</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Tier-2 backfill: which complementary categories to suggest for a
            source category (e.g. Rackets → Strings, Grips, Bags).
          </Text>
        </div>
        <Button
          size="small"
          onClick={() => {
            setEditing(null);
            setDrawerOpen(true);
          }}
        >
          Create mapping
        </Button>
      </div>

      {isLoading ? (
        <div className="px-6 py-8">
          <Text className="text-ui-fg-muted">Loading…</Text>
        </div>
      ) : mappings.length === 0 ? (
        <div className="px-6 py-8">
          <Text className="text-ui-fg-muted">No mappings yet.</Text>
        </div>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Source category</Table.HeaderCell>
              <Table.HeaderCell>Complement category</Table.HeaderCell>
              <Table.HeaderCell>Order</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {mappings.map((m) => (
              <Table.Row key={m.id}>
                <Table.Cell className="font-medium">
                  {nameOf(m.source_category_id)}
                </Table.Cell>
                <Table.Cell>
                  <span className="flex items-center gap-2">
                    <ArrowRight className="text-ui-fg-muted" />
                    {nameOf(m.complement_category_id)}
                  </span>
                </Table.Cell>
                <Table.Cell>{m.display_order}</Table.Cell>
                <Table.Cell>
                  <StatusBadge color={m.is_active ? "green" : "grey"}>
                    {m.is_active ? "Active" : "Inactive"}
                  </StatusBadge>
                </Table.Cell>
                <Table.Cell>
                  <div className="flex items-center justify-end gap-2">
                    <IconButton
                      size="small"
                      variant="transparent"
                      onClick={() => {
                        setEditing(m);
                        setDrawerOpen(true);
                      }}
                    >
                      <PencilSquare />
                    </IconButton>
                    <IconButton
                      size="small"
                      variant="transparent"
                      onClick={() => setDeleting(m)}
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

      <ComplementDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        mapping={editing}
      />

      <Prompt open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <Prompt.Content>
          <Prompt.Header>
            <Prompt.Title>Delete mapping</Prompt.Title>
            <Prompt.Description>
              Delete this complement mapping? Tier-2 backfill will stop using
              it.
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

const ComplementDrawer = ({
  open,
  onClose,
  mapping,
}: {
  open: boolean;
  onClose: () => void;
  mapping: CategoryComplementMapping | null;
}) => {
  const isEdit = !!mapping;
  const create = useCreateComplement();
  const update = useUpdateComplement();

  const [source, setSource] = useState<string | null>(null);
  const [complement, setComplement] = useState<string | null>(null);
  const [order, setOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    setSource(mapping?.source_category_id ?? null);
    setComplement(mapping?.complement_category_id ?? null);
    setOrder(String(mapping?.display_order ?? 0));
    setIsActive(mapping?.is_active ?? true);
  }, [open, mapping]);

  const submitting = create.isPending || update.isPending;

  const handleSubmit = async () => {
    if (!source || !complement) {
      toast.error("Both source and complement categories are required");
      return;
    }
    if (source === complement) {
      toast.error("Source and complement categories must differ");
      return;
    }
    const body = {
      source_category_id: source,
      complement_category_id: complement,
      display_order: parseInt(order, 10) || 0,
      is_active: isActive,
    };
    try {
      if (isEdit && mapping) {
        await update.mutateAsync({ id: mapping.id, ...body });
        toast.success("Mapping updated");
      } else {
        await create.mutateAsync(body);
        toast.success("Mapping created");
      }
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save mapping");
    }
  };

  return (
    <Drawer open={open} onOpenChange={(v) => !v && onClose()}>
      <Drawer.Content>
        <Drawer.Header>
          <Drawer.Title>
            {isEdit ? "Edit complement mapping" : "New complement mapping"}
          </Drawer.Title>
        </Drawer.Header>
        <Drawer.Body className="flex flex-col gap-4">
          <div>
            <Label size="small" className="mb-1 block">
              Source category
            </Label>
            <CategorySelect value={source} onChange={setSource} />
          </div>
          <div>
            <Label size="small" className="mb-1 block">
              Complement category
            </Label>
            <CategorySelect value={complement} onChange={setComplement} />
          </div>
          <div>
            <Label size="small" className="mb-1 block">
              Display order
            </Label>
            <Input
              type="number"
              value={order}
              onChange={(e) => setOrder(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={isActive} onCheckedChange={setIsActive} />
            <Label size="small">Active</Label>
          </div>
        </Drawer.Body>
        <Drawer.Footer>
          <Drawer.Close asChild>
            <Button variant="secondary">Cancel</Button>
          </Drawer.Close>
          <Button onClick={handleSubmit} isLoading={submitting}>
            {isEdit ? "Save" : "Create"}
          </Button>
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer>
  );
};

export const config = defineRouteConfig({
  label: "Category complements",
  icon: SquaresPlus,
});

export default ComplementMappingsPage;
