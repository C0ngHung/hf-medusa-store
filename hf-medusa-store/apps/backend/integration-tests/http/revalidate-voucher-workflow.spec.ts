/**
 * revalidateVoucherWorkflow — REAL workflow integration (SPEC §11.3/§11.5;
 * tasks 3.5.1, 3.5.7, 3.5.8).
 *
 * `revalidate-voucher.unit.spec.ts` already pins the PURE V1/V2/V5/V6/V8
 * subset logic in isolation. This file exercises the actual production
 * workflow (`revalidateVoucherWorkflow`) end-to-end against a real cart +
 * ephemeral Promotion — the same workflow the `cart.updated` subscriber
 * (`../../src/subscribers/voucher-cart-updated.ts`) invokes — so the
 * recompute/auto-remove branches are proven against real Promotion
 * create/attach/detach/delete calls, not just the pure validator subset.
 *
 * Boots the full app via `medusaIntegrationTestRunner` (same pattern as
 * `apply-remove-voucher.spec.ts`) so a real Cart module + Promotion module
 * + ephemeral-promotion machinery is exercised. Calls the workflow directly
 * (not via the subscriber) since the subscriber only adds async
 * fire-and-forget wiring around this same call (proven working, but
 * unreliable to await in a test without artificial polling).
 */
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { Modules } from "@medusajs/framework/utils";
import type { ICartModuleService } from "@medusajs/framework/types";
import { VOUCHER_ENGINE_MODULE } from "../../src/modules/voucher-engine";
import type VoucherEngineService from "../../src/modules/voucher-engine/service";
import { applyVoucherWorkflow } from "../../src/workflows/voucher-engine/apply-voucher";
import { revalidateVoucherWorkflow } from "../../src/workflows/voucher-engine/revalidate-voucher-on-cart-change";
import { VOUCHER_METADATA_KEY } from "../../src/workflows/voucher-engine/lib/ephemeral-promotion";

jest.setTimeout(60_000);
// Known infra flake (not an assertion failure) — see
// .claude/lessons/voucher-engine/2026-07-14-redis-bullmq-teardown-race.md.
jest.retryTimes(2);

medusaIntegrationTestRunner({
  testSuite: ({ getContainer }) => {
    describe("revalidateVoucherWorkflow (real workflow, tasks 3.5.1/3.5.7/3.5.8)", () => {
      const FAR_PAST = new Date("2020-01-01T00:00:00Z");
      const FAR_FUTURE = new Date("2999-01-01T00:00:00Z");

      function container() {
        return getContainer();
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async function createCart(items: any[]): Promise<{ id: string }> {
        const cartModuleService: ICartModuleService = container().resolve(
          Modules.CART,
        );
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

      async function retrieveCartWithTotal(cartId: string) {
        const cartModuleService: ICartModuleService = container().resolve(
          Modules.CART,
        );
        return cartModuleService.retrieveCart(cartId, {
          select: ["id", "total", "metadata"],
        });
      }

      async function firstLineItemId(cartId: string): Promise<string> {
        const cartModuleService: ICartModuleService = container().resolve(
          Modules.CART,
        );
        const cart = await cartModuleService.retrieveCart(cartId, {
          relations: ["items"],
          select: ["id", "items.id"],
        });
        return (cart.items as unknown as { id: string }[])[0].id;
      }

      it("recomputes the voucher discount when the cart subtotal changes but the voucher is still valid (task 3.5.7)", async () => {
        const cart = await createCart([
          {
            title: "Racket",
            unit_price: 2_000_000,
            quantity: 1,
            product_id: "prod_racket_recompute",
          },
        ]);
        await createVoucher({
          code: "RECOMPUTE10",
          discount_type: "percentage",
          discount_value: 1000, // 10%
          min_order_value: 500_000,
        });

        await applyVoucherWorkflow(container()).run({
          input: { cart_id: cart.id, code: "RECOMPUTE10", customer_id: null },
        });

        const beforeCart = await retrieveCartWithTotal(cart.id);
        expect(Number(beforeCart.total)).toBe(1_800_000); // 2,000,000 - 10%

        // Simulate the cart mutation a `cart.updated` event would carry —
        // bump quantity so the eligible subtotal changes (still passes V5:
        // min_order_value 500,000 is comfortably under the new 4,000,000).
        const lineItemId = await firstLineItemId(cart.id);
        const cartModuleService: ICartModuleService = container().resolve(
          Modules.CART,
        );
        await cartModuleService.updateLineItems(lineItemId, { quantity: 2 });

        await revalidateVoucherWorkflow(container()).run({
          input: { cart_id: cart.id },
        });

        const afterCart = await retrieveCartWithTotal(cart.id);
        expect(Number(afterCart.total)).toBe(3_600_000); // 4,000,000 - 10%
        const snapshot = (
          afterCart.metadata as Record<string, unknown> | null
        )?.[VOUCHER_METADATA_KEY] as { discount_amount: number } | undefined;
        expect(snapshot?.discount_amount).toBe(400_000);
      });

      it("auto-removes the voucher when a cart mutation makes it no longer eligible (task 3.5.8, VOUCHER_AUTO_REMOVED)", async () => {
        const cart = await createCart([
          {
            title: "Racket",
            unit_price: 2_000_000,
            quantity: 1,
            product_id: "prod_racket_autoremove",
          },
        ]);
        await createVoucher({
          code: "AUTOREMOVE10",
          discount_type: "percentage",
          discount_value: 1000, // 10%
          min_order_value: 1_500_000,
        });

        await applyVoucherWorkflow(container()).run({
          input: { cart_id: cart.id, code: "AUTOREMOVE10", customer_id: null },
        });

        const beforeCart = await retrieveCartWithTotal(cart.id);
        expect(Number(beforeCart.total)).toBe(1_800_000); // 2,000,000 - 10%

        // Drop the item price under the voucher's min_order_value (V5 now fails).
        const lineItemId = await firstLineItemId(cart.id);
        const cartModuleService: ICartModuleService = container().resolve(
          Modules.CART,
        );
        await cartModuleService.updateLineItems(lineItemId, {
          unit_price: 1_000_000,
        });

        await revalidateVoucherWorkflow(container()).run({
          input: { cart_id: cart.id },
        });

        const afterCart = await retrieveCartWithTotal(cart.id);
        expect(Number(afterCart.total)).toBe(1_000_000); // no discount — auto-removed
        expect(
          (afterCart.metadata as Record<string, unknown> | null)?.[
            VOUCHER_METADATA_KEY
          ],
        ).toBeUndefined();
      });
    });
  },
});
