import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import {
  cache,
  getCachedVoucherConfig,
  setCachedVoucherConfig,
  invalidateVoucherConfig,
} from "../../../lib/voucher-cache";
import {
  recordFailedAttempt,
  isRateLimited,
  resetFailedAttempts,
} from "../../../lib/voucher-rate-limit";
import { FAIL_THRESHOLD } from "../constants";

jest.setTimeout(120_000);

/**
 * Module integration — exercises the VoucherEngine Redis helpers against the REAL
 * cache module the app boots with (Redis on 6380 when REDIS_URL is set; in-memory
 * otherwise). Covers cache scope-safety (3.7.1/3.7.2), rate-limit counter +
 * cooldown (3.7.3–3.7.5), and the atomic-ish usage foundation path (3.7.7 degrade).
 */
medusaIntegrationTestRunner({
  testSuite: ({ getContainer }) => {
    describe("VoucherEngine cache + rate-limit (Redis) — Day 4", () => {
      it("resolves a cache module (Redis or in-memory) — never crashes", () => {
        expect(cache(getContainer())).not.toBeUndefined();
      });

      it("caches config and reads it back by normalized code (3.7.1/3.7.2)", async () => {
        const container = getContainer();
        const snapshot = { code: "SAVE10", is_active: true };
        await setCachedVoucherConfig(container, "SAVE10", snapshot);
        // Lower-case lookup must hit — key builder normalizes (V1).
        const got = await getCachedVoucherConfig<typeof snapshot>(
          container,
          "save10",
        );
        expect(got).toMatchObject({ code: "SAVE10", is_active: true });

        await invalidateVoucherConfig(container, "SAVE10");
        expect(await getCachedVoucherConfig(container, "SAVE10")).toBeNull();
      });

      it("blocks after 5 failed attempts and keeps the cooldown (3.7.4/3.7.5)", async () => {
        const container = getContainer();
        const customer = "cus_ratelimit_1";
        const ip = "203.0.113.10";
        await resetFailedAttempts(container, customer, ip);

        let last = { blocked: false, count: 0 };
        for (let i = 0; i < FAIL_THRESHOLD; i++) {
          last = await recordFailedAttempt(container, customer, ip);
        }
        expect(last.count).toBe(FAIL_THRESHOLD);
        expect(last.blocked).toBe(true);
        expect(await isRateLimited(container, customer, ip)).toBe(true);
      });

      it("does not block a fresh (customer, ip) pair", async () => {
        const container = getContainer();
        expect(
          await isRateLimited(container, "cus_fresh", "198.51.100.7"),
        ).toBe(false);
      });

      it("reset clears the failed-attempt counter (3.7.3)", async () => {
        const container = getContainer();
        const customer = "cus_ratelimit_2";
        const ip = "203.0.113.20";
        await recordFailedAttempt(container, customer, ip);
        await recordFailedAttempt(container, customer, ip);
        await resetFailedAttempts(container, customer, ip);
        // After reset the next failure starts the count again at 1.
        const next = await recordFailedAttempt(container, customer, ip);
        expect(next.count).toBe(1);
        expect(next.blocked).toBe(false);
      });
    });
  },
});
