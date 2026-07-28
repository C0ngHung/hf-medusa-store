import { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, ProductStatus } from "@medusajs/framework/utils";

/**
 * GET /store/product-options
 *
 * Serves product options and their values for storefront filtering (OptionsPicker).
 * Groups options by `title` and option values by `value` text across all published, active products.
 * Collects all matching option_value IDs for each value text (comma-joined) so filtering by a value
 * (e.g. Size "42") matches all products carrying that option value.
 * Excludes internal "Default" options/values, soft-deleted products, draft products,
 * soft-deleted options, and soft-deleted values.
 */
export const GET = async (req: MedusaStoreRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const { data: products } = await query.graph<any>({
    entity: "product",
    fields: [
      "id",
      "status",
      "deleted_at",
      "options.id",
      "options.title",
      "options.deleted_at",
      "options.values.id",
      "options.values.value",
      "options.values.deleted_at",
    ],
    filters: {
      status: ProductStatus.PUBLISHED,
    },
  });

  if (!products || products.length === 0) {
    return res.status(200).json({ product_options: [] });
  }

  // Map option title key -> { id: string, title: string, valuesMap: Map<valKey, { idsSet: Set<string>, value: string }> }
  const optionMap = new Map<
    string,
    {
      id: string;
      title: string;
      valuesMap: Map<string, { idsSet: Set<string>; value: string }>;
    }
  >();

  for (const product of products) {
    if (product.deleted_at || product.status !== ProductStatus.PUBLISHED) {
      continue;
    }

    if (!Array.isArray(product.options)) {
      continue;
    }

    for (const option of product.options) {
      if (!option || option.deleted_at || !option.title) {
        continue;
      }

      const rawTitle = option.title.trim();
      if (!rawTitle || rawTitle.toLowerCase() === "default") {
        continue;
      }

      const key = rawTitle.toLowerCase();
      if (!optionMap.has(key)) {
        optionMap.set(key, {
          id: option.id || `opt_${key}`,
          title: rawTitle,
          valuesMap: new Map(),
        });
      }

      const grouped = optionMap.get(key)!;
      if (Array.isArray(option.values)) {
        for (const val of option.values) {
          if (!val || val.deleted_at || !val.value || !val.id) {
            continue;
          }
          const valText = val.value.trim();
          if (!valText || valText.toLowerCase() === "default") {
            continue;
          }
          const valKey = valText.toLowerCase();
          if (!grouped.valuesMap.has(valKey)) {
            grouped.valuesMap.set(valKey, {
              idsSet: new Set(),
              value: valText,
            });
          }
          grouped.valuesMap.get(valKey)!.idsSet.add(val.id);
        }
      }
    }
  }

  const resultOptions = Array.from(optionMap.values())
    .map((grouped) => ({
      id: grouped.id,
      title: grouped.title,
      values: Array.from(grouped.valuesMap.values()).map((v) => ({
        id: Array.from(v.idsSet).join(","),
        value: v.value,
      })),
    }))
    .filter((opt) => opt.values.length > 0);

  return res.status(200).json({ product_options: resultOptions });
};

export default GET;
