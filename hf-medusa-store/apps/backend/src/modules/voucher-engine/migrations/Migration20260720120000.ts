import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * VoucherEngine Admin unified-model rebuild — DB-level duplicate guard for
 * "Enable VoucherEngine on an existing Promotion" (`POST
 * /admin/promotions/:promotion_id/voucher-config`). An application-level
 * check (query for an existing `voucher_config` row with this `promotion_id`
 * before creating a new one) cannot alone prevent two concurrent Enable
 * requests for the same Promotion from both passing that check before either
 * insert commits — a partial unique index is the actual guarantee, matching
 * the same pattern already used for `voucher_usage_log`'s
 * `(voucher_id, order_id)` uniqueness (`Migration20260714091302.ts`).
 * Partial (`WHERE promotion_id IS NOT NULL`) because `promotion_id` is
 * nullable — most historical rows created before Rebuild Phase 1 have no
 * linked Promotion yet and must not collide with each other on `NULL`.
 */
export class Migration20260720120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_voucher_config_promotion_id_unique" ON "voucher_config" ("promotion_id") WHERE ("promotion_id" IS NOT NULL AND "deleted_at" IS NULL);`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `drop index if exists "IDX_voucher_config_promotion_id_unique";`,
    );
  }
}
