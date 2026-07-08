import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260707091628 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "category_complement_mapping" ("id" text not null, "source_category_id" text not null, "complement_category_id" text not null, "display_order" integer not null default 0, "is_active" boolean not null default true, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "category_complement_mapping_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_category_complement_mapping_deleted_at" ON "category_complement_mapping" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_category_complement_mapping_source_category_id_is_active" ON "category_complement_mapping" ("source_category_id", "is_active") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "suggestion_event" ("id" text not null, "rule_id" text null, "source_context" text check ("source_context" in ('product_view', 'cart')) not null, "source_product_id" text null, "suggested_product_id" text not null, "customer_id" text null, "session_id" text null, "action" text check ("action" in ('impression', 'tap', 'add_to_cart', 'dismiss')) not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "suggestion_event_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_suggestion_event_deleted_at" ON "suggestion_event" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_suggestion_event_created_at" ON "suggestion_event" ("created_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "suggestion_rule" ("id" text not null, "name" text not null, "type" text check ("type" in ('product', 'cart')) not null, "tier" text check ("tier" in ('manual', 'category', 'behavioral')) not null, "priority" integer not null default 0, "is_active" boolean not null default true, "valid_from" timestamptz null, "valid_to" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "suggestion_rule_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_suggestion_rule_deleted_at" ON "suggestion_rule" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_suggestion_rule_type_is_active_priority" ON "suggestion_rule" ("type", "is_active", "priority") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "cart_suggestion_condition" ("id" text not null, "condition_type" text check ("condition_type" in ('category_missing', 'threshold_near', 'brand_match', 'consumable_upsell')) not null, "condition_params" jsonb null, "rule_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "cart_suggestion_condition_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_cart_suggestion_condition_rule_id" ON "cart_suggestion_condition" ("rule_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_cart_suggestion_condition_deleted_at" ON "cart_suggestion_condition" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "suggestion_rule_item" ("id" text not null, "suggested_product_id" text not null, "display_order" integer not null default 0, "custom_label" text null, "rule_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "suggestion_rule_item_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_suggestion_rule_item_rule_id" ON "suggestion_rule_item" ("rule_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_suggestion_rule_item_deleted_at" ON "suggestion_rule_item" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "cart_suggestion_condition" add constraint "cart_suggestion_condition_rule_id_foreign" foreign key ("rule_id") references "suggestion_rule" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table if exists "suggestion_rule_item" add constraint "suggestion_rule_item_rule_id_foreign" foreign key ("rule_id") references "suggestion_rule" ("id") on update cascade on delete cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "cart_suggestion_condition" drop constraint if exists "cart_suggestion_condition_rule_id_foreign";`);

    this.addSql(`alter table if exists "suggestion_rule_item" drop constraint if exists "suggestion_rule_item_rule_id_foreign";`);

    this.addSql(`drop table if exists "category_complement_mapping" cascade;`);

    this.addSql(`drop table if exists "suggestion_event" cascade;`);

    this.addSql(`drop table if exists "suggestion_rule" cascade;`);

    this.addSql(`drop table if exists "cart_suggestion_condition" cascade;`);

    this.addSql(`drop table if exists "suggestion_rule_item" cascade;`);
  }

}
