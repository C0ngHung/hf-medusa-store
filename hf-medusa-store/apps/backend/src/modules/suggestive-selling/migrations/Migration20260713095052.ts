import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260713095052 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "category_top_seller" ("id" text not null, "category_id" text not null, "product_id" text not null, "sales_count" integer not null default 0, "window_days" integer not null default 30, "computed_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "category_top_seller_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_category_top_seller_deleted_at" ON "category_top_seller" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_category_top_seller_category_id_sales_count" ON "category_top_seller" ("category_id", "sales_count") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "category_top_seller" cascade;`);
  }

}
