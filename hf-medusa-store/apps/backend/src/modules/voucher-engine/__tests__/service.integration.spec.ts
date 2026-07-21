/**
 * VoucherEngine module integration tests — real Postgres + real migrations
 * (Phase 3 testing requirements: module registration/service resolution,
 * migration/model validity, voucher lookup, active cap fallback).
 *
 * Uses `moduleIntegrationTestRunner` (@medusajs/test-utils): spins up a real,
 * disposable Postgres database, runs THIS module's migrations against it, and
 * resolves the actual registered `VoucherEngineService` from a real Medusa
 * module container — not a mock. `pnpm test:integration:modules` (module
 * runner only executes files directly under `src/modules/<name>/__tests__/`).
 */
import { moduleIntegrationTestRunner } from "@medusajs/test-utils";
import { VOUCHER_ENGINE_MODULE } from "..";
import VoucherEngineService from "../service";
import { DEFAULT_CAP_PCT } from "../constants";

moduleIntegrationTestRunner<VoucherEngineService>({
  moduleName: VOUCHER_ENGINE_MODULE,
  resolve: __dirname + "/..",
  testSuite: ({ service }) => {
    describe("VoucherEngineService (real DB)", () => {
      it("resolves the registered service from the module container", () => {
        // Not `toBeInstanceOf(VoucherEngineService)` — Medusa's module loader
        // requires the compiled service via its own module graph, so the
        // resolved instance and this test's static import are different
        // class references even though they're the same code. Assert the
        // real shape instead: our custom V1-V8/cap methods are present.
        expect(service).toBeDefined();
        expect(typeof service.findByCode).toBe("function");
        expect(typeof service.getActiveCap).toBe("function");
        expect(typeof service.countUserUsage).toBe("function");
        expect(typeof service.redeemVoucherAtomic).toBe("function");
        expect(typeof service.listVoucherConfigs).toBe("function");
      });

      it("findByCode returns null for a code that has no row", async () => {
        const voucher = await service.findByCode("NOPE123");
        expect(voucher).toBeNull();
      });

      it("findByCode normalizes case/whitespace to match the stored UPPERCASE code (V1)", async () => {
        await service.createVoucherConfigs({
          code: "SAVE10NOW",
          discount_type: "percentage",
          discount_value: 1000,
          valid_from: new Date("2020-01-01T00:00:00Z"),
          valid_to: new Date("2999-01-01T00:00:00Z"),
        });

        const voucher = await service.findByCode("  save10now ");
        expect(voucher).not.toBeNull();
        expect(voucher!.code).toBe("SAVE10NOW");
      });

      it("getActiveCap falls back to DEFAULT_CAP_PCT (5000 bps) when no active DiscountCapConfig row exists", async () => {
        const cap = await service.getActiveCap();
        expect(cap).toBe(DEFAULT_CAP_PCT);
        expect(cap).toBe(5000);
      });

      it("getActiveCap returns the active custom DiscountCapConfig row's percentage", async () => {
        await service.createDiscountCapConfigs({
          max_discount_percentage: 3000,
          is_active: true,
          updated_by: "admin_test",
        });

        const cap = await service.getActiveCap();
        expect(cap).toBe(3000);
      });

      it("getActiveCap ignores inactive DiscountCapConfig rows", async () => {
        await service.createDiscountCapConfigs({
          max_discount_percentage: 2000,
          is_active: false,
        });

        const cap = await service.getActiveCap();
        expect(cap).toBe(DEFAULT_CAP_PCT);
      });

      it("countUserUsage counts only this voucher+customer pair (V4) and stays append-only", async () => {
        const voucher = await service.createVoucherConfigs({
          code: "USAGE10LIMIT",
          discount_type: "fixed_amount",
          discount_value: 10_000,
          valid_from: new Date("2020-01-01T00:00:00Z"),
          valid_to: new Date("2999-01-01T00:00:00Z"),
        });

        expect(await service.countUserUsage(voucher.id, "cus_1")).toBe(0);

        const baseEntry = {
          currency_code: "vnd",
          voucher_code: "USAGE10LIMIT",
          discount_type: "fixed_amount" as const,
          discount_value: 10_000,
          raw_voucher_discount: 10_000,
          voucher_discount_after_voucher_cap: 10_000,
          final_voucher_discount: 10_000,
          discount_applied: 10_000,
          was_capped: false,
          original_discount: 10_000,
          cap_percentage_bps: 5000,
          original_subtotal: 100_000,
          item_promotion_discount: 0,
          applied_at: new Date(),
        };

        await service.redeemVoucherAtomic(voucher.id, null, {
          ...baseEntry,
          voucher_id: voucher.id,
          customer_id: "cus_1",
          order_id: "order_1",
        });
        await service.redeemVoucherAtomic(voucher.id, null, {
          ...baseEntry,
          voucher_id: voucher.id,
          customer_id: "cus_2",
          order_id: "order_2",
        });

        expect(await service.countUserUsage(voucher.id, "cus_1")).toBe(1);
        expect(await service.countUserUsage(voucher.id, "cus_2")).toBe(1);
        expect(await service.countUserUsage(voucher.id, "cus_3")).toBe(0);
      });

      it("persists product/category scope (V6) round-trip as plain id arrays", async () => {
        const voucher = await service.createVoucherConfigs({
          code: "SCOPEDVOUCHER",
          discount_type: "percentage",
          discount_value: 1500,
          valid_from: new Date("2020-01-01T00:00:00Z"),
          valid_to: new Date("2999-01-01T00:00:00Z"),
          // model.json() fields are generically typed Record<string, unknown>
          // by MedusaService's codegen, which doesn't express the actual
          // array-of-ids shape stored here (SPEC §5.4 scope) — cast at this
          // boundary rather than loosen the model/mapper types (mirrors
          // `PersistedVoucherConfig`'s `as` cast in `lib/mappers.ts`).
          applicable_product_ids: ["prod_racket", "prod_shuttle"],
          applicable_category_ids: ["cat_badminton"],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);

        const reloaded = await service.findByCode("SCOPEDVOUCHER");
        expect(reloaded!.applicable_product_ids).toEqual([
          "prod_racket",
          "prod_shuttle",
        ]);
        expect(reloaded!.applicable_category_ids).toEqual(["cat_badminton"]);
        expect(voucher.id).toBe(reloaded!.id);
      });

      it("unscoped voucher persists null scope arrays (both null => unscoped, V6)", async () => {
        await service.createVoucherConfigs({
          code: "UNSCOPEDVOUCHER",
          discount_type: "percentage",
          discount_value: 500,
          valid_from: new Date("2020-01-01T00:00:00Z"),
          valid_to: new Date("2999-01-01T00:00:00Z"),
        });

        const reloaded = await service.findByCode("UNSCOPEDVOUCHER");
        expect(reloaded!.applicable_product_ids).toBeNull();
        expect(reloaded!.applicable_category_ids).toBeNull();
      });

      it("enforces the unique index on code (V1 uniqueness)", async () => {
        await service.createVoucherConfigs({
          code: "DUPECODE1",
          discount_type: "percentage",
          discount_value: 1000,
          valid_from: new Date("2020-01-01T00:00:00Z"),
          valid_to: new Date("2999-01-01T00:00:00Z"),
        });

        await expect(
          service.createVoucherConfigs({
            code: "DUPECODE1",
            discount_type: "percentage",
            discount_value: 2000,
            valid_from: new Date("2020-01-01T00:00:00Z"),
            valid_to: new Date("2999-01-01T00:00:00Z"),
          }),
        ).rejects.toThrow();
      });

      // Tasks 3.6.4/3.6.5/3.6.7 — atomic redemption + idempotency (SPEC §14.3, Decision D).
      describe("redeemVoucherAtomic (real DB transaction)", () => {
        const usageLogEntry = (
          overrides: Partial<Record<string, unknown>>,
        ) => ({
          currency_code: "vnd",
          voucher_code: "REDEEM10",
          discount_type: "percentage" as const,
          discount_value: 1000,
          raw_voucher_discount: 10_000,
          voucher_discount_after_voucher_cap: 10_000,
          final_voucher_discount: 10_000,
          discount_applied: 10_000,
          original_discount: 10_000,
          was_capped: false,
          cap_percentage_bps: 5000,
          original_subtotal: 100_000,
          item_promotion_discount: 0,
          applied_at: new Date(),
          ...overrides,
        });

        it("increments usage_count and inserts an immutable usage log in one transaction", async () => {
          const voucher = await service.createVoucherConfigs({
            code: "REDEEM10",
            discount_type: "percentage",
            discount_value: 1000,
            usage_limit: 5,
            valid_from: new Date("2020-01-01T00:00:00Z"),
            valid_to: new Date("2999-01-01T00:00:00Z"),
          });

          const result = await service.redeemVoucherAtomic(
            voucher.id,
            5,
            usageLogEntry({
              voucher_id: voucher.id,
              customer_id: "cus_redeem_1",
              order_id: "order_redeem_1",
            }) as any,
          );

          expect(result.incremented).toBe(true);
          expect(result.usage_log_id).toBeDefined();

          const reloaded = await service.retrieveVoucherConfig(voucher.id);
          expect(reloaded.usage_count).toBe(1);

          const [, count] = await service.listAndCountVoucherUsageLogs({
            voucher_id: voucher.id,
            order_id: "order_redeem_1",
          });
          expect(count).toBe(1);
        });

        it("fails closed (incremented:false, no log) when usage_limit is already exhausted", async () => {
          const voucher = await service.createVoucherConfigs({
            code: "EXHAUSTED10",
            discount_type: "percentage",
            discount_value: 1000,
            usage_limit: 1,
            usage_count: 1, // already at the limit
            valid_from: new Date("2020-01-01T00:00:00Z"),
            valid_to: new Date("2999-01-01T00:00:00Z"),
          });

          const result = await service.redeemVoucherAtomic(
            voucher.id,
            1,
            usageLogEntry({
              voucher_id: voucher.id,
              customer_id: "cus_redeem_2",
              order_id: "order_redeem_2",
            }) as any,
          );

          expect(result.incremented).toBe(false);
          expect(result.usage_log_id).toBeUndefined();

          const reloaded = await service.retrieveVoucherConfig(voucher.id);
          expect(reloaded.usage_count).toBe(1); // unchanged — no double-count

          const [, count] = await service.listAndCountVoucherUsageLogs({
            voucher_id: voucher.id,
            order_id: "order_redeem_2",
          });
          expect(count).toBe(0); // no log written for a failed redemption
        });

        it("rejects a second insert for the same (voucher_id, order_id) — unique-index idempotency guard (§14.3)", async () => {
          const voucher = await service.createVoucherConfigs({
            code: "IDEMPOTENT10",
            discount_type: "percentage",
            discount_value: 1000,
            usage_limit: 10,
            valid_from: new Date("2020-01-01T00:00:00Z"),
            valid_to: new Date("2999-01-01T00:00:00Z"),
          });

          const entry = usageLogEntry({
            voucher_id: voucher.id,
            customer_id: "cus_redeem_3",
            order_id: "order_redeem_3",
          });

          const first = await service.redeemVoucherAtomic(
            voucher.id,
            10,
            entry as any,
          );
          expect(first.incremented).toBe(true);

          // A genuine duplicate (voucher_id, order_id) — the durable unique
          // index must reject this even though the pre-check (a separate
          // workflow step, not exercised here) would normally short-circuit
          // it first.
          await expect(
            service.redeemVoucherAtomic(voucher.id, 10, entry as any),
          ).rejects.toThrow();

          // usage_count incremented only ONCE despite two redeemVoucherAtomic
          // calls — the rejected second insert's transaction rolled back its
          // own conditional UPDATE too.
          const reloaded = await service.retrieveVoucherConfig(voucher.id);
          expect(reloaded.usage_count).toBe(1);
        });

        // Task 3.6.6 — anti-over-redemption under CONCURRENT orders (SPEC §14.3
        // "conditional WHERE prevents the read-check-write race", §16.5). The
        // sequential tests above prove the guard fires; this proves it holds
        // when many orders redeem the SAME voucher AT ONCE near its limit.
        it("never exceeds usage_limit under concurrent redemptions (3.6.6, §14.3/§16.5)", async () => {
          const LIMIT = 3;
          const CONCURRENT = 8; // more than the limit, all firing at once
          const voucher = await service.createVoucherConfigs({
            code: "CONCURRENT10",
            discount_type: "percentage",
            discount_value: 1000,
            usage_limit: LIMIT,
            valid_from: new Date("2020-01-01T00:00:00Z"),
            valid_to: new Date("2999-01-01T00:00:00Z"),
          });

          // Distinct order_ids so the (voucher_id, order_id) idempotency guard
          // never fires — this isolates the usage_limit race from idempotency.
          const results = await Promise.all(
            Array.from({ length: CONCURRENT }, (_, i) =>
              service.redeemVoucherAtomic(
                voucher.id,
                LIMIT,
                usageLogEntry({
                  voucher_id: voucher.id,
                  customer_id: `cus_concurrent_${i}`,
                  order_id: `order_concurrent_${i}`,
                }) as any,
              ),
            ),
          );

          // EXACTLY `LIMIT` redemptions may succeed; the rest fail closed.
          const succeeded = results.filter((r) => r.incremented).length;
          expect(succeeded).toBe(LIMIT);

          // The authoritative counter never overshoots the limit.
          const reloaded = await service.retrieveVoucherConfig(voucher.id);
          expect(reloaded.usage_count).toBe(LIMIT);

          // Exactly `LIMIT` immutable usage logs were written (one per success).
          const [, logCount] = await service.listAndCountVoucherUsageLogs({
            voucher_id: voucher.id,
          });
          expect(logCount).toBe(LIMIT);
        });
      });
    });
  },
});
