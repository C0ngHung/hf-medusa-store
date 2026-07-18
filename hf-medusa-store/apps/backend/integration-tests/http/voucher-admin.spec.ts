import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { Modules } from "@medusajs/framework/utils";
import {
  createPromotionsWorkflow,
  updatePromotionsWorkflow,
} from "@medusajs/core-flows";
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

    describe("POST /admin/vouchers — backing Promotion+Campaign provisioning (Decision H, Phase 2)", () => {
      it("provisions a real Promotion + Campaign mirroring the voucher config (V3 limit, V4 budget, V5 rule, V6 target_rule) and links promotion_id/campaign_id", async () => {
        const res = await api.post(
          "/admin/vouchers",
          {
            ...validBody(),
            code: "backing1",
            discount_type: "percentage",
            discount_value: 2000, // 20.00% -> Medusa value 20
            min_order_value: 500_000, // V5
            applicable_product_ids: ["prod_scoped_1"], // V6 product-only scope
            usage_limit: 100, // V3
            per_user_limit: 2, // V4
          },
          adminHeaders,
        );
        expect(res.status).toBe(201);
        const voucher = res.data.voucher;
        expect(voucher.promotion_id).toBeTruthy();
        expect(voucher.campaign_id).toBeTruthy();

        const promotionService = getContainer().resolve(Modules.PROMOTION);
        const promotion = await promotionService.retrievePromotion(
          voucher.promotion_id,
          {
            relations: [
              "application_method",
              "application_method.target_rules",
              "rules",
              "campaign",
              "campaign.budget",
            ],
          },
        );

        expect(promotion.code).toBe("BACKING1");
        expect(promotion.status).toBe("active");
        expect(promotion.limit).toBe(100); // V3 global limit
        expect(promotion.application_method?.type).toBe("percentage");
        expect(Number(promotion.application_method?.value)).toBe(20); // 2000 bps -> 20
        expect(promotion.application_method?.target_type).toBe("items");

        // V6 product scope → single-attribute target_rule
        const targetRules = promotion.application_method?.target_rules ?? [];
        expect(
          targetRules.some((r) => r.attribute === "items.product.id"),
        ).toBe(true);

        // V5 min-order → order-scope rule
        const rules = promotion.rules ?? [];
        expect(
          rules.some(
            (r) => r.attribute === "item_total" && r.operator === "gte",
          ),
        ).toBe(true);

        // V2 window + V4 per-customer usage budget
        expect(promotion.campaign?.id).toBe(voucher.campaign_id);
        expect(promotion.campaign?.budget?.type).toBe("use_by_attribute");
        expect(Number(promotion.campaign?.budget?.limit)).toBe(2);
      });
    });

    describe("POST /admin/vouchers — attach mode (Task 4, admin widget flow)", () => {
      it("attaches a voucher to an existing promotion (widget flow)", async () => {
        const { result: createdPromotions } = await createPromotionsWorkflow(
          getContainer(),
        ).run({
          input: {
            promotionsData: [
              {
                code: "ATTACHME",
                type: "standard",
                status: "active",
                application_method: {
                  type: "percentage",
                  target_type: "items",
                  allocation: "across",
                  value: 15, // 15% -> discount_value 1500 bps
                  currency_code: "vnd",
                },
              },
            ],
          },
        });
        const promo = createdPromotions[0];

        const res = await api.post(
          "/admin/vouchers",
          {
            promotion_id: promo.id,
            max_discount_amount: 500_000,
            min_order_value: 200_000,
            per_user_limit: 2,
          },
          adminHeaders,
        );
        expect(res.status).toBe(201);
        expect(res.data.voucher.promotion_id).toBe(promo.id);
        expect(res.data.voucher.max_discount_amount).toBe(500_000);
        expect(res.data.voucher.min_order_value).toBe(200_000);
        expect(res.data.voucher.discount_type).toBe("percentage");
        expect(res.data.voucher.discount_value).toBe(1500);
        expect(res.data.voucher.code).toBe("ATTACHME");

        // Guardrail (Decision C/G): the referenced Promotion — created here
        // directly via createPromotionsWorkflow, bypassing the admin voucher
        // create-mode that normally stamps this metadata — must now carry it
        // too, so block-voucher-promotion/analytics guardrails cover it.
        const promotionService = getContainer().resolve(Modules.PROMOTION);
        const promotion = (await promotionService.retrievePromotion(
          promo.id,
        )) as { metadata?: Record<string, unknown> | null };
        expect(promotion.metadata?.voucher_engine).toBe(true);
      });

      // Code-review Task 4 FIX 1 (HIGH, money-critical): attach mode derives
      // discount_value straight from the Promotion with no sanity bounds.
      // Medusa itself only bounds `percentage` to (0,100]; a `fixed_amount`
      // (Medusa type "fixed") promotion can have value 0. resolvePromotionSnapshotStep
      // must reject this with the SAME >= 1 bound create-mode enforces (INT-01).
      it("rejects attaching a fixed_amount promotion whose value is 0 with 400 (INVALID_DATA)", async () => {
        const { result: createdPromotions } = await createPromotionsWorkflow(
          getContainer(),
        ).run({
          input: {
            promotionsData: [
              {
                code: "ZEROFIXED",
                type: "standard",
                status: "active",
                application_method: {
                  type: "fixed",
                  target_type: "items",
                  allocation: "across",
                  value: 0,
                  currency_code: "vnd",
                },
              },
            ],
          },
        });
        const promo = createdPromotions[0];

        const err = await api
          .post("/admin/vouchers", { promotion_id: promo.id }, adminHeaders)
          .catch((e) => e.response);
        expect(err.status).toBe(400);
      });

      // Code-review Task 4 FIX 2 (MEDIUM): missing promotion previously threw
      // a plain Error (500) instead of a MedusaError NOT_FOUND (404).
      it("returns 404 when attaching a non-existent promotion_id", async () => {
        const err = await api
          .post(
            "/admin/vouchers",
            { promotion_id: "promo_does_not_exist_123" },
            adminHeaders,
          )
          .catch((e) => e.response);
        expect(err.status).toBe(404);
      });

      // Task 7 code-review FIX 2 (MEDIUM, race condition): two "Enable as
      // voucher" calls for the SAME promotion_id must not create two
      // voucher_config rows — the second attempt must be rejected and only
      // one row must exist afterward.
      it("rejects attaching a SECOND voucher to a promotion that already has one (400), leaving only one row", async () => {
        const { result: createdPromotions } = await createPromotionsWorkflow(
          getContainer(),
        ).run({
          input: {
            promotionsData: [
              {
                code: "DUPEATTACH",
                type: "standard",
                status: "active",
                application_method: {
                  type: "percentage",
                  target_type: "items",
                  allocation: "across",
                  value: 10,
                  currency_code: "vnd",
                },
              },
            ],
          },
        });
        const promo = createdPromotions[0];

        const first = await api.post(
          "/admin/vouchers",
          { promotion_id: promo.id, per_user_limit: 1 },
          adminHeaders,
        );
        expect(first.status).toBe(201);

        const err = await api
          .post(
            "/admin/vouchers",
            { promotion_id: promo.id, per_user_limit: 1 },
            adminHeaders,
          )
          .catch((e) => e.response);
        expect(err.status).toBeGreaterThanOrEqual(400);
        expect(err.status).toBeLessThan(500);

        const res = await api.get(
          `/admin/vouchers?promotion_id=${promo.id}`,
          adminHeaders,
        );
        expect(res.data.vouchers).toHaveLength(1);
        expect(res.data.vouchers[0].id).toBe(first.data.voucher.id);
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
