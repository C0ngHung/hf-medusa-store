/**
 * reapStaleEphemeralPromotions — Backend-5B-2 (SPEC Decision G, §14.2-A).
 *
 * Tests the core helper directly (`lib/reap-ephemeral-promotions.ts`), not
 * the scheduled-job wrapper — the job wrapper is intentionally a one-line
 * pass-through with nothing of its own to test, per the task's own guidance
 * ("test the core helper function directly and keep the job wrapper thin").
 *
 * Backdates `created_at` via a direct `updatePromotions` call after
 * creation — Mikro-ORM's `@BeforeCreate` timestamp defaults only apply on
 * the initial insert, so a subsequent update can freely override it for
 * test purposes.
 */
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { createPromotionsWorkflow } from "@medusajs/core-flows";
import { Modules } from "@medusajs/framework/utils";
import type { ICartModuleService } from "@medusajs/framework/types";
import { VOUCHER_ENGINE_MODULE } from "../../src/modules/voucher-engine";
import type VoucherEngineService from "../../src/modules/voucher-engine/service";
import { reapStaleEphemeralPromotions } from "../../src/workflows/voucher-engine/lib/reap-ephemeral-promotions";
import { VOUCHER_METADATA_KEY } from "../../src/workflows/voucher-engine/lib/ephemeral-promotion";

jest.setTimeout(60_000);
// Known infra flake (not an assertion failure) — see
// .claude/lessons/voucher-engine/2026-07-14-redis-bullmq-teardown-race.md.
jest.retryTimes(2);

const FAR_PAST = new Date("2020-01-01T00:00:00Z");
const FAR_FUTURE = new Date("2999-01-01T00:00:00Z");
const STALE_DATE = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
const FRESH_DATE = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000); // 1 day ago

medusaIntegrationTestRunner({
  testSuite: ({ getContainer }) => {
    describe("reapStaleEphemeralPromotions (Backend-5B-2)", () => {
      function container() {
        return getContainer();
      }

      async function createPromotion(
        code: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        overrides: Record<string, any> = {},
      ) {
        const { result: promotions } = await createPromotionsWorkflow(
          container(),
        ).run({
          input: {
            promotionsData: [
              {
                code,
                type: "standard",
                status: "active",
                is_automatic: false,
                application_method: {
                  type: "fixed",
                  target_type: "items",
                  allocation: "across",
                  value: 100_000,
                  currency_code: "vnd",
                },
                ...overrides,
              },
            ],
          },
        });
        return promotions[0];
      }

      async function backdate(promotionId: string, createdAt: Date) {
        const promotionModule: any = container().resolve(Modules.PROMOTION);
        await promotionModule.updatePromotions({
          id: promotionId,
          created_at: createdAt,
        });
      }

      async function stillExists(promotionId: string): Promise<boolean> {
        const promotionModule: any = container().resolve(Modules.PROMOTION);
        try {
          await promotionModule.retrievePromotion(promotionId);
          return true;
        } catch {
          return false;
        }
      }

      it("deletes a stale VEPH-* Promotion older than the threshold", async () => {
        const stale = await createPromotion("VEPH-STALE-CART-VOUCHER-NONCE1");
        await backdate(stale.id, STALE_DATE);

        const result = await reapStaleEphemeralPromotions(container(), 7);

        expect(result.deleted).toBeGreaterThanOrEqual(1);
        expect(await stillExists(stale.id)).toBe(false);
      });

      it("does NOT delete a fresh VEPH-* Promotion younger than the threshold", async () => {
        const fresh = await createPromotion("VEPH-FRESH-CART-VOUCHER-NONCE2");
        await backdate(fresh.id, FRESH_DATE);

        await reapStaleEphemeralPromotions(container(), 7);

        expect(await stillExists(fresh.id)).toBe(true);
      });

      it("does NOT delete an old CANONICAL voucher Promotion (non-VEPH code)", async () => {
        const canonical = await createPromotion("OLDVOUCHER10");
        await backdate(canonical.id, STALE_DATE);

        await reapStaleEphemeralPromotions(container(), 7);

        expect(await stillExists(canonical.id)).toBe(true);
      });

      it("does NOT delete an old NORMAL (non-voucher) Promotion", async () => {
        const normal = await createPromotion("SUMMERSALE2020");
        await backdate(normal.id, STALE_DATE);

        await reapStaleEphemeralPromotions(container(), 7);

        expect(await stillExists(normal.id)).toBe(true);
      });

      it("documents the soft-delete-only tradeoff: a stale Promotion still attached to a cart is deleted, but the cart's own metadata is left untouched (cart-by-promotion lookup is not supported by the installed query layer)", async () => {
        const cartModuleService: ICartModuleService = container().resolve(
          Modules.CART,
        );
        const stale = await createPromotion("VEPH-ATTACHED-CART-NONCE3");
        await backdate(stale.id, STALE_DATE);

        const cart = await cartModuleService.createCarts({
          currency_code: "vnd",
          items: [
            {
              title: "Racket",
              unit_price: 1_800_000,
              quantity: 1,
              product_id: "prod_reap_test",
            },
          ],
        } as any);
        const createdCart = Array.isArray(cart) ? cart[0] : cart;

        const { updateCartPromotionsWorkflow } =
          await import("@medusajs/core-flows");
        await updateCartPromotionsWorkflow(container()).run({
          input: {
            cart_id: createdCart.id,
            promo_codes: [stale.code],
            action: "add",
          } as any,
        });
        await cartModuleService.updateCarts(createdCart.id, {
          metadata: {
            [VOUCHER_METADATA_KEY]: {
              voucher_id: "voucher_test",
              code: "TESTCODE",
              ephemeral_promotion_id: stale.id,
              ephemeral_code: stale.code,
            },
          },
        } as any);

        await reapStaleEphemeralPromotions(container(), 7);

        // The Promotion is gone regardless of cart attachment...
        expect(await stillExists(stale.id)).toBe(false);

        // ...but the cart's own metadata is deliberately left as-is per the
        // documented tradeoff — this reaper does not touch carts.
        const reloadedCart = await cartModuleService.retrieveCart(
          createdCart.id,
          { select: ["id", "metadata"] },
        );
        expect(
          (
            (reloadedCart.metadata as Record<string, unknown> | null)?.[
              VOUCHER_METADATA_KEY
            ] as Record<string, unknown> | undefined
          )?.ephemeral_promotion_id,
        ).toBe(stale.id);
      });

      it("one failed row does not stop the rest of the batch", async () => {
        const bad = await createPromotion("VEPH-WILLFAIL-NONCE4");
        await backdate(bad.id, STALE_DATE);
        const good = await createPromotion("VEPH-WILLSUCCEED-NONCE5");
        await backdate(good.id, STALE_DATE);

        // Soft-delete `bad` up front via the real workflow, so the reaper's
        // own delete attempt on it exercises a real "already gone" failure
        // path without needing to mock anything.
        const { deletePromotionsWorkflow } =
          await import("@medusajs/core-flows");
        await deletePromotionsWorkflow(container()).run({
          input: { ids: [bad.id] },
        });

        const result = await reapStaleEphemeralPromotions(container(), 7);

        // `good` must still be deleted even though `bad` was already gone.
        expect(await stillExists(good.id)).toBe(false);
        expect(result.scanned).toBeGreaterThanOrEqual(1);
      });
    });
  },
});
