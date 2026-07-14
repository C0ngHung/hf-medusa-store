import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import { SUGGESTION_CACHE_TTL } from "../modules/suggestive-selling/constants";

/**
 * Suggestion cache & dismissal helpers — SPEC A.9 / API Contract §2.7 (D6, D11).
 * Tasks 2.6.3–2.6.6.
 *
 * Redis is OPTIONAL (project convention / D11): Medusa always registers a cache
 * module (Redis when REDIS_URL is set, in-memory otherwise), but every helper here
 * degrades to a safe NO-OP if `Modules.CACHE` cannot be resolved — a missing cache
 * must never break the suggestion flow (BR-10). Reads return empty; writes/
 * invalidations do nothing.
 *
 * Cache-key catalogue (API Contract §2.7):
 *   - suggest:product:v3:{productId}     raw enriched buffer, TTL 5′ (2.6.3)
 *   - suggest:cart:v{version}:{cartId}   raw cart result,      TTL 5′ (2.6.4/2.6.5)
 *   - suggest:dismiss:{scope}:{context}  dismissal set,        TTL 24h (D6)
 *   - suggest:cart-rules:version         monotonic version counter (bulk invalidation)
 */

/** Re-exported so callers wire the 5-minute TTL (2.6.5) from one source (SPEC A.2). */
export { SUGGESTION_CACHE_TTL };

/** Dismissal TTL — session-scoped, 24h (D6 / SPEC A.9). */
export const DISMISSAL_TTL = 24 * 60 * 60;

/**
 * Version-counter TTL. The counter only busts stale cart caches, so if it is ever
 * evicted the reset value simply yields cache misses (recompute) — self-healing,
 * never a correctness problem. Kept long so it survives normal churn.
 */
export const CART_RULE_VERSION_TTL = 30 * 24 * 60 * 60;

/** Redis key for the cart-rule version counter (bulk cart-cache invalidation). */
export const CART_RULE_VERSION_KEY = "suggest:cart-rules:version";

/** Dismissal contexts (mirrors `suggestion_event.source_context`). */
export type SuggestionContext = "product_view" | "cart";

/**
 * Minimal structural view of Medusa's cache service (`Modules.CACHE`). We depend
 * only on these three methods so the engines can accept it without importing the
 * full ICacheService type.
 */
export interface SuggestionCache {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, data: unknown, ttl?: number): Promise<void>;
  invalidate(key: string): Promise<void>;
}

/**
 * Resolve the cache module, or `null` when it is not registered/resolvable (D11).
 * Callers treat `null` as "caching disabled" and proceed without it.
 */
export function cache(container: MedusaContainer): SuggestionCache | null {
  try {
    return container.resolve(Modules.CACHE) as SuggestionCache;
  } catch {
    return null;
  }
}

// ── Key builders (API Contract §2.7) ──

/** Raw enriched product-suggestion buffer key (2.6.3). */
export function productCacheKey(productId: string): string {
  return `suggest:product:v3:${productId}`;
}

/** Raw cart-suggestion result key, namespaced by the cart-rule version (2.6.4). */
export function cartCacheKey(cartId: string, version: number | string): string {
  return `suggest:cart:v${version}:${cartId}`;
}

/**
 * Dismissal scope (D6 / BR-08 / SF-05): logged-in customers key by customer id so
 * dismissals follow them across devices; guests key by session (or "anon" when the
 * `x-session-id` header is absent).
 */
export function dismissalScope(
  customerId?: string | null,
  sessionId?: string | null,
): string {
  return customerId ? `cus:${customerId}` : `sess:${sessionId ?? "anon"}`;
}

/** Dismissal set key, per scope × context (a product dismissed in cart may still show on PDP). */
export function dismissKey(scope: string, context: SuggestionContext): string {
  return `suggest:dismiss:${scope}:${context}`;
}

// ── Dismissals (D6, server-side, TTL 24h) ──

/**
 * Products the viewer dismissed this session for `context` (BR-02(c)). Returns an
 * empty set when caching is off or nothing is stored. Stored as a plain string[]
 * (the cache module only persists serializable values), rehydrated to a Set.
 */
export async function getDismissed(
  container: MedusaContainer,
  scope: string,
  context: SuggestionContext,
): Promise<Set<string>> {
  const c = cache(container);
  if (!c) return new Set();
  try {
    const stored = await c.get<string[]>(dismissKey(scope, context));
    return new Set(Array.isArray(stored) ? stored : []);
  } catch {
    return new Set();
  }
}

/** Add a product to the dismissal set (idempotent), refreshing the 24h TTL (D6). */
export async function addDismissal(
  container: MedusaContainer,
  scope: string,
  context: SuggestionContext,
  productId: string,
): Promise<void> {
  const c = cache(container);
  if (!c) return;
  try {
    const key = dismissKey(scope, context);
    const stored = (await c.get<string[]>(key)) ?? [];
    if (!stored.includes(productId)) stored.push(productId);
    await c.set(key, stored, DISMISSAL_TTL);
  } catch {
    /* dismissal is best-effort — never break the request (BR-10). */
  }
}

/** Remove a product from the dismissal set (e.g. undo), keeping the 24h TTL. */
export async function removeDismissal(
  container: MedusaContainer,
  scope: string,
  context: SuggestionContext,
  productId: string,
): Promise<void> {
  const c = cache(container);
  if (!c) return;
  try {
    const key = dismissKey(scope, context);
    const stored = (await c.get<string[]>(key)) ?? [];
    await c.set(
      key,
      stored.filter((id) => id !== productId),
      DISMISSAL_TTL,
    );
  } catch {
    /* best-effort. */
  }
}

// ── Cart-rule version counter (bulk cart-cache invalidation) ──

/**
 * Current cart-rule version (defaults to 1 when unset or caching is off). All cart
 * cache keys embed this number, so bumping it invalidates every cart's cache at
 * once — used when an admin edits a cart rule / complement (SPEC A.9 lazy-miss).
 */
export async function getCartRuleVersion(
  container: MedusaContainer,
): Promise<number> {
  const c = cache(container);
  if (!c) return 1;
  try {
    const v = await c.get<number>(CART_RULE_VERSION_KEY);
    return typeof v === "number" && Number.isFinite(v) ? v : 1;
  } catch {
    return 1;
  }
}

/** Increment the cart-rule version → all existing cart caches become unreachable. */
export async function bumpCartRuleVersion(
  container: MedusaContainer,
): Promise<number> {
  const c = cache(container);
  if (!c) return 1;
  try {
    const next = (await getCartRuleVersion(container)) + 1;
    await c.set(CART_RULE_VERSION_KEY, next, CART_RULE_VERSION_TTL);
    return next;
  } catch {
    return 1;
  }
}

// ── Invalidation ──

/**
 * Invalidate a single cart's suggestion cache (2.6.6 / SUGG-005). Called
 * synchronously from the `cart.updated` subscriber so the next GET recomputes
 * against fresh cart state (D7 lazy re-evaluation).
 */
export async function invalidateCartSuggestions(
  container: MedusaContainer,
  cartId: string,
): Promise<void> {
  const c = cache(container);
  if (!c) return;
  try {
    const version = await getCartRuleVersion(container);
    await c.invalidate(cartCacheKey(cartId, version));
  } catch {
    /* best-effort. */
  }
}

/** Invalidate a product's raw suggestion buffer (called when a rule targeting it changes). */
export async function invalidateProductSuggestions(
  container: MedusaContainer,
  productId: string,
): Promise<void> {
  const c = cache(container);
  if (!c) return;
  try {
    await c.invalidate(productCacheKey(productId));
  } catch {
    /* best-effort. */
  }
}

/**
 * Invalidate the product buffers of every product in a category — used when a
 * category-complement mapping changes (SPEC A.9). Resolves the member products via
 * Query, then delegates to `invalidateProductSuggestions` per product.
 */
export async function invalidateCategorySuggestions(
  container: MedusaContainer,
  categoryId: string,
): Promise<void> {
  const c = cache(container);
  if (!c) return;
  try {
    // Structural view of Query.graph (the same shape the evaluator engines use) so
    // the nested category filter isn't rejected by the strict generated types.
    const query = container.resolve(ContainerRegistrationKeys.QUERY) as {
      graph: (config: {
        entity: string;
        fields: string[];
        filters?: Record<string, unknown>;
      }) => Promise<{ data: Array<{ id: string }> }>;
    };
    const { data } = await query.graph({
      entity: "product",
      fields: ["id"],
      filters: { categories: { id: categoryId } },
    });
    await Promise.all(
      (data ?? []).map((p) => invalidateProductSuggestions(container, p.id)),
    );
  } catch {
    /* best-effort. */
  }
}
