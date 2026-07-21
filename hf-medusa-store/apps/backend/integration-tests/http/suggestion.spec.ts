import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { Modules } from "@medusajs/framework/utils";
import { SUGGESTIVE_SELLING_MODULE } from "../../src/modules/suggestive-selling";
import cartUpdatedSuggestionsHandler from "../../src/subscribers/cart-updated-suggestions";
import {
  SUGGESTION_CACHE_TTL,
  cartCacheKey,
  dismissalScope,
  getCartRuleVersion,
  getDismissed,
  invalidateCartSuggestions,
} from "../../src/lib/suggestion-cache";

/**
 * HTTP integration for SuggestiveSelling — end-to-end through the real routes, app
 * and cache module (Redis when REDIS_URL is set; in-memory otherwise).
 *
 * ONE `medusaIntegrationTestRunner` = ONE app boot. All scenarios live here as
 * describe blocks on purpose: booting more than one runner in a single jest
 * `--runInBand` process corrupts Medusa's module registry ("Map.prototype.set
 * called on incompatible receiver"), so multiple *.spec.ts files that each call
 * the runner cannot coexist. Keep new HTTP scenarios as describe blocks in here.
 *
 * Coverage:
 *   T-SUGG-01 (5.1.1)  manual suggestions returned in display_order
 *   T-SUGG-05 (5.1.5)  dismiss persists across requests, session-scoped
 *   T-SUGG-10 (5.1.10) 4 analytics actions tracked + payload + dismiss persistence
 *   T-SUGG-09 (5.1.9) / 5.3.7  cart.updated → cache invalidation → refresh
 *
 * T-SUGG-02/03/04 (backfill / in-cart / out-of-stock) are pure logic → unit only.
 * The pure cache key/version logic is unit-tested in src/lib/__tests__/suggestion-cache.unit.spec.ts.
 *
 * All /store routes require a publishable API key (created in the top-level beforeEach).
 */
jest.setTimeout(180_000);

/** Poll `fn` until true or timeout (absorbs async event delivery). */
async function waitFor(
  fn: () => Promise<boolean>,
  { timeout = 6000, interval = 100 } = {},
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, interval));
  }
  return fn();
}

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    let pubKey: string;

    // The runner resets the DB between tests, so seed per-test (beforeEach).
    beforeEach(async () => {
      const apiKeyService: any = getContainer().resolve(Modules.API_KEY);
      const [pk] = await apiKeyService.createApiKeys([
        { title: "test store key", type: "publishable", created_by: "test" },
      ]);
      pubKey = pk.token;
    });

    const hdr = (session: string) => ({
      "x-publishable-api-key": pubKey,
      "x-session-id": session,
    });

    // ── Product-level suggestions (T-SUGG-01 / T-SUGG-05) ──
    describe("GET /store/products/:id/suggestions", () => {
      let sourceId: string;
      let s1: string;
      let s2: string;
      let s3: string;

      const publishedProduct = (title: string) => ({
        title,
        status: "published" as const,
        options: [{ title: "Default", values: ["OS"] }],
        // manage_inventory: false — untracked/always-purchasable. This suite
        // tests Tier-1 ordering/dismissal, not stock; without this flag these
        // raw-created variants have zero inventory items, so
        // isProductInStock() (pipeline.ts BR-02b) correctly reports them
        // out-of-stock and BR-02 filters every candidate, emptying the result.
        variants: [
          { title: "OS", options: { Default: "OS" }, manage_inventory: false },
        ],
      });

      beforeEach(async () => {
        const productService: any = getContainer().resolve(Modules.PRODUCT);
        const ss: any = getContainer().resolve(SUGGESTIVE_SELLING_MODULE);

        const [source, sug1, sug2, sug3] = await productService.createProducts([
          publishedProduct("T-SUGG source racket"),
          publishedProduct("T-SUGG string"),
          publishedProduct("T-SUGG grip"),
          publishedProduct("T-SUGG bag"),
        ]);
        sourceId = source.id;
        s1 = sug1.id;
        s2 = sug2.id;
        s3 = sug3.id;

        // display_order out of order to prove the route sorts by display_order.
        await ss.createSuggestionRules({
          name: "T-SUGG manual rule",
          type: "product",
          tier: "manual",
          is_active: true,
          priority: 10,
          sources: [{ source_product_id: sourceId }],
          items: [
            { suggested_product_id: s2, display_order: 1 },
            {
              suggested_product_id: s1,
              display_order: 0,
              custom_label: "Best Match",
            },
            { suggested_product_id: s3, display_order: 2 },
          ],
        });
      });

      it("T-SUGG-01: returns the 3 manual suggestions in display_order", async () => {
        const res = await api.get(`/store/products/${sourceId}/suggestions`, {
          headers: hdr("sess-t01"),
        });

        expect(res.status).toBe(200);
        expect(res.data.suggestions.map((s: any) => s.product_id)).toEqual([
          s1,
          s2,
          s3,
        ]);
        expect(res.data.suggestions[0].label).toBe("Best Match");
        expect(res.data.suggestions.map((s: any) => s.display_order)).toEqual([
          1, 2, 3,
        ]);
      });

      it("T-SUGG-05: a dismissed product stays hidden on the next request (same session)", async () => {
        const session = "sess-t05";

        const before = await api.get(
          `/store/products/${sourceId}/suggestions`,
          {
            headers: hdr(session),
          },
        );
        expect(before.data.suggestions.map((s: any) => s.product_id)).toContain(
          s2,
        );

        const ev = await api.post(
          "/store/suggestion-events",
          {
            events: [
              {
                action: "dismiss",
                source_context: "product_view",
                source_product_id: sourceId,
                suggested_product_id: s2,
                session_id: session,
              },
            ],
          },
          { headers: hdr(session) },
        );
        expect(ev.status).toBe(202);

        const after = await api.get(`/store/products/${sourceId}/suggestions`, {
          headers: hdr(session),
        });
        const ids = after.data.suggestions.map((s: any) => s.product_id);
        expect(ids).not.toContain(s2);
        expect(ids).toEqual(expect.arrayContaining([s1, s3]));
      });

      it("T-SUGG-05: the dismissal is scoped to its session (other sessions unaffected)", async () => {
        const res = await api.get(`/store/products/${sourceId}/suggestions`, {
          headers: hdr("sess-other"),
        });
        expect(res.data.suggestions.map((s: any) => s.product_id)).toContain(
          s2,
        );
      });
    });

    // ── Analytics event tracking (T-SUGG-10) ──
    describe("POST /store/suggestion-events", () => {
      const event = (action: string, extra: Record<string, unknown> = {}) => ({
        action,
        source_context: "product_view",
        source_product_id: "prod_source",
        suggested_product_id: `prod_${action}`,
        rule_id: "rule_1",
        tier: "manual",
        slot: 1,
        ...extra,
      });

      it("T-SUGG-10: tracks all four actions and persists them with payload", async () => {
        const session = "sess-events";
        const res = await api.post(
          "/store/suggestion-events",
          {
            events: [
              event("impression"),
              event("tap"),
              event("add_to_cart"),
              event("dismiss"),
            ],
          },
          { headers: hdr(session) },
        );

        expect(res.status).toBe(202);
        expect(res.data).toEqual({ accepted: 4, rejected: 0 });

        const ss: any = getContainer().resolve(SUGGESTIVE_SELLING_MODULE);
        const rows = await ss.listSuggestionEvents(
          { session_id: session },
          {
            select: [
              "action",
              "suggested_product_id",
              "rule_id",
              "tier",
              "slot",
              "source_context",
            ],
          },
        );
        expect(rows).toHaveLength(4);
        expect(new Set(rows.map((r: any) => r.action))).toEqual(
          new Set(["impression", "tap", "add_to_cart", "dismiss"]),
        );
        expect(rows.find((r: any) => r.action === "impression")).toMatchObject({
          rule_id: "rule_1",
          tier: "manual",
          slot: 1,
          source_context: "product_view",
        });
      });

      it("T-SUGG-10: rejects a malformed event individually, keeps the rest (SEC-04)", async () => {
        const res = await api.post(
          "/store/suggestion-events",
          {
            events: [
              event("impression"),
              event("not_a_real_action"), // bad enum → rejected
              { source_context: "product_view" }, // missing suggested_product_id → rejected
            ],
          },
          { headers: hdr("sess-mixed") },
        );

        expect(res.status).toBe(202);
        expect(res.data).toEqual({ accepted: 1, rejected: 2 });
      });

      it("T-SUGG-10 / bug-fix: a dismiss event persists the dismissal set (BR-02(c))", async () => {
        await api.post(
          "/store/suggestion-events",
          {
            events: [
              event("dismiss", { suggested_product_id: "prod_dismissed" }),
            ],
          },
          { headers: hdr("sess-dismiss") },
        );

        const dismissed = await getDismissed(
          getContainer(),
          dismissalScope(null, "sess-dismiss"),
          "product_view",
        );
        expect(dismissed.has("prod_dismissed")).toBe(true);
      });
    });

    // ── Cart-suggestion cache invalidation / refresh (T-SUGG-09 / 5.3.7) ──
    describe("cart.updated → cache invalidation", () => {
      const CART_ID = "cart_test_refresh";

      async function seedCartCache(): Promise<string> {
        const cache = getContainer().resolve(Modules.CACHE);
        const version = await getCartRuleVersion(getContainer());
        const key = cartCacheKey(CART_ID, version);
        await cache.set(
          key,
          { candidates: [{ product_id: "stale_p" }], threshold_info: null },
          SUGGESTION_CACHE_TTL,
        );
        return key;
      }

      it("invalidateCartSuggestions clears the cached cart result (real cache module)", async () => {
        const cache = getContainer().resolve(Modules.CACHE);
        const key = await seedCartCache();
        expect(await cache.get(key)).not.toBeNull();

        await invalidateCartSuggestions(getContainer(), CART_ID);
        expect(await cache.get(key)).toBeNull(); // next GET misses → recompute (refresh)
      });

      it("the cart.updated subscriber invalidates the cache (registered + fires)", async () => {
        const cache = getContainer().resolve(Modules.CACHE);
        const key = await seedCartCache();

        await cartUpdatedSuggestionsHandler({
          event: { data: { id: CART_ID } },
          container: getContainer(),
        } as any);

        expect(await waitFor(async () => (await cache.get(key)) === null)).toBe(
          true,
        );
      });

      it("cart.updated emitted on the event bus reaches the subscriber (wiring)", async () => {
        const cache = getContainer().resolve(Modules.CACHE);
        const key = await seedCartCache();

        const eventBus = getContainer().resolve(Modules.EVENT_BUS);
        await eventBus.emit({ name: "cart.updated", data: { id: CART_ID } });

        expect(
          await waitFor(async () => (await cache.get(key)) === null, {
            timeout: 8000,
          }),
        ).toBe(true);
      });
    });
  },
});
