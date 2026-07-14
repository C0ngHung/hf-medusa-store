import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260714091302 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "voucher_usage_log" drop constraint if exists "voucher_usage_log_voucher_id_order_id_unique";`);
    this.addSql(`alter table if exists "voucher_config" add column if not exists "promotion_id" text null;`);

    this.addSql(`alter table if exists "voucher_usage_log" add column if not exists "currency_code" text not null, add column if not exists "voucher_code" text not null, add column if not exists "discount_type" text check ("discount_type" in ('percentage', 'fixed_amount')) not null, add column if not exists "discount_value" integer not null, add column if not exists "raw_voucher_discount" integer not null, add column if not exists "voucher_discount_after_voucher_cap" integer not null, add column if not exists "final_voucher_discount" integer not null, add column if not exists "cap_percentage_bps" integer null, add column if not exists "original_subtotal" integer not null, add column if not exists "item_promotion_discount" integer not null default 0;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_voucher_usage_log_voucher_id_order_id_unique" ON "voucher_usage_log" ("voucher_id", "order_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_voucher_usage_log_order_id" ON "voucher_usage_log" ("order_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "voucher_config" drop column if exists "promotion_id";`);

    this.addSql(`drop index if exists "IDX_voucher_usage_log_voucher_id_order_id_unique";`);
    this.addSql(`drop index if exists "IDX_voucher_usage_log_order_id";`);
    this.addSql(`alter table if exists "voucher_usage_log" drop column if exists "currency_code", drop column if exists "voucher_code", drop column if exists "discount_type", drop column if exists "discount_value", drop column if exists "raw_voucher_discount", drop column if exists "voucher_discount_after_voucher_cap", drop column if exists "final_voucher_discount", drop column if exists "cap_percentage_bps", drop column if exists "original_subtotal", drop column if exists "item_promotion_discount";`);
  }

}
