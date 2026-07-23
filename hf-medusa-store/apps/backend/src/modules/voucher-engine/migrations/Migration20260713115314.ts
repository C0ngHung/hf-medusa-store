import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260713115314 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "voucher_config" drop constraint if exists "voucher_config_code_unique";`);
    this.addSql(`create table if not exists "discount_cap_config" ("id" text not null, "max_discount_percentage" integer not null default 5000, "is_active" boolean not null default true, "updated_by" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "discount_cap_config_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_discount_cap_config_deleted_at" ON "discount_cap_config" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "voucher_config" ("id" text not null, "code" text not null, "discount_type" text check ("discount_type" in ('percentage', 'fixed_amount')) not null, "discount_value" integer not null, "min_order_value" integer null, "max_discount_amount" integer null, "applicable_product_ids" jsonb null, "applicable_category_ids" jsonb null, "stackable_with_promotions" boolean not null default true, "per_user_limit" integer not null default 1, "usage_limit" integer null, "usage_count" integer not null default 0, "user_segment_conditions" jsonb null, "valid_from" timestamptz not null, "valid_to" timestamptz not null, "is_active" boolean not null default true, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "voucher_config_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_voucher_config_deleted_at" ON "voucher_config" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_voucher_config_code_unique" ON "voucher_config" ("code") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_voucher_config_is_active" ON "voucher_config" ("is_active") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "voucher_usage_log" ("id" text not null, "voucher_id" text not null, "customer_id" text not null, "order_id" text not null, "discount_applied" integer not null, "was_capped" boolean not null default false, "original_discount" integer not null, "applied_at" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "voucher_usage_log_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_voucher_usage_log_deleted_at" ON "voucher_usage_log" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_voucher_usage_log_voucher_id_customer_id" ON "voucher_usage_log" ("voucher_id", "customer_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "discount_cap_config" cascade;`);

    this.addSql(`drop table if exists "voucher_config" cascade;`);

    this.addSql(`drop table if exists "voucher_usage_log" cascade;`);
  }

}
