import { QueryContext } from "@medusajs/framework/utils";
import {
  CONSUMABLE_CATEGORIES,
  RECENT_PURCHASE_WINDOW_DAYS,
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

export interface EngineDeps {
  query: QueryGraph;
  logger: EngineLogger;
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
      const pricing = await this.resolvePricingContext(request.cartId);
      const enriched = await this.enrichCandidates(candidates, pricing);
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
        "variants.calculated_price.calculated_amount",
        "variants.calculated_price.original_amount",
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
        // Best-effort availability: purchasable if the product has any variant.
        // Authoritative per-variant stock is re-checked at add-time (EC-07/SUGG-003);
        // display staleness is acceptable (EC-09).
        in_stock: variants.length > 0,
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
      // D6 server-side dismissals are wired in Day-4 alongside the dismissal-write
      // endpoint + cache; until a write path exists this is always empty.
      dismissedProductIds: new Set(),
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

/** Brand is not a first-class Medusa entity here — read it from product metadata. */
function readBrand(product: any): string | null {
  const brand = product?.metadata?.brand;
  return typeof brand === "string" && brand.length > 0 ? brand : null;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
