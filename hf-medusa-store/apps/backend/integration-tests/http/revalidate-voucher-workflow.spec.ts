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
import { VOUCHER_NOTICE_METADATA_KEY } from "../../src/workflows/voucher-engine/lib/auto-remove-notice";

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

      it("recomputes the discount when a new line item is added to the cart (task 3.5.2; 3.5.5 suggested-add shares this path)", async () => {
        const cart = await createCart([
          {
            title: "Racket",
            unit_price: 2_000_000,
            quantity: 1,
            product_id: "prod_racket_additem",
          },
        ]);
        await createVoucher({
          code: "ADDITEM10",
          discount_type: "percentage",
          discount_value: 1000, // 10% — unscoped, applies to all items
          min_order_value: null,
        });

        await applyVoucherWorkflow(container()).run({
          input: { cart_id: cart.id, code: "ADDITEM10", customer_id: null },
        });
        expect(Number((await retrieveCartWithTotal(cart.id)).total)).toBe(
          1_800_000,
        ); // 2,000,000 - 10%

        // Add a second line item (the mutation a "suggested product added" /
        // one-tap-add would emit as `cart.updated`, task 3.5.5 — identical path).
        const cartModuleService: ICartModuleService = container().resolve(
          Modules.CART,
        );
        await cartModuleService.addLineItems({
          cart_id: cart.id,
          title: "Grip",
          unit_price: 1_000_000,
          quantity: 1,
          product_id: "prod_grip_added",
        } as any);

        await revalidateVoucherWorkflow(container()).run({
          input: { cart_id: cart.id },
        });

        const afterCart = await retrieveCartWithTotal(cart.id);
        expect(Number(afterCart.total)).toBe(2_700_000); // 3,000,000 - 10%
        const snapshot = (
          afterCart.metadata as Record<string, unknown> | null
        )?.[VOUCHER_METADATA_KEY] as { discount_amount: number } | undefined;
        expect(snapshot?.discount_amount).toBe(300_000);
      });

      it("auto-removes the voucher + writes the min-order reason notice when the cart drops below min (tasks 3.5.8/3.5.9, VOUCHER_AUTO_REMOVED)", async () => {
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
        expect(Number(afterCart.total)).toBe(1_000_000); // no discount — auto-removed (3.5.11 recalc from source)
        const metadata = afterCart.metadata as Record<string, unknown> | null;
        // Voucher snapshot cleared…
        expect(metadata?.[VOUCHER_METADATA_KEY]).toBeUndefined();
        // …and the async min-order reason surfaced for the storefront (task 3.5.9).
        const notice = metadata?.[VOUCHER_NOTICE_METADATA_KEY] as
          | {
              code: string;
              reason_code: string;
              voucher_code: string;
              customer_message: string;
            }
          | undefined;
        expect(notice?.code).toBe("VOUCHER_AUTO_REMOVED");
        expect(notice?.reason_code).toBe("VOUCHER_MIN_ORDER_NOT_MET");
        expect(notice?.voucher_code).toBe("AUTOREMOVE10");
        expect(notice?.customer_message).toContain("AUTOREMOVE10");
        expect(notice?.customer_message).not.toMatch(/\{code\}|\{reason\}/);
      });

      it("clears a stale auto-remove notice once a new voucher is successfully (re-)applied", async () => {
        const cart = await createCart([
          {
            title: "Racket",
            unit_price: 2_000_000,
            quantity: 1,
            product_id: "prod_racket_noticecleared",
          },
        ]);
        await createVoucher({
          code: "NOTICECLEAR10",
          discount_type: "percentage",
          discount_value: 1000,
          min_order_value: 1_500_000,
        });
        await createVoucher({
          code: "NOTICECLEAR20",
          discount_type: "percentage",
          discount_value: 2000,
          min_order_value: null,
        });

        await applyVoucherWorkflow(container()).run({
          input: {
            cart_id: cart.id,
            code: "NOTICECLEAR10",
            customer_id: null,
          },
        });

        // Drop the item price under the first voucher's min_order_value so
        // revalidation auto-removes it and writes the stale notice.
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

        const withStaleNotice = await retrieveCartWithTotal(cart.id);
        expect(
          (withStaleNotice.metadata as Record<string, unknown> | null)?.[
            VOUCHER_NOTICE_METADATA_KEY
          ],
        ).toBeDefined();

        // Now successfully apply a different (unscoped) voucher.
        await applyVoucherWorkflow(container()).run({
          input: {
            cart_id: cart.id,
            code: "NOTICECLEAR20",
            customer_id: null,
          },
        });

        const afterCart = await retrieveCartWithTotal(cart.id);
        expect(
          (afterCart.metadata as Record<string, unknown> | null)?.[
            VOUCHER_NOTICE_METADATA_KEY
          ],
        ).toBeUndefined();
      });

      it("auto-removes + writes the no-eligible-items reason when the last eligible item is removed (tasks 3.5.3/3.5.10)", async () => {
        // Scoped voucher: only the racket product is eligible. Apply on a cart
        // that has ONLY the eligible item (a fixed/across ephemeral promotion
        // over a single line stays integer — the multi-item across-split is an
        // apply-time concern outside this revalidation task's scope).
        const cart = await createCart([
          {
            title: "Racket",
            unit_price: 2_000_000,
            quantity: 1,
            product_id: "prod_racket_scoped",
          },
        ]);
        await createVoucher({
          code: "RACKETONLY10",
          discount_type: "percentage",
          discount_value: 1000, // 10%
          min_order_value: null,
          applicable_product_ids: ["prod_racket_scoped"],
        });

        await applyVoucherWorkflow(container()).run({
          input: { cart_id: cart.id, code: "RACKETONLY10", customer_id: null },
        });

        const cartModuleService: ICartModuleService = container().resolve(
          Modules.CART,
        );
        // Add a non-eligible item, then remove the ONLY eligible one (task
        // 3.5.3) → the cart still has items, but none in scope → V6 fails.
        await cartModuleService.addLineItems({
          cart_id: cart.id,
          title: "Shoes (not in scope)",
          unit_price: 1_500_000,
          quantity: 1,
          product_id: "prod_shoes_other",
        } as any);
        const cartWithItems = await cartModuleService.retrieveCart(cart.id, {
          relations: ["items"],
          select: ["id", "items.id", "items.product_id"],
        });
        const racketLine = (
          cartWithItems.items as unknown as { id: string; product_id: string }[]
        ).find((i) => i.product_id === "prod_racket_scoped")!;
        await cartModuleService.deleteLineItems(racketLine.id);

        await revalidateVoucherWorkflow(container()).run({
          input: { cart_id: cart.id },
        });

        const afterCart = await retrieveCartWithTotal(cart.id);
        const metadata = afterCart.metadata as Record<string, unknown> | null;
        expect(metadata?.[VOUCHER_METADATA_KEY]).toBeUndefined();
        const notice = metadata?.[VOUCHER_NOTICE_METADATA_KEY] as
          | { code: string; reason_code: string; voucher_code: string }
          | undefined;
        expect(notice?.code).toBe("VOUCHER_AUTO_REMOVED");
        expect(notice?.reason_code).toBe("VOUCHER_NO_ELIGIBLE_ITEMS");
        expect(notice?.voucher_code).toBe("RACKETONLY10");
      });

      it("acquires the voucher:cart:{id} lock so two concurrent revalidations on the same cart don't corrupt the ephemeral promotion (EC-04)", async () => {
        const cart = await createCart([
          {
            title: "Racket",
            unit_price: 2_000_000,
            quantity: 1,
            product_id: "prod_racket_lockrace",
          },
        ]);
        await createVoucher({
          code: "LOCKRACE10",
          discount_type: "percentage",
          discount_value: 1000, // 10%, unscoped
          min_order_value: null,
        });

        await applyVoucherWorkflow(container()).run({
          input: { cart_id: cart.id, code: "LOCKRACE10", customer_id: null },
        });

        const cartModuleService: ICartModuleService = container().resolve(
          Modules.CART,
        );
        const lineItemId = await firstLineItemId(cart.id);
        await cartModuleService.updateLineItems(lineItemId, { quantity: 2 });

        // Fire two revalidations for the SAME cart concurrently. Medusa's
        // (in-memory, test-env) locking provider is FAIL-FAST, not
        // queue-and-wait: the loser throws "Failed to acquire lock" rather
        // than blocking — which the calling `cart.updated` subscriber always
        // catches/logs (this workflow "Never throws" by design, see file
        // header), so a lost race is a silent no-op, not a corruption. Without
        // the EC-04 lock, BOTH would instead proceed, read the same stale
        // `existing.active!.ephemeral_promotion_id`, and race to
        // create+attach a new promotion + delete the old one — leaving either
        // a duplicate attached promotion or a crash from double-deleting the
        // same one.
        const results = await Promise.allSettled([
          revalidateVoucherWorkflow(container()).run({
            input: { cart_id: cart.id },
          }),
          revalidateVoucherWorkflow(container()).run({
            input: { cart_id: cart.id },
          }),
        ]);
        const fulfilled = results.filter((r) => r.status === "fulfilled");
        const rejected = results.filter((r) => r.status === "rejected");
        // Mutual exclusion in effect: exactly one of the two racing
        // revalidations won the lock; the other lost it (fail-fast).
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        const rejectionReason = (rejected[0] as PromiseRejectedResult).reason;
        expect(
          typeof rejectionReason === "string"
            ? rejectionReason
            : (rejectionReason?.message ?? JSON.stringify(rejectionReason)),
        ).toMatch(/Failed to acquire lock/);

        const afterCart = await retrieveCartWithTotal(cart.id);
        expect(Number(afterCart.total)).toBe(3_600_000); // 4,000,000 - 10%
        const snapshot = (
          afterCart.metadata as Record<string, unknown> | null
        )?.[VOUCHER_METADATA_KEY] as
          | { discount_amount: number; ephemeral_promotion_id: string }
          | undefined;
        expect(snapshot?.discount_amount).toBe(400_000);
      });

      it("does NOT increment usage_count when a voucher is applied to a cart (task 3.6.11, Rule 12)", async () => {
        const cart = await createCart([
          {
            title: "Racket",
            unit_price: 2_000_000,
            quantity: 1,
            product_id: "prod_racket_noincrement",
          },
        ]);
        const voucher = await createVoucher({
          code: "NOINCREMENT10",
          discount_type: "percentage",
          discount_value: 1000,
          min_order_value: null,
          usage_limit: 100,
        });

        await applyVoucherWorkflow(container()).run({
          input: { cart_id: cart.id, code: "NOINCREMENT10", customer_id: null },
        });

        const service = container().resolve(
          VOUCHER_ENGINE_MODULE,
        ) as VoucherEngineService;
        // Applying to a cart must not consume usage — only order.placed does.
        const reloaded = await service.retrieveVoucherConfig(voucher.id);
        expect(reloaded.usage_count).toBe(0);
        const [, logCount] = await service.listAndCountVoucherUsageLogs({
          voucher_id: voucher.id,
        });
        expect(logCount).toBe(0);
      });

      it("never leaves two ephemeral promotions attached during recompute, and the final cart total is authoritative (fix: detach-before-attach + verify)", async () => {
        const cart = await createCart([
          {
            title: "Racket",
            unit_price: 2_000_000,
            quantity: 1,
            product_id: "prod_racket_norecompute_dupe",
          },
        ]);
        await createVoucher({
          code: "NODUPE10",
          discount_type: "percentage",
          discount_value: 1000, // 10%
          min_order_value: null,
        });

        await applyVoucherWorkflow(container()).run({
          input: { cart_id: cart.id, code: "NODUPE10", customer_id: null },
        });

        const cartModuleService: ICartModuleService = container().resolve(
          Modules.CART,
        );
        const beforeCart = await cartModuleService.retrieveCart(cart.id, {
          select: ["id", "total", "metadata"],
        });
        expect(Number(beforeCart.total)).toBe(1_800_000); // 2,000,000 - 10%
        const beforePromotionId = (
          beforeCart.metadata as Record<string, unknown>
        )[VOUCHER_METADATA_KEY] as { ephemeral_promotion_id: string };

        // Trigger a recompute (quantity change → still valid, new amount).
        const lineItemId = await firstLineItemId(cart.id);
        await cartModuleService.updateLineItems(lineItemId, { quantity: 2 });
        await revalidateVoucherWorkflow(container()).run({
          input: { cart_id: cart.id },
        });

        const afterCart = await cartModuleService.retrieveCart(cart.id, {
          select: ["id", "total", "discount_total", "metadata"],
          relations: ["items", "items.adjustments"],
        });

        // Exactly one voucher discount is reflected in the authoritative
        // total — never the sum of the old AND new ephemeral promotions.
        expect(Number(afterCart.total)).toBe(3_600_000); // 4,000,000 - 10%

        // Exactly ONE distinct promotion_id is attached across all line
        // adjustments — never both the stale and the recomputed one at once.
        const attachedPromotionIds = new Set(
          (
            afterCart.items as unknown as {
              adjustments?: { promotion_id?: string | null }[];
            }[]
          ).flatMap((item) =>
            (item.adjustments ?? [])
              .map((a) => a.promotion_id)
              .filter((id): id is string => !!id),
          ),
        );
        expect(attachedPromotionIds.size).toBe(1);

        const afterMetadata = afterCart.metadata as Record<string, unknown>;
        const afterPromotion = afterMetadata[VOUCHER_METADATA_KEY] as {
          ephemeral_promotion_id: string;
          discount_amount: number;
        };
        // The recomputed promotion replaced (not duplicated) the old one.
        expect(afterPromotion.ephemeral_promotion_id).not.toBe(
          beforePromotionId.ephemeral_promotion_id,
        );
        expect([...attachedPromotionIds]).toEqual([
          afterPromotion.ephemeral_promotion_id,
        ]);
        expect(afterPromotion.discount_amount).toBe(400_000);
      });
    });
  },
});
