import { useEffect, useMemo, useState } from "react";
import { defineRouteConfig } from "@medusajs/admin-sdk";
import { ArrowsPointingOut, PencilSquare, Trash } from "@medusajs/icons";
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
  useBulkMappings,
  useCreateBulkMapping,
  useDeleteBulkMapping,
  useUpdateBulkMapping,
} from "../../lib/api";
import type { ProductBulkMapping } from "../../lib/types";
import { ProductSelect } from "../../components/product-select";
import { useProductTitles } from "../../lib/use-products";

const BulkMappingsPage = () => {
  const { data, isLoading } = useBulkMappings();
  const del = useDeleteBulkMapping();

  const mappings = useMemo(() => data?.product_bulk_mappings ?? [], [data]);

  // Resolve all referenced product ids → titles for the table.
  const ids = useMemo(
    () => mappings.flatMap((m) => [m.single_product_id, m.bulk_product_id]),
    [mappings],
  );
  const { data: titles = {} } = useProductTitles(ids);
  const titleOf = (id: string) => titles[id]?.title ?? id;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ProductBulkMapping | null>(null);
  const [deleting, setDeleting] = useState<ProductBulkMapping | null>(null);

  const openCreate = () => {
    setEditing(null);
    setDrawerOpen(true);
  };
  const openEdit = (m: ProductBulkMapping) => {
    setEditing(m);
    setDrawerOpen(true);
  };

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
          <Heading level="h1">Bulk mappings</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Single → bulk product links used by the CR-04 consumable upsell.
          </Text>
        </div>
        <Button size="small" onClick={openCreate}>
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
              <Table.HeaderCell>Single product</Table.HeaderCell>
              <Table.HeaderCell>Bulk product</Table.HeaderCell>
              <Table.HeaderCell>Multiplier</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {mappings.map((m) => (
              <Table.Row key={m.id}>
                <Table.Cell className="font-medium">
                  {titleOf(m.single_product_id)}
                </Table.Cell>
                <Table.Cell>{titleOf(m.bulk_product_id)}</Table.Cell>
                <Table.Cell>{m.unit_multiplier ?? "—"}</Table.Cell>
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
                      onClick={() => openEdit(m)}
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

      <BulkMappingDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        mapping={editing}
      />

      <Prompt open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <Prompt.Content>
          <Prompt.Header>
            <Prompt.Title>Delete mapping</Prompt.Title>
            <Prompt.Description>
              Delete this single → bulk mapping? The CR-04 upsell will stop
              using it.
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

/* ---- create / edit drawer ---- */

const BulkMappingDrawer = ({
  open,
  onClose,
  mapping,
}: {
  open: boolean;
  onClose: () => void;
  mapping: ProductBulkMapping | null;
}) => {
  const isEdit = !!mapping;
  const create = useCreateBulkMapping();
  const update = useUpdateBulkMapping();

  const [single, setSingle] = useState<string | null>(null);
  const [bulk, setBulk] = useState<string | null>(null);
  const [multiplier, setMultiplier] = useState("");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    setSingle(mapping?.single_product_id ?? null);
    setBulk(mapping?.bulk_product_id ?? null);
    setMultiplier(
      mapping?.unit_multiplier != null ? String(mapping.unit_multiplier) : "",
    );
    setIsActive(mapping?.is_active ?? true);
  }, [open, mapping]);

  const submitting = create.isPending || update.isPending;

  const handleSubmit = async () => {
    if (!single || !bulk) {
      toast.error("Both single and bulk products are required");
      return;
    }
    if (single === bulk) {
      toast.error("Single and bulk products must differ");
      return;
    }
    const body = {
      single_product_id: single,
      bulk_product_id: bulk,
      unit_multiplier: multiplier ? parseInt(multiplier, 10) : null,
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
            {isEdit ? "Edit bulk mapping" : "New bulk mapping"}
          </Drawer.Title>
        </Drawer.Header>
        <Drawer.Body className="flex flex-col gap-4">
          <div>
            <Label size="small" className="mb-1 block">
              Single product
            </Label>
            <ProductSelect value={single} onChange={setSingle} />
          </div>
          <div>
            <Label size="small" className="mb-1 block">
              Bulk product
            </Label>
            <ProductSelect value={bulk} onChange={setBulk} />
          </div>
          <div>
            <Label size="small" className="mb-1 block">
              Unit multiplier (optional)
            </Label>
            <Input
              type="number"
              placeholder="e.g. 3"
              value={multiplier}
              onChange={(e) => setMultiplier(e.target.value)}
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
  label: "Bulk mappings",
  icon: ArrowsPointingOut,
});

export default BulkMappingsPage;
