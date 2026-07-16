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
 */
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
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
      async function createOrderWithVoucherMetadata(voucher: any) {
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
        };
        const order = await orderModuleService.createOrders({
          currency_code: "vnd",
          email: "voucher-usage-test@example.com",
          items: [
            {
              title: "Racket",
              quantity: 1,
              unit_price: 1_800_000,
            },
          ],
          metadata: { [VOUCHER_METADATA_KEY]: snapshot },
        } as any);
        return Array.isArray(order) ? order[0] : order;
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
    });
  },
});
