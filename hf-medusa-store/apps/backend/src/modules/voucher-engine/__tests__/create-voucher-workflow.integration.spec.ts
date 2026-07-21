import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { createPromotionsWorkflow } from "@medusajs/core-flows";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { VOUCHER_ENGINE_MODULE } from "..";
import type VoucherEngineService from "../service";
import { createVoucherWorkflow } from "../../../workflows/voucher-engine/admin/create-voucher";

jest.setTimeout(120_000);

/**
 * Rebuild Phase 1 (SRS §5.2 "VoucherConfig extends Promotion") — Promotion-first
 * `createVoucherWorkflow` + `promotionsCreated` hook, against a REAL full app
 * container (`medusaIntegrationTestRunner`, same precedent as
 * `cache-ratelimit.integration.spec.ts`). A plain `moduleIntegrationTestRunner`
 * only loads VoucherEngine's own module/migrations in isolation — it would
 * register neither the Promotion module, the `workflows/hooks/*` hook, nor the
 * `voucher-config-promotion` Link this flow depends on.
 */
medusaIntegrationTestRunner({
  testSuite: ({ getContainer }) => {
    describe("createVoucherWorkflow (Promotion-first, real DB)", () => {
      function container() {
        return getContainer();
      }

      function ve() {
        return container().resolve(
          VOUCHER_ENGINE_MODULE,
        ) as VoucherEngineService;
      }

      const baseInput = (overrides: Record<string, unknown> = {}) => ({
        code: "REBUILDP1",
        discount_type: "percentage" as const,
        discount_value: 2000, // 20.00%
        min_order_value: 100_000,
        max_discount_amount: 300_000,
        applicable_product_ids: ["prod_racket", "prod_shuttle"],
        applicable_category_ids: null,
        stackable_with_promotions: true,
        per_user_limit: 2,
        usage_limit: 50,
        user_segment_conditions: null,
        valid_from: new Date("2026-01-01T00:00:00.000Z"),
        valid_to: new Date("2026-12-31T23:59:59.000Z"),
        is_active: true,
        ...overrides,
      });

      it("creates a real Promotion, provisions a linked VoucherConfig, and the link resolves via query.graph", async () => {
        const { result: voucher } = await createVoucherWorkflow(
          container(),
        ).run({ input: baseInput() });

        // (b) VoucherConfig row carries the original SRS fields + promotion_id.
        expect(voucher.code).toBe("REBUILDP1");
        expect(voucher.promotion_id).toBeTruthy();
        expect(voucher.min_order_value).toBe(100_000);
        expect(voucher.max_discount_amount).toBe(300_000);
        expect(voucher.applicable_product_ids).toEqual([
          "prod_racket",
          "prod_shuttle",
        ]);
        expect(voucher.applicable_category_ids).toBeNull();
        expect(voucher.stackable_with_promotions).toBe(true);
        expect(voucher.per_user_limit).toBe(2);
        expect(voucher.usage_limit).toBe(50);
        expect(voucher.user_segment_conditions).toBeNull();

        // Re-read from the DB directly (not just the workflow's return value)
        // to prove the row was actually persisted, not just constructed in memory.
        const reloaded = await ve().retrieveVoucherConfig(voucher.id);
        expect(reloaded.promotion_id).toBe(voucher.promotion_id);

        // (a) A real Promotion row exists with the expected code/status/
        // application_method/campaign, AND (c) the link resolves through
        // query.graph on voucher_config -> promotion.*.
        const query = container().resolve(ContainerRegistrationKeys.QUERY);
        const { data } = await query.graph({
          entity: "voucher_config",
          filters: { id: voucher.id },
          fields: [
            "id",
            "promotion.id",
            "promotion.code",
            "promotion.status",
            "promotion.is_automatic",
            "promotion.application_method.type",
            "promotion.application_method.target_type",
            "promotion.application_method.allocation",
            "promotion.application_method.value",
            "promotion.application_method.currency_code",
            "promotion.campaign.campaign_identifier",
            "promotion.campaign.name",
          ],
        });

        expect(data).toHaveLength(1);
        const linkedPromotion = (data[0] as any).promotion;
        expect(linkedPromotion.id).toBe(voucher.promotion_id);
        expect(linkedPromotion.code).toBe("REBUILDP1");
        expect(linkedPromotion.status).toBe("active");
        expect(linkedPromotion.is_automatic).toBe(false);
        expect(linkedPromotion.application_method.type).toBe("percentage");
        expect(linkedPromotion.application_method.target_type).toBe("items");
        expect(linkedPromotion.application_method.allocation).toBe("across");
        expect(linkedPromotion.application_method.value).toBe(20);
        expect(linkedPromotion.application_method.currency_code).toBe("vnd");
        expect(linkedPromotion.campaign.campaign_identifier).toBe("REBUILDP1");
        expect(linkedPromotion.campaign.name).toBe("REBUILDP1");
      });

      it("maps is_active=false and fixed_amount discount_type onto the created Promotion", async () => {
        const { result: voucher } = await createVoucherWorkflow(
          container(),
        ).run({
          input: baseInput({
            code: "REBUILDP1FIX",
            discount_type: "fixed_amount",
            discount_value: 75_000,
            applicable_product_ids: null,
            is_active: false,
          }),
        });

        const promotionModule: any = container().resolve(Modules.PROMOTION);
        const promotion = await promotionModule.retrievePromotion(
          voucher.promotion_id,
          { relations: ["application_method"] },
        );

        expect(promotion.status).toBe("inactive");
        expect(promotion.application_method.type).toBe("fixed");
        expect(promotion.application_method.target_type).toBe("order");
        expect(promotion.application_method.value).toBe(75_000);
      });

      it("promotionsCreated hook's guard: a Promotion created WITHOUT additional_data.voucher_config never creates a VoucherConfig row (ephemeral-carrier coexistence)", async () => {
        const { result: promotions } = await createPromotionsWorkflow(
          container(),
        ).run({
          input: {
            promotionsData: [
              {
                code: "VEPH-NOHOOK-TEST",
                type: "standard",
                status: "active",
                is_automatic: false,
                application_method: {
                  type: "fixed",
                  target_type: "items",
                  allocation: "across",
                  value: 1_000,
                  currency_code: "vnd",
                },
              },
            ],
          },
        });

        const created = promotions[0];
        const matches = await ve().listVoucherConfigs({
          promotion_id: created.id,
        });
        expect(matches).toHaveLength(0);
      });

      it("promotionsCreated hook's guard: a native /admin/promotions-shaped call that spoofs the namespaced additional_data key WITHOUT the internal source marker never creates a VoucherConfig row (Phase 1 review hardening)", async () => {
        const { result: promotions } = await createPromotionsWorkflow(
          container(),
        ).run({
          input: {
            promotionsData: [
              {
                code: "VEPH-SPOOF-TEST",
                type: "standard",
                status: "active",
                is_automatic: false,
                application_method: {
                  type: "fixed",
                  target_type: "items",
                  allocation: "across",
                  value: 1_000,
                  currency_code: "vnd",
                },
              },
            ],
            // Simulates a caller of the NATIVE /admin/promotions route
            // hand-constructing a payload shaped like VoucherEngine's own
            // namespaced key — but without the internal `source` marker only
            // `createVoucherWorkflow` sets. The hook must reject this even
            // though the namespace and voucher_config shape both look valid.
            additional_data: {
              voucher_engine: {
                voucher_config: {
                  code: "VEPH-SPOOF-TEST",
                  discount_type: "fixed_amount",
                  discount_value: 1_000,
                  stackable_with_promotions: true,
                  per_user_limit: 1,
                  is_active: true,
                  valid_from: new Date("2026-01-01T00:00:00.000Z"),
                  valid_to: new Date("2026-12-31T23:59:59.000Z"),
                },
              },
            },
          },
        });

        const created = promotions[0];
        const matches = await ve().listVoucherConfigs({
          promotion_id: created.id,
        });
        expect(matches).toHaveLength(0);
      });
    });
  },
});
