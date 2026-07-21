/**
 * HTTP integration — GET /store/customers/me/vouchers (Task 6, read-through
 * list + `estimated_savings` + smart sort; ported/adapted from a colleague's
 * branch feature to the credit-line/read-through architecture).
 *
 * Exercises the real route with a real `?cart_id=`: each voucher must carry
 * an integer `estimated_savings` computed via the SAME pure
 * `resolveEligibleItems`/`calculateVoucherDiscount` the real apply-time
 * discount math uses (INT-01, security.md 50% global cap), a voucher that
 * fails the V5 min-order check must sort AFTER every eligible voucher
 * regardless of its own (hypothetical) savings size, and no voucher's
 * `estimated_savings` may exceed the 50% global cap threshold on the cart's
 * subtotal. Vouchers are provisioned via the REAL `createVoucherWorkflow`
 * (not `service.createVoucherConfigs` directly) so each one carries a real
 * backing Promotion (`promotion_id`) — this is what makes the Decision I
 * read-through hydration path in the route actually fire.
 *
 * Note: despite the route's own file-header doc claiming guest access is
 * allowed, the CORE Medusa middleware `ALL /store/customers/me*` ->
 * `authenticate("customer", ["session","bearer"])` (unconditional, no
 * `allowUnregistered`) 401s every unauthenticated request to this path —
 * verified empirically here. This spec authenticates a real store customer
 * (`helpers/create-store-customer.ts`) to reach the route at all; the "guest
 * never 401s" claim in the route's header appears stale/aspirational
 * (pre-existing, unrelated to Task 6 — logged, not fixed here).
 */
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { Modules } from "@medusajs/framework/utils";
import {
  createApiKeysWorkflow,
  createSalesChannelsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
} from "@medusajs/medusa/core-flows";
import { createVoucherWorkflow } from "../../src/workflows/voucher-engine/admin/create-voucher";
import { VOUCHER_ENGINE_MODULE } from "../../src/modules/voucher-engine";
import type VoucherEngineService from "../../src/modules/voucher-engine/service";
import { createStoreCustomer } from "./helpers/create-store-customer";

jest.setTimeout(60_000);
// Known infra flake (not an assertion failure) — see
// .claude/lessons/voucher-engine/2026-07-14-redis-bullmq-teardown-race.md.
jest.retryTimes(2);

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api }) => {
    describe("GET /store/customers/me/vouchers?cart_id= (Task 6)", () => {
      const FAR_PAST = new Date("2020-01-01T00:00:00Z");
      const FAR_FUTURE = new Date("2999-01-01T00:00:00Z");
      let requestHeaders: { headers: Record<string, string> };

      function container() {
        return getContainer();
      }

      // Recreated before every test — `medusaIntegrationTestRunner` resets
      // the DB between tests in the same file (see apply-remove-voucher.spec.ts).
      beforeEach(async () => {
        const {
          result: [salesChannel],
        } = await createSalesChannelsWorkflow(container()).run({
          input: { salesChannelsData: [{ name: "My Vouchers Test Channel" }] },
        });
        const {
          result: [apiKey],
        } = await createApiKeysWorkflow(container()).run({
          input: {
            api_keys: [
              {
                title: "My Vouchers Test Key",
                type: "publishable",
                created_by: "",
              },
            ],
          },
        });
        await linkSalesChannelsToApiKeyWorkflow(container()).run({
          input: { id: apiKey.id, add: [salesChannel.id] },
        });
        const customerHeaders = await createStoreCustomer(container());
        requestHeaders = {
          headers: {
            ...customerHeaders.headers,
            "x-publishable-api-key": apiKey.token,
          },
        };
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async function createCart(items: any[]): Promise<{ id: string }> {
        const cartModuleService = container().resolve(Modules.CART);
        const cart = await cartModuleService.createCarts({
          currency_code: "vnd",
          items,
        } as any);
        return (Array.isArray(cart) ? cart[0] : cart) as { id: string };
      }

      // Real admin workflow (not the service directly) — provisions a
      // backing Promotion + Campaign and stores promotion_id on the config
      // row, which is what makes the route's hydration branch fire.
      async function createVoucher(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        overrides: Record<string, any>,
      ) {
        const { result, errors } = await createVoucherWorkflow(container()).run(
          {
            input: {
              valid_from: FAR_PAST,
              valid_to: FAR_FUTURE,
              per_user_limit: 5,
              ...overrides,
            },
            throwOnError: false,
          },
        );
        expect(errors).toEqual([]);
        return result as { id: string; promotion_id: string | null };
      }

      it("adds an integer estimated_savings per voucher, sorts eligible-before-ineligible ahead of raw savings size, and never exceeds the 50% global cap", async () => {
        const cart = await createCart([
          {
            title: "Racket",
            unit_price: 1_000_000,
            quantity: 1,
            product_id: "prod_racket_myvouchers",
          },
        ]);

        // Eligible, large but under-cap savings (20% of 1,000,000 = 200,000).
        const high = await createVoucher({
          code: "MYVOUCH-HIGH20",
          discount_type: "percentage",
          discount_value: 2000,
        });
        // Eligible, small savings (5% of 1,000,000 = 50,000).
        const low = await createVoucher({
          code: "MYVOUCH-LOW5",
          discount_type: "percentage",
          discount_value: 500,
        });
        // V5-ineligible (min order 2,000,000 > cart subtotal 1,000,000) but its
        // OWN raw savings (10% of 1,000,000 = 100,000) would rank ABOVE "LOW5"
        // (50,000) by amount alone — proving eligibility, not savings size,
        // is the primary sort key.
        const minOrder = await createVoucher({
          code: "MYVOUCH-MINORDER",
          discount_type: "percentage",
          discount_value: 1000,
          min_order_value: 2_000_000,
        });
        // Deliberately over the 50% cap (80% of 1,000,000 = 800,000 raw) —
        // must be trimmed down to the 500,000 cap threshold, never returned
        // as the uncapped raw amount.
        const fat = await createVoucher({
          code: "MYVOUCH-FAT80",
          discount_type: "percentage",
          discount_value: 8000,
        });

        expect(high.promotion_id).toBeTruthy();
        expect(low.promotion_id).toBeTruthy();
        expect(minOrder.promotion_id).toBeTruthy();
        expect(fat.promotion_id).toBeTruthy();

        const res = await api.get(
          `/store/customers/me/vouchers?cart_id=${cart.id}`,
          requestHeaders,
        );
        expect(res.status).toBe(200);

        const byCode = new Map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (res.data.vouchers as any[]).map((v) => [v.code, v]),
        );
        const vHigh = byCode.get("MYVOUCH-HIGH20");
        const vLow = byCode.get("MYVOUCH-LOW5");
        const vMinOrder = byCode.get("MYVOUCH-MINORDER");
        const vFat = byCode.get("MYVOUCH-FAT80");
        expect(vHigh).toBeTruthy();
        expect(vLow).toBeTruthy();
        expect(vMinOrder).toBeTruthy();
        expect(vFat).toBeTruthy();

        // Integer estimated_savings, matching the exact discount math.
        expect(vHigh.estimated_savings).toBe(200_000);
        expect(vLow.estimated_savings).toBe(50_000);
        expect(vMinOrder.estimated_savings).toBe(100_000);
        for (const v of [vHigh, vLow, vMinOrder, vFat]) {
          expect(Number.isInteger(v.estimated_savings)).toBe(true);
        }

        // Eligibility (V5/V6 preview, existing behavior) is preserved.
        expect(vHigh.eligible).toBe(true);
        expect(vLow.eligible).toBe(true);
        expect(vFat.eligible).toBe(true);
        expect(vMinOrder.eligible).toBe(false);
        expect(vMinOrder.ineligible_reason).toBeTruthy();

        // 50% global cap (default DiscountCapConfig, DEFAULT_CAP_PCT = 5000
        // bps) — the raw 80% (800,000) must be trimmed to 500,000, and no
        // voucher's estimate may exceed that threshold (subtotal 1,000,000).
        expect(vFat.estimated_savings).toBe(500_000);
        const originalSubtotal = 1_000_000;
        for (const v of [vHigh, vLow, vMinOrder, vFat]) {
          expect(v.estimated_savings).toBeLessThanOrEqual(
            Math.floor(originalSubtotal * 0.5),
          );
        }

        // Smart sort: eligible vouchers first (by estimated_savings desc:
        // FAT80 500,000 > HIGH20 200,000 > LOW5 50,000), THEN ineligible ones
        // — MINORDER (100,000) sorts LAST despite out-ranking LOW5 by amount.
        const codesInOrder = (res.data.vouchers as { code: string }[]).map(
          (v) => v.code,
        );
        const idxFat = codesInOrder.indexOf("MYVOUCH-FAT80");
        const idxHigh = codesInOrder.indexOf("MYVOUCH-HIGH20");
        const idxLow = codesInOrder.indexOf("MYVOUCH-LOW5");
        const idxMinOrder = codesInOrder.indexOf("MYVOUCH-MINORDER");
        expect(idxFat).toBeLessThan(idxHigh);
        expect(idxHigh).toBeLessThan(idxLow);
        expect(idxLow).toBeLessThan(idxMinOrder);
      });

      it("reflects the linked Promotion's discount (read-through, Decision I) even when it drifts from the original voucher_config value", async () => {
        const cart = await createCart([
          {
            title: "Racket",
            unit_price: 1_000_000,
            quantity: 1,
            product_id: "prod_racket_myvouchers_drift",
          },
        ]);

        const voucher = await createVoucher({
          code: "MYVOUCH-DRIFT",
          discount_type: "percentage",
          discount_value: 2000, // 20% -> backing Promotion application_method.value = 20
        });

        const { updatePromotionsWorkflow } =
          await import("@medusajs/core-flows");
        await updatePromotionsWorkflow(container()).run({
          input: {
            promotionsData: [
              {
                id: voucher.promotion_id as string,
                application_method: { value: 35 }, // drift to 35%, config row untouched
              },
            ],
          },
        });

        const res = await api.get(
          `/store/customers/me/vouchers?cart_id=${cart.id}`,
          requestHeaders,
        );
        expect(res.status).toBe(200);
        const row = (res.data.vouchers as { code: string }[]).find(
          (v) => v.code === "MYVOUCH-DRIFT",
        ) as { discount_value: number; estimated_savings: number } | undefined;
        expect(row).toBeTruthy();
        // Reflects the drifted 35%, not the stale voucher_config 2000 bps.
        expect(row!.discount_value).toBe(3500);
        expect(row!.estimated_savings).toBe(350_000);
      });

      it("M1 fix: still lists a voucher whose voucher_config.is_active is stale-false while its linked Promotion remains active (Decision I — Promotion is the source of truth, not a DB pre-filter)", async () => {
        const voucher = await createVoucher({
          code: "MYVOUCH-STALEFLAG",
          discount_type: "percentage",
          discount_value: 1500,
        });
        expect(voucher.promotion_id).toBeTruthy();

        // Flip ONLY the voucher_config column stale/false, directly via the
        // module service (bypassing the admin API) — simulates the config
        // row drifting out of sync with its backing Promotion, which is left
        // untouched (still "active" from createVoucherWorkflow's default).
        // Before the M1 fix, the route pre-filtered `listVoucherConfigs({
        // is_active: true })` BEFORE hydrating from the Promotion, so this
        // row would never even reach the hydration/window filter and would
        // be wrongly hidden.
        const ve = container().resolve(
          VOUCHER_ENGINE_MODULE,
        ) as VoucherEngineService;
        await ve.updateVoucherConfigs({
          id: voucher.id,
          is_active: false,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);

        const res = await api.get(
          "/store/customers/me/vouchers",
          requestHeaders,
        );
        expect(res.status).toBe(200);

        const row = (res.data.vouchers as { code: string }[]).find(
          (v) => v.code === "MYVOUCH-STALEFLAG",
        );
        // The linked Promotion is still active -> hydration overlays
        // is_active=true onto the row, so the post-hydration filter keeps
        // it in the list despite the stale `voucher_config.is_active=false`.
        expect(row).toBeTruthy();
      });
    });
  },
});
