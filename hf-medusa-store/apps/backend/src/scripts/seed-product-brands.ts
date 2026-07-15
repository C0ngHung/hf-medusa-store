import { ExecArgs } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { bumpCartRuleVersion } from "../lib/suggestion-cache";

/**
 * Seed `metadata.brand` on every catalog product — run with:
 *   npx medusa exec ./src/scripts/seed-product-brands.ts
 *
 * WHY: CR-03 (SUGG-004 "same-brand accessories") reads the brand from
 * `product.metadata.brand` (evaluator readBrand). No product carried a brand, so
 * CR-03 was permanently INERT — a single-brand cart never got same-brand
 * suggestions. This activates the rule with real data (no logic change).
 *
 * Brand is inferred from the title prefix (the catalog is all Yonex / Victor /
 * Li-Ning). Idempotent: re-running only rewrites the brand key and preserves any
 * other metadata. Products whose brand can't be inferred are left untouched (a
 * warning is logged) rather than mislabelled.
 *
 * NOTE: mixed-brand carts (e.g. a Yonex racket + a Victor shoe) still won't fire
 * CR-03 — it requires exactly ONE distinct brand in the cart (BR: brand_match).
 * This seed makes single-brand carts work; it does not force a suggestion.
 */

// Ordered longest-first so "Li-Ning" matches before any shorter accidental prefix.
const BRAND_PREFIXES: Array<{ match: string; brand: string }> = [
  { match: "li-ning", brand: "Li-Ning" },
  { match: "lining", brand: "Li-Ning" },
  { match: "yonex", brand: "Yonex" },
  { match: "victor", brand: "Victor" },
];

function inferBrand(title: string): string | null {
  const t = title.trim().toLowerCase();
  for (const { match, brand } of BRAND_PREFIXES) {
    if (t.startsWith(match)) return brand;
  }
  return null;
}

export default async function seedProductBrands({ container }: ExecArgs) {
  const logger = container.resolve("logger");
  const productModule = container.resolve(Modules.PRODUCT);

  const products = await productModule.listProducts(
    {},
    { select: ["id", "title", "metadata"], take: 1000 },
  );

  const updates: Array<{ id: string; metadata: Record<string, unknown> }> = [];
  let skipped = 0;

  for (const p of products) {
    const brand = inferBrand(p.title ?? "");
    if (!brand) {
      skipped++;
      logger.warn(
        `[seed:brands] cannot infer brand for "${p.title}" (${p.id}) — skipped`,
      );
      continue;
    }
    const metadata = { ...(p.metadata ?? {}) };
    if (metadata.brand === brand) continue; // already correct — idempotent no-op.
    metadata.brand = brand;
    updates.push({ id: p.id, metadata });
  }

  for (const u of updates) {
    // Per-id form (bulk array form is read as a selector by the module service).
    await productModule.updateProducts(u.id, { metadata: u.metadata });
  }
  if (updates.length) {
    // CR-03 is cart-level and its output is cached under the cart-rule version;
    // bump it so existing carts recompute against the new brands immediately (D9).
    await bumpCartRuleVersion(container);
  }

  logger.info(
    `[seed:brands] set brand on ${updates.length} product(s), ${skipped} skipped, ${products.length} total.`,
  );
}
