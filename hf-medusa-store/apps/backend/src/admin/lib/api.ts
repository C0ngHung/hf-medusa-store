import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sdk } from "./sdk";
import type {
  CategoryComplementMapping,
  CategoryTopSeller,
  ProductBulkMapping,
  RuleType,
  SuggestionEvent,
  SuggestionRule,
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
