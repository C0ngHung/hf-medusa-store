/**
 * recordVoucherUsageWorkflow — REAL workflow integration (SPEC §11.4/§13.3;
 * tasks 3.6.2, 3.6.3, 3.6.4). Proves the redemption path end-to-end:
 *
 *  - 3.6.2 — the workflow resolves the applied voucher FROM THE ORDER via
 *    `order.metadata.voucher` (Decision G identity channel), not the ephemeral
 *    adjustment; a no-voucher order is a clean no-op.
 *  - 3.6.3 — the voucher discount that landed in the order is recorded: the
 *    `VoucherUsageLog.discount_applied` equals the order snapshot's
 *    `discount_amount` (= the final voucher discount in the order total).
 *  - 3.6.4 — running the workflow twice for the same order writes ONE log
 *    (idempotency at the workflow level: pre-check + unique index, §14.3).
 *
 * `service.integration.spec.ts` already pins `redeemVoucherAtomic` (the atomic
 * increment + immutable insert + concurrency/idempotency) against a real DB;
 * this file proves the WORKFLOW glue that reads the order and feeds that step.
 *
 * Boots the full app via `medusaIntegrationTestRunner` so a real Order module +
 * VoucherEngine module are exercised. Calls the workflow directly (the
 * `order.placed` subscriber only adds fire-and-forget wiring around this call).
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
    describe("recordVoucherUsageWorkflow (real workflow, tasks 3.6.2/3.6.3/3.6.4)", () => {
      const FAR_PAST = new Date("2020-01-01T00:00:00Z");
      const FAR_FUTURE = new Date("2999-01-01T00:00:00Z");

      function container() {
        return getContainer();
      }

      function voucherService() {
        return container().resolve(
          VOUCHER_ENGINE_MODULE,
        ) as VoucherEngineService;
      }

      // Builds the `cart.metadata.voucher` snapshot that `completeCartWorkflow`
      // copies onto `order.metadata` (verified §13.3) — the redemption identity
      // + amount channel.
      function voucherSnapshot(voucherId: string, code: string) {
        return {
          voucher_id: voucherId,
          code,
          ephemeral_promotion_id: "promo_ephemeral_test",
          ephemeral_code: "VEPH-TEST",
          discount_type: "percentage" as const,
          discount_value: 1000,
          raw_voucher_discount: 200_000,
          voucher_discount_after_voucher_cap: 200_000,
          discount_amount: 200_000, // = final voucher discount in the order total
          discount_capped: false,
          original_discount: 200_000,
          cap_percentage_bps: 5000,
          original_subtotal: 2_000_000,
          item_promotion_discount: 0,
          revalidation_marker: "",
        };
      }

      async function createOrder(metadata: Record<string, unknown> | null) {
        const orderModuleService: IOrderModuleService = container().resolve(
          Modules.ORDER,
        );
        const order = await orderModuleService.createOrders({
          currency_code: "vnd",
          customer_id: "cus_redeem_wf",
          items: [
            {
              title: "Racket",
              quantity: 1,
              unit_price: 2_000_000,
            },
          ],
          ...(metadata ? { metadata } : {}),
        } as any);
        return (Array.isArray(order) ? order[0] : order) as { id: string };
      }

      it("records the order's voucher usage: identity from order.metadata + discount_applied from the snapshot (3.6.2/3.6.3)", async () => {
        const voucher = await voucherService().createVoucherConfigs({
          code: "ORDERREDEEM10",
          discount_type: "percentage",
          discount_value: 1000,
          usage_limit: 10,
          valid_from: FAR_PAST,
          valid_to: FAR_FUTURE,
        });

        const order = await createOrder({
          [VOUCHER_METADATA_KEY]: voucherSnapshot(voucher.id, "ORDERREDEEM10"),
        });

        await recordVoucherUsageWorkflow(container()).run({
          input: { order_id: order.id },
        });

        // 3.6.2 — usage recorded for the voucher resolved from order.metadata.
        const reloaded = await voucherService().retrieveVoucherConfig(
          voucher.id,
        );
        expect(reloaded.usage_count).toBe(1);

        const [logs, count] =
          await voucherService().listAndCountVoucherUsageLogs({
            voucher_id: voucher.id,
            order_id: order.id,
          });
        expect(count).toBe(1);
        // 3.6.3 — the discount that was in the order total is recorded.
        expect(logs[0].discount_applied).toBe(200_000);
        expect(logs[0].order_id).toBe(order.id);
        expect(logs[0].voucher_code).toBe("ORDERREDEEM10");
      });

      it("is idempotent: running twice for the same order writes ONE usage log (3.6.4)", async () => {
        const voucher = await voucherService().createVoucherConfigs({
          code: "ORDERIDEMPOTENT10",
          discount_type: "percentage",
          discount_value: 1000,
          usage_limit: 10,
          valid_from: FAR_PAST,
          valid_to: FAR_FUTURE,
        });

        const order = await createOrder({
          [VOUCHER_METADATA_KEY]: voucherSnapshot(
            voucher.id,
            "ORDERIDEMPOTENT10",
          ),
        });

        await recordVoucherUsageWorkflow(container()).run({
          input: { order_id: order.id },
        });
        // Duplicate delivery of order.placed — must not double-count.
        await recordVoucherUsageWorkflow(container()).run({
          input: { order_id: order.id },
        });

        const reloaded = await voucherService().retrieveVoucherConfig(
          voucher.id,
        );
        expect(reloaded.usage_count).toBe(1);
        const [, count] = await voucherService().listAndCountVoucherUsageLogs({
          voucher_id: voucher.id,
          order_id: order.id,
        });
        expect(count).toBe(1);
      });

      it("is a no-op for an order that carries no voucher (3.6.2)", async () => {
        const order = await createOrder(null);

        const { result } = await recordVoucherUsageWorkflow(container()).run({
          input: { order_id: order.id },
        });

        expect(result.processed).toBe(false);
      });
    });
  },
});
