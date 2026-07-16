import { Drawer, Text } from "@medusajs/ui";
import { useVoucherAnalytics } from "../lib/api";

type Props = {
  voucherId: string | null;
  voucherCode?: string;
  onClose: () => void;
};

const AnalyticsStat = ({ label, value }: { label: string; value: number }) => (
  <div className="flex flex-col gap-y-1">
    <Text size="small" leading="compact" className="text-ui-fg-subtle">
      {label}
    </Text>
    <Text size="large" leading="compact" weight="plus">
      {value}
    </Text>
  </div>
);

/** Analyze side panel — GET /admin/vouchers/:id/analytics (3.4.12). */
export const VoucherAnalyticsDrawer = ({
  voucherId,
  voucherCode,
  onClose,
}: Props) => {
  const analytics = useVoucherAnalytics(voucherId ?? "");

  return (
    <Drawer open={!!voucherId} onOpenChange={(v) => !v && onClose()}>
      <Drawer.Content>
        <Drawer.Header>
          <Drawer.Title>
            Voucher analytics{voucherCode ? ` — ${voucherCode}` : ""}
          </Drawer.Title>
        </Drawer.Header>
        <Drawer.Body className="flex-1 overflow-auto p-6">
          {analytics.isLoading && (
            <Text size="small" className="text-ui-fg-muted">
              Loading…
            </Text>
          )}
          {analytics.isError && (
            <Text size="small" className="text-ui-fg-error">
              {(analytics.error as any)?.message ??
                "Analytics unavailable for this voucher."}
            </Text>
          )}
          {analytics.data && (
            <div className="grid grid-cols-2 gap-4">
              <AnalyticsStat
                label="Total uses"
                value={analytics.data.analytics.total_uses}
              />
              <AnalyticsStat
                label="Total discount given"
                value={analytics.data.analytics.total_discount_given}
              />
              <AnalyticsStat
                label="Avg. order value"
                value={analytics.data.analytics.avg_order_value}
              />
              <AnalyticsStat
                label="Capped count"
                value={analytics.data.analytics.capped_count}
              />
              <AnalyticsStat
                label="Conversion rate"
                value={analytics.data.analytics.conversion_rate}
              />
            </div>
          )}
        </Drawer.Body>
      </Drawer.Content>
    </Drawer>
  );
};

export default VoucherAnalyticsDrawer;
