import { QueryContext } from "@medusajs/framework/utils";
import {
  CART_LIMIT,
  CR02_DEFAULT_BADGE,
  CR04_DEFAULT_MAX_QUANTITY,
  FREE_SHIPPING_THRESHOLD,
  SUGGESTION_CACHE_TTL,
} from "../constants";
import type {
  CartEvaluationRequest,
  CartRawResult,
  CartRuleCode,
  EnrichedProduct,
  PricingContext,
  ThresholdInfo,
} from "../types";
import type { EngineLogger, QueryGraph, SuggestionCache } from "./engine";
import { enrichProductRow, readBrand } from "./pipeline";
import {
  cr02Band,
  cr02Fires,
  CR_CODE_BY_CONDITION,
  CR_RANK,
  matchesCartRule,
  mergeDedupeCart,
  type CartRuleCondition,
  type CartRuleContext,
  type CollectedCartCandidate,
} from "./cart-rules";

/**
 * Structural view of the SuggestiveSellingService methods the cart engine calls.
 * Typed structurally (not the concrete class) so the engine unit-tests with fakes
 * and stays decoupled from the module wiring.
 */
export interface CartRuleService {
  listActiveCartRules(at?: Date): Promise<any[]>;
  listComplements(sourceCategoryId: string): Promise<any[]>;
  listProductBulkMappings(filters?: any, config?: any): Promise<any[]>;
  /** Tier-2 ranking snapshot (plan B) — rows `{ product_id, sales_count }` sales-desc. */
  listTopSellersByCategories(categoryIds: string[]): Promise<any[]>;
}

export interface CartEngineDeps {
  query: QueryGraph;
  logger: EngineLogger;
  suggestive: CartRuleService;
  /** Optional cache adapter for the raw cart result (2.6.4); absent → compute fresh (D11). */
  cache?: SuggestionCache | null;
  /**
   * Versioned cache key (`suggest:cart:v{version}:{cartId}`), or null to bypass.
   * Built by the step from the current cart-rule version so a version bump
   * invalidates every cart at once (SPEC A.9).
   */
  cacheKey?: string | null;
}

/** Standard product graph fields used by every cart-candidate fetch. */
const PRODUCT_FIELDS = [
  "id",
  "title",
  "handle",
  "thumbnail",
  "status",
  "metadata",
  "categories.id",
  "categories.name",
  "variants.id",
  "variants.calculated_price.calculated_amount",
  "variants.calculated_price.original_amount",
];

/** Upper bound on the CR-02 price-band scan pool (Phase-1; cache lands Day-4). */
const PRICE_BAND_POOL = 60;

/**
 * CartEvaluationEngine — SPEC A.4 evaluateCart / A.6 (SUGG-004, tasks 2.4.1–2.4.10).
 *
 * Owns the I/O for cart-level "You Might Also Need": load the cart, run the active
 * cart rules CR-01→CR-04 in priority order, generate + enrich candidates, and
 * project the ≤3 unique survivors. All firing/assembly decisions delegate to the
 * pure cart-rules module, so the business rules stay unit-testable. Dependencies
 * are injected (DI) so it mocks cleanly.
 *
 * Degrade contract (BR-10 / API Contract §4.3): any failure returns an empty
 * result — the section is hidden, never a 5xx to the customer.
 *
 * Caching (BR-06 / 2.6.x, key `suggest:cart:v{version}:{id}`) is deferred to Day-4,
 * matching the product engine; `computeCartRaw` is written as the cache-fill body.
 */
export class CartEvaluationEngine {
  constructor(private readonly deps: CartEngineDeps) {}

  /**
   * Public entry (SPEC A.4 evaluateCart): raw candidates → drop session
   * dismissals (D6) → cap → gate threshold_info. threshold_info is returned ONLY
   * when at least one suggestion survives, so a hidden section reports null (2.4.9).
   */
  async evaluateCart(
    cartId: string,
    request: CartEvaluationRequest,
  ): Promise<CartRawResult> {
    try {
      const raw = await this.readOrComputeCartRaw(cartId);
      const dismissed = new Set(request.dismissedProductIds ?? []);
      const limit = request.limit ?? CART_LIMIT;

      const candidates = raw.candidates
        .filter((c) => !dismissed.has(c.product_id))
        .slice(0, limit);

      // 2.4.9 / 2.4.10: no suggestions ⇒ suggestions:[], threshold_info:null.
      const threshold_info = candidates.length > 0 ? raw.threshold_info : null;
      return { candidates, threshold_info };
    } catch (err) {
      this.deps.logger.error(
        `[suggestive] evaluateCart failed cart_id=${cartId}: ${errMessage(err)}`,
      );
      return { candidates: [], threshold_info: null };
    }
  }

  /**
   * Cache-aside over the raw cart result (BR-06 / 2.6.4). On a hit `computeCartRaw`
   * is skipped; on a miss the result is stored under `cacheKey` with the 5-minute
   * TTL (2.6.5) and invalidated on `cart.updated` (2.6.6). The RAW (pre-dismissal)
   * result is cached so the per-session dismissal filter still runs at request time
   * (D6/D7). Cache errors degrade to a fresh compute; skipped without a `cacheKey`.
   */
  async readOrComputeCartRaw(cartId: string): Promise<CartRawResult> {
    const { cache, cacheKey } = this.deps;

    if (cache && cacheKey) {
      try {
        const hit = await cache.get<CartRawResult>(cacheKey);
        if (hit) return hit;
      } catch (err) {
        this.deps.logger.warn(
          `[suggestive] cart cache read failed key=${cacheKey}: ${errMessage(err)}`,
        );
      }
    }

    const raw = await this.computeCartRaw(cartId);

    if (cache && cacheKey) {
      try {
        await cache.set(cacheKey, raw, SUGGESTION_CACHE_TTL);
      } catch (err) {
        this.deps.logger.warn(
          `[suggestive] cart cache write failed key=${cacheKey}: ${errMessage(err)}`,
        );
      }
    }

    return raw;
  }

  /**
   * Compute the raw cart suggestions (pre-dismissal-filter) — SPEC A.6.
   * This is the body the Day-4 cache-aside (`readOrComputeCartRaw`) wraps. Fires each active
   * cart rule in CR-01→CR-04 order, collects enriched candidates (deduped via a
   * shared exclude set that also holds the cart's own products), then merges to
   * ≤ CART_LIMIT unique suggestions (2.4.8, first rule keeps the badge — BR-04).
   */
  async computeCartRaw(cartId: string): Promise<CartRawResult> {
    const cart = await this.loadCart(cartId);
    const items: any[] = cart?.items ?? [];
    if (!cart || items.length === 0) {
      return { candidates: [], threshold_info: null };
    }

    const pricing = resolvePricingContext(cart);
    const lines = items.map((item) => ({
      product_id: item?.product_id as string | undefined,
      quantity: numberOr(item?.quantity, 0),
      categoryIds: categoryIdsOf(item),
      categoryNames: categoryNamesOf(item),
    }));

    const cartProductIds = new Set(
      lines.map((l) => l.product_id).filter((id): id is string => !!id),
    );
    const cartCategoryIds = new Set(lines.flatMap((l) => l.categoryIds));
    const brands = [
      ...new Set(
        items
          .map((item) => readBrand(item?.product ?? {}))
          .filter((b): b is string => !!b),
      ),
    ];
    const subtotal = resolveSubtotal(cart, items);

    const context: CartRuleContext = {
      subtotal,
      categoryIds: [...cartCategoryIds],
      brands,
      lines: lines.map(({ quantity, categoryIds, categoryNames }) => ({
        quantity,
        categoryIds,
        categoryNames,
      })),
    };

    // Never re-suggest a product already in the cart (BR-02(a)); the set grows as
    // rules append, so a product surfaced by CR-01 can't be re-added by CR-03.
    const exclude = new Set<string>(cartProductIds);
    const collected: CollectedCartCandidate[] = [];
    let threshold_info: ThresholdInfo | null = null;

    // Priority CR-01→CR-04 (2.4.7 / BR-03): rules sorted by priority asc, then by
    // CR-code as a deterministic tiebreak when priorities collide.
    const rules = [...(await this.safeListCartRules())].sort(
      (a, b) =>
        (a.priority ?? 0) - (b.priority ?? 0) ||
        ruleCrOrder(a) - ruleCrOrder(b),
    );

    for (const rule of rules) {
      const conditions = (rule.conditions ?? []) as CartRuleCondition[];
      if (!matchesCartRule(conditions, context)) continue;

      for (const condition of conditions) {
        const params = condition.condition_params ?? {};
        switch (condition.condition_type) {
          case "category_missing": {
            const products = await this.cr01Candidates(
              params,
              cartCategoryIds,
              exclude,
              pricing,
            );
            this.collect(collected, exclude, products, "CR-01", null);
            break;
          }
          case "threshold_near": {
            const pct = params.percentage;
            if (
              typeof pct !== "number" ||
              !cr02Fires(subtotal, FREE_SHIPPING_THRESHOLD, pct)
            ) {
              break;
            }
            const remaining = FREE_SHIPPING_THRESHOLD - subtotal;
            threshold_info ??= {
              target: FREE_SHIPPING_THRESHOLD,
              current: subtotal,
              remaining,
            };
            const badge =
              typeof params.badge_text === "string" && params.badge_text
                ? params.badge_text
                : CR02_DEFAULT_BADGE;
            const products = await this.cr02Candidates(
              remaining,
              exclude,
              pricing,
            );
            this.collect(collected, exclude, products, "CR-02", badge);
            break;
          }
          case "brand_match": {
            if (brands.length !== 1) break;
            const products = await this.cr03Candidates(
              params,
              brands[0],
              exclude,
              pricing,
            );
            this.collect(collected, exclude, products, "CR-03", null);
            break;
          }
          case "consumable_upsell": {
            const products = await this.cr04Candidates(
              params,
              lines,
              exclude,
              pricing,
            );
            this.collect(collected, exclude, products, "CR-04", null);
            break;
          }
        }
      }
    }

    return {
      candidates: mergeDedupeCart(collected, CART_LIMIT),
      threshold_info,
    };
  }

  // ── Candidate generation per rule (SPEC A.6) ──

  /**
   * CR-01 (2.4.2): for each watched source category present in the cart, look up
   * its complement categories and suggest top-sellers from the ones the cart is
   * MISSING. Uses the category_complement_mapping table (Tier-2/CR-01 source).
   */
  private async cr01Candidates(
    params: Record<string, any>,
    cartCategoryIds: Set<string>,
    exclude: Set<string>,
    pricing: PricingContext | null,
  ): Promise<EnrichedProduct[]> {
    const sources: unknown = params.source_category_ids;
    if (!Array.isArray(sources)) return [];

    const missing = new Set<string>();
    for (const sourceCat of sources) {
      if (typeof sourceCat !== "string" || !cartCategoryIds.has(sourceCat)) {
        continue;
      }
      const maps = await this.deps.suggestive.listComplements(sourceCat);
      for (const m of maps ?? []) {
        const complement = m?.complement_category_id;
        if (
          typeof complement === "string" &&
          !cartCategoryIds.has(complement)
        ) {
          missing.add(complement);
        }
      }
    }
    if (missing.size === 0) return [];
    return this.fetchByCategories([...missing], CART_LIMIT, exclude, pricing);
  }

  /**
   * CR-02 (2.4.3): products priced within the nudge band [remaining, remaining×2]
   * (D4) so adding one crosses the free-shipping threshold, ranked by recent sales.
   */
  private async cr02Candidates(
    remaining: number,
    exclude: Set<string>,
    pricing: PricingContext | null,
  ): Promise<EnrichedProduct[]> {
    const band = cr02Band(remaining);
    const pool = await this.fetchProducts({ pricing, take: PRICE_BAND_POOL });
    const inBand = pool.filter((p) => {
      const effective = p.discount_price ?? p.price;
      return (
        effective !== null &&
        effective >= band.min &&
        effective <= band.max &&
        !exclude.has(p.product_id)
      );
    });
    // No category scope for CR-02 → rank by the band items' own categories.
    return this.rankByCategorySales(inBand);
  }

  /**
   * CR-03 (2.4.5): same-brand accessories. Sourced from the rule's configured
   * accessory categories then filtered to the cart's single brand. Without
   * accessory_category_ids there is no Phase-1 way to scope by brand alone → none.
   */
  private async cr03Candidates(
    params: Record<string, any>,
    brand: string,
    exclude: Set<string>,
    pricing: PricingContext | null,
  ): Promise<EnrichedProduct[]> {
    const catIds: unknown = params.accessory_category_ids;
    if (!Array.isArray(catIds) || catIds.length === 0) return [];
    const ids = catIds.filter((id): id is string => typeof id === "string");
    const pool = await this.fetchByCategories(
      ids,
      CART_LIMIT,
      exclude,
      pricing,
    );
    return pool.filter((p) => p.brand === brand);
  }

  /**
   * CR-04 (2.4.6): for each consumable line at qty ≤ max_quantity, suggest its
   * mapped bulk/multipack via product_bulk_mapping. Explicit single→bulk pairs,
   * not category matching, keep the suggestion on the same item.
   */
  private async cr04Candidates(
    params: Record<string, any>,
    lines: Array<{
      product_id?: string;
      quantity: number;
      categoryIds: string[];
    }>,
    exclude: Set<string>,
    pricing: PricingContext | null,
  ): Promise<EnrichedProduct[]> {
    const maxQty = numberOr(params.max_quantity, CR04_DEFAULT_MAX_QUANTITY);
    const scope: unknown = params.consumable_category_ids;
    const scopedIds =
      Array.isArray(scope) && scope.length > 0
        ? new Set(scope.filter((id): id is string => typeof id === "string"))
        : null;

    const bulkIds: string[] = [];
    for (const line of lines) {
      if (!line.product_id || line.quantity > maxQty) continue;
      if (scopedIds && !line.categoryIds.some((id) => scopedIds.has(id))) {
        continue;
      }
      // Model has no priority column (Linh's schema) → take mappings in list order.
      const maps = await this.deps.suggestive.listProductBulkMappings({
        single_product_id: line.product_id,
        is_active: true,
      });
      for (const m of maps ?? []) {
        if (typeof m?.bulk_product_id === "string")
          bulkIds.push(m.bulk_product_id);
      }
    }
    if (bulkIds.length === 0) return [];
    return this.fetchByIds(bulkIds, exclude, pricing);
  }

  // ── Product fetch + ranking helpers ──

  /**
   * Fetch published products in the given categories (2.4.2), over-fetching so
   * post-filtering still yields enough, newest-first, then sales-ranked (plan B).
   */
  private async fetchByCategories(
    categoryIds: string[],
    take: number,
    exclude: Set<string>,
    pricing: PricingContext | null,
  ): Promise<EnrichedProduct[]> {
    if (categoryIds.length === 0) return [];
    const products = await this.fetchProducts({
      categoryIds,
      take: Math.max(take * 3, 12),
      pricing,
    });
    const eligible = products.filter((p) => !exclude.has(p.product_id));
    return this.rankByCategorySales(eligible, categoryIds);
  }

  /** Fetch specific products by id (CR-04 bulk targets), preserving `ids` order. */
  private async fetchByIds(
    ids: string[],
    exclude: Set<string>,
    pricing: PricingContext | null,
  ): Promise<EnrichedProduct[]> {
    if (ids.length === 0) return [];
    const products = await this.fetchProducts({
      ids,
      pricing,
      take: ids.length,
    });
    const byId = new Map(products.map((p) => [p.product_id, p]));
    const out: EnrichedProduct[] = [];
    for (const id of ids) {
      const p = byId.get(id);
      if (p && !exclude.has(id)) out.push(p);
    }
    return out;
  }

  /** Low-level product query → enriched rows (price/variant/stock/taxonomy). */
  private async fetchProducts(opts: {
    ids?: string[];
    categoryIds?: string[];
    take: number;
    pricing: PricingContext | null;
  }): Promise<EnrichedProduct[]> {
    const filters: Record<string, unknown> = { status: "published" };
    if (opts.ids) filters.id = opts.ids;
    if (opts.categoryIds) filters.categories = { id: opts.categoryIds };

    const context = opts.pricing
      ? {
          variants: {
            calculated_price: QueryContext({
              currency_code: opts.pricing.currencyCode,
              ...(opts.pricing.regionId
                ? { region_id: opts.pricing.regionId }
                : {}),
            }),
          },
        }
      : undefined;

    const { data } = await this.deps.query.graph<any>({
      entity: "product",
      fields: PRODUCT_FIELDS,
      filters,
      pagination: { take: opts.take, order: { created_at: "DESC" } },
      context,
    });

    return (data ?? []).map((row) => enrichProductRow(row));
  }

  /**
   * Sales-rank candidates (SPEC A.6) using the precomputed top-seller snapshot
   * (plan B, `category_top_seller` filled by the compute-category-top-sellers
   * job) — the SAME source the product-level Tier-2 backfill uses, so ranking is
   * consistent and we avoid per-request order aggregation (NFR p95). Falls back
   * to the input order (newest-first, plan C) when the snapshot is empty or the
   * lookup fails. `categoryIds` scopes the lookup; when omitted (CR-02 has no
   * category context) it's derived from the candidates' own categories.
   */
  private async rankByCategorySales(
    products: EnrichedProduct[],
    categoryIds?: string[],
  ): Promise<EnrichedProduct[]> {
    if (products.length < 2) return products;
    const cats =
      categoryIds && categoryIds.length > 0
        ? categoryIds
        : [...new Set(products.flatMap((p) => p.category_ids))];
    if (cats.length === 0) return products;

    try {
      const rows = await this.deps.suggestive.listTopSellersByCategories(cats);
      if (!rows?.length) return products; // plan C: keep newest-first.

      const sold = new Map<string, number>();
      for (const r of rows) {
        const pid = r?.product_id;
        if (typeof pid === "string") {
          sold.set(
            pid,
            Math.max(sold.get(pid) ?? 0, numberOr(r?.sales_count, 0)),
          );
        }
      }

      return products
        .map((product, index) => ({ product, index }))
        .sort(
          (a, b) =>
            (sold.get(b.product.product_id) ?? 0) -
              (sold.get(a.product.product_id) ?? 0) || a.index - b.index,
        )
        .map(({ product }) => product);
    } catch (err) {
      this.deps.logger.warn(
        `[suggestive] rankByCategorySales failed: ${errMessage(err)}`,
      );
      return products;
    }
  }

  // ── Internals ──

  /** Add enriched products to the collection, skipping excluded/oos/unpublished. */
  private collect(
    target: CollectedCartCandidate[],
    exclude: Set<string>,
    products: EnrichedProduct[],
    code: CartRuleCode,
    badge: string | null,
  ): void {
    for (const product of products) {
      if (
        exclude.has(product.product_id) ||
        !product.in_stock ||
        product.status !== "published"
      ) {
        continue;
      }
      exclude.add(product.product_id);
      target.push({ product, code, badge });
    }
  }

  private async loadCart(cartId: string): Promise<any | null> {
    const { data } = await this.deps.query.graph<any>({
      entity: "cart",
      fields: [
        "id",
        "currency_code",
        "region_id",
        "item_total",
        "subtotal",
        "items.product_id",
        "items.quantity",
        "items.unit_price",
        "items.product.categories.id",
        "items.product.categories.name",
        "items.product.metadata",
      ],
      filters: { id: cartId },
    });
    return data?.[0] ?? null;
  }

  private async safeListCartRules(): Promise<any[]> {
    try {
      return (await this.deps.suggestive.listActiveCartRules()) ?? [];
    } catch (err) {
      this.deps.logger.warn(
        `[suggestive] listActiveCartRules failed: ${errMessage(err)}`,
      );
      return [];
    }
  }
}

/** Cart-level pricing context for `calculated_price` (D9) — from the cart itself. */
function resolvePricingContext(cart: any): PricingContext | null {
  if (cart?.currency_code) {
    return {
      currencyCode: cart.currency_code,
      regionId: cart.region_id ?? null,
    };
  }
  return null;
}

/** Category ids of a cart line's product (empty when the graph can't traverse it). */
function categoryIdsOf(item: any): string[] {
  return (item?.product?.categories ?? [])
    .map((c: any) => c?.id)
    .filter((id: unknown): id is string => typeof id === "string");
}

function categoryNamesOf(item: any): string[] {
  return (item?.product?.categories ?? [])
    .map((c: any) => c?.name)
    .filter((name: unknown): name is string => typeof name === "string");
}

/**
 * Post-item-promo subtotal (voucher excluded) — CR-02 base (SPEC A.6/D5).
 * Prefers cart totals; falls back to summing line unit_price×quantity.
 */
function resolveSubtotal(cart: any, items: any[]): number {
  const itemTotal = numOrNull(cart?.item_total);
  if (itemTotal !== null) return itemTotal;
  const subtotal = numOrNull(cart?.subtotal);
  if (subtotal !== null) return subtotal;
  return items.reduce(
    (sum, item) =>
      sum + numberOr(item?.unit_price, 0) * numberOr(item?.quantity, 0),
    0,
  );
}

function ruleCrOrder(rule: any): number {
  let min = 99;
  for (const c of rule?.conditions ?? []) {
    const code =
      CR_CODE_BY_CONDITION[
        c?.condition_type as CartRuleCondition["condition_type"]
      ];
    if (code && CR_RANK[code] < min) min = CR_RANK[code];
  }
  return min;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function numOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
