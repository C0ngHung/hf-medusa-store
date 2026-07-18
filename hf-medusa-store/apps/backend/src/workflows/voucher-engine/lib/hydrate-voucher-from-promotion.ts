import type { PersistedVoucherConfig } from "./mappers";

const BPS_PER_PERCENT = 100;

/** Promotion/Campaign đã đọc qua Link (chỉ các field cần overlay). */
export interface LinkedPromotionView {
  code: string;
  status: string;
  limit?: number | null;
  application_method?: { type?: string | null; value?: number | null } | null;
  campaign?: {
    starts_at?: Date | string | null;
    ends_at?: Date | string | null;
  } | null;
}

/**
 * Decision I: các field CHUNG (code, discount type/value, status, window, global
 * usage limit) là nguồn-sự-thật ở Promotion/Campaign. Overlay chúng vào bản config
 * để downstream (mapper/validators/calc) dùng nguyên trạng. Field voucher-only
 * (cap, min order, per-user, scope, usage_count) giữ từ config.
 */
export function hydrateVoucherFromPromotion(
  config: PersistedVoucherConfig,
  promotion: LinkedPromotionView | null,
): PersistedVoucherConfig {
  if (!promotion) return config;

  const am = promotion.application_method ?? {};
  const isPercentage = am.type === "percentage";
  const value = am.value ?? 0;

  return {
    ...config,
    code: promotion.code ?? config.code,
    discount_type: isPercentage ? "percentage" : "fixed_amount",
    discount_value: isPercentage ? value * BPS_PER_PERCENT : value,
    is_active: promotion.status === "active",
    valid_from: promotion.campaign?.starts_at
      ? new Date(promotion.campaign.starts_at)
      : config.valid_from,
    valid_to: promotion.campaign?.ends_at
      ? new Date(promotion.campaign.ends_at)
      : config.valid_to,
    usage_limit: promotion.limit ?? config.usage_limit,
  };
}
