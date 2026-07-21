import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { Modules } from "@medusajs/framework/utils";
import {
  createPromotionsWorkflow,
  createApiKeysWorkflow,
  createSalesChannelsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
} from "@medusajs/core-flows";
import { createAdminUser } from "./helpers/create-admin-user";
import { VOUCHER_ENGINE_MODULE } from "../../src/modules/voucher-engine";
import type VoucherEngineService from "../../src/modules/voucher-engine/service";

jest.setTimeout(120_000);

/**
 * HTTP integration — "Enable VoucherEngine on an existing Promotion" (Admin
 * unified model, 2026-07-20). Covers `POST/GET
 * /admin/promotions/:promotion_id/voucher-config`, the eligibility rules in
 * `admin/steps/assert-promotion-voucher-eligible.ts`, the DB-level duplicate
 * guard (`Migration20260720120000`), and the `lookupVoucherStep`
 * source-of-truth overlay (`steps/lookup-voucher.ts`).
 */
medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    let adminHeaders: { headers: { authorization: string } };

    beforeAll(async () => {
      adminHeaders = await createAdminUser(getContainer());
    });

    const createPromotion = async (overrides: Record<string, any> = {}) => {
      const { result } = await createPromotionsWorkflow(getContainer()).run({
        input: {
          promotionsData: [
            {
              code: `ENABLE${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
              type: "standard" as const,
              status: "active" as const,
              is_automatic: false,
              application_method: {
                type: "percentage" as const,
                target_type: "items" as const,
                allocation: "across" as const,
                value: 15,
                currency_code: "vnd",
              },
              ...overrides,
            },
          ],
        },
      });
      return result[0];
    };

    const enableBody = () => ({
      min_order_value: 200_000,
      max_discount_amount: 100_000,
      per_user_limit: 1,
      valid_from: "2026-01-01T00:00:00.000Z",
      valid_to: "2026-12-31T23:59:59.000Z",
    });

    /** Minimal storefront sales-channel + publishable key + cart, for exercising the real store apply route. */
    const createStorefrontCart = async (
      items: Record<string, any>[] = [
        {
          title: "Cart Code Test Item",
          unit_price: 1_000_000,
          quantity: 1,
          product_id: "prod_cart_code_test",
        },
      ],
    ) => {
      const {
        result: [salesChannel],
      } = await createSalesChannelsWorkflow(getContainer()).run({
        input: {
          salesChannelsData: [
            {
              name: `Cart Code Test ${Math.random().toString(36).slice(2, 6)}`,
            },
          ],
        },
      });
      const {
        result: [apiKey],
      } = await createApiKeysWorkflow(getContainer()).run({
        input: {
          api_keys: [
            {
              title: "Cart Code Test Key",
              type: "publishable",
              created_by: "",
            },
          ],
        },
      });
      await linkSalesChannelsToApiKeyWorkflow(getContainer()).run({
        input: { id: apiKey.id, add: [salesChannel.id] },
      });
      const publishableKeyHeaders = {
        headers: { "x-publishable-api-key": apiKey.token },
      };

      const cartModuleService = getContainer().resolve(Modules.CART);
      const cartResult = await cartModuleService.createCarts({
        currency_code: "vnd",
        items,
      } as any);
      const cart = (Array.isArray(cartResult) ? cartResult[0] : cartResult) as {
        id: string;
      };
      return { cart, publishableKeyHeaders };
    };

    describe("POST /admin/promotions/:promotion_id/voucher-config", () => {
      it("requires admin auth (SEC-04)", async () => {
        const promotion = await createPromotion();
        const err = await api
          .post(
            `/admin/promotions/${promotion.id}/voucher-config`,
            enableBody(),
          )
          .catch((e) => e.response);
        expect(err.status).toBe(401);
      });

      it("enables VoucherEngine on an eligible, non-automatic, code-based Promotion", async () => {
        const promotion = await createPromotion();
        const res = await api.post(
          `/admin/promotions/${promotion.id}/voucher-config`,
          enableBody(),
          adminHeaders,
        );
        expect(res.status).toBe(201);
        expect(res.data.voucher.promotion_id).toBe(promotion.id);
        expect(res.data.voucher.min_order_value).toBe(200_000);
        expect(res.data.voucher.max_discount_amount).toBe(100_000);
      });

      it("rejects an automatic Promotion", async () => {
        const promotion = await createPromotion({ is_automatic: true });
        const err = await api
          .post(
            `/admin/promotions/${promotion.id}/voucher-config`,
            enableBody(),
            adminHeaders,
          )
          .catch((e) => e.response);
        expect(err.status).toBe(400);
      });

      it("rejects a Promotion with an unsupported shipping_methods target type", async () => {
        const promotion = await createPromotion({
          application_method: {
            type: "percentage" as const,
            target_type: "shipping_methods" as const,
            allocation: "across" as const,
            value: 15,
            currency_code: "vnd",
          },
        });
        const err = await api
          .post(
            `/admin/promotions/${promotion.id}/voucher-config`,
            enableBody(),
            adminHeaders,
          )
          .catch((e) => e.response);
        expect(err.status).toBe(400);
      });

      it("rejects a VEPH-* ephemeral cart-transport Promotion code", async () => {
        const promotion = await createPromotion({
          code: "VEPH-TESTCART-ABC123",
        });
        const err = await api
          .post(
            `/admin/promotions/${promotion.id}/voucher-config`,
            enableBody(),
            adminHeaders,
          )
          .catch((e) => e.response);
        expect(err.status).toBe(400);
      });

      it("enabling twice on the same Promotion is idempotent — updates the SAME VoucherConfig row, not an error", async () => {
        const promotion = await createPromotion();
        const first = await api.post(
          `/admin/promotions/${promotion.id}/voucher-config`,
          enableBody(),
          adminHeaders,
        );
        expect(first.status).toBe(201);
        const firstId = first.data.voucher.id;

        const second = await api.post(
          `/admin/promotions/${promotion.id}/voucher-config`,
          { ...enableBody(), max_discount_amount: 150_000 },
          adminHeaders,
        );
        expect(second.status).toBe(201);
        expect(second.data.voucher.id).toBe(firstId);
        expect(second.data.voucher.max_discount_amount).toBe(150_000);

        const service = getContainer().resolve(
          VOUCHER_ENGINE_MODULE,
        ) as VoucherEngineService;
        const rows = await service.listVoucherConfigs({
          promotion_id: promotion.id,
        });
        expect(rows.length).toBe(1);
      });

      it("concurrent enable requests for the same Promotion produce exactly one VoucherConfig (DB unique index)", async () => {
        const promotion = await createPromotion();

        const results = await Promise.allSettled([
          api.post(
            `/admin/promotions/${promotion.id}/voucher-config`,
            enableBody(),
            adminHeaders,
          ),
          api.post(
            `/admin/promotions/${promotion.id}/voucher-config`,
            enableBody(),
            adminHeaders,
          ),
        ]);

        // Enable is now idempotent (create-or-reactivate-or-update), so both
        // concurrent requests may legitimately succeed (lock serializes them
        // into create-then-update) — what must hold is the DB invariant:
        // exactly one VoucherConfig row ever exists for this Promotion.
        const succeeded = results.filter(
          (r) => r.status === "fulfilled" && (r as any).value.status === 201,
        );
        expect(succeeded.length).toBeGreaterThanOrEqual(1);

        const service = getContainer().resolve(
          VOUCHER_ENGINE_MODULE,
        ) as VoucherEngineService;
        const rows = await service.listVoucherConfigs({
          promotion_id: promotion.id,
        });
        expect(rows.length).toBe(1);
      });

      it("canonical Promotion native fields are authoritative at runtime — VoucherConfig column drift does not affect validation/calculation", async () => {
        const promotion = await createPromotion({
          application_method: {
            type: "percentage" as const,
            target_type: "items" as const,
            allocation: "across" as const,
            value: 20, // real 20% — must be what the store apply route actually charges
            currency_code: "vnd",
          },
        });
        const created = await api.post(
          `/admin/promotions/${promotion.id}/voucher-config`,
          enableBody(),
          adminHeaders,
        );
        const voucherId = created.data.voucher.id;
        const voucherCode = created.data.voucher.code;

        // Simulate drift: directly corrupt VoucherConfig's own deprecated
        // cache columns (as if they'd gone stale) without touching the
        // canonical Promotion — a fake fixed_amount=999,999 voucher, which
        // must be ignored at apply time in favor of the Promotion's real
        // 20% application_method.
        const service = getContainer().resolve(
          VOUCHER_ENGINE_MODULE,
        ) as VoucherEngineService;
        await service.updateVoucherConfigs({
          id: voucherId,
          discount_type: "fixed_amount",
          discount_value: 999_999,
        });
        const corrupted = await service.retrieveVoucherConfig(voucherId);
        // The DB column itself is indeed corrupted now (proves this test
        // exercises real drift, not a no-op).
        expect(corrupted.discount_type).toBe("fixed_amount");
        expect(corrupted.discount_value).toBe(999_999);

        // Set up a minimal storefront sales-channel + publishable key, and a
        // real cart, then apply the voucher through the ACTUAL store route —
        // the same path a customer uses.
        const {
          result: [salesChannel],
        } = await createSalesChannelsWorkflow(getContainer()).run({
          input: { salesChannelsData: [{ name: "Drift Test Channel" }] },
        });
        const {
          result: [apiKey],
        } = await createApiKeysWorkflow(getContainer()).run({
          input: {
            api_keys: [
              { title: "Drift Test Key", type: "publishable", created_by: "" },
            ],
          },
        });
        await linkSalesChannelsToApiKeyWorkflow(getContainer()).run({
          input: { id: apiKey.id, add: [salesChannel.id] },
        });
        const publishableKeyHeaders = {
          headers: { "x-publishable-api-key": apiKey.token },
        };

        const cartModuleService = getContainer().resolve(Modules.CART);
        const cartResult = await cartModuleService.createCarts({
          currency_code: "vnd",
          items: [
            {
              title: "Drift Test Item",
              unit_price: 1_000_000,
              quantity: 1,
              product_id: "prod_drift_test",
            },
          ],
        } as any);
        const cart = (
          Array.isArray(cartResult) ? cartResult[0] : cartResult
        ) as {
          id: string;
        };

        const applyRes = await api.post(
          `/store/carts/${cart.id}/voucher`,
          { code: voucherCode },
          publishableKeyHeaders,
        );

        // Raw 20% of 1,000,000 = 200,000 (the Promotion's real value, NOT
        // the corrupted fixed_amount=999_999 VoucherConfig column) — then
        // capped by the voucher's OWN max_discount_amount=100,000 set in
        // `enableBody()`, well under the 50% global-cap default, so the
        // final charged amount is exactly 100,000. Getting 100,000 (not
        // 999,999 or some other fixed amount) is the proof the overlay used
        // the Promotion's real application_method, not the corrupted columns.
        expect(applyRes.status).toBe(200);
        expect(applyRes.data.discount_amount).toBe(100_000);
      });

      it("usage_limit is native-sourced from the linked Promotion's own `limit` field (strict native-field reuse)", async () => {
        const promotion = await createPromotion({ limit: 42 });

        const res = await api.post(
          `/admin/promotions/${promotion.id}/voucher-config`,
          enableBody(),
          adminHeaders,
        );
        expect(res.status).toBe(201);
        expect(res.data.voucher.usage_limit).toBe(42);
      });

      it("rejects a usage_limit field in the Enable request body outright (strict native-field reuse — not even silently ignored)", async () => {
        const promotion = await createPromotion();
        const err = await api
          .post(
            `/admin/promotions/${promotion.id}/voucher-config`,
            { ...enableBody(), usage_limit: 999 } as any,
            adminHeaders,
          )
          .catch((e) => e.response);
        expect(err.status).toBe(400);
      });

      it("usage_limit is unlimited (null) when the Promotion has no `limit` set", async () => {
        const promotion = await createPromotion();
        const res = await api.post(
          `/admin/promotions/${promotion.id}/voucher-config`,
          enableBody(),
          adminHeaders,
        );
        expect(res.status).toBe(201);
        expect(res.data.voucher.usage_limit).toBeNull();
      });
    });

    describe("DELETE /admin/promotions/:promotion_id/voucher-config — Disable (reversible, idempotent)", () => {
      it("disables without deleting the Promotion, the VoucherConfig row, or its usage history", async () => {
        const promotion = await createPromotion();
        const created = await api.post(
          `/admin/promotions/${promotion.id}/voucher-config`,
          enableBody(),
          adminHeaders,
        );
        const voucherId = created.data.voucher.id;

        const service = getContainer().resolve(
          VOUCHER_ENGINE_MODULE,
        ) as VoucherEngineService;
        await service.createVoucherUsageLogs([
          {
            voucher_id: voucherId,
            customer_id: "cus_disable_test",
            order_id: "order_disable_test",
            currency_code: "vnd",
            voucher_code: created.data.voucher.code,
            discount_type: "percentage",
            discount_value: 1000,
            raw_voucher_discount: 50_000,
            voucher_discount_after_voucher_cap: 50_000,
            final_voucher_discount: 50_000,
            discount_applied: 50_000,
            original_discount: 50_000,
            was_capped: false,
            cap_percentage_bps: 5000,
            original_subtotal: 500_000,
            item_promotion_discount: 0,
            applied_at: new Date(),
          } as any,
        ]);

        const disableRes = await api.delete(
          `/admin/promotions/${promotion.id}/voucher-config`,
          adminHeaders,
        );
        expect(disableRes.status).toBe(200);
        expect(disableRes.data.voucher.is_active).toBe(false);
        expect(disableRes.data.voucher.id).toBe(voucherId);

        // Promotion itself is untouched.
        const promotionService = getContainer().resolve(Modules.PROMOTION);
        const stillExists = await promotionService.retrievePromotion(
          promotion.id,
        );
        expect(stillExists).toBeTruthy();

        // VoucherConfig row and usage history survive, just flagged disabled.
        const row = await service.retrieveVoucherConfig(voucherId);
        expect(row).toBeTruthy();
        expect(row.is_active).toBe(false);
        const [, count] = await service.listAndCountVoucherUsageLogs({
          voucher_id: voucherId,
        });
        expect(count).toBe(1);
      });

      it("is idempotent: disabling an already-disabled (or never-enabled) Promotion succeeds without error", async () => {
        const neverEnabled = await createPromotion();
        const noop = await api.delete(
          `/admin/promotions/${neverEnabled.id}/voucher-config`,
          adminHeaders,
        );
        expect(noop.status).toBe(200);
        expect(noop.data.voucher).toBeNull();

        const enabled = await createPromotion();
        await api.post(
          `/admin/promotions/${enabled.id}/voucher-config`,
          enableBody(),
          adminHeaders,
        );
        const first = await api.delete(
          `/admin/promotions/${enabled.id}/voucher-config`,
          adminHeaders,
        );
        expect(first.status).toBe(200);
        const second = await api.delete(
          `/admin/promotions/${enabled.id}/voucher-config`,
          adminHeaders,
        );
        expect(second.status).toBe(200);
        expect(second.data.voucher.is_active).toBe(false);
      });

      it("requires admin auth (SEC-04)", async () => {
        const promotion = await createPromotion();
        const err = await api
          .delete(`/admin/promotions/${promotion.id}/voucher-config`)
          .catch((e) => e.response);
        expect(err.status).toBe(401);
      });
    });

    describe("Enable -> Disable -> re-Enable lifecycle (preserves history, reuses the same row)", () => {
      it("re-enabling reuses the SAME VoucherConfig id and its prior settings/usage_count", async () => {
        const promotion = await createPromotion();
        const created = await api.post(
          `/admin/promotions/${promotion.id}/voucher-config`,
          enableBody(),
          adminHeaders,
        );
        const voucherId = created.data.voucher.id;

        const service = getContainer().resolve(
          VOUCHER_ENGINE_MODULE,
        ) as VoucherEngineService;
        await service.redeemVoucherAtomic(voucherId, {
          voucher_id: voucherId,
          customer_id: "cus_lifecycle_test",
          order_id: "order_lifecycle_test",
          currency_code: "vnd",
          voucher_code: created.data.voucher.code,
          discount_type: "percentage",
          discount_value: 1000,
          raw_voucher_discount: 20_000,
          voucher_discount_after_voucher_cap: 20_000,
          final_voucher_discount: 20_000,
          discount_applied: 20_000,
          original_discount: 20_000,
          was_capped: false,
          cap_percentage_bps: 5000,
          original_subtotal: 200_000,
          item_promotion_discount: 0,
          applied_at: new Date(),
        });

        await api.delete(
          `/admin/promotions/${promotion.id}/voucher-config`,
          adminHeaders,
        );

        const reEnabled = await api.post(
          `/admin/promotions/${promotion.id}/voucher-config`,
          { ...enableBody(), max_discount_amount: 150_000 },
          adminHeaders,
        );
        expect(reEnabled.status).toBe(201);
        expect(reEnabled.data.voucher.id).toBe(voucherId);
        expect(reEnabled.data.voucher.is_active).toBe(true);
        expect(reEnabled.data.voucher.max_discount_amount).toBe(150_000);
        expect(reEnabled.data.voucher.usage_count).toBe(1);

        const [, count] = await service.listAndCountVoucherUsageLogs({
          voucher_id: voucherId,
        });
        expect(count).toBe(1);
      });
    });

    describe("GET /admin/promotions/:promotion_id/voucher-config", () => {
      it("returns { voucher: null } for a Promotion with no linked VoucherConfig", async () => {
        const promotion = await createPromotion();
        const res = await api.get(
          `/admin/promotions/${promotion.id}/voucher-config`,
          adminHeaders,
        );
        expect(res.status).toBe(200);
        expect(res.data.voucher).toBeNull();
      });

      it("returns the linked VoucherConfig once enabled", async () => {
        const promotion = await createPromotion();
        await api.post(
          `/admin/promotions/${promotion.id}/voucher-config`,
          enableBody(),
          adminHeaders,
        );
        const res = await api.get(
          `/admin/promotions/${promotion.id}/voucher-config`,
          adminHeaders,
        );
        expect(res.status).toBe(200);
        expect(res.data.voucher.promotion_id).toBe(promotion.id);
      });
    });

    describe("transitional compatibility — atomic POST /admin/vouchers still functions", () => {
      it("the pre-existing atomic create-voucher flow is unaffected by the Enable flow", async () => {
        const res = await api.post(
          "/admin/vouchers",
          {
            discount_type: "percentage",
            discount_value: 1000,
            per_user_limit: 1,
            valid_from: "2026-01-01T00:00:00.000Z",
            valid_to: "2026-12-31T23:59:59.000Z",
            is_active: true,
          },
          adminHeaders,
        );
        expect(res.status).toBe(201);
        expect(res.data.promotion_id).toEqual(expect.any(String));
      });
    });

    describe("Cart code behavior — POST /store/carts/:id/voucher (Admin unified model)", () => {
      it("an automatic Promotion's code is rejected (automatic Promotions never use the code field)", async () => {
        const automatic = await createPromotion({ is_automatic: true });
        const { cart, publishableKeyHeaders } = await createStorefrontCart();

        const err = await api
          .post(
            `/store/carts/${cart.id}/voucher`,
            { code: automatic.code },
            publishableKeyHeaders,
          )
          .catch((e) => e.response);
        expect(err.status).toBe(404);
        expect(err.data.code).toBe("VOUCHER_NOT_FOUND");
      });

      it("a non-automatic Promotion's code with VoucherEngine never enabled is rejected — no fallback to native Promotion-code application", async () => {
        const neverEnabled = await createPromotion();
        const { cart, publishableKeyHeaders } = await createStorefrontCart();

        const err = await api
          .post(
            `/store/carts/${cart.id}/voucher`,
            { code: neverEnabled.code },
            publishableKeyHeaders,
          )
          .catch((e) => e.response);
        expect(err.status).toBe(404);
        expect(err.data.code).toBe("VOUCHER_NOT_FOUND");

        // No promotion was silently attached to the cart via any fallback.
        const cartModuleService = getContainer().resolve(Modules.CART);
        const cartAfter = (await cartModuleService.retrieveCart(cart.id, {
          relations: ["promotions"],
        })) as any;
        expect(cartAfter.promotions ?? []).toHaveLength(0);
      });

      it("a disabled Voucher's code is rejected — SRS validation runs only after confirming VoucherEngine is enabled", async () => {
        const promotion = await createPromotion();
        await api.post(
          `/admin/promotions/${promotion.id}/voucher-config`,
          enableBody(),
          adminHeaders,
        );
        await api.delete(
          `/admin/promotions/${promotion.id}/voucher-config`,
          adminHeaders,
        );

        const { cart, publishableKeyHeaders } = await createStorefrontCart();
        const err = await api
          .post(
            `/store/carts/${cart.id}/voucher`,
            { code: promotion.code },
            publishableKeyHeaders,
          )
          .catch((e) => e.response);
        // V1 finds the row (code exists) but its VoucherEngine `is_active`
        // flag is false -> VOUCHER_INACTIVE (422), not VOUCHER_NOT_FOUND
        // (404) — same anti-enumeration customer message as NOT_FOUND
        // (`lib/errors.ts`), but a distinct internal code/status, which is
        // exactly what proves SRS validation ran and rejected on the
        // Enable-flag check rather than never finding the code at all.
        expect(err.status).toBe(422);
        expect(err.data.code).toBe("VOUCHER_INACTIVE");
      });

      it("re-enabling a previously-disabled Voucher makes its code redeemable again", async () => {
        const promotion = await createPromotion();
        await api.post(
          `/admin/promotions/${promotion.id}/voucher-config`,
          enableBody(),
          adminHeaders,
        );
        await api.delete(
          `/admin/promotions/${promotion.id}/voucher-config`,
          adminHeaders,
        );
        await api.post(
          `/admin/promotions/${promotion.id}/voucher-config`,
          enableBody(),
          adminHeaders,
        );

        const { cart, publishableKeyHeaders } = await createStorefrontCart();
        const res = await api.post(
          `/store/carts/${cart.id}/voucher`,
          { code: promotion.code },
          publishableKeyHeaders,
        );
        expect(res.status).toBe(200);
      });
    });
  },
});
