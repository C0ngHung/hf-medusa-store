/** Shared types for the suggestive-selling admin config UI. */

export type RuleType = "product" | "cart";
export type RuleTier = "manual" | "category" | "behavioral";
export type ConditionType =
  | "category_missing"
  | "threshold_near"
  | "brand_match"
  | "consumable_upsell";

export type SuggestionRuleItem = {
  id?: string;
  suggested_product_id: string;
  display_order: number;
  custom_label?: string | null;
};

export type CartSuggestionCondition = {
  id?: string;
  condition_type: ConditionType;
  condition_params?: Record<string, unknown> | null;
};

export type SuggestionRuleSource = {
  id?: string;
  source_product_id: string;
};

export type SuggestionRule = {
  id: string;
  name: string;
  type: RuleType;
  tier: RuleTier;
  priority: number;
  is_active: boolean;
  valid_from?: string | null;
  valid_to?: string | null;
  items?: SuggestionRuleItem[];
  conditions?: CartSuggestionCondition[];
  sources?: SuggestionRuleSource[];
  created_at?: string;
  updated_at?: string;
};

export type ProductBulkMapping = {
  id: string;
  single_product_id: string;
  bulk_product_id: string;
  unit_multiplier?: number | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type CategoryComplementMapping = {
  id: string;
  source_category_id: string;
  complement_category_id: string;
  display_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type CategoryTopSeller = {
  id: string;
  category_id: string;
  product_id: string;
  sales_count: number;
  window_days: number;
  computed_at?: string | null;
};

export type SuggestionEvent = {
  id: string;
  rule_id?: string | null;
  source_context: "product_view" | "cart";
  source_product_id?: string | null;
  suggested_product_id: string;
  customer_id?: string | null;
  session_id?: string | null;
  action: "impression" | "tap" | "add_to_cart" | "dismiss";
  tier?: string | null;
  slot?: number | null;
  created_at?: string;
};

export const EVENT_ACTIONS = [
  "impression",
  "tap",
  "add_to_cart",
  "dismiss",
] as const;

export const EVENT_CONTEXTS = ["product_view", "cart"] as const;

export const CONDITION_TYPES: ConditionType[] = [
  "category_missing",
  "threshold_near",
  "brand_match",
  "consumable_upsell",
];

export const RULE_TIERS: RuleTier[] = ["manual", "category", "behavioral"];

/** VoucherEngine — admin create + analytics (SRS §6.4). */
export type VoucherDiscountType = "percentage" | "fixed_amount";

export const VOUCHER_DISCOUNT_TYPES: VoucherDiscountType[] = [
  "percentage",
  "fixed_amount",
];

export type VoucherConfig = {
  id: string;
  code: string;
  discount_type: VoucherDiscountType;
  discount_value: number;
  min_order_value?: number | null;
  max_discount_amount?: number | null;
  applicable_product_ids?: string[] | null;
  applicable_category_ids?: string[] | null;
  stackable_with_promotions: boolean;
  per_user_limit: number;
  usage_limit?: number | null;
  valid_from: string;
  valid_to: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type VoucherAnalytics = {
  total_uses: number;
  total_discount_given: number;
  avg_order_value: number;
  capped_count: number;
  conversion_rate: number;
};
