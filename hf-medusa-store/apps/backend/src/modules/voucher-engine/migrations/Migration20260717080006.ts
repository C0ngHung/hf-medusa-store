import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260717080006 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "voucher_config" add column if not exists "campaign_id" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "voucher_config" drop column if exists "campaign_id";`);
  }

}
