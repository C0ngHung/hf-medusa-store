import { Modules } from "@medusajs/framework/utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import {
  DISMISSAL_TTL,
  SUGGESTION_CACHE_TTL,
  addDismissal,
  bumpCartRuleVersion,
  cartCacheKey,
  dismissKey,
  dismissalScope,
  getCartRuleVersion,
  getDismissed,
  invalidateCartSuggestions,
  invalidateProductSuggestions,
  productCacheKey,
  removeDismissal,
} from "../suggestion-cache";
import { CONSUMABLE_CATEGORIES } from "../../modules/suggestive-selling/constants";
import { finalizeSuggestions } from "../../modules/suggestive-selling/evaluator/pipeline";
import type {
  EnrichedCandidate,
  FilterContext,
} from "../../modules/suggestive-selling/types";

/**
 * Dismissal-persistence acceptance — T-SUGG-05 ("suggestion dismissed → không
 * hiện lại trong session"). SUGG-002 / BR-02(c), SPEC A.9 (D6).
 *
 * The pure BR-02 filter that DROPS a dismissed product is unit-tested in
 * evaluator/pipeline.unit.spec.ts. What this file proves is the STATEFUL half the
 * filter depends on and that was previously unwired (no writer for addDismissal):
 * a dismiss recorded on one request is still remembered on the NEXT request within
 * the session, so the product stays hidden. Uses a fake in-memory `Modules.CACHE`
 * so the roundtrip is deterministic (no Redis) — the real-Redis end-to-end path is
 * exercised by integration-tests/http/suggestion-dismissal.spec.ts.
 */

/** Minimal in-memory stand-in for Medusa's cache module (get/set/invalidate + TTL capture). */
class FakeCache {
  private store = new Map<string, unknown>();
  /** Last TTL passed to `set`, per key — lets tests assert the 24h dismissal TTL. */
  readonly ttls = new Map<string, number | undefined>();

  async get<T = unknown>(key: string): Promise<T | null> {
    return (this.store.has(key) ? (this.store.get(key) as T) : null) ?? null;
  }
  async set(key: string, data: unknown, ttl?: number): Promise<void> {
    this.store.set(key, data);
    this.ttls.set(key, ttl);
  }
  async invalidate(key: string): Promise<void> {
    this.store.delete(key);
  }
}

/** A container that resolves ONLY the cache module (all the helpers touch). */
function containerWith(cache: FakeCache | null): MedusaContainer {
  return {
    resolve: (key: string) => {
      if (key === Modules.CACHE && cache) return cache;
      throw new Error(`unexpected resolve(${key})`);
    },
  } as unknown as MedusaContainer;
}

function candidate(
  overrides: Partial<EnrichedCandidate> = {},
): EnrichedCandidate {
  return {
    product_id: "prod_x",
    tier: "manual",
    rule_id: "srule_1",
    display_order: 0,
    custom_label: null,
    handle: "handle-x",
    name: "Product X",
    image_url: null,
    status: "published",
    category_names: [],
    brand: null,
    variant_id: "var_x",
    requires_variant_selection: false,
    in_stock: true,
    price: 100000,
    discount_price: null,
    ...overrides,
  };
}

function filterCtx(dismissed: Iterable<string>): FilterContext {
  return {
    sourceProductId: null,
    cartProductIds: new Set(),
    dismissedProductIds: new Set(dismissed),
    recentlyPurchasedProductIds: new Set(),
    consumableCategories: new Set(CONSUMABLE_CATEGORIES),
  };
}

describe("dismissal persistence — T-SUGG-05 (SUGG-002 / BR-02(c))", () => {
  it("remembers a dismissal across requests, then the filter hides it (roundtrip)", async () => {
    const cache = new FakeCache();
    const container = containerWith(cache);
    const scope = dismissalScope(null, "sess_123"); // guest session
    const context = "product_view" as const;

    // Request N: nothing dismissed yet → both candidates would show.
    const before = await getDismissed(container, scope, context);
    expect([...before]).toEqual([]);

    // Customer taps [x] on "p_dismiss" → route persists the dismissal.
    await addDismissal(container, scope, context, "p_dismiss");

    // Request N+1 (same session): the dismissal is remembered and drives the filter.
    const after = await getDismissed(container, scope, context);
    expect(after.has("p_dismiss")).toBe(true);

    const result = finalizeSuggestions(
      [
        candidate({ product_id: "p_keep" }),
        candidate({ product_id: "p_dismiss" }),
      ],
      filterCtx(after),
      5,
    );
    expect(result.map((s) => s.product_id)).toEqual(["p_keep"]); // hidden, not just first-request
  });

  it("writes the dismissal set under the 24h session TTL (D6)", async () => {
    const cache = new FakeCache();
    const scope = dismissalScope(null, "sess_ttl");
    await addDismissal(containerWith(cache), scope, "product_view", "p1");
    expect(cache.ttls.get(dismissKey(scope, "product_view"))).toBe(
      DISMISSAL_TTL,
    );
  });

  it("is idempotent — dismissing the same product twice stores it once", async () => {
    const cache = new FakeCache();
    const container = containerWith(cache);
    const scope = dismissalScope(null, "sess_dup");
    await addDismissal(container, scope, "product_view", "p1");
    await addDismissal(container, scope, "product_view", "p1");
    expect([...(await getDismissed(container, scope, "product_view"))]).toEqual(
      ["p1"],
    );
  });

  it("isolates contexts — a product dismissed in cart still shows on the PDP", async () => {
    const cache = new FakeCache();
    const container = containerWith(cache);
    const scope = dismissalScope(null, "sess_ctx");
    await addDismissal(container, scope, "cart", "p1");

    expect((await getDismissed(container, scope, "cart")).has("p1")).toBe(true);
    expect(
      (await getDismissed(container, scope, "product_view")).has("p1"),
    ).toBe(false);
  });

  it("scopes by customer when logged in, else by session (BR-08 / SF-05)", () => {
    expect(dismissalScope("cus_1", "sess_1")).toBe("cus:cus_1"); // customer wins → follows across devices
    expect(dismissalScope(null, "sess_1")).toBe("sess:sess_1"); // guest → per session
    expect(dismissalScope(null, null)).toBe("sess:anon"); // no session header
  });

  it("undo removes a dismissal so the product can show again", async () => {
    const cache = new FakeCache();
    const container = containerWith(cache);
    const scope = dismissalScope(null, "sess_undo");
    await addDismissal(container, scope, "product_view", "p1");
    await removeDismissal(container, scope, "product_view", "p1");
    expect(
      (await getDismissed(container, scope, "product_view")).has("p1"),
    ).toBe(false);
  });

  it("degrades safely when the cache module is absent (BR-10 / D11)", async () => {
    const container = containerWith(null); // resolve(Modules.CACHE) throws → treated as disabled
    // No throw; reads empty, writes are no-ops.
    await expect(
      getDismissed(container, dismissalScope(null, "s"), "product_view"),
    ).resolves.toEqual(new Set());
    await expect(
      addDismissal(container, dismissalScope(null, "s"), "product_view", "p1"),
    ).resolves.toBeUndefined();
  });
});

/**
 * Cache invalidation — 5.3.7 / T-SUGG-09 (SUGG-005, SPEC A.9). The `cart.updated`
 * subscriber calls invalidateCartSuggestions so the next GET recomputes against
 * fresh cart state; an admin rule/complement change bumps the cart-rule version to
 * invalidate every cart at once. These prove that invalidation LOGIC deterministically
 * (fake cache); the subscriber wiring + refresh end-to-end is exercised over the real
 * app in integration-tests/http/cart-suggestion-refresh.spec.ts.
 */
describe("cart-suggestion cache invalidation — 5.3.7 / T-SUGG-09 (SUGG-005)", () => {
  it("caches then invalidates a single cart (cart.updated path)", async () => {
    const cache = new FakeCache();
    const container = containerWith(cache);
    const version = await getCartRuleVersion(container); // defaults to 1
    const key = cartCacheKey("cart_1", version);

    // Simulate the cache-aside write the engine does on a miss.
    await cache.set(
      key,
      { candidates: [{ product_id: "p1" }] },
      SUGGESTION_CACHE_TTL,
    );
    expect(await cache.get(key)).not.toBeNull();

    await invalidateCartSuggestions(container, "cart_1"); // what the subscriber calls
    expect(await cache.get(key)).toBeNull(); // next GET misses → recompute (refresh)
  });

  it("invalidates ONLY the target cart, leaving others cached", async () => {
    const cache = new FakeCache();
    const container = containerWith(cache);
    const v = await getCartRuleVersion(container);
    await cache.set(cartCacheKey("cart_a", v), { candidates: [] });
    await cache.set(cartCacheKey("cart_b", v), { candidates: [] });

    await invalidateCartSuggestions(container, "cart_a");
    expect(await cache.get(cartCacheKey("cart_a", v))).toBeNull();
    expect(await cache.get(cartCacheKey("cart_b", v))).not.toBeNull();
  });

  it("bumping the cart-rule version makes every existing cart key unreachable (bulk invalidation)", async () => {
    const cache = new FakeCache();
    const container = containerWith(cache);
    const v1 = await getCartRuleVersion(container);
    await cache.set(cartCacheKey("cart_1", v1), {
      candidates: [{ product_id: "p1" }],
    });

    const v2 = await bumpCartRuleVersion(container); // admin edits a rule/complement
    expect(v2).toBe(v1 + 1);
    // New reads use v2 → the v1 entry is orphaned (a guaranteed miss), no per-cart delete needed.
    expect(await cache.get(cartCacheKey("cart_1", v2))).toBeNull();
    expect(cartCacheKey("cart_1", v2)).not.toBe(cartCacheKey("cart_1", v1));
  });

  it("invalidates a product's raw buffer (rule targeting it changed)", async () => {
    const cache = new FakeCache();
    const container = containerWith(cache);
    await cache.set(
      productCacheKey("prod_1"),
      [{ product_id: "x" }],
      SUGGESTION_CACHE_TTL,
    );
    await invalidateProductSuggestions(container, "prod_1");
    expect(await cache.get(productCacheKey("prod_1"))).toBeNull();
  });

  it("invalidation degrades to a no-op when the cache is absent (BR-10 / D11)", async () => {
    const container = containerWith(null);
    await expect(
      invalidateCartSuggestions(container, "cart_1"),
    ).resolves.toBeUndefined();
    await expect(getCartRuleVersion(container)).resolves.toBe(1); // safe default
  });
});
