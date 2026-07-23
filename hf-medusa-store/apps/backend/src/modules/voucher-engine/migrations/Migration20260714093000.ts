import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * Comment migration — thêm COMMENT ON TABLE/COLUMN tiếng Việt cho 3 bảng
 * VoucherEngine. Medusa sinh bảng từ `model.define` (không đẩy comment xuống DB),
 * nên comment này giúp DDL / `\d+` / công cụ DB đọc hiểu ý nghĩa từng cột (bám
 * V1–V8, INT-01/02/04, SRS §5.2/§5.3). Chỉ thêm metadata comment — không đổi cấu
 * trúc. `down()` gỡ comment về NULL.
 */
export class Migration20260714093000 extends Migration {
  override async up(): Promise<void> {
    // ── voucher_config (SPEC D-B1, SRS §5.2, V1–V8) ──
    this.addSql(
      `comment on table "voucher_config" is 'Định nghĩa voucher (SPEC D-B1, SRS §5.2, luật V1–V8). Tiền = integer VND (INT-01).';`,
    );
    this.addSql(
      `comment on column "voucher_config"."id" is 'Khóa chính (text id Medusa).';`,
    );
    this.addSql(
      `comment on column "voucher_config"."code" is 'Mã voucher; lưu UPPERCASE + trim, lookup case-insensitive (V1, SEC-03).';`,
    );
    this.addSql(
      `comment on column "voucher_config"."discount_type" is 'Loại giảm: percentage | fixed_amount.';`,
    );
    this.addSql(
      `comment on column "voucher_config"."discount_value" is 'Giá trị giảm: basis-points nếu percentage (2000 = 20%), VND nếu fixed_amount (INT-01).';`,
    );
    this.addSql(
      `comment on column "voucher_config"."min_order_value" is 'V5 — subtotal tối thiểu (VND) để đủ điều kiện; NULL = không yêu cầu.';`,
    );
    this.addSql(
      `comment on column "voucher_config"."max_discount_amount" is 'Trần giảm của riêng voucher này (VND); NULL = không giới hạn.';`,
    );
    this.addSql(
      `comment on column "voucher_config"."applicable_product_ids" is 'V6 — phạm vi theo product id (JSON array); NULL/rỗng = mọi sản phẩm.';`,
    );
    this.addSql(
      `comment on column "voucher_config"."applicable_category_ids" is 'V6 — phạm vi theo category id (JSON array); NULL/rỗng = mọi danh mục. Cả 2 mảng NULL ⇒ áp toàn giỏ.';`,
    );
    this.addSql(
      `comment on column "voucher_config"."stackable_with_promotions" is 'V8 — cho phép cộng dồn với khuyến mãi item-level hay không (default true).';`,
    );
    this.addSql(
      `comment on column "voucher_config"."per_user_limit" is 'V4 — số lần tối đa mỗi khách được dùng (đếm trên voucher_usage_log); default 1.';`,
    );
    this.addSql(
      `comment on column "voucher_config"."usage_limit" is 'V3 — giới hạn dùng toàn cục; NULL = không giới hạn.';`,
    );
    this.addSql(
      `comment on column "voucher_config"."usage_count" is 'V3 — bộ đếm số lần đã dùng (INT-02, tăng nguyên tử tại order.placed — Day 5); default 0.';`,
    );
    this.addSql(
      `comment on column "voucher_config"."user_segment_conditions" is 'V7 — điều kiện phân khúc khách hàng (JSON); logic tạm hoãn (open issue CRM).';`,
    );
    this.addSql(
      `comment on column "voucher_config"."valid_from" is 'V2 — thời điểm bắt đầu hiệu lực.';`,
    );
    this.addSql(
      `comment on column "voucher_config"."valid_to" is 'V2 — thời điểm hết hiệu lực.';`,
    );
    this.addSql(
      `comment on column "voucher_config"."is_active" is 'V1 — voucher có đang bật hay không (default true).';`,
    );
    this.addSql(
      `comment on column "voucher_config"."created_at" is 'Thời điểm tạo bản ghi.';`,
    );
    this.addSql(
      `comment on column "voucher_config"."updated_at" is 'Thời điểm cập nhật gần nhất.';`,
    );
    this.addSql(
      `comment on column "voucher_config"."deleted_at" is 'Soft-delete: NULL = còn hiệu lực (Medusa).';`,
    );

    // ── voucher_usage_log (INT-04, append-only) ──
    this.addSql(
      `comment on table "voucher_usage_log" is 'Sổ ghi redemption append-only/bất biến (INT-04). Chỉ ghi tại order.placed (Day 5), không update/delete; áp voucher vào giỏ KHÔNG ghi ở đây.';`,
    );
    this.addSql(`comment on column "voucher_usage_log"."id" is 'Khóa chính.';`);
    this.addSql(
      `comment on column "voucher_usage_log"."voucher_id" is 'Tham chiếu voucher_config.id (Link Module, không FK DB).';`,
    );
    this.addSql(
      `comment on column "voucher_usage_log"."customer_id" is 'Tham chiếu khách hàng (Link Module, không FK DB).';`,
    );
    this.addSql(
      `comment on column "voucher_usage_log"."order_id" is 'Tham chiếu đơn hàng (Link Module, không FK DB); idempotency theo voucher+order.';`,
    );
    this.addSql(
      `comment on column "voucher_usage_log"."discount_applied" is 'Số tiền giảm thực tế sau khi áp trần 50% (VND, INT-01).';`,
    );
    this.addSql(
      `comment on column "voucher_usage_log"."was_capped" is 'True nếu trần 50% toàn cục đã cắt bớt voucher này.';`,
    );
    this.addSql(
      `comment on column "voucher_usage_log"."original_discount" is 'Số tiền giảm trước khi bị cắt trần (VND) — phục vụ audit.';`,
    );
    this.addSql(
      `comment on column "voucher_usage_log"."applied_at" is 'Thời điểm redemption được ghi nhận.';`,
    );
    this.addSql(
      `comment on column "voucher_usage_log"."created_at" is 'Thời điểm tạo bản ghi.';`,
    );
    this.addSql(
      `comment on column "voucher_usage_log"."updated_at" is 'Thời điểm cập nhật gần nhất.';`,
    );
    this.addSql(
      `comment on column "voucher_usage_log"."deleted_at" is 'Soft-delete: NULL = còn hiệu lực (Medusa).';`,
    );

    // ── discount_cap_config (SRS §5.3, VOUCH-003) ──
    this.addSql(
      `comment on table "discount_cap_config" is 'Trần giảm giá toàn cục — singleton 0..1 row active (SRS §5.3, VOUCH-003).';`,
    );
    this.addSql(
      `comment on column "discount_cap_config"."id" is 'Khóa chính.';`,
    );
    this.addSql(
      `comment on column "discount_cap_config"."max_discount_percentage" is 'Trần % tổng giảm, basis-points (5000 = 50.00%). Không có row active ⇒ fallback DEFAULT_CAP_PCT = 5000.';`,
    );
    this.addSql(
      `comment on column "discount_cap_config"."is_active" is 'Có đang áp dụng hay không (chỉ 0..1 row active); default true.';`,
    );
    this.addSql(
      `comment on column "discount_cap_config"."updated_by" is 'Ai cập nhật lần cuối (vd "seed" hoặc admin id).';`,
    );
    this.addSql(
      `comment on column "discount_cap_config"."created_at" is 'Thời điểm tạo bản ghi.';`,
    );
    this.addSql(
      `comment on column "discount_cap_config"."updated_at" is 'Thời điểm cập nhật gần nhất.';`,
    );
    this.addSql(
      `comment on column "discount_cap_config"."deleted_at" is 'Soft-delete: NULL = còn hiệu lực (Medusa).';`,
    );
  }

  override async down(): Promise<void> {
    for (const col of [
      "id",
      "code",
      "discount_type",
      "discount_value",
      "min_order_value",
      "max_discount_amount",
      "applicable_product_ids",
      "applicable_category_ids",
      "stackable_with_promotions",
      "per_user_limit",
      "usage_limit",
      "usage_count",
      "user_segment_conditions",
      "valid_from",
      "valid_to",
      "is_active",
      "created_at",
      "updated_at",
      "deleted_at",
    ]) {
      this.addSql(`comment on column "voucher_config"."${col}" is NULL;`);
    }
    this.addSql(`comment on table "voucher_config" is NULL;`);

    for (const col of [
      "id",
      "voucher_id",
      "customer_id",
      "order_id",
      "discount_applied",
      "was_capped",
      "original_discount",
      "applied_at",
      "created_at",
      "updated_at",
      "deleted_at",
    ]) {
      this.addSql(`comment on column "voucher_usage_log"."${col}" is NULL;`);
    }
    this.addSql(`comment on table "voucher_usage_log" is NULL;`);

    for (const col of [
      "id",
      "max_discount_percentage",
      "is_active",
      "updated_by",
      "created_at",
      "updated_at",
      "deleted_at",
    ]) {
      this.addSql(`comment on column "discount_cap_config"."${col}" is NULL;`);
    }
    this.addSql(`comment on table "discount_cap_config" is NULL;`);
  }
}
