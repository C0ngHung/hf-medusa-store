import { useQuery } from "@tanstack/react-query";
import { sdk } from "./sdk";

export type AdminCategoryLite = {
  id: string;
  name: string;
};

/** Search product categories by name for the picker. */
export const useCategorySearch = (query: string) =>
  useQuery({
    queryKey: ["admin-category-search", query],
    queryFn: async () => {
      const { product_categories } = await sdk.admin.productCategory.list({
        q: query || undefined,
        limit: 20,
        fields: "id,name",
      });
      return product_categories as unknown as AdminCategoryLite[];
    },
    staleTime: 30_000,
  });

/** Resolve category ids → { id: category } so tables show names not ids. */
export const useCategoryNames = (ids: string[]) => {
  const unique = [...new Set(ids.filter(Boolean))];
  return useQuery({
    queryKey: ["admin-category-names", unique.sort().join(",")],
    enabled: unique.length > 0,
    queryFn: async () => {
      const { product_categories } = await sdk.admin.productCategory.list({
        id: unique,
        limit: unique.length,
        fields: "id,name",
      });
      const map: Record<string, AdminCategoryLite> = {};
      for (const c of product_categories as unknown as AdminCategoryLite[]) {
        map[c.id] = c;
      }
      return map;
    },
    staleTime: 60_000,
  });
};
