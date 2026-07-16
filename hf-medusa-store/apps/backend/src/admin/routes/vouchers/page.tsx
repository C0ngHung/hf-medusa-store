import { useState } from "react";
import { defineRouteConfig } from "@medusajs/admin-sdk";
import { ReceiptPercent } from "@medusajs/icons";
import {
  Button,
  Container,
  Heading,
  StatusBadge,
  Table,
  Text,
} from "@medusajs/ui";
import { useVouchers } from "../../lib/api";
import type { VoucherConfig } from "../../lib/types";
import { CreateVoucherModal } from "../../components/create-voucher-modal";
import { VoucherAnalyticsDrawer } from "../../components/voucher-analytics-drawer";

function formatDiscount(v: VoucherConfig): string {
  if (v.discount_type === "percentage") {
    const pct = v.discount_value / 100; // bps -> percent (2000 -> 20)
    return `${Number.isInteger(pct) ? pct : pct.toFixed(2)}%`;
  }
  return `${new Intl.NumberFormat("vi-VN").format(v.discount_value)}₫`;
}

function formatMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${new Intl.NumberFormat("vi-VN").format(n)}₫`;
}

function formatDate(s: string): string {
  return new Date(s).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Admin Voucher Engine management page. Reads/writes ONLY the VoucherConfig
 * table via /admin/vouchers* — never the native Promotion list (a voucher's
 * backing/ephemeral Promotions are internal transport, not admin-visible
 * rows, SPEC Decision C/G). List/create/analyze only — no update, delete, or
 * deactivate yet.
 */
const VouchersPage = () => {
  const { data, isLoading, isError, refetch } = useVouchers();
  const vouchers = data?.vouchers ?? [];

  const [createOpen, setCreateOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState<{
    id: string;
    code: string;
  } | null>(null);

  const handleCreated = (voucher: VoucherConfig) => {
    // Offer the newly created voucher's analytics immediately — it will be
    // all zeros (fresh voucher), but keeps the create→analyze flow smooth
    // without requiring a second click to find the row.
    setAnalyzing({ id: voucher.id, code: voucher.code });
  };

  return (
    <Container className="p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading level="h1">Vouchers</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            VoucherEngine voucher configuration and usage.
          </Text>
        </div>
        <Button size="small" onClick={() => setCreateOpen(true)}>
          Create voucher
        </Button>
      </div>

      {isLoading ? (
        <div className="border-ui-border-base border-t px-6 py-8">
          <Text size="small" className="text-ui-fg-muted">
            Loading…
          </Text>
        </div>
      ) : isError ? (
        <div className="border-ui-border-base flex flex-col items-start gap-y-3 border-t px-6 py-8">
          <Text size="small" className="text-ui-fg-error">
            Failed to load vouchers.
          </Text>
          <Button size="small" variant="secondary" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : vouchers.length === 0 ? (
        <div className="border-ui-border-base flex flex-col items-start gap-y-3 border-t px-6 py-8">
          <Text size="small" className="text-ui-fg-muted">
            No vouchers yet.
          </Text>
          <Button size="small" onClick={() => setCreateOpen(true)}>
            Create voucher
          </Button>
        </div>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Code</Table.HeaderCell>
              <Table.HeaderCell>Discount</Table.HeaderCell>
              <Table.HeaderCell>Min order</Table.HeaderCell>
              <Table.HeaderCell>Usage</Table.HeaderCell>
              <Table.HeaderCell>Active</Table.HeaderCell>
              <Table.HeaderCell>Validity</Table.HeaderCell>
              <Table.HeaderCell>Created</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {vouchers.map((v) => (
              <Table.Row key={v.id}>
                <Table.Cell className="font-mono font-medium">
                  {v.code}
                </Table.Cell>
                <Table.Cell>{formatDiscount(v)}</Table.Cell>
                <Table.Cell>{formatMoney(v.min_order_value)}</Table.Cell>
                <Table.Cell>
                  {v.usage_count ?? 0} / {v.usage_limit ?? "∞"}
                </Table.Cell>
                <Table.Cell>
                  <StatusBadge color={v.is_active ? "green" : "grey"}>
                    {v.is_active ? "Active" : "Inactive"}
                  </StatusBadge>
                </Table.Cell>
                <Table.Cell>
                  {formatDate(v.valid_from)} – {formatDate(v.valid_to)}
                </Table.Cell>
                <Table.Cell>
                  {v.created_at ? formatDate(v.created_at) : "—"}
                </Table.Cell>
                <Table.Cell>
                  <Button
                    size="small"
                    variant="secondary"
                    onClick={() => setAnalyzing({ id: v.id, code: v.code })}
                  >
                    Analyze
                  </Button>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}

      <CreateVoucherModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
      />

      <VoucherAnalyticsDrawer
        voucherId={analyzing?.id ?? null}
        voucherCode={analyzing?.code}
        onClose={() => setAnalyzing(null)}
      />
    </Container>
  );
};

export const config = defineRouteConfig({
  label: "Vouchers",
  icon: ReceiptPercent,
});

export default VouchersPage;
