import { QueryContext } from "@medusajs/framework/utils";
import {
  CONSUMABLE_CATEGORIES,
  RECENT_PURCHASE_WINDOW_DAYS,
  SUGGESTION_CACHE_TTL,
} from "../constants";
import type {
  EnrichedCandidate,
  FilterContext,
  PricingContext,
  ProductEvaluationRequest,
  ProductSuggestion,
  RawCandidate,
  VariantLike,
} from "../types";
import {
  computePriceFields,
  finalizeSuggestions,
  isProductInStock,
  readBrand,
  resolveVariant,
} from "./pipeline";

/**
 * Minimal structural view of Medusa's Query (`ContainerRegistrationKeys.QUERY`).
 * We depend only on `graph`, so we type it structurally rather than importing the
 * full RemoteQueryFunction — keeps the engine easy to mock in tests.
 */
export interface QueryGraph {
  graph<T = any>(
    config: {
      entity: string;
      fields: string[];
      filters?: Record<string, unknown>;
      pagination?: {
        take?: number;
        skip?: number;
        order?: Record<string, "ASC" | "DESC">;
      };
      context?: Record<string, unknown>;
    },
    options?: Record<string, unknown>,
  ): Promise<{ data: T[]; metadata?: unknown }>;
}

/** Structural logger view (Medusa Logger). */
export interface EngineLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  debug(message: string): void;
}

/**
 * Minimal cache view (`Modules.CACHE`) used for the raw-buffer cache-aside (BR-06).
 * Optional — when absent the engine simply computes fresh every request (D11).
 */
export interface SuggestionCache {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, data: unknown, ttl?: number): Promise<void>;
}

export interface EngineDeps {
  query: QueryGraph;
  logger: EngineLogger;
  /** Optional cache adapter for the raw enriched buffer (2.6.3). */
  cache?: SuggestionCache | null;
  /**
   * Cache key for this product's raw enriched buffer (`suggest:product:v3:{id}`),
   * or null to bypass caching. The step passes null for cart-scoped requests
   * (region-specific pricing + in-cart filter make them non-shareable).
   */
  cacheKey?: string | null;
}

/**
 * EvaluationEngine — SPEC A.4 stages 4–6 (the "downstream (Sơn)" layer).
 *
 * Candidate SELECTION (load rules → Tier-1 → Tier-2 backfill → rank) is owned by
 * `evaluateProductSuggestionsWorkflow` (Linh, SRS SUGG-001 Tier logic). This engine
 * takes the already-ranked candidates and does what the selection workflow
 * explicitly defers to us: enrich (price / variant / stock / taxonomy), BR-02
 * per-customer filtering, and the response projection. Dependencies are injected
 * (DI) so it unit-tests with fakes.
 *
 * Degrade contract (BR-10 / API Contract §4.3): any failure returns an empty
 * list — the suggestion section is hidden, never a 5xx to the customer.
 */
export class EvaluationEngine {
  constructor(private readonly deps: EngineDeps) {}

  /**
   * Enrich a selected candidate buffer, apply the BR-02 filter, rank/limit and
   * project to the wire shape ("Complete Your Setup", SUGG-001).
   */
  async enrichAndFinalize(
    candidates: RawCandidate[],
    productId: string,
    request: ProductEvaluationRequest,
  ): Promise<ProductSuggestion[]> {
    try {
      // Cache the RAW enriched buffer (pre-filter) so one key serves every viewer
      // (SPEC A.4 stage 7 / D7); per-customer BR-02 filtering runs at request time.
      const enriched = await this.readOrEnrichCandidates(candidates, request);
      const filterContext = await this.buildFilterContext(productId, request);
      // Pure: BR-02 filter → BR-01 rank/limit → response projection (SPEC A.4 4–6).
      return finalizeSuggestions(enriched, filterContext, request.limit);
    } catch (err) {
      this.deps.logger.error(
        `[suggestive] enrichAndFinalize failed product_id=${productId}: ${errMessage(err)}`,
      );
      return [];
    }
  }

  /**
   * Cache-aside over the enriched buffer (BR-06 / 2.6.3). On a hit the enrichment
   * queries are skipped entirely; on a miss we resolve pricing, enrich, and store
   * the buffer under `cacheKey` with the 5-minute TTL (2.6.5). Cache errors degrade
   * to a fresh compute (never fatal). Skipped when no `cacheKey` is provided.
   */
  private async readOrEnrichCandidates(
    candidates: RawCandidate[],
    request: ProductEvaluationRequest,
  ): Promise<EnrichedCandidate[]> {
    const { cache, cacheKey } = this.deps;

    if (cache && cacheKey) {
      try {
        const hit = await cache.get<EnrichedCandidate[]>(cacheKey);
        if (hit) return hit;
      } catch (err) {
        this.deps.logger.warn(
          `[suggestive] product cache read failed key=${cacheKey}: ${errMessage(err)}`,
        );
      }
    }

    const pricing = await this.resolvePricingContext(request.cartId);
    const enriched = await this.enrichCandidates(candidates, pricing);

    if (cache && cacheKey) {
      try {
        await cache.set(cacheKey, enriched, SUGGESTION_CACHE_TTL);
      } catch (err) {
        this.deps.logger.warn(
          `[suggestive] product cache write failed key=${cacheKey}: ${errMessage(err)}`,
        );
      }
    }

    return enriched;
  }

  /** Stage 6 enrich (SPEC A.4): attach price, variant, stock, taxonomy per candidate. */
  private async enrichCandidates(
    candidates: RawCandidate[],
    pricing: PricingContext | null,
  ): Promise<EnrichedCandidate[]> {
    if (candidates.length === 0) return [];
    const ids = candidates.map((c) => c.product_id);

    const context = pricing
      ? {
          variants: {
            calculated_price: QueryContext({
              currency_code: pricing.currencyCode,
              ...(pricing.regionId ? { region_id: pricing.regionId } : {}),
            }),
          },
        }
      : undefined;

    const { data } = await this.deps.query.graph<any>({
      entity: "product",
      fields: [
        "id",
        "title",
        "handle",
        "thumbnail",
        "status",
        "metadata",
        "categories.name",
        "variants.id",
        "variants.manage_inventory",
        "variants.allow_backorder",
        "variants.calculated_price.calculated_amount",
        "variants.calculated_price.original_amount",
        "variants.inventory_items.inventory.location_levels.stocked_quantity",
        "variants.inventory_items.inventory.location_levels.reserved_quantity",
      ],
      filters: { id: ids },
      context,
    });

    const byId = new Map<string, any>((data ?? []).map((p) => [p.id, p]));
    const enriched: EnrichedCandidate[] = [];

    for (const candidate of candidates) {
      const product = byId.get(candidate.product_id);
      if (!product) continue; // product vanished since the rule was authored — drop it.

      const variants = (product.variants ?? []) as VariantLike[];
      const { variant_id, requires_variant_selection } =
        resolveVariant(variants);
      const { price, discount_price } = computePriceFields(variants);
      const category_names = (product.categories ?? [])
        .map((c: any) => c?.name)
        .filter(Boolean) as string[];

      enriched.push({
        ...candidate,
        handle: product.handle ?? null,
        name: product.title ?? "",
        image_url: product.thumbnail ?? null,
        status: product.status ?? "draft",
        category_names,
        brand: readBrand(product),
        variant_id,
        requires_variant_selection,
        // BR-02(b): in stock iff ≥1 purchasable variant (shared helper — same
        // source of truth as the cart engine). Authoritative per-variant stock
        // is still re-checked at add-time (EC-07/SUGG-003).
        in_stock: isProductInStock(variants),
        price,
        discount_price,
      });
    }

    return enriched;
  }

  /** Build the per-customer BR-02 filter inputs (runtime — D7). */
  private async buildFilterContext(
    productId: string,
    request: ProductEvaluationRequest,
  ): Promise<FilterContext> {
    const [cartProductIds, recentlyPurchasedProductIds] = await Promise.all([
      this.loadCartProductIds(request.cartId),
      this.loadRecentlyPurchasedProductIds(request.customerId),
    ]);

    return {
      sourceProductId: productId,
      cartProductIds,
      // D6 server-side dismissals (BR-02(c)) — resolved by the route from the cache
      // dismissal set and passed through the request; rehydrated to a Set here.
      dismissedProductIds: new Set(request.dismissedProductIds ?? []),
      recentlyPurchasedProductIds,
      consumableCategories: new Set(CONSUMABLE_CATEGORIES),
    };
  }

  private async loadCartProductIds(
    cartId?: string | null,
  ): Promise<Set<string>> {
    if (!cartId) return new Set();
    try {
      const { data } = await this.deps.query.graph<any>({
        entity: "cart",
        fields: ["id", "items.product_id"],
        filters: { id: cartId },
      });
      const items = data?.[0]?.items ?? [];
      return new Set(items.map((i: any) => i?.product_id).filter(Boolean));
    } catch (err) {
      this.deps.logger.warn(
        `[suggestive] loadCartProductIds failed: ${errMessage(err)}`,
      );
      return new Set();
    }
  }

  /**
   * Products the customer bought within the recent window (BR-02(d)). Guests are
   * never purchase-filtered (BR-08) → empty set. Durable-vs-consumable exemption
   * is applied later in the pure filter (consumables are kept even if rebought).
   */
  private async loadRecentlyPurchasedProductIds(
    customerId?: string | null,
  ): Promise<Set<string>> {
    if (!customerId) return new Set();
    try {
      const since = new Date(
        Date.now() - RECENT_PURCHASE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
      );
      const { data } = await this.deps.query.graph<any>({
        entity: "order",
        fields: ["id", "items.product_id", "created_at"],
        filters: { customer_id: customerId, created_at: { $gte: since } },
      });
      const ids = new Set<string>();
      for (const order of data ?? []) {
        for (const item of order.items ?? []) {
          if (item?.product_id) ids.add(item.product_id);
        }
      }
      return ids;
    } catch (err) {
      this.deps.logger.warn(
        `[suggestive] loadRecentlyPurchasedProductIds failed: ${errMessage(err)}`,
      );
      return new Set();
    }
  }

  /**
   * Resolve the pricing context for `calculated_price` (D9). Prefers the cart's
   * currency/region; otherwise the first configured region. Returns null when it
   * can't be resolved — enrichment then omits prices rather than failing.
   */
  private async resolvePricingContext(
    cartId?: string | null,
  ): Promise<PricingContext | null> {
    try {
      if (cartId) {
        const { data } = await this.deps.query.graph<any>({
          entity: "cart",
          fields: ["id", "currency_code", "region_id"],
          filters: { id: cartId },
        });
        const cart = data?.[0];
        if (cart?.currency_code) {
          return {
            currencyCode: cart.currency_code,
            regionId: cart.region_id ?? null,
          };
        }
      }

      const { data } = await this.deps.query.graph<any>({
        entity: "region",
        fields: ["id", "currency_code"],
        pagination: { take: 1 },
      });
      const region = data?.[0];
      if (region?.currency_code) {
        return { currencyCode: region.currency_code, regionId: region.id };
      }
    } catch (err) {
      this.deps.logger.warn(
        `[suggestive] resolvePricingContext failed: ${errMessage(err)}`,
      );
    }
    return null;
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
