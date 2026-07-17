import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { createAdminUser } from "./helpers/create-admin-user";
import { VOUCHER_ENGINE_MODULE } from "../../src/modules/voucher-engine";
import type VoucherEngineService from "../../src/modules/voucher-engine/service";

jest.setTimeout(120_000);

/**
 * HTTP integration — admin voucher APIs (3.4.11–3.4.13, SRS §6.4).
 * POST /admin/vouchers (create, code auto-gen/normalize, input validation) and
 * GET /admin/vouchers/:id/analytics (aggregation shape). Auth: admin only (SEC-04).
 */
medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    let adminHeaders: { headers: { authorization: string } };

    beforeAll(async () => {
      adminHeaders = await createAdminUser(getContainer());
    });

    const validBody = () => ({
      discount_type: "percentage",
      discount_value: 1000, // 10.00%
      stackable_with_promotions: true,
      per_user_limit: 1,
      valid_from: "2026-01-01T00:00:00.000Z",
      valid_to: "2026-12-31T23:59:59.000Z",
      is_active: true,
    });

    describe("POST /admin/vouchers (3.4.11/3.4.13)", () => {
      it("requires admin auth (SEC-04)", async () => {
        const err = await api
          .post("/admin/vouchers", validBody())
          .catch((e) => e.response);
        expect(err.status).toBe(401);
      });

      it("creates a voucher and auto-generates an UPPERCASE code", async () => {
        const res = await api.post(
          "/admin/vouchers",
          validBody(),
          adminHeaders,
        );
        expect(res.status).toBe(201);
        expect(res.data.voucher.id).toBeTruthy();
        expect(res.data.voucher.code).toMatch(/^[A-Z0-9]{6,}$/);
      });

      // Rebuild Phase 1 (SRS §5.2 "VoucherConfig extends Promotion") —
      // response-contract compatibility: the `{ voucher: {...} }` shape is
      // unchanged, but `promotion_id` is now a REAL, non-null Promotion id
      // (previously null/absent, since no Promotion was ever created).
      it("response contract stays { voucher: {...} } and promotion_id is now a real, non-null Promotion id", async () => {
        const res = await api.post(
          "/admin/vouchers",
          { ...validBody(), code: "PROMOLINKED1" },
          adminHeaders,
        );
        expect(res.status).toBe(201);
        expect(Object.keys(res.data)).toEqual(["voucher"]);
        expect(res.data.voucher.promotion_id).toEqual(expect.any(String));
        expect(res.data.voucher.promotion_id).not.toBeNull();
      });

      it("normalizes a supplied lowercase code to UPPERCASE (SEC-03)", async () => {
        const res = await api.post(
          "/admin/vouchers",
          { ...validBody(), code: "spring24" },
          adminHeaders,
        );
        expect(res.status).toBe(201);
        expect(res.data.voucher.code).toBe("SPRING24");
      });

      it("rejects invalid input with 400 (window inverted)", async () => {
        const err = await api
          .post(
            "/admin/vouchers",
            {
              ...validBody(),
              valid_from: "2026-12-31T00:00:00.000Z",
              valid_to: "2026-01-01T00:00:00.000Z",
            },
            adminHeaders,
          )
          .catch((e) => e.response);
        expect(err.status).toBe(400);
      });

      it("rejects discount_value = 0 with 400 (meaningless voucher)", async () => {
        const err = await api
          .post(
            "/admin/vouchers",
            { ...validBody(), discount_value: 0 },
            adminHeaders,
          )
          .catch((e) => e.response);
        expect(err.status).toBe(400);
      });

      it("rejects percentage > 100% (10000 bps) with 400", async () => {
        const err = await api
          .post(
            "/admin/vouchers",
            { ...validBody(), discount_value: 9_999_999 },
            adminHeaders,
          )
          .catch((e) => e.response);
        expect(err.status).toBe(400);
      });
    });

    describe("GET /admin/vouchers/:id/analytics (3.4.12)", () => {
      it("returns the analytics shape for a fresh voucher (all zeros)", async () => {
        const created = await api.post(
          "/admin/vouchers",
          validBody(),
          adminHeaders,
        );
        const id = created.data.voucher.id;

        const res = await api.get(
          `/admin/vouchers/${id}/analytics`,
          adminHeaders,
        );
        expect(res.status).toBe(200);
        expect(res.data.analytics).toEqual(
          expect.objectContaining({
            voucher_id: id,
            total_uses: 0,
            total_discount_given: 0,
            avg_order_value: 0,
            capped_count: 0,
            conversion_rate: 0,
          }),
        );
      });

      // Code-review Task 7.2: analytics now aggregates voucher_usage_log at
      // the DB layer (COUNT/SUM/COUNT FILTER) instead of fetching every row
      // and reducing in JS — this pins the aggregate's numeric output against
      // several real rows, not just the empty/all-zero case above.
      it("aggregates total_uses/total_discount_given/capped_count correctly across several real usage-log rows", async () => {
        const created = await api.post(
          "/admin/vouchers",
          validBody(),
          adminHeaders,
        );
        const id = created.data.voucher.id;

        const service = getContainer().resolve(
          VOUCHER_ENGINE_MODULE,
        ) as VoucherEngineService;
        const rows = [
          { order_id: "order_1", discount_applied: 100_000, was_capped: false },
          { order_id: "order_2", discount_applied: 250_000, was_capped: true },
          { order_id: "order_3", discount_applied: 50_000, was_capped: true },
        ];
        await service.createVoucherUsageLogs(
          rows.map((r) => ({
            voucher_id: id,
            customer_id: "cus_test_fixture",
            order_id: r.order_id,
            currency_code: "vnd",
            voucher_code: "ANALYTICS-TEST",
            discount_type: "percentage" as const,
            discount_value: 1000,
            raw_voucher_discount: r.discount_applied,
            voucher_discount_after_voucher_cap: r.discount_applied,
            final_voucher_discount: r.discount_applied,
            discount_applied: r.discount_applied,
            original_discount: r.discount_applied,
            was_capped: r.was_capped,
            cap_percentage_bps: 5000,
            original_subtotal: 2_000_000,
            item_promotion_discount: 0,
            applied_at: new Date(),
          })),
        );

        const res = await api.get(
          `/admin/vouchers/${id}/analytics`,
          adminHeaders,
        );
        expect(res.status).toBe(200);
        expect(res.data.analytics).toEqual(
          expect.objectContaining({
            voucher_id: id,
            total_uses: 3,
            total_discount_given: 400_000,
            capped_count: 2,
            avg_order_value: 0,
            conversion_rate: 0,
          }),
        );
      });
    });

    describe("GET /admin/vouchers (list, admin table)", () => {
      it("requires admin auth (SEC-04)", async () => {
        const err = await api.get("/admin/vouchers").catch((e) => e.response);
        expect(err.status).toBe(401);
      });

      it("lists created vouchers with the table's required fields", async () => {
        const created = await api.post(
          "/admin/vouchers",
          { ...validBody(), code: "LISTME10" },
          adminHeaders,
        );
        const id = created.data.voucher.id;

        const res = await api.get("/admin/vouchers", adminHeaders);
        expect(res.status).toBe(200);
        expect(typeof res.data.count).toBe("number");
        expect(Array.isArray(res.data.vouchers)).toBe(true);

        const row = res.data.vouchers.find((v: any) => v.id === id);
        expect(row).toEqual(
          expect.objectContaining({
            id,
            code: "LISTME10",
            discount_type: "percentage",
            discount_value: 1000,
            usage_limit: null,
            usage_count: 0,
            is_active: true,
          }),
        );
        expect(row.valid_from).toBeTruthy();
        expect(row.valid_to).toBeTruthy();
        expect(row.created_at).toBeTruthy();
        expect(row.updated_at).toBeTruthy();
      });

      it("never includes native Promotion fields (reads voucher_config only)", async () => {
        const res = await api.get("/admin/vouchers", adminHeaders);
        for (const row of res.data.vouchers) {
          expect(row).not.toHaveProperty("application_method");
          expect(row).not.toHaveProperty("promotion_id");
        }
      });
    });
  },
});
