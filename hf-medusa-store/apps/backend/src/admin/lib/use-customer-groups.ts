import { useQuery } from "@tanstack/react-query";
import { sdk } from "./sdk";

export type AdminCustomerGroupLite = {
  id: string;
  name: string;
};

/** Search customer groups by name for the picker. */
export const useCustomerGroupSearch = (query: string) =>
  useQuery({
    queryKey: ["admin-customer-group-search", query],
    queryFn: async () => {
      const { customer_groups } = await sdk.admin.customerGroup.list({
        q: query || undefined,
        limit: 20,
        fields: "id,name",
      });
      return customer_groups as unknown as AdminCustomerGroupLite[];
    },
    staleTime: 30_000,
  });

/** Resolve group ids → { id: group } so read-only views show names not ids. */
export const useCustomerGroupNames = (ids: string[]) => {
  const unique = [...new Set(ids.filter(Boolean))];
  return useQuery({
    queryKey: ["admin-customer-group-names", unique.sort().join(",")],
    enabled: unique.length > 0,
    queryFn: async () => {
      const { customer_groups } = await sdk.admin.customerGroup.list({
        id: unique,
        limit: unique.length,
        fields: "id,name",
      });
      const map: Record<string, AdminCustomerGroupLite> = {};
      for (const g of customer_groups as unknown as AdminCustomerGroupLite[]) {
        map[g.id] = g;
      }
      return map;
    },
    staleTime: 60_000,
  });
};
