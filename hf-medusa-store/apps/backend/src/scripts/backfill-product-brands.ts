import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows";

/**
 * Backfill `metadata.brand` on existing products so CR-03 (same-brand
 * accessories, SUGG-004) can fire. The evaluator reads the brand via
 * `readBrand(product)` → `product.metadata.brand` (evaluator/pipeline.ts); with
 * no brand set, CR-03 is inert (distinct brands = 0 ≠ 1).
 *
 * Brand is inferred from the handle prefix (yonex-/victor-/lining-), falling
 * back to the title's first word. Idempotent — re-running skips products whose
 * metadata.brand is already correct, and merges (never clobbers) other metadata.
 *
 * Run with:  npx medusa exec ./src/scripts/backfill-product-brands.ts
 */

// Ordered longest-prefix-first so "lining-" wins before any shorter match.
const BRAND_BY_HANDLE_PREFIX: Array<[string, string]> = [
  ["yonex-", "Yonex"],
  ["victor-", "Victor"],
  ["lining-", "Li-Ning"],
];

// Fallback: normalise the first token(s) of the title to a canonical brand.
const BRAND_BY_TITLE: Array<[RegExp, string]> = [
  [/^yonex\b/i, "Yonex"],
  [/^victor\b/i, "Victor"],
  [/^li[-\s]?ning\b/i, "Li-Ning"],
];

function inferBrand(
  handle?: string | null,
  title?: string | null,
): string | null {
  const h = (handle ?? "").toLowerCase();
  for (const [prefix, brand] of BRAND_BY_HANDLE_PREFIX) {
    if (h.startsWith(prefix)) return brand;
  }
  const t = (title ?? "").trim();
  for (const [re, brand] of BRAND_BY_TITLE) {
    if (re.test(t)) return brand;
  }
  return null;
}

export default async function backfillProductBrands({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const productModule: any = container.resolve(Modules.PRODUCT);

  const products = await productModule.listProducts(
    {},
    { select: ["id", "title", "handle", "metadata"], take: 10_000 },
  );

  const updates: Array<{ id: string; metadata: Record<string, unknown> }> = [];
  const skipped: string[] = [];

  for (const p of products) {
    const brand = inferBrand(p.handle, p.title);
    if (!brand) {
      skipped.push(p.handle ?? p.id);
      continue;
    }
    // Idempotent: nothing to do if already correct.
    if (p.metadata?.brand === brand) continue;
    updates.push({ id: p.id, metadata: { ...(p.metadata ?? {}), brand } });
  }

  if (updates.length) {
    await updateProductsWorkflow(container).run({
      input: { products: updates },
    });
  }

  logger.info(
    `[backfill:brands] ${products.length} products, ${updates.length} updated, ${skipped.length} without a recognised brand.`,
  );
  if (skipped.length) {
    logger.info(
      `[backfill:brands] no brand inferred for: ${skipped.join(", ")}`,
    );
  }
}
