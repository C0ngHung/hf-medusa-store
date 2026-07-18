/**
 * HTTP integration — guardrail blocking voucher codes on the NATIVE
 * `POST /store/carts/:id/promotions` route (Task 3, spec §5).
 *
 * Vouchers are backed by a real Medusa Promotion (Task 1,
 * `build-backing-promotion.ts`, flagged `metadata.voucher_engine === true`).
 * Without this guard a client could attach that code directly through the
 * native route, bypassing V1–V8/cap/rate-limit and reviving the Rule-11
 * stacking bug. `block-voucher-promotion.ts` inspects `promo_codes` against
 * `metadata.voucher_engine` and 400s before Medusa's own promotion-attach
 * workflow runs; a normal (non-voucher) promotion code is unaffected.
 */
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { Modules } from "@medusajs/framework/utils";
import {
  createApiKeysWorkflow,
  createPromotionsWorkflow,
  createSalesChannelsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
} from "@medusajs/medusa/core-flows";
import { createVoucherWorkflow } from "../../src/workflows/voucher-engine/admin/create-voucher";

jest.setTimeout(60_000);
// Known infra flake (not an assertion failure) — see
// .claude/lessons/voucher-engine/2026-07-14-redis-bullmq-teardown-race.md.
jest.retryTimes(2);

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api }) => {
    describe("POST /store/carts/:id/promotions — voucher-code guardrail (Task 3)", () => {
      const FAR_PAST = new Date("2020-01-01T00:00:00Z");
      const FAR_FUTURE = new Date("2999-01-01T00:00:00Z");
      let publishableKeyHeaders: { headers: Record<string, string> };
      let cart: { id: string };

      function container() {
        return getContainer();
      }

      // `beforeEach`, not `beforeAll`: medusaIntegrationTestRunner resets the
      // DB between tests in the same file (see apply-remove-voucher.spec.ts),
      // so the sales-channel/publishable-key/cart fixtures must be recreated
      // before every test.
      beforeEach(async () => {
        const {
          result: [salesChannel],
        } = await createSalesChannelsWorkflow(container()).run({
          input: { salesChannelsData: [{ name: "Guard Test Channel" }] },
        });
        const {
          result: [apiKey],
        } = await createApiKeysWorkflow(container()).run({
          input: {
            api_keys: [
              {
                title: "Guard Test Key",
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
        const createdCart = await cartModuleService.createCarts({
          currency_code: "vnd",
          sales_channel_id: salesChannel.id,
          // GUARD10's backing Promotion carries a per-user-limit campaign
          // budget keyed on the `customer_id` attribute (build-backing-
          // promotion.ts) — the native attach workflow needs a customer_id
          // on the cart to evaluate that budget rule at all, independent of
          // this guardrail.
          customer_id: "cus_guard_test",
          items: [{ title: "Racket", unit_price: 1_000_000, quantity: 1 }],
        } as any);
        cart = (Array.isArray(createdCart) ? createdCart[0] : createdCart) as {
          id: string;
        };

        // A voucher-flagged backing Promotion (Task 1) — GUARD10.
        await createVoucherWorkflow(container()).run({
          input: {
            code: "GUARD10",
            discount_type: "percentage",
            discount_value: 1000, // 10%
            stackable_with_promotions: true,
            per_user_limit: 1,
            valid_from: FAR_PAST,
            valid_to: FAR_FUTURE,
            is_active: true,
          } as any,
        });

        // A plain (non-voucher) promotion — RACKET2M.
        await createPromotionsWorkflow(container()).run({
          input: {
            promotionsData: [
              {
                code: "RACKET2M",
                type: "standard",
                status: "active",
                application_method: {
                  type: "fixed",
                  target_type: "items",
                  allocation: "across",
                  value: 100_000,
                  currency_code: "vnd",
                },
              },
            ],
          },
        });
      });

      it("rejects a voucher code sent to the native cart-promotions route", async () => {
        const res = await api
          .post(
            `/store/carts/${cart.id}/promotions`,
            { promo_codes: ["GUARD10"] },
            publishableKeyHeaders,
          )
          .catch((e) => e.response);
        // Canonical VoucherEngine `ErrorEnvelope` shape (lib/errors.ts), hand-mirrored
        // by this middleware short-circuit (same pattern as voucher-rate-limit.ts):
        // `customer_message` (VI) is what the storefront renders; `message` (EN) is
        // log-only; `type`/`code` let the FE branch without parsing text. 422 (not
        // 400) matches the V1–V8 client-input-policy-violation family in errors.ts.
        expect(res.status).toBe(422);
        expect(res.data.type).toBe("invalid_data");
        expect(res.data.code).toBe("VOUCHER_CODE_NOT_A_PROMOTION");
        expect(res.data.message).toMatch(/voucher/i);
        expect(res.data.customer_message).toContain(
          "Mã này là voucher — vui lòng nhập ở ô mã voucher.",
        );
      });

      it("still allows a normal (non-voucher) promotion code", async () => {
        const res = await api.post(
          `/store/carts/${cart.id}/promotions`,
          { promo_codes: ["RACKET2M"] },
          publishableKeyHeaders,
        );
        expect(res.status).toBe(200);
      });
    });
  },
});
