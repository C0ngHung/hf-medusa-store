/**
 * lookupVoucherStep — Redis config cache wiring (3.7.1/3.7.2). Verifies the
 * 30s cart-independent voucher-config cache (`lib/voucher-cache.ts`, built in
 * Day 4 but never actually invoked from the lookup path until this fix) is
 * now populated on a miss and served on a hit — exercised end-to-end through
 * the real `POST /store/carts/:id/voucher` route, not a mocked step.
 */
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import {
  createApiKeysWorkflow,
  createSalesChannelsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
} from "@medusajs/medusa/core-flows";
import { Modules } from "@medusajs/framework/utils";
import { VOUCHER_ENGINE_MODULE } from "../../src/modules/voucher-engine";
import type VoucherEngineService from "../../src/modules/voucher-engine/service";
import { cache, voucherConfigCacheKey } from "../../src/lib/voucher-cache";

jest.setTimeout(60_000);
jest.retryTimes(2);

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api }) => {
    describe("lookupVoucherStep — Redis config cache (3.7.1/3.7.2)", () => {
      const FAR_PAST = new Date("2020-01-01T00:00:00Z");
      const FAR_FUTURE = new Date("2999-01-01T00:00:00Z");

      function container() {
        return getContainer();
      }

      let publishableKeyHeaders: { headers: Record<string, string> };

      beforeEach(async () => {
        const {
          result: [salesChannel],
        } = await createSalesChannelsWorkflow(container()).run({
          input: { salesChannelsData: [{ name: "Cache Test Channel" }] },
        });
        const {
          result: [apiKey],
        } = await createApiKeysWorkflow(container()).run({
          input: {
            api_keys: [
              { title: "Cache Test Key", type: "publishable", created_by: "" },
            ],
          },
        });
        await linkSalesChannelsToApiKeyWorkflow(container()).run({
          input: { id: apiKey.id, add: [salesChannel.id] },
        });
        publishableKeyHeaders = {
          headers: { "x-publishable-api-key": apiKey.token },
        };

        const c = cache(container());
        if (c) {
          await c
            .invalidate(voucherConfigCacheKey("CACHEWIRED10"))
            .catch(() => undefined);
        }
      });

      it("populates the Redis config cache on a miss (first apply)", async () => {
        const service = container().resolve(
          VOUCHER_ENGINE_MODULE,
        ) as VoucherEngineService;
        await service.createVoucherConfigs({
          code: "CACHEWIRED10",
          discount_type: "percentage",
          discount_value: 1000,
          valid_from: FAR_PAST,
          valid_to: FAR_FUTURE,
        } as any);

        const cartModuleService = container().resolve(Modules.CART);
        const cart = await cartModuleService.createCarts({
          currency_code: "vnd",
          items: [
            {
              title: "Racket",
              unit_price: 1_000_000,
              quantity: 1,
              product_id: "prod_racket_cachewired",
            },
          ],
        } as any);
        const cartId = (Array.isArray(cart) ? cart[0] : cart).id;

        const { status } = await api.post(
          `/store/carts/${cartId}/voucher`,
          { code: "CACHEWIRED10" },
          publishableKeyHeaders,
        );
        expect(status).toBe(200);

        const c = cache(container());
        expect(c).not.toBeNull();
        const cached = await c!.get<{ code: string; discount_value: number }>(
          voucherConfigCacheKey("CACHEWIRED10"),
        );
        expect(cached).not.toBeNull();
        expect(cached?.code).toBe("CACHEWIRED10");
        expect(cached?.discount_value).toBe(1000);
      });

      it("serves a cache hit even if the DB row is deleted afterward (proves the DB is not re-hit)", async () => {
        const service = container().resolve(
          VOUCHER_ENGINE_MODULE,
        ) as VoucherEngineService;
        const voucher = await service.createVoucherConfigs({
          code: "CACHEHIT20",
          discount_type: "percentage",
          discount_value: 2000,
          valid_from: FAR_PAST,
          valid_to: FAR_FUTURE,
        } as any);

        const cartModuleService = container().resolve(Modules.CART);
        const firstCart = await cartModuleService.createCarts({
          currency_code: "vnd",
          items: [
            {
              title: "Racket",
              unit_price: 1_000_000,
              quantity: 1,
              product_id: "prod_racket_cachehit_1",
            },
          ],
        } as any);
        const firstCartId = (
          Array.isArray(firstCart) ? firstCart[0] : firstCart
        ).id;

        // First apply populates the cache.
        await api.post(
          `/store/carts/${firstCartId}/voucher`,
          { code: "CACHEHIT20" },
          publishableKeyHeaders,
        );

        // Deactivate the DB row directly (bypassing normal admin flow) —
        // if the second apply below still succeeds at 20%, the config came
        // from the cache, not a fresh DB read.
        await service.updateVoucherConfigs({
          id: voucher.id,
          is_active: false,
        } as any);

        const secondCart = await cartModuleService.createCarts({
          currency_code: "vnd",
          items: [
            {
              title: "Racket",
              unit_price: 1_000_000,
              quantity: 1,
              product_id: "prod_racket_cachehit_2",
            },
          ],
        } as any);
        const secondCartId = (
          Array.isArray(secondCart) ? secondCart[0] : secondCart
        ).id;

        const { status, data } = await api.post(
          `/store/carts/${secondCartId}/voucher`,
          { code: "CACHEHIT20" },
          publishableKeyHeaders,
        );
        expect(status).toBe(200);
        expect(data.discount_amount).toBe(200_000); // 20% — the CACHED (still-active) snapshot
      });
    });
  },
});
