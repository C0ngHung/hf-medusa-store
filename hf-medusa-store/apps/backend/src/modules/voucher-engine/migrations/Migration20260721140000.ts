import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * Bug-bash fix, 2026-07-21: `discount_cap_config` is documented as a global
 * singleton (0..1 active row, see the model's own docstring), but
 * `POST /admin/discount-cap-config` only enforced that with application
 * logic (query the existing active row, update it if found, else create) —
 * exactly the same race the `voucher_config.promotion_id` guard
 * (`Migration20260720120000.ts`) was added to close: two concurrent POSTs
 * can both read "no active row" before either insert commits, producing two
 * active rows with no DB-level guarantee to prevent it.
 *
 * A unique partial index on `is_active` (true only within the filter, so any
 * two matching rows would collide) — same pattern as that migration — makes
 * "at most one active, non-deleted row" an actual DB constraint rather than
 * a best-effort read-then-write check.
 */
export class Migration20260721140000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_discount_cap_config_active_unique" ON "discount_cap_config" ("is_active") WHERE ("is_active" = true AND "deleted_at" IS NULL);`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `drop index if exists "IDX_discount_cap_config_active_unique";`,
    );
  }
}
