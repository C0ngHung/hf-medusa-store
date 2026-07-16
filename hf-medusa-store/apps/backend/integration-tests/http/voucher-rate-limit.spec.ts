/**
 * Store voucher apply — brute-force rate limit (SEC-02/EC-10, tasks 3.7.3–3.7.5).
 *
 * Exercises the REAL `POST /store/carts/:id/voucher` route end-to-end: 5
 * failed attempts (a syntactically-valid but nonexistent code) within the
 * 15-min window must 429 the 6th, with the shared ErrorEnvelope contract.
 *
 * Defensively invalidates the rate-limit keys for the local loopback
 * addresses before each test — this suite's counters live in the REAL Redis
 * instance (not reset between test files like the Postgres DB is), so a
 * previous run of this exact file within the last 30 minutes would otherwise
 * leave a stale cooldown armed and break the "first 5 attempts still 404"
 * assertion.
 */
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import {
  createApiKeysWorkflow,
  createSalesChannelsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
} from "@medusajs/medusa/core-flows";
import { Modules } from "@medusajs/framework/utils";
import { cache, failKey, cooldownKey } from "../../src/lib/voucher-cache";

jest.setTimeout(60_000);
jest.retryTimes(2);

const LOOPBACK_CANDIDATES = ["127.0.0.1", "::1", "::ffff:127.0.0.1"];

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api }) => {
    describe("POST /store/carts/:id/voucher — rate limit (SEC-02/EC-10)", () => {
      function container() {
        return getContainer();
      }

      let publishableKeyHeaders: { headers: Record<string, string> };
      let cartId: string;

      beforeEach(async () => {
        const c = cache(container());
        if (c) {
          for (const ip of LOOPBACK_CANDIDATES) {
            await c.invalidate(failKey(null, ip)).catch(() => undefined);
            await c.invalidate(cooldownKey(null, ip)).catch(() => undefined);
          }
        }

        const {
          result: [salesChannel],
        } = await createSalesChannelsWorkflow(container()).run({
          input: { salesChannelsData: [{ name: "Rate Limit Test Channel" }] },
        });
        const {
          result: [apiKey],
        } = await createApiKeysWorkflow(container()).run({
          input: {
            api_keys: [
              {
                title: "Rate Limit Test Key",
                type: "publishable",
                created_by: "",
              },
            ],
          },
        });
        await linkSalesChannelsToApiKeyWorkflow(container()).run({
          input: { id: apiKey.id, add: [salesChannel.id] },
        });
        publishableKeyHeaders = {
          headers: { "x-publishable-api-key": apiKey.token },
        };

        const cartModuleService = container().resolve(Modules.CART);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cart = await cartModuleService.createCarts({
          currency_code: "vnd",
        } as any);
        cartId = (Array.isArray(cart) ? cart[0] : cart).id;
      });

      it("returns 429 after 5 failed attempts and matches the shared ErrorEnvelope contract", async () => {
        for (let i = 0; i < 5; i++) {
          const res = await api
            .post(
              `/store/carts/${cartId}/voucher`,
              { code: "NOTREAL123" },
              publishableKeyHeaders,
            )
            .catch((e) => e.response);
          expect(res.status).toBe(404);
        }

        const blocked = await api
          .post(
            `/store/carts/${cartId}/voucher`,
            { code: "NOTREAL123" },
            publishableKeyHeaders,
          )
          .catch((e) => e.response);
        expect(blocked.status).toBe(429);
        expect(blocked.data).toMatchObject({
          type: "rate_limited",
          code: "VOUCHER_RATE_LIMITED",
          customer_message:
            "Bạn đã thử quá nhiều lần. Vui lòng thử lại sau 30 phút.",
        });
      });
    });
  },
});
