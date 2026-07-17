import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sdk } from "./sdk";
import type {
  CategoryComplementMapping,
  CategoryTopSeller,
  DiscountCapConfig,
  ProductBulkMapping,
  RuleType,
  SuggestionEvent,
  SuggestionRule,
  VoucherAnalytics,
  VoucherConfig,
  VoucherDiscountType,
} from "./types";

/* ------------------------------------------------------------------ */
/* Suggestion rules — reuse the existing /admin/suggestion-rules API   */
/* ------------------------------------------------------------------ */

const RULES_KEY = ["suggestion-rules"];

export const useSuggestionRules = (type?: RuleType) =>
  useQuery({
    queryKey: [...RULES_KEY, { type: type ?? "all" }],
    queryFn: () =>
      sdk.client.fetch<{ suggestion_rules: SuggestionRule[]; count: number }>(
        "/admin/suggestion-rules",
        { query: { limit: 200, ...(type ? { type } : {}) } },
      ),
  });

export const useSuggestionRule = (id?: string) =>
  useQuery({
    queryKey: [...RULES_KEY, id],
    enabled: !!id,
    queryFn: () =>
      sdk.client.fetch<{ suggestion_rule: SuggestionRule }>(
        `/admin/suggestion-rules/${id}`,
      ),
  });

export type RulePayload = Partial<SuggestionRule> & {
  source_product_ids?: string[];
};

export const useCreateRule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RulePayload) =>
      sdk.client.fetch("/admin/suggestion-rules", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: RULES_KEY }),
  });
};

export const useUpdateRule = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RulePayload) =>
      sdk.client.fetch(`/admin/suggestion-rules/${id}`, {
        method: "PUT",
        body,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: RULES_KEY }),
  });
};

export const useDeleteRule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      sdk.client.fetch(`/admin/suggestion-rules/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: RULES_KEY }),
  });
};

/* ------------------------------------------------------------------ */
/* Product bulk mappings — the new /admin/product-bulk-mappings API     */
/* ------------------------------------------------------------------ */

const BULK_KEY = ["product-bulk-mappings"];

export const useBulkMappings = () =>
  useQuery({
    queryKey: BULK_KEY,
    queryFn: () =>
      sdk.client.fetch<{
        product_bulk_mappings: ProductBulkMapping[];
        count: number;
      }>("/admin/product-bulk-mappings", { query: { limit: 200 } }),
  });

export type BulkMappingPayload = {
  single_product_id: string;
  bulk_product_id: string;
  unit_multiplier?: number | null;
  is_active?: boolean;
};

export const useCreateBulkMapping = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: BulkMappingPayload) =>
      sdk.client.fetch("/admin/product-bulk-mappings", {
        method: "POST",
        body,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: BULK_KEY }),
  });
};

export const useUpdateBulkMapping = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: BulkMappingPayload & { id: string }) =>
      sdk.client.fetch(`/admin/product-bulk-mappings/${id}`, {
        method: "PUT",
        body,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: BULK_KEY }),
  });
};

export const useDeleteBulkMapping = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      sdk.client.fetch(`/admin/product-bulk-mappings/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: BULK_KEY }),
  });
};

/* ------------------------------------------------------------------ */
/* Category complement mappings — Tier-2 backfill config (full CRUD)   */
/* ------------------------------------------------------------------ */

const COMPLEMENT_KEY = ["category-complement-mappings"];

export const useComplementMappings = () =>
  useQuery({
    queryKey: COMPLEMENT_KEY,
    queryFn: () =>
      sdk.client.fetch<{
        category_complement_mappings: CategoryComplementMapping[];
        count: number;
      }>("/admin/category-complement-mappings", { query: { limit: 200 } }),
  });

export type ComplementPayload = {
  source_category_id: string;
  complement_category_id: string;
  display_order?: number;
  is_active?: boolean;
};

export const useCreateComplement = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ComplementPayload) =>
      sdk.client.fetch("/admin/category-complement-mappings", {
        method: "POST",
        body,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: COMPLEMENT_KEY }),
  });
};

export const useUpdateComplement = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: ComplementPayload & { id: string }) =>
      sdk.client.fetch(`/admin/category-complement-mappings/${id}`, {
        method: "PUT",
        body,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: COMPLEMENT_KEY }),
  });
};

export const useDeleteComplement = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      sdk.client.fetch(`/admin/category-complement-mappings/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: COMPLEMENT_KEY }),
  });
};

/* ------------------------------------------------------------------ */
/* Read-only analytics views                                           */
/* ------------------------------------------------------------------ */

export const useCategoryTopSellers = () =>
  useQuery({
    queryKey: ["category-top-sellers"],
    queryFn: () =>
      sdk.client.fetch<{
        category_top_sellers: CategoryTopSeller[];
        count: number;
      }>("/admin/category-top-sellers", { query: { limit: 500 } }),
  });

export type EventFilters = {
  source_context?: string;
  action?: string;
};

export const useSuggestionEvents = (filters: EventFilters = {}) =>
  useQuery({
    queryKey: ["suggestion-events", filters],
    queryFn: () =>
      sdk.client.fetch<{
        suggestion_events: SuggestionEvent[];
        count: number;
      }>("/admin/suggestion-events", {
        query: {
          limit: 100,
          ...(filters.source_context
            ? { source_context: filters.source_context }
            : {}),
          ...(filters.action ? { action: filters.action } : {}),
        },
      }),
  });

/* ------------------------------------------------------------------ */
/* VoucherEngine — admin list + create + analytics (SRS §6.4)          */
/* Reads/writes ONLY the VoucherConfig table via /admin/vouchers* —    */
/* never the native Promotion list (SPEC Decision C/G).                */
/* ------------------------------------------------------------------ */

const VOUCHERS_KEY = ["vouchers"];

export const useVouchers = () =>
  useQuery({
    queryKey: VOUCHERS_KEY,
    queryFn: () =>
      sdk.client.fetch<{ vouchers: VoucherConfig[]; count: number }>(
        "/admin/vouchers",
        { query: { limit: 200 } },
      ),
  });

export type CreateVoucherPayload = {
  code?: string;
  discount_type: VoucherDiscountType;
  discount_value: number;
  min_order_value?: number | null;
  max_discount_amount?: number | null;
  applicable_product_ids?: string[] | null;
  applicable_category_ids?: string[] | null;
  stackable_with_promotions?: boolean;
  per_user_limit?: number;
  usage_limit?: number | null;
  valid_from: string;
  valid_to: string;
  is_active?: boolean;
};

export const useCreateVoucher = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateVoucherPayload) =>
      sdk.client.fetch<{ voucher: VoucherConfig }>("/admin/vouchers", {
        method: "POST",
        body,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: VOUCHERS_KEY }),
  });
};

export const useVoucherAnalytics = (id: string) =>
  useQuery({
    queryKey: ["voucher-analytics", id],
    enabled: !!id,
    retry: false,
    queryFn: () =>
      sdk.client.fetch<{ analytics: VoucherAnalytics }>(
        `/admin/vouchers/${id}/analytics`,
      ),
  });

/* ------------------------------------------------------------------ */
/* DiscountCapConfig — global cap, single active record (SRS §5.2;    */
/* Rebuild Phase 3A). GET/POST only — no :id, it's a singleton.        */
/* ------------------------------------------------------------------ */

const DISCOUNT_CAP_CONFIG_KEY = ["discount-cap-config"];

export const useDiscountCapConfig = () =>
  useQuery({
    queryKey: DISCOUNT_CAP_CONFIG_KEY,
    queryFn: () =>
      sdk.client.fetch<{ discount_cap_config: DiscountCapConfig }>(
        "/admin/discount-cap-config",
      ),
  });

export const useUpsertDiscountCapConfig = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { max_discount_percentage: number }) =>
      sdk.client.fetch<{ discount_cap_config: DiscountCapConfig }>(
        "/admin/discount-cap-config",
        { method: "POST", body },
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: DISCOUNT_CAP_CONFIG_KEY }),
  });
};
