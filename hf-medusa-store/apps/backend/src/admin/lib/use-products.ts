import { useQuery } from "@tanstack/react-query";
import { sdk } from "./sdk";

export type AdminProductLite = {
  id: string;
  title: string;
  thumbnail?: string | null;
  handle?: string;
};

/** Search products by title/handle for the picker. Empty query lists recent. */
export const useProductSearch = (query: string) =>
  useQuery({
    queryKey: ["admin-product-search", query],
    queryFn: async () => {
      const { products } = await sdk.admin.product.list({
        q: query || undefined,
        limit: 20,
        fields: "id,title,thumbnail,handle",
      });
      return products as unknown as AdminProductLite[];
    },
    staleTime: 30_000,
  });

/**
 * Resolve a set of product ids → { id: product } so tables show titles
 * instead of raw ids. Batches into a single list call.
 */
export const useProductTitles = (ids: string[]) => {
  const unique = [...new Set(ids.filter(Boolean))];
  return useQuery({
    queryKey: ["admin-product-titles", unique.sort().join(",")],
    enabled: unique.length > 0,
    queryFn: async () => {
      const { products } = await sdk.admin.product.list({
        id: unique,
        limit: unique.length,
        fields: "id,title,thumbnail,handle",
      });
      const map: Record<string, AdminProductLite> = {};
      for (const p of products as unknown as AdminProductLite[]) map[p.id] = p;
      return map;
    },
    staleTime: 60_000,
  });
};
