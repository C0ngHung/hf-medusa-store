import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260708045326 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "suggestion_rule" add column if not exists "source_product_id" text null;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_suggestion_rule_source_product_id_is_active" ON "suggestion_rule" ("source_product_id", "is_active") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_suggestion_rule_source_product_id_is_active";`);
    this.addSql(`alter table if exists "suggestion_rule" drop column if exists "source_product_id";`);
  }

}
