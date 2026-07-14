import { MedusaContainer } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { SUGGESTIVE_SELLING_MODULE } from "../modules/suggestive-selling";
import {
  CR02_DEFAULT_BADGE,
  CR02_THRESHOLD_PCT,
  CR04_DEFAULT_MAX_QUANTITY,
} from "../modules/suggestive-selling/constants";

/**
 * Seed for the SuggestiveSelling module — run with:
 *   npx medusa exec ./src/scripts/seed-suggestive-selling.ts
 *
 * Seeds four things (SRS SUGG-001 / SUGG-004), resolving catalog by name/handle
 * so it must run AFTER the catalog seed. Idempotent: clears its own data before
 * inserting.
 *   1. Tier-2 category complement mapping (category → complementary categories).
 *   2. Tier-1 manual product rules (source product(s) → specific suggested products).
 *   3. CR-04 product bulk mapping (single consumable → its designated multipack).
 *   4. Cart-level rules CR-01…CR-04 (+ their conditions) that drive the cart
 *      "Bạn có thể cần thêm" section — WITHOUT these no cart suggestions show.
 */

// Tier-2: source category → complementary categories (by name).
const COMPLEMENT_MAP: Record<string, string[]> = {
  Rackets: ["Strings", "Grips", "Bags"],
  Shoes: ["Socks", "Insoles"],
  Shuttlecocks: ["Tubes"],
};

// CR-04: single consumable handle (the "1 ống" tube) → its 3-tube combo + unit count.
const BULK_MAP: Record<string, { handle: string; multiplier: number }> = {
  "yonex-mavis-350-1tube": { handle: "yonex-mavis-350-3tube", multiplier: 3 },
  "yonex-as30-1tube": { handle: "yonex-as30-3tube", multiplier: 3 },
  "yonex-as50-1tube": { handle: "yonex-as50-3tube", multiplier: 3 },
  "yonex-mavis-2000-1tube": { handle: "yonex-mavis-2000-3tube", multiplier: 3 },
  "lining-a62-1tube": { handle: "lining-a62-3tube", multiplier: 3 },
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

  // ── Cart-level rules CR-01…CR-04 (SUGG-004, tasks 2.4.2–2.4.6) ──
  // Each CR is its OWN cart rule with a SINGLE condition: matchesCartRule ANDs a
  // rule's conditions together (2.4.7 / BR-03), so bundling all four in one rule
  // would only fire when every condition holds at once. `priority` asc drives the
  // CR-01→CR-04 evaluation order. condition_params shapes match the pure matcher
  // + engine (evaluator/cart-rules.ts, evaluator/cart-engine.ts). Category ids are
  // resolved by name (idByName, above) so the seed stays catalog-agnostic.
  const catId = (name: string) => idByName.get(name) as string | undefined;
  const cr01SourceIds = ["Rackets", "Shoes", "Shuttlecocks"]
    .map(catId)
    .filter((id): id is string => !!id);
  const accessoryCatIds = [
    "Strings",
    "Grips",
    "Bags",
    "Socks",
    "Insoles",
    "Tubes",
  ]
    .map(catId)
    .filter((id): id is string => !!id);

  const cartRules: Array<{
    name: string;
    priority: number;
    condition_type:
      | "category_missing"
      | "threshold_near"
      | "brand_match"
      | "consumable_upsell";
    condition_params: Record<string, unknown>;
  }> = [];

  // CR-01 (2.4.2): cart holds a racket/shoe/shuttle → suggest top-sellers from the
  // complementary categories the cart is MISSING (uses the Tier-2 complement
  // mappings seeded above). This is the rule that populates a typical cart.
  if (cr01SourceIds.length) {
    cartRules.push({
      name: "Cart CR-01: complete the setup",
      priority: 10,
      condition_type: "category_missing",
      condition_params: { source_category_ids: cr01SourceIds },
    });
  }
  // CR-02 (2.4.3): subtotal within 15% below the 7.000.000₫ free-shipping ceiling
  // → nudge a product that pushes the cart over it (fires only inside the band).
  cartRules.push({
    name: "Cart CR-02: free-shipping nudge",
    priority: 20,
    condition_type: "threshold_near",
    condition_params: {
      percentage: CR02_THRESHOLD_PCT,
      badge_text: CR02_DEFAULT_BADGE,
    },
  });
  // CR-03 (2.4.5): single-brand cart → same-brand accessories. INERT for now — no
  // product carries metadata.brand yet, so brand_match never resolves a brand;
  // seeded so the rule set is complete and it activates once brands are populated.
  if (accessoryCatIds.length) {
    cartRules.push({
      name: "Cart CR-03: same-brand accessories",
      priority: 30,
      condition_type: "brand_match",
      condition_params: { accessory_category_ids: accessoryCatIds },
    });
  }
  // CR-04 (2.4.6): a consumable line at qty ≤ default → its multipack (uses the
  // product bulk mappings seeded above).
  cartRules.push({
    name: "Cart CR-04: buy the multipack",
    priority: 40,
    condition_type: "consumable_upsell",
    condition_params: { max_quantity: CR04_DEFAULT_MAX_QUANTITY },
  });

  // Idempotent: drop existing cart-type rules (cascade removes their conditions),
  // then recreate. `existingRules` was fetched above with type selected.
  const existingCartRuleIds = existingRules
    .filter((r: any) => r.type === "cart")
    .map((r: any) => r.id);
  if (existingCartRuleIds.length) {
    await ss.deleteSuggestionRules(existingCartRuleIds);
  }
  for (const r of cartRules) {
    await ss.createSuggestionRules({
      name: r.name,
      type: "cart",
      tier: "manual",
      priority: r.priority,
      is_active: true,
      conditions: [
        {
          condition_type: r.condition_type,
          condition_params: r.condition_params,
        },
      ],
    });
  }
  logger.info(
    `[seed:suggestive] created ${cartRules.length} cart rules (CR-01…CR-04).`,
  );
}
