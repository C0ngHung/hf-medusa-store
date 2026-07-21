/**
 * GET /store/vouchers — public "available vouchers" (2026-07-21).
 *
 * The whole point of this route is to be reachable by a GUEST over real
 * HTTP, unlike `GET /store/customers/me/vouchers` (blocked for guests by
 * Medusa's own core `/store/customers/me/*` middleware — see
 * `my-vouchers.spec.ts`'s skipped test). This file proves that over a real
 * HTTP request, not a direct handler call.
 */
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import {
  createApiKeysWorkflow,
  createSalesChannelsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  createCustomersWorkflow,
  createCustomerGroupsWorkflow,
  linkCustomerGroupsToCustomerWorkflow,
} from "@medusajs/medusa/core-flows";
import {
  createPromotionsWorkflow,
  updateCartPromotionsWorkflow,
} from "@medusajs/core-flows";
import { Modules, PromotionActions } from "@medusajs/framework/utils";
import { VOUCHER_ENGINE_MODULE } from "../../src/modules/voucher-engine";
import type VoucherEngineService from "../../src/modules/voucher-engine/service";
import { GET as getStoreVouchers } from "../../src/api/store/vouchers/route";

jest.setTimeout(60_000);
jest.retryTimes(2);

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api }) => {
    describe("GET /store/vouchers (public, auth-optional)", () => {
      const FAR_PAST = new Date("2020-01-01T00:00:00Z");
      const FAR_FUTURE = new Date("2999-01-01T00:00:00Z");
      let publishableKeyHeaders: { headers: Record<string, string> };

      function container() {
        return getContainer();
      }

      beforeEach(async () => {
        const {
          result: [salesChannel],
        } = await createSalesChannelsWorkflow(container()).run({
          input: {
            salesChannelsData: [{ name: "Store Vouchers Test Channel" }],
          },
        });
        const {
          result: [apiKey],
        } = await createApiKeysWorkflow(container()).run({
          input: {
            api_keys: [
              {
                title: "Store Vouchers Test Key",
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
          discount_type: "percentage",
          discount_value: 1000,
          ...overrides,
        } as any);
      }

      it("guest (no auth header, no login) sees an unrestricted voucher over real HTTP — the bug this route fixes", async () => {
        await createVoucher({
          code: "PUBLIC10",
          user_segment_conditions: null,
        });

        const response = await api.get(
          "/store/vouchers",
          publishableKeyHeaders,
        );

        expect(response.status).toBe(200);
        const codes = (response.data.vouchers as { code: string }[]).map(
          (v) => v.code,
        );
        expect(codes).toContain("PUBLIC10");
      });

      it("guest never sees a voucher gated to a Customer Group (fails closed, no identity to check)", async () => {
        const [vipGroup] = await createCustomerGroupsWorkflow(container())
          .run({ input: { customersData: [{ name: "Store-Vouchers-VIP" }] } })
          .then((r) => r.result);

        await createVoucher({
          code: "GUESTHIDDEN20",
          user_segment_conditions: { customer_group_ids: [vipGroup.id] },
        });

        const response = await api.get(
          "/store/vouchers",
          publishableKeyHeaders,
        );

        expect(response.status).toBe(200);
        const codes = (response.data.vouchers as { code: string }[]).map(
          (v) => v.code,
        );
        expect(codes).not.toContain("GUESTHIDDEN20");
      });

      it("an authenticated customer additionally sees a voucher gated to a group they belong to", async () => {
        const [customer] = await createCustomersWorkflow(container())
          .run({
            input: {
              customersData: [
                {
                  email: "store-vouchers-vip@example.com",
                  first_name: "Store",
                  last_name: "VoucherVip",
                },
              ],
            },
          })
          .then((r) => r.result);

        const [vipGroup] = await createCustomerGroupsWorkflow(container())
          .run({ input: { customersData: [{ name: "Store-Vouchers-VIP-2" }] } })
          .then((r) => r.result);

        await linkCustomerGroupsToCustomerWorkflow(container()).run({
          input: { id: customer.id, add: [vipGroup.id] },
        });

        await createVoucher({
          code: "OPENFORALL30",
          user_segment_conditions: null,
        });
        await createVoucher({
          code: "VIPGATED30",
          discount_value: 3000,
          user_segment_conditions: { customer_group_ids: [vipGroup.id] },
        });

        // Direct handler invocation for the authenticated case — same
        // rationale/pattern as `my-vouchers.spec.ts`: this repo has no
        // customer-JWT-auth test harness, so `req.auth_context` is
        // hand-built while the container/DB reads underneath stay real.
        const req = {
          scope: container(),
          auth_context: { actor_id: customer.id },
          query: {},
        } as any;
        const res: any = {};
        res.json = jest.fn().mockReturnValue(res);
        await getStoreVouchers(req, res);

        const body = res.json.mock.calls[0][0] as {
          vouchers: { code: string }[];
        };
        const codes = body.vouchers.map((v) => v.code).sort();
        expect(codes).toEqual(["OPENFORALL30", "VIPGATED30"]);
      });

      // Bug-bash fix, 2026-07-21: `loadPreviewLines` used to hardcode
      // `item_promotion_discount: 0`, so `estimated_savings` was computed
      // against the cart's FULL original subtotal even when a real automatic
      // Promotion already discounted it — overstating what the voucher would
      // actually contribute once the fixed "item promo first, then voucher on
      // the remainder" order runs for real (`calculateVoucherDiscount`).
      it("estimated_savings accounts for an automatic Promotion already applied to the cart", async () => {
        const cartModuleService = container().resolve(Modules.CART);
        const cartResult = await cartModuleService.createCarts({
          currency_code: "vnd",
          items: [
            {
              title: "Preview Savings Item",
              unit_price: 1_000_000,
              quantity: 1,
              product_id: "prod_preview_savings_test",
            },
          ],
        } as any);
        const cart = (
          Array.isArray(cartResult) ? cartResult[0] : cartResult
        ) as { id: string };

        // A real, native AUTOMATIC Promotion (20% off items) — same setup as
        // `conflict-8-automatic-promotion-coexistence.spec.ts`.
        await createPromotionsWorkflow(container()).run({
          input: {
            promotionsData: [
              {
                code: `AUTO20-PREVIEW-${Math.random().toString(36).slice(2, 8)}`,
                type: "standard" as const,
                status: "active" as const,
                is_automatic: true,
                application_method: {
                  type: "percentage" as const,
                  target_type: "items" as const,
                  allocation: "across" as const,
                  value: 20,
                  currency_code: "vnd",
                },
              },
            ],
          },
        });
        await updateCartPromotionsWorkflow(container()).run({
          input: {
            cart_id: cart.id,
            promo_codes: [],
            action: PromotionActions.ADD,
          },
        });

        const cartWithAdjustments = (await cartModuleService.retrieveCart(
          cart.id,
          { select: ["id"], relations: ["items", "items.adjustments"] },
        )) as any;
        const itemPromotionDiscount = (cartWithAdjustments.items ?? [])
          .flatMap((i: any) => i.adjustments ?? [])
          .reduce((sum: number, a: any) => sum + Number(a.amount ?? 0), 0);

        // Sanity check: the automatic Promotion actually produced a real
        // adjustment, otherwise this test wouldn't exercise the fix at all.
        expect(itemPromotionDiscount).toBeGreaterThan(0);

        await createVoucher({
          code: "PREVIEWSAVE10",
          discount_type: "percentage",
          discount_value: 1000, // 10%
          user_segment_conditions: null,
        });

        const response = await api.get(
          `/store/vouchers?cart_id=${cart.id}`,
          publishableKeyHeaders,
        );

        expect(response.status).toBe(200);
        const voucher = (
          response.data.vouchers as {
            code: string;
            estimated_savings?: number;
          }[]
        ).find((v) => v.code === "PREVIEWSAVE10");
        expect(voucher).toBeDefined();

        const correctEstimate = Math.floor(
          (1_000_000 - itemPromotionDiscount) * 0.1,
        );
        const brokenEstimate = Math.floor(1_000_000 * 0.1);

        // The fixed value accounts for the automatic Promotion; the broken
        // (pre-fix) value would have ignored it entirely — assert both to
        // make a regression back to the old behavior fail loudly.
        expect(voucher!.estimated_savings).toBe(correctEstimate);
        expect(voucher!.estimated_savings).toBeLessThan(brokenEstimate);
      });
    });
  },
});
