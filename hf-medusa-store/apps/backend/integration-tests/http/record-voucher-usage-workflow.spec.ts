/**
 * recordVoucherUsageWorkflow — REAL workflow integration (SPEC §11.4/§14.3;
 * tasks 4.3.7, 4.3.8).
 *
 * `service.integration.spec.ts` already pins `redeemVoucherAtomic`'s own DB
 * transaction (increment + append-only log, fail-closed on exhaustion, unique-
 * index idempotency) in isolation. This file is the one seam that had NO
 * coverage: the workflow itself (`assertOrderHasVoucherStep` →
 * `idempotencyCheckStep` → `atomicRedeemStep`) run against a REAL order row —
 * the same call the `order.placed` subscriber makes.
 *
 * Deliberately does NOT drive a full `completeCartWorkflow` checkout (no
 * region/shipping/payment scaffolding exists anywhere in this repo's tests) —
 * `assertOrderHasVoucherStep` only ever reads `order.metadata.voucher` via
 * `query.graph`, so a directly-created Order carrying that same metadata shape
 * exercises the exact same code path a real checkout completion would drive.
 * The cart.metadata → order.metadata propagation itself is separately verified
 * (SPEC Decision G, `@medusajs/core-flows/dist/cart/workflows/complete-cart.js:404`)
 * and exercised live by the existing apply-voucher cart-total assertions — this
 * file is not re-proving that hop, only the redemption workflow beyond it.
 *
 * Backend-5B-1 additions: the fixed-string `ephemeral_promotion_id` the
 * original tests use ("promo_test_fixture") never corresponds to a real
 * Promotion row — that's fine for those tests (they only assert usage-log/
 * usage_count behavior) and, as a side effect, already exercises the cleanup
 * step's "missing Promotion" non-fatal path on every run. The new tests below
 * need a REAL Promotion row to assert soft-deletion, so they create one
 * directly via `createPromotionsWorkflow` with a `VEPH-*` code — the same
 * shape `createAndAttachEphemeralPromotion` produces — via a new
 * `createRealEphemeralPromotion` helper and an optional override on
 * `createOrderWithVoucherMetadata`.
 */
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { createPromotionsWorkflow } from "@medusajs/core-flows";
import { Modules } from "@medusajs/framework/utils";
import type { IOrderModuleService } from "@medusajs/framework/types";
import { VOUCHER_ENGINE_MODULE } from "../../src/modules/voucher-engine";
import type VoucherEngineService from "../../src/modules/voucher-engine/service";
import { recordVoucherUsageWorkflow } from "../../src/workflows/voucher-engine/record-voucher-usage";
import { VOUCHER_METADATA_KEY } from "../../src/workflows/voucher-engine/lib/ephemeral-promotion";

jest.setTimeout(60_000);
// Known infra flake (not an assertion failure) — see
// .claude/lessons/voucher-engine/2026-07-14-redis-bullmq-teardown-race.md.
jest.retryTimes(2);

medusaIntegrationTestRunner({
  testSuite: ({ getContainer }) => {
    describe("recordVoucherUsageWorkflow (real workflow, tasks 4.3.7/4.3.8)", () => {
      const FAR_PAST = new Date("2020-01-01T00:00:00Z");
      const FAR_FUTURE = new Date("2999-01-01T00:00:00Z");

      function container() {
        return getContainer();
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async function createOrderWithVoucherMetadata(
        voucher: any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        overrides: Record<string, any> = {},
      ) {
        const orderModuleService: IOrderModuleService = container().resolve(
          Modules.ORDER,
        );
        const snapshot = {
          voucher_id: voucher.id,
          code: voucher.code,
          ephemeral_promotion_id: "promo_test_fixture",
          ephemeral_code: "VEPH-TEST-FIXTURE",
          discount_type: voucher.discount_type,
          discount_value: voucher.discount_value,
          uncapped_voucher_discount: 200_000,
          voucher_discount_after_voucher_cap: 200_000,
          discount_amount: 200_000,
          discount_capped: false,
          original_discount: 200_000,
          cap_percentage_bps: 5000,
          original_subtotal: 2_000_000,
          item_promotion_discount: 0,
          revalidation_marker: "test-fixture",
          ...overrides,
        };
        const order = await orderModuleService.createOrders({
          currency_code: "vnd",
          email: "voucher-usage-test@example.com",
          items: [
            {
              title: "Racket",
              quantity: 1,
              unit_price: 1_800_000,
              adjustments: [
                {
                  code: snapshot.ephemeral_code,
                  promotion_id: snapshot.ephemeral_promotion_id,
                  amount: snapshot.discount_amount,
                },
              ],
            },
          ],
          metadata: { [VOUCHER_METADATA_KEY]: snapshot },
        } as any);
        return Array.isArray(order) ? order[0] : order;
      }

      /** A REAL Promotion row, same shape `createAndAttachEphemeralPromotion` produces. */
      async function createRealEphemeralPromotion(value = 200_000) {
        const { result: promotions } = await createPromotionsWorkflow(
          container(),
        ).run({
          input: {
            promotionsData: [
              {
                code: `VEPH-USAGETEST-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
                type: "standard",
                status: "active",
                is_automatic: false,
                application_method: {
                  type: "fixed",
                  target_type: "items",
                  allocation: "across",
                  value,
                  currency_code: "vnd",
                },
              },
            ],
          },
        });
        return promotions[0];
      }

      it("records exactly one VoucherUsageLog row and increments usage_count when a real order carries a voucher snapshot (task 4.3.7)", async () => {
        const voucher = await createVoucher({
          code: "USAGE10",
          discount_type: "percentage",
          discount_value: 1000, // 10%
          usage_count: 0,
        });
        const order = await createOrderWithVoucherMetadata(voucher);

        const result = await recordVoucherUsageWorkflow(container()).run({
          input: { order_id: order.id },
        });
        expect(result.result.processed).toBe(true);

        const voucherService = container().resolve(
          VOUCHER_ENGINE_MODULE,
        ) as VoucherEngineService;
        const [logs, count] = await voucherService.listAndCountVoucherUsageLogs(
          { voucher_id: voucher.id, order_id: order.id },
        );
        expect(count).toBe(1);
        expect(logs[0].order_id).toBe(order.id);
        expect(logs[0].discount_applied).toBe(200_000);

        const reloaded = await voucherService.retrieveVoucherConfig(voucher.id);
        expect(reloaded.usage_count).toBe(1);
      });

      it("does not create a duplicate VoucherUsageLog or double-increment usage_count when the same order is processed twice (task 4.3.8, idempotency)", async () => {
        const voucher = await createVoucher({
          code: "USAGE10DUP",
          discount_type: "percentage",
          discount_value: 1000,
          usage_count: 0,
        });
        const order = await createOrderWithVoucherMetadata(voucher);

        await recordVoucherUsageWorkflow(container()).run({
          input: { order_id: order.id },
        });
        // Simulates a duplicate order.placed event delivery.
        const second = await recordVoucherUsageWorkflow(container()).run({
          input: { order_id: order.id },
        });
        expect(second.result.processed).toBe(true);

        const voucherService = container().resolve(
          VOUCHER_ENGINE_MODULE,
        ) as VoucherEngineService;
        const [, count] = await voucherService.listAndCountVoucherUsageLogs({
          voucher_id: voucher.id,
          order_id: order.id,
        });
        expect(count).toBe(1); // still exactly one — no duplicate

        const reloaded = await voucherService.retrieveVoucherConfig(voucher.id);
        expect(reloaded.usage_count).toBe(1); // not double-incremented
      });

      it("is a no-op for an order with no voucher metadata (most orders)", async () => {
        const orderModuleService: IOrderModuleService = container().resolve(
          Modules.ORDER,
        );
        const order = await orderModuleService.createOrders({
          currency_code: "vnd",
          email: "no-voucher-order@example.com",
          items: [{ title: "Racket", quantity: 1, unit_price: 1_800_000 }],
        } as any);
        const created = Array.isArray(order) ? order[0] : order;

        const result = await recordVoucherUsageWorkflow(container()).run({
          input: { order_id: created.id },
        });
        expect(result.result.processed).toBe(false);
      });

      it("Backend-5B-1: soft-deletes the ephemeral Promotion once VoucherUsageLog is recorded", async () => {
        const voucher = await createVoucher({
          code: "USAGECLEANUP10",
          discount_type: "percentage",
          discount_value: 1000,
          usage_count: 0,
        });
        const ephemeralPromotion = await createRealEphemeralPromotion();
        const order = await createOrderWithVoucherMetadata(voucher, {
          ephemeral_promotion_id: ephemeralPromotion.id,
          ephemeral_code: ephemeralPromotion.code,
        });

        await recordVoucherUsageWorkflow(container()).run({
          input: { order_id: order.id },
        });

        const voucherService = container().resolve(
          VOUCHER_ENGINE_MODULE,
        ) as VoucherEngineService;
        const [, count] = await voucherService.listAndCountVoucherUsageLogs({
          voucher_id: voucher.id,
          order_id: order.id,
        });
        expect(count).toBe(1); // usage log confirmed recorded first

        const promotionModule: any = container().resolve(Modules.PROMOTION);
        // Soft-deleted rows are excluded from default retrieve/list queries
        // (verified: `deletePromotionsWorkflow` → `softDeletePromotions`).
        await expect(
          promotionModule.retrievePromotion(ephemeralPromotion.id),
        ).rejects.toThrow();
      });

      it("Backend-5B-1: duplicate order event stays idempotent when the ephemeral Promotion is already deleted", async () => {
        const voucher = await createVoucher({
          code: "USAGECLEANUPDUP10",
          discount_type: "percentage",
          discount_value: 1000,
          usage_count: 0,
        });
        const ephemeralPromotion = await createRealEphemeralPromotion();
        const order = await createOrderWithVoucherMetadata(voucher, {
          ephemeral_promotion_id: ephemeralPromotion.id,
          ephemeral_code: ephemeralPromotion.code,
        });

        await recordVoucherUsageWorkflow(container()).run({
          input: { order_id: order.id },
        });
        // Simulates a duplicate order.placed delivery AFTER the ephemeral
        // Promotion has already been cleaned up by the first run — must not
        // throw, and usage accounting must not change.
        const second = await recordVoucherUsageWorkflow(container()).run({
          input: { order_id: order.id },
        });
        expect(second.result.processed).toBe(true);

        const voucherService = container().resolve(
          VOUCHER_ENGINE_MODULE,
        ) as VoucherEngineService;
        const [, count] = await voucherService.listAndCountVoucherUsageLogs({
          voucher_id: voucher.id,
          order_id: order.id,
        });
        expect(count).toBe(1);
        const reloaded = await voucherService.retrieveVoucherConfig(voucher.id);
        expect(reloaded.usage_count).toBe(1);
      });

      it("Backend-5B-1: order line item adjustments remain readable after the ephemeral Promotion is cleaned up", async () => {
        const voucher = await createVoucher({
          code: "USAGECLEANUPADJ10",
          discount_type: "percentage",
          discount_value: 1000,
          usage_count: 0,
        });
        const ephemeralPromotion = await createRealEphemeralPromotion();
        const order = await createOrderWithVoucherMetadata(voucher, {
          ephemeral_promotion_id: ephemeralPromotion.id,
          ephemeral_code: ephemeralPromotion.code,
        });

        await recordVoucherUsageWorkflow(container()).run({
          input: { order_id: order.id },
        });

        const orderModuleService: IOrderModuleService = container().resolve(
          Modules.ORDER,
        );
        const reloaded = await orderModuleService.retrieveOrder(order.id, {
          select: ["id", "total"],
          relations: ["items", "items.adjustments"],
        });
        const items = reloaded.items as unknown as Array<{
          adjustments?: { amount: unknown; promotion_id?: string | null }[];
        }>;
        const adjustment = items[0]?.adjustments?.[0];
        expect(adjustment?.promotion_id).toBe(ephemeralPromotion.id);
        expect(Number(adjustment?.amount)).toBe(200_000);
        expect(reloaded.total).toBeDefined();
      });

      it("Backend-5B-1: does NOT delete the ephemeral Promotion when redemption capacity is exhausted (no usage log written)", async () => {
        const voucher = await createVoucher({
          code: "USAGECAPPED10",
          discount_type: "percentage",
          discount_value: 1000,
          usage_limit: 1,
          usage_count: 1, // already at limit — the conditional increment fails closed
        });
        const ephemeralPromotion = await createRealEphemeralPromotion();
        const order = await createOrderWithVoucherMetadata(voucher, {
          ephemeral_promotion_id: ephemeralPromotion.id,
          ephemeral_code: ephemeralPromotion.code,
        });

        await recordVoucherUsageWorkflow(container()).run({
          input: { order_id: order.id },
        });

        const voucherService = container().resolve(
          VOUCHER_ENGINE_MODULE,
        ) as VoucherEngineService;
        const [, count] = await voucherService.listAndCountVoucherUsageLogs({
          voucher_id: voucher.id,
          order_id: order.id,
        });
        expect(count).toBe(0); // no log written — capacity was exhausted

        const promotionModule: any = container().resolve(Modules.PROMOTION);
        // Never deleted — no VoucherUsageLog was ever recorded for it.
        const stillThere = await promotionModule.retrievePromotion(
          ephemeralPromotion.id,
        );
        expect(stillThere.id).toBe(ephemeralPromotion.id);
      });
    });
  },
});
