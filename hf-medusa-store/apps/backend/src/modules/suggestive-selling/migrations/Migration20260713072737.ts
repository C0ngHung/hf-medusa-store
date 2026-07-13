import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260713072737 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "product_bulk_mapping" ("id" text not null, "single_product_id" text not null, "bulk_product_id" text not null, "unit_multiplier" integer null, "is_active" boolean not null default true, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "product_bulk_mapping_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_product_bulk_mapping_deleted_at" ON "product_bulk_mapping" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_product_bulk_mapping_single_product_id_is_active" ON "product_bulk_mapping" ("single_product_id", "is_active") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "suggestion_rule_source" ("id" text not null, "source_product_id" text not null, "rule_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "suggestion_rule_source_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_suggestion_rule_source_rule_id" ON "suggestion_rule_source" ("rule_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_suggestion_rule_source_deleted_at" ON "suggestion_rule_source" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_suggestion_rule_source_source_product_id" ON "suggestion_rule_source" ("source_product_id") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "suggestion_rule_source" add constraint "suggestion_rule_source_rule_id_foreign" foreign key ("rule_id") references "suggestion_rule" ("id") on update cascade on delete cascade;`);

    this.addSql(`drop index if exists "IDX_suggestion_rule_source_product_id_is_active";`);
    this.addSql(`alter table if exists "suggestion_rule" drop column if exists "source_product_id";`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "product_bulk_mapping" cascade;`);

    this.addSql(`drop table if exists "suggestion_rule_source" cascade;`);

    this.addSql(`alter table if exists "suggestion_rule" add column if not exists "source_product_id" text null;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_suggestion_rule_source_product_id_is_active" ON "suggestion_rule" ("source_product_id", "is_active") WHERE deleted_at IS NULL;`);
  }

}
