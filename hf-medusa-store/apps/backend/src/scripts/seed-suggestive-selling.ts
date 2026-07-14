import { MedusaContainer } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { SUGGESTIVE_SELLING_MODULE } from "../modules/suggestive-selling";

/**
 * Seed for the SuggestiveSelling module — run with:
 *   npx medusa exec ./src/scripts/seed-suggestive-selling.ts
 *
 * Seeds three things (SRS SUGG-001 / SUGG-004 CR-04), resolving catalog by
 * name/handle so it must run AFTER the catalog seed. Idempotent: clears its own
 * data before inserting.
 *   1. Tier-2 category complement mapping (category → complementary categories).
 *   2. Tier-1 manual product rules (source product(s) → specific suggested products).
 *   3. CR-04 product bulk mapping (single consumable → its designated multipack).
 */

// Tier-2: source category → complementary categories (by name).
const COMPLEMENT_MAP: Record<string, string[]> = {
  Rackets: ["Strings", "Grips", "Bags"],
  Shoes: ["Socks", "Insoles"],
  Shuttlecocks: ["Tubes"],
};

// CR-04: single consumable handle → designated bulk/multipack handle + unit count.
const BULK_MAP: Record<string, { handle: string; multiplier: number }> = {
  "yonex-mavis-350": { handle: "yonex-mavis-350-3tube", multiplier: 3 },
  "yonex-as30": { handle: "yonex-as30-3tube", multiplier: 3 },
  "yonex-as50": { handle: "yonex-as50-3tube", multiplier: 3 },
  "yonex-mavis-2000": { handle: "yonex-mavis-2000-3tube", multiplier: 3 },
  "lining-a62": { handle: "lining-a62-3tube", multiplier: 3 },
};

// Tier-1: source product handle → suggested product handles ("Complete Your Setup").
const TIER1_RULES: Record<string, { handle: string; label?: string }[]> = {
  "yonex-astrox-99-pro": [
    { handle: "yonex-bg65", label: "Best Match" },
    { handle: "yonex-pro-bag-92026" },
    { handle: "yonex-ac102-towel-grip" },
  ],
  "yonex-nanoflare-800": [
    { handle: "yonex-bg80-power", label: "Best Match" },
    { handle: "yonex-super-grap-ac104" },
    { handle: "victor-br9213-bag" },
  ],
  "lining-axforce-80": [
    { handle: "lining-no1-string" },
    { handle: "victor-gr262-grip" },
  ],
  "yonex-pc-65z3": [
    { handle: "yonex-socks-19120" },
    { handle: "yonex-pc-insole" },
  ],
  "victor-a970": [
    { handle: "victor-sk155-socks" },
    { handle: "yonex-pc-insole" },
  ],
  "yonex-astrox-88d-pro": [
    { handle: "yonex-bg65", label: "Best Match" },
    { handle: "yonex-ac105-grip" },
    { handle: "yonex-pro-bag-92026" },
  ],
  "victor-auraspeed-90k": [
    { handle: "victor-vbs-63", label: "Best Match" },
    { handle: "victor-gr262-grip" },
    { handle: "victor-br9111-bag" },
  ],
  "victor-thruster-ryuga-2": [
    { handle: "victor-vbs-63" },
    { handle: "victor-gr262-grip" },
  ],
};

// Accepts a bare { container } so it can run BOTH via `medusa exec` (ExecArgs is
// structurally compatible) AND chained from the catalog migration-script.
export default async function seedSuggestiveSelling({
  container,
}: {
  container: MedusaContainer;
}) {
  const logger = container.resolve("logger");
  const productModule = container.resolve(Modules.PRODUCT);
  const ss: any = container.resolve(SUGGESTIVE_SELLING_MODULE);

  // List all categories then match by name in memory — array-filter on `name`
  // isn't reliably translated to an IN query by the module service.
  const categories = await productModule.listProductCategories(
    {},
    { select: ["id", "name"], take: 1000 },
  );
  const idByName = new Map(categories.map((c: any) => [c.name, c.id]));

  const rows: Array<{
    source_category_id: string;
    complement_category_id: string;
    display_order: number;
    is_active: boolean;
  }> = [];

  for (const [source, complements] of Object.entries(COMPLEMENT_MAP)) {
    const sourceId = idByName.get(source);
    if (!sourceId) {
      logger.warn(
        `[seed:suggestive] category "${source}" not found — skip (waiting on catalog seed)`,
      );
      continue;
    }
    complements.forEach((comp, order) => {
      const compId = idByName.get(comp);
      if (!compId) {
        logger.warn(
          `[seed:suggestive] complement category "${comp}" not found — skip`,
        );
        return;
      }
      rows.push({
        source_category_id: sourceId,
        complement_category_id: compId,
        display_order: order,
        is_active: true,
      });
    });
  }

  // Tier-2: idempotent wipe + insert.
  if (rows.length) {
    const existing = await ss.listCategoryComplementMappings(
      {},
      { select: ["id"] },
    );
    if (existing.length) {
      await ss.deleteCategoryComplementMappings(existing.map((r: any) => r.id));
    }
    await ss.createCategoryComplementMappings(rows);
    logger.info(
      `[seed:suggestive] created ${rows.length} category complement mappings.`,
    );
  } else {
    logger.info(
      "[seed:suggestive] no category mappings (categories not seeded yet).",
    );
  }

  // ── Tier-1: manual product rules (source product → suggested products) ──
  const products = await productModule.listProducts(
    {},
    { select: ["id", "handle"], take: 1000 },
  );
  const idByHandle = new Map(products.map((p: any) => [p.handle, p.id]));

  // Idempotent: remove existing manual product-level rules (cascades to items).
  const existingRules = await ss.listSuggestionRules(
    {},
    { select: ["id", "type", "tier"] },
  );
  const toDelete = existingRules
    .filter((r: any) => r.type === "product" && r.tier === "manual")
    .map((r: any) => r.id);
  if (toDelete.length) {
    await ss.deleteSuggestionRules(toDelete);
  }

  let created = 0;
  for (const [sourceHandle, suggestions] of Object.entries(TIER1_RULES)) {
    const sourceId = idByHandle.get(sourceHandle);
    if (!sourceId) {
      logger.warn(
        `[seed:suggestive] source product "${sourceHandle}" not found — skip rule`,
      );
      continue;
    }
    const items = suggestions
      .map((s, order) => {
        const pid = idByHandle.get(s.handle);
        if (!pid) {
          logger.warn(
            `[seed:suggestive] suggested product "${s.handle}" not found — skip item`,
          );
          return null;
        }
        return {
          suggested_product_id: pid,
          display_order: order,
          custom_label: s.label ?? null,
        };
      })
      .filter(Boolean);

    if (!items.length) continue;

    await ss.createSuggestionRules({
      name: `Complete your setup: ${sourceHandle}`,
      type: "product",
      tier: "manual",
      // One rule → one source product here (N=1); the pivot allows sharing a rule
      // across many source products when curation is identical.
      sources: [{ source_product_id: sourceId }],
      priority: 10,
      is_active: true,
      items,
    });
    created++;
  }
  logger.info(
    `[seed:suggestive] created ${created} Tier-1 manual product rules.`,
  );

  // ── CR-04: product bulk mappings (single consumable → designated multipack) ──
  const bulkRows: Array<{
    single_product_id: string;
    bulk_product_id: string;
    unit_multiplier: number;
    is_active: boolean;
  }> = [];
  for (const [singleHandle, bulk] of Object.entries(BULK_MAP)) {
    const singleId = idByHandle.get(singleHandle);
    const bulkId = idByHandle.get(bulk.handle);
    if (!singleId || !bulkId) {
      logger.warn(
        `[seed:suggestive] bulk mapping "${singleHandle}" → "${bulk.handle}" — product missing, skip`,
      );
      continue;
    }
    bulkRows.push({
      single_product_id: singleId,
      bulk_product_id: bulkId,
      unit_multiplier: bulk.multiplier,
      is_active: true,
    });
  }

  if (bulkRows.length) {
    const existingBulk = await ss.listProductBulkMappings(
      {},
      { select: ["id"] },
    );
    if (existingBulk.length) {
      await ss.deleteProductBulkMappings(existingBulk.map((r: any) => r.id));
    }
    await ss.createProductBulkMappings(bulkRows);
    logger.info(
      `[seed:suggestive] created ${bulkRows.length} product bulk mappings.`,
    );
  } else {
    logger.info(
      "[seed:suggestive] no product bulk mappings (products not seeded yet).",
    );
  }
}
