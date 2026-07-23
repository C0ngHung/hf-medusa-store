import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { createAdminUser } from "./helpers/create-admin-user";
import { VOUCHER_ENGINE_MODULE } from "../../src/modules/voucher-engine";
import { DEFAULT_CAP_PCT } from "../../src/modules/voucher-engine/constants";
import type VoucherEngineService from "../../src/modules/voucher-engine/service";

jest.setTimeout(120_000);

/**
 * HTTP integration — admin DiscountCapConfig API (SRS §5.2: "managed via
 * admin API, single active record, history tracked via updated_at";
 * Rebuild Phase 3A). GET/POST `/admin/discount-cap-config` only — no
 * `:id` route, since this is a global singleton, not a collection.
 *
 * `medusaIntegrationTestRunner` resets the DB between tests in the same
 * file (see `apply-remove-voucher.spec.ts`'s header note) — the
 * create-then-update-in-place assertion therefore runs as sequential steps
 * inside ONE `it`, not as separate tests relying on cross-test state.
 */
medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    let adminHeaders: { headers: { authorization: string } };

    beforeAll(async () => {
      adminHeaders = await createAdminUser(getContainer());
    });

    function ve() {
      return getContainer().resolve(
        VOUCHER_ENGINE_MODULE,
      ) as VoucherEngineService;
    }

    describe("GET/POST /admin/discount-cap-config (SRS §5.2)", () => {
      it("requires admin auth (SEC-04)", async () => {
        const err = await api
          .get("/admin/discount-cap-config")
          .catch((e) => e.response);
        expect(err.status).toBe(401);
      });

      it("GET returns the default config when no active row exists", async () => {
        const res = await api.get("/admin/discount-cap-config", adminHeaders);

        expect(res.status).toBe(200);
        expect(res.data.discount_cap_config).toEqual({
          id: null,
          max_discount_percentage: DEFAULT_CAP_PCT,
          is_active: true,
          updated_at: null,
          updated_by: null,
        });
      });

      it("POST creates the active config, a second POST updates the SAME row (never a second active row), and GET reflects the latest value", async () => {
        const created = await api.post(
          "/admin/discount-cap-config",
          { max_discount_percentage: 4000 },
          adminHeaders,
        );
        expect(created.status).toBe(200);
        expect(created.data.discount_cap_config.max_discount_percentage).toBe(
          4000,
        );
        expect(created.data.discount_cap_config.is_active).toBe(true);
        expect(created.data.discount_cap_config.id).toBeTruthy();
        const createdId = created.data.discount_cap_config.id;

        const updated = await api.post(
          "/admin/discount-cap-config",
          { max_discount_percentage: 3000 },
          adminHeaders,
        );
        expect(updated.status).toBe(200);
        expect(updated.data.discount_cap_config.id).toBe(createdId);
        expect(updated.data.discount_cap_config.max_discount_percentage).toBe(
          3000,
        );

        // Exactly one row ever exists — the second POST updated in place,
        // never created a second active record.
        const [, count] = await ve().listAndCountDiscountCapConfigs({});
        expect(count).toBe(1);

        const fetched = await api.get(
          "/admin/discount-cap-config",
          adminHeaders,
        );
        expect(fetched.data.discount_cap_config.id).toBe(createdId);
        expect(fetched.data.discount_cap_config.max_discount_percentage).toBe(
          3000,
        );
      });

      it("rejects an invalid max_discount_percentage (>100%, non-integer, or missing) with 400", async () => {
        const tooHigh = await api
          .post(
            "/admin/discount-cap-config",
            { max_discount_percentage: 10001 },
            adminHeaders,
          )
          .catch((e) => e.response);
        expect(tooHigh.status).toBe(400);

        const nonInteger = await api
          .post(
            "/admin/discount-cap-config",
            { max_discount_percentage: 50.5 },
            adminHeaders,
          )
          .catch((e) => e.response);
        expect(nonInteger.status).toBe(400);

        const missing = await api
          .post("/admin/discount-cap-config", {}, adminHeaders)
          .catch((e) => e.response);
        expect(missing.status).toBe(400);
      });
    });
  },
});
