import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import type { PersistedVoucherConfig } from "./mappers";

const BPS_PER_PERCENT = 100;

/** The exact `query.graph` field list every promotion-hydration read needs —
 * defined once here so both the admin and store voucher list routes (Task 6
 * L1 dedupe) can't drift from each other. */
export const PROMOTION_HYDRATION_FIELDS = [
  "id",
  "code",
  "status",
  "limit",
  "application_method.type",
  "application_method.value",
  "campaign.starts_at",
  "campaign.ends_at",
] as const;

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

/**
 * Task 6 (L1 dedupe): batch-reads every distinct linked Promotion in one
 * `query.graph` round trip and overlays the shared fields onto each voucher
 * row via `hydrateVoucherFromPromotion`. Rows without a `promotion_id` (never
 * provisioned / attach-mode edge case) pass through unchanged. Shared by both
 * `GET /admin/vouchers` and `GET /store/customers/me/vouchers` — previously
 * duplicated inline in each route.
 */
export async function hydrateVouchersFromPromotions<
  T extends { promotion_id: string | null },
>(scope: MedusaContainer, vouchers: T[]): Promise<T[]> {
  const promotionIds = Array.from(
    new Set(
      vouchers.map((v) => v.promotion_id).filter((id): id is string => !!id),
    ),
  );
  if (promotionIds.length === 0) return vouchers;

  const query = scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data: promotions } = await query.graph({
    entity: "promotion",
    filters: { id: promotionIds },
    fields: [...PROMOTION_HYDRATION_FIELDS],
  });

  const promotionById = new Map<string, LinkedPromotionView>();
  for (const promo of (promotions ?? []) as (LinkedPromotionView & {
    id: string;
  })[]) {
    promotionById.set(promo.id, promo);
  }

  return vouchers.map((v) => {
    if (!v.promotion_id) return v;
    const promo = promotionById.get(v.promotion_id) ?? null;
    return hydrateVoucherFromPromotion(
      v as unknown as PersistedVoucherConfig,
      promo,
    ) as unknown as T;
  });
}
