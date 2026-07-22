/**
 * Store voucher apply/remove — REAL HTTP integration (SPEC §23.5, Decision E/G;
 * tasks 3.4.1, 3.4.2, 3.4.6, 3.4.7, 3.4.8, 3.4.10, 3.4.14, 3.5.1/3.5.7/3.5.8).
 *
 * Exercises the actual `POST`/`DELETE /store/carts/:id/voucher` routes (not
 * just the workflow directly) against a real seeded Cart, boots the full app
 * via `medusaIntegrationTestRunner`. Covers: tamper rejection (SEC-01), a
 * real apply carrying the discount on a `cart.credit_lines` entry and
 * reconciling `updated_cart_total`, the one-active-voucher replace-confirmation gate
 * (409 → `?replace=true`), and remove (idempotent, no usage increment).
 *
 * Store routes require a publishable API key (`x-publishable-api-key`
 * header) — this test's disposable DB has no catalog seed, so a minimal
 * sales-channel + publishable-key pair is created once in `beforeAll` via the
 * same core workflows the repo's own `initial-data-seed.ts` uses.
 */
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { Modules, PromotionActions } from "@medusajs/framework/utils";
import {
  createApiKeysWorkflow,
  createPromotionsWorkflow,
  createSalesChannelsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  updateCartPromotionsWorkflow,
} from "@medusajs/medusa/core-flows";
import { VOUCHER_ENGINE_MODULE } from "../../src/modules/voucher-engine";
import type VoucherEngineService from "../../src/modules/voucher-engine/service";

jest.setTimeout(60_000);
// Known infra flake (not an assertion failure) — see
// .claude/lessons/voucher-engine/2026-07-14-redis-bullmq-teardown-race.md.
// Absorbs the Redis/BullMQ teardown race between heavy full-app tests in the
// same file; a genuinely broken assertion still fails identically on retry.
jest.retryTimes(2);

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api }) => {
    describe("POST/DELETE /store/carts/:id/voucher (real HTTP, tasks 3.4.x/3.5.x)", () => {
      const FAR_PAST = new Date("2020-01-01T00:00:00Z");
      const FAR_FUTURE = new Date("2999-01-01T00:00:00Z");
      let publishableKeyHeaders: { headers: Record<string, string> };

      function container() {
        return getContainer();
      }

      // `beforeEach`, not `beforeAll`: `medusaIntegrationTestRunner` resets
      // the database between tests in the same file (verified empirically —
      // a publishable key created in `beforeAll` was gone by the second
      // test), so the sales-channel + publishable-key pair must be recreated
      // before every test, not once for the whole suite.
      beforeEach(async () => {
        const {
          result: [salesChannel],
        } = await createSalesChannelsWorkflow(container()).run({
          input: { salesChannelsData: [{ name: "Voucher Test Channel" }] },
        });
        const {
          result: [apiKey],
        } = await createApiKeysWorkflow(container()).run({
          input: {
            api_keys: [
              {
                title: "Voucher Test Key",
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

      async function createVoucher(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        overrides: Record<string, any>,
      ) {
        const service = container().resolve(
          VOUCHER_ENGINE_MODULE,
        ) as VoucherEngineService;
        return service.createVoucherConfigs({
          valid_from: FAR_PAST,
          valid_to: FAR_FUTURE,
          ...overrides,
        } as any);
      }

      it("rejects a body containing pricing/identity fields with 400 (strict rejection, SEC-01 tamper test)", async () => {
        const cart = await createCart([
          { title: "Racket", unit_price: 1_000_000, quantity: 1 },
        ]);

        await expect(
          api.post(
            `/store/carts/${cart.id}/voucher`,
            {
              code: "TAMPER10",
              discount_amount: 999_999,
              cart_id: "some-other-cart",
            },
            publishableKeyHeaders,
          ),
        ).rejects.toMatchObject({
          response: { status: 400 },
        });
      });

      it("applies a valid voucher: carries the discount on a credit line and returns the authoritative cart total (tasks 3.4.1/3.4.4/3.4.14)", async () => {
        const cart = await createCart([
          {
            title: "Racket",
            unit_price: 1_000_000,
            quantity: 1,
            product_id: "prod_racket_http",
          },
        ]);
        await createVoucher({
          code: "HTTPAPPLY10",
          discount_type: "percentage",
          discount_value: 1000, // 10%
        });

        const { status, data } = await api.post(
          `/store/carts/${cart.id}/voucher`,
          { code: "httpapply10" }, // lowercase on purpose — normalized server-side
          publishableKeyHeaders,
        );

        expect(status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.discount_amount).toBe(100_000);
        expect(data.discount_capped).toBe(false);
        expect(data.cap_explanation).toBeNull();
        expect(data.updated_cart_total).toBe(900_000);
        expect(data.voucher_details.code).toBe("HTTPAPPLY10");
        expect(data.voucher_details.type).toBe("percentage");
        expect(data.voucher_details.value).toBe(1000);
      });

      it("applies a voucher on a cart that already has a paid shipping method — 2026-07-21 bug fix regression (voucher+shipping interaction)", async () => {
        // Bug found this session: `verify-cart-totals.ts` compared Medusa's
        // real, shipping-inclusive `cart.total` against an oracle computed
        // purely from item subtotal, so applying/replacing a voucher on any
        // cart with a non-zero shipping fee always threw
        // VOUCHER_CALCULATION_FAILED. Fixed by threading `shipping_total`
        // into `calculateVoucherDiscount`'s oracle (never discounted, never
        // capped — see lib/calculate-discount.ts).
        const cart = await createCart([
          {
            title: "Racket",
            unit_price: 1_000_000,
            quantity: 1,
            product_id: "prod_racket_shipping",
          },
        ]);
        const cartModuleService = container().resolve(Modules.CART);
        await cartModuleService.addShippingMethods(cart.id, [
          { name: "Standard Shipping", amount: 30_000 },
        ]);
        await createVoucher({
          code: "SHIPHTTP10",
          discount_type: "percentage",
          discount_value: 1000, // 10%
        });

        const { status, data } = await api.post(
          `/store/carts/${cart.id}/voucher`,
          { code: "SHIPHTTP10" },
          publishableKeyHeaders,
        );

        // voucher 10% of 1,000,000 = 100,000; total = 1,000,000 - 100,000 +
        // 30,000 shipping = 930,000 (shipping never discounted/capped).
        expect(status).toBe(200);
        expect(data.discount_amount).toBe(100_000);
        expect(data.updated_cart_total).toBe(930_000);
      });

      it("preserves a coexisting percentage item-promotion's discount when a voucher is applied on top — Rule 11 regression (credit-line carrier, CONFLICT-8/PD-15 fix)", async () => {
        const cart = await createCart([
          {
            title: "Racket",
            unit_price: 1_000_000,
            quantity: 1,
            product_id: "prod_racket_rule11",
          },
        ]);

        // A coexisting item-level PERCENTAGE promotion (40%) — the exact case
        // the former ephemeral-fixed-Promotion carrier corrupted: it re-sorted
        // and re-compounded through `computeActions`, shrinking THIS
        // promotion's own adjustment. The credit-line carrier never enters
        // `computeActions`, so it cannot.
        await createPromotionsWorkflow(container()).run({
          input: {
            promotionsData: [
              {
                code: "ITEMPROMO40",
                type: "standard",
                status: "active",
                application_method: {
                  type: "percentage",
                  target_type: "items",
                  allocation: "across",
                  value: 40,
                  currency_code: "vnd",
                },
              },
            ],
          },
        });
        await updateCartPromotionsWorkflow(container()).run({
          input: {
            cart_id: cart.id,
            promo_codes: ["ITEMPROMO40"],
            action: PromotionActions.ADD,
          },
        });

        await createVoucher({
          code: "STACK20",
          discount_type: "percentage",
          discount_value: 2000, // 20%
        });

        const { status, data } = await api.post(
          `/store/carts/${cart.id}/voucher`,
          { code: "STACK20" },
          publishableKeyHeaders,
        );

        // item promo 40% = 400,000; voucher 20% of the eligible post-promo
        // subtotal (600,000) = 120,000; combined 520,000 > 50% cap (500,000);
        // voucher trimmed to the remaining cap capacity (100,000); total 500,000.
        expect(status).toBe(200);
        expect(data.discount_amount).toBe(100_000);
        expect(data.discount_capped).toBe(true);
        expect(data.updated_cart_total).toBe(500_000);

        // THE Rule-11 proof: the item promotion's OWN adjustment is UNCHANGED
        // (400,000) — never shrunk by the voucher.
        const cartModuleService = container().resolve(Modules.CART);
        const reloaded = await cartModuleService.retrieveCart(cart.id, {
          select: ["id", "total", "credit_line_total"],
          relations: ["items", "items.adjustments", "credit_lines"],
        });
        const itemAdjustmentTotal = (
          (reloaded.items ?? []) as { adjustments?: { amount: unknown }[] }[]
        )
          .flatMap((item) => item.adjustments ?? [])
          .reduce((sum, adj) => sum + Number(adj.amount), 0);
        expect(itemAdjustmentTotal).toBe(400_000);

        // The voucher discount lives on a credit line of exactly 100,000.
        const creditLineTotal = (
          (reloaded.credit_lines ?? []) as { amount: unknown }[]
        ).reduce((sum, cl) => sum + Number(cl.amount), 0);
        expect(creditLineTotal).toBe(100_000);
        expect(Number(reloaded.total)).toBe(500_000);
      });

      it("returns 409 VOUCHER_REPLACE_REQUIRED when applying a second voucher without ?replace=true (tasks 3.4.6/3.4.7)", async () => {
        const cart = await createCart([
          {
            title: "Racket",
            unit_price: 1_000_000,
            quantity: 1,
            product_id: "prod_racket_replace",
          },
        ]);
        await createVoucher({
          code: "FIRSTVOUCHER",
          discount_type: "percentage",
          discount_value: 1000,
        });
        await createVoucher({
          code: "SECONDVOUCHER",
          discount_type: "percentage",
          discount_value: 2000,
        });

        await api.post(
          `/store/carts/${cart.id}/voucher`,
          { code: "FIRSTVOUCHER" },
          publishableKeyHeaders,
        );

        await expect(
          api.post(
            `/store/carts/${cart.id}/voucher`,
            { code: "SECONDVOUCHER" },
            publishableKeyHeaders,
          ),
        ).rejects.toMatchObject({
          response: {
            status: 409,
            data: expect.objectContaining({
              code: "VOUCHER_REPLACE_REQUIRED",
              type: "conflict",
              details: { current_code: "FIRSTVOUCHER" },
            }),
          },
        });

        // Confirming with ?replace=true swaps the voucher (task 3.4.8).
        const { status, data } = await api.post(
          `/store/carts/${cart.id}/voucher?replace=true`,
          { code: "SECONDVOUCHER" },
          publishableKeyHeaders,
        );
        expect(status).toBe(200);
        expect(data.voucher_details.code).toBe("SECONDVOUCHER");
        expect(data.discount_amount).toBe(200_000); // 20% of 1,000,000
      });

      it("returns 404 VOUCHER_NOT_FOUND (not 409 VOUCHER_REPLACE_REQUIRED) for a nonexistent code while a voucher is already active", async () => {
        const cart = await createCart([
          {
            title: "Racket",
            unit_price: 1_000_000,
            quantity: 1,
            product_id: "prod_racket_notfound_order",
          },
        ]);
        await createVoucher({
          code: "ACTIVEVOUCHER",
          discount_type: "percentage",
          discount_value: 1000,
        });

        await api.post(
          `/store/carts/${cart.id}/voucher`,
          { code: "ACTIVEVOUCHER" },
          publishableKeyHeaders,
        );

        // Syntactically valid (passes the Zod shape check) but no matching
        // row — must 404 (V1), never 409 (the replace-confirmation gate must
        // not even be reached for a code that was never valid).
        await expect(
          api.post(
            `/store/carts/${cart.id}/voucher`,
            { code: "NOTREALCODE1" },
            publishableKeyHeaders,
          ),
        ).rejects.toMatchObject({
          response: {
            status: 404,
            data: expect.objectContaining({ code: "VOUCHER_NOT_FOUND" }),
          },
        });
      });

      it("removes an applied voucher: reverts the cart total and does not increment usage_count (tasks 3.4.2/3.4.10)", async () => {
        const cart = await createCart([
          {
            title: "Racket",
            unit_price: 1_000_000,
            quantity: 1,
            product_id: "prod_racket_remove",
          },
        ]);
        const voucher = await createVoucher({
          code: "REMOVEME10",
          discount_type: "percentage",
          discount_value: 1000,
        });

        await api.post(
          `/store/carts/${cart.id}/voucher`,
          { code: "REMOVEME10" },
          publishableKeyHeaders,
        );

        const { status, data } = await api.delete(
          `/store/carts/${cart.id}/voucher`,
          publishableKeyHeaders,
        );

        expect(status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.updated_cart_total).toBe(1_000_000);
        expect(data.message).toBe("Đã gỡ mã giảm giá.");

        const service = container().resolve(
          VOUCHER_ENGINE_MODULE,
        ) as VoucherEngineService;
        const reloaded = await service.retrieveVoucherConfig(
          (voucher as { id: string }).id,
        );
        expect(reloaded.usage_count).toBe(0); // Rule 12 — apply/remove never touches usage_count

        // `cart.metadata.voucher` must actually be cleared, not just left
        // stale (regression check: `CartModuleService.updateCarts`'s
        // `metadata` patch is a merge, not a replace — a patch that merely
        // OMITS the `voucher` key is a no-op for it; only an explicit `""`
        // value deletes it — see the fix in `remove-voucher.ts`).
        const cartModuleService = container().resolve(Modules.CART);
        const reloadedCart = await cartModuleService.retrieveCart(cart.id, {
          select: ["id", "metadata"],
        });
        expect(
          (reloadedCart.metadata as Record<string, unknown> | null)?.voucher,
        ).toBeUndefined();
      });

      it("removing when no voucher is active is a 200 idempotent no-op (API_CONTRACT §1.3)", async () => {
        const cart = await createCart([
          { title: "Grip", unit_price: 50_000, quantity: 1 },
        ]);

        const { status, data } = await api.delete(
          `/store/carts/${cart.id}/voucher`,
          publishableKeyHeaders,
        );
        expect(status).toBe(200);
        expect(data.success).toBe(true);
      });

      it("allows applying the same per_user_limit=1 voucher again in the same session after removing it — usage is only consumed at order placement (SRS §8 EC-06)", async () => {
        const cart = await createCart([
          {
            title: "Racket",
            unit_price: 1_000_000,
            quantity: 1,
            product_id: "prod_racket_ec06",
          },
        ]);
        await createVoucher({
          code: "REAPPLY10",
          discount_type: "percentage",
          discount_value: 1000, // 10%
          per_user_limit: 1,
        });

        const first = await api.post(
          `/store/carts/${cart.id}/voucher`,
          { code: "REAPPLY10" },
          publishableKeyHeaders,
        );
        expect(first.status).toBe(200);

        const removed = await api.delete(
          `/store/carts/${cart.id}/voucher`,
          publishableKeyHeaders,
        );
        expect(removed.status).toBe(200);

        // Re-apply in the same session: per_user_limit=1 must NOT block this,
        // because usage_count/VoucherUsageLog are only written by
        // recordVoucherUsageWorkflow on order.placed — never on apply/remove.
        const second = await api.post(
          `/store/carts/${cart.id}/voucher`,
          { code: "REAPPLY10" },
          publishableKeyHeaders,
        );
        expect(second.status).toBe(200);
        expect(second.data.discount_amount).toBe(100_000);
      });
    });
  },
});
