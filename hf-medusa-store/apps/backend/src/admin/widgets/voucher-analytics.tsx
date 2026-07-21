import { defineWidgetConfig } from "@medusajs/admin-sdk";
import type {
  AdminPromotion,
  DetailWidgetProps,
} from "@medusajs/framework/types";
import { Container, Heading, Text } from "@medusajs/ui";
import { useVoucherAnalytics, useVoucherByPromotion } from "../lib/api";

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

/**
 * "Voucher analytics" widget on the native Promotion detail page (zone
 * `promotion.details.after`). Renders nothing for promotions that are not
 * VoucherEngine vouchers — same eligibility gate as `voucher-settings.tsx`
 * (SPEC Decision H/I: a voucher is always a customer-entered `standard`,
 * non-automatic promotion). Reuses the existing
 * `GET /admin/vouchers/:id/analytics` endpoint via `useVoucherAnalytics`;
 * this widget only relocates the display from a Drawer (Task 8, now
 * removed) to an inline block on the Promotion page itself.
 */
const VoucherAnalyticsWidget = ({
  data,
}: DetailWidgetProps<AdminPromotion>) => {
  const isEligible = data.type === "standard" && data.is_automatic !== true;

  const { data: voucherList } = useVoucherByPromotion(
    isEligible ? data.id : undefined,
  );
  const voucher = voucherList?.vouchers?.[0] ?? null;

  const analytics = useVoucherAnalytics(voucher?.id ?? "");

  if (!isEligible || !voucher) {
    return null;
  }

  return (
    <Container className="flex flex-col gap-y-4 p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">Voucher analytics</Heading>
      </div>

      <div className="border-ui-border-base border-t px-6 py-4">
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
      </div>
    </Container>
  );
};

export const config = defineWidgetConfig({
  zone: "promotion.details.after",
});

export default VoucherAnalyticsWidget;
