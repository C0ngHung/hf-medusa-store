import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { VOUCHER_ENGINE_MODULE } from "..";
import type VoucherEngineService from "../service";
import backfillVoucherPromotions from "../../../scripts/backfill-voucher-promotions";

jest.setTimeout(120_000);

/**
 * Rebuild Phase 1 backfill script (`npx medusa exec
 * ./src/scripts/backfill-voucher-promotions.ts`) — legacy `voucher_config` rows
 * created before the Promotion-first rebuild have `promotion_id: null`. Uses
 * `medusaIntegrationTestRunner` (full app, real Promotion module + link) — same
 * precedent as `create-voucher-workflow.integration.spec.ts`.
 */
medusaIntegrationTestRunner({
  testSuite: ({ getContainer }) => {
    describe("backfillVoucherPromotions (real DB, idempotent)", () => {
      function container() {
        return getContainer();
      }

      function ve() {
        return container().resolve(
          VOUCHER_ENGINE_MODULE,
        ) as VoucherEngineService;
      }

      // Simulates a pre-Phase-1 legacy row: created directly via the service,
      // bypassing createVoucherWorkflow entirely, so promotion_id stays null.
      async function seedLegacyVoucher(code: string) {
        return ve().createVoucherConfigs({
          code,
          discount_type: "percentage",
          discount_value: 1500,
          valid_from: new Date("2020-01-01T00:00:00Z"),
          valid_to: new Date("2999-01-01T00:00:00Z"),
        });
      }

      it("creates a Promotion for a legacy unlinked voucher_config and sets its promotion_id, without creating a duplicate row", async () => {
        const legacy = await seedLegacyVoucher("LEGACYBACKFILL1");
        expect(legacy.promotion_id).toBeNull();

        const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
        await backfillVoucherPromotions({
          container: {
            resolve: (key: string) =>
              key === "logger" ? logger : container().resolve(key),
          },
        } as any);

        const reloaded = await ve().retrieveVoucherConfig(legacy.id);
        expect(reloaded.promotion_id).toBeTruthy();

        // The link resolves — a real Promotion with this voucher's code exists.
        const query = container().resolve(ContainerRegistrationKeys.QUERY);
        const { data } = await query.graph({
          entity: "voucher_config",
          filters: { id: legacy.id },
          fields: ["id", "promotion.id", "promotion.code"],
        });
        expect((data[0] as any).promotion.id).toBe(reloaded.promotion_id);
        expect((data[0] as any).promotion.code).toBe("LEGACYBACKFILL1");

        // No duplicate voucher_config row was created for this code — the
        // backfill script deliberately omits additional_data.voucher_config so
        // the promotionsCreated hook does not re-provision a second row.
        const matches = await ve().listVoucherConfigs({
          code: "LEGACYBACKFILL1",
        });
        expect(matches).toHaveLength(1);
        expect(matches[0].id).toBe(legacy.id);
      });

      it("running the backfill twice does not create a second Promotion or change the row further (idempotent)", async () => {
        const legacy = await seedLegacyVoucher("LEGACYBACKFILL2");

        const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
        const scopedContainer = {
          resolve: (key: string) =>
            key === "logger" ? logger : container().resolve(key),
        } as any;

        await backfillVoucherPromotions({ container: scopedContainer, args: [] });
        const afterFirst = await ve().retrieveVoucherConfig(legacy.id);
        expect(afterFirst.promotion_id).toBeTruthy();
        const promotionIdAfterFirst = afterFirst.promotion_id;

        // Second run: the row is no longer `promotion_id: null`, so the
        // `listVoucherConfigs({ promotion_id: null })` query must now exclude
        // it — nothing to do for this voucher on the second pass.
        await backfillVoucherPromotions({ container: scopedContainer, args: [] });
        const afterSecond = await ve().retrieveVoucherConfig(legacy.id);
        expect(afterSecond.promotion_id).toBe(promotionIdAfterFirst);

        const matches = await ve().listVoucherConfigs({
          code: "LEGACYBACKFILL2",
        });
        expect(matches).toHaveLength(1);
      });

      it("does nothing when every voucher_config row already has a promotion_id", async () => {
        const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
        const scopedContainer = {
          resolve: (key: string) =>
            key === "logger" ? logger : container().resolve(key),
        } as any;

        // Ensure the two seeded-above rows (or a fresh linked one) already have
        // promotion_id set, then confirm a further run is a no-op message.
        await ve().createVoucherConfigs({
          code: "ALREADYLINKED",
          discount_type: "percentage",
          discount_value: 1000,
          promotion_id: "promo_fake_already_linked",
          valid_from: new Date("2020-01-01T00:00:00Z"),
          valid_to: new Date("2999-01-01T00:00:00Z"),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);

        const unlinkedBefore = await ve().listVoucherConfigs({
          promotion_id: null,
        });

        await backfillVoucherPromotions({ container: scopedContainer, args: [] });

        if (unlinkedBefore.length === 0) {
          expect(logger.info).toHaveBeenCalledWith(
            expect.stringContaining("Nothing to backfill"),
          );
        }

        // The already-linked row is untouched either way.
        const stillLinked = await ve().retrieveVoucherConfig(
          (await ve().listVoucherConfigs({ code: "ALREADYLINKED" }))[0].id,
        );
        expect(stillLinked.promotion_id).toBe("promo_fake_already_linked");
      });
    });
  },
});
