import type { ReactNode } from "react";
import { defineWidgetConfig } from "@medusajs/admin-sdk";
import type {
  AdminPromotion,
  DetailWidgetProps,
} from "@medusajs/framework/types";
import { Button, Container, Heading, Text } from "@medusajs/ui";
import { useVoucherAnalytics, useVoucherByPromotion } from "../lib/api";

/**
 * Voucher analytics panel on the native Promotion Detail page (Admin
 * unified model). Reuses the VoucherEngine Settings widget's
 * `useVoucherByPromotion` lookup (same query key, so react-query dedupes
 * the request) to resolve the linked VoucherConfig, then reuses the
 * existing `GET /admin/vouchers/:id/analytics` via `useVoucherAnalytics`.
 * No new API, no mutation hooks, strictly read-only.
 *
 * Analytics visibility (Admin unified model requirement): shown ONLY when
 * VoucherEngine is persisted as enabled (`voucher.is_active === true`) —
 * hidden when disabled, and shown again immediately after re-enable, since
 * disabling never deletes the underlying VoucherConfig row or its
 * `VoucherUsageLog` history (historical analytics are preserved, not
 * recomputed). While the VoucherConfig lookup is resolving, resolved to
 * "not a voucher", or resolved to "disabled", this widget renders nothing —
 * the VoucherEngine Settings widget already communicates all of those
 * states; duplicating them here in a second side panel would be redundant.
 * The loading/error+retry/empty/success states below are for the analytics
 * call itself, once a voucher IS enabled.
 */

function formatVnd(amount: number): string {
  return `${new Intl.NumberFormat("vi-VN").format(amount)}₫`;
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-y-1">
      <Text size="small" leading="compact" className="text-ui-fg-subtle">
        {label}
      </Text>
      <Text size="large" leading="compact" weight="plus">
        {children}
      </Text>
    </div>
  );
}

const PromotionDetailVoucherAnalyticsWidget = ({
  data,
}: DetailWidgetProps<AdminPromotion>) => {
  const {
    data: voucher,
    isLoading: voucherLoading,
    isError: voucherError,
  } = useVoucherByPromotion(data.id);

  const analytics = useVoucherAnalytics(voucher?.id ?? "");

  // Still resolving the VoucherConfig lookup, lookup failed, this Promotion
  // has no linked VoucherConfig, or VoucherEngine is currently disabled —
  // nothing to show here (see header comment). The VoucherEngine Settings
  // widget already communicates all of these states.
  if (voucherLoading || voucherError || !voucher || !voucher.is_active) {
    return null;
  }

  return (
    <Container className="p-0">
      <div className="px-6 py-4">
        <Heading level="h2">Voucher analytics</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Redemption analytics derived from VoucherUsageLog.
        </Text>
      </div>

      {analytics.isLoading ? (
        <div className="border-ui-border-base border-t px-6 py-8">
          <Text size="small" className="text-ui-fg-muted">
            Loading…
          </Text>
        </div>
      ) : analytics.isError ? (
        <div className="border-ui-border-base flex flex-col items-start gap-y-3 border-t px-6 py-8">
          <Text size="small" className="text-ui-fg-error">
            Failed to load analytics.
          </Text>
          <Button
            size="small"
            variant="secondary"
            onClick={() => analytics.refetch()}
          >
            Retry
          </Button>
        </div>
      ) : !analytics.data ? null : analytics.data.total_uses === 0 ? (
        <div className="border-ui-border-base border-t px-6 py-8">
          <Text size="small" className="text-ui-fg-muted">
            No redemptions yet.
          </Text>
        </div>
      ) : (
        <div className="border-ui-border-base grid grid-cols-2 gap-x-4 gap-y-4 border-t px-6 py-4">
          <Stat label="Total uses">{analytics.data.total_uses}</Stat>
          <Stat label="Total discount given">
            {formatVnd(analytics.data.total_discount_given)}
          </Stat>
          <Stat label="Avg. order value">
            {formatVnd(analytics.data.avg_order_value)}
          </Stat>
          <Stat label="Capped count">{analytics.data.capped_count}</Stat>
          <Stat label="Conversion rate">{analytics.data.conversion_rate}%</Stat>
        </div>
      )}
    </Container>
  );
};

export const config = defineWidgetConfig({
  zone: "promotion.details.side.after",
});

export default PromotionDetailVoucherAnalyticsWidget;
