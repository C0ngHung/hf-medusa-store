# Thiết kế: Promotion-native Voucher (wizard → widget, đọc-từ-Promotion)

- **Ngày:** 2026-07-18 · **Nhánh:** `feat/voucher-credit-line-carrier` · **Người duyệt:** Cealus
- **Trạng thái:** Design đã duyệt miệng trong phiên (Cealus ủy quyền các quyết định kỹ thuật chi tiết).

## Bối cảnh & mục tiêu

Form tạo voucher hiện tại lặp ~9 field đã có trong wizard Promotion gốc của Medusa. Nhánh đồng nghiệp
(`review/voucher-engine-before-testing`) chứng minh hướng "tựa vào Promotion" khả thi nhưng giữ carrier
ephemeral (vi phạm Rule 11 — đã verify). Thiết kế này lấy phần tốt của cả hai:

> **Config chung nhập ở wizard Promotion gốc + đọc-thẳng-từ-Promotion khi chạy; field voucher-only nằm
> trong widget trên trang chi tiết promotion; tiền vẫn đi qua credit line (Decision H, không đổi).**

Bốn quyết định đã chốt với Cealus:

1. Luồng tạo: **wizard native → widget "Voucher settings"** trên trang promotion detail.
2. Nguồn sự thật field chung: **đọc thẳng từ Promotion/Campaign qua Link** (hết drift).
3. Phạm vi kèm theo: **port estimated_savings + smart-sort** từ nhánh đồng nghiệp. KHÔNG port Discount Cap Config.
4. Trang Vouchers: **giữ list/analytics, bỏ form tạo**; API `POST /admin/vouchers` giữ (thêm mode mới).

## 1. Kiến trúc

```
TẠO:   Promotions › Create (wizard gốc) → Promotion + Campaign (native)
       Promotion detail → widget "Voucher settings" (zone promotion.details.side.after — verified 2.16)
         └─ Enable as voucher + field voucher-only → voucher_config {promotion_id, campaign_id, voucher-only}

CHẠY:  Apply → resolve-voucher-runtime (đọc %, code, status, ngày, limit từ Promotion/Campaign qua Link
        + voucher-only từ voucher_config) → V1–V8 + cap 50% (nguyên trạng) → CREDIT LINE (nguyên trạng)
```

Không đổi: `calculate-discount.ts`, credit-line carrier, enforcement atomic (`redeemVoucherAtomic`),
rate-limit SEC-02, `voucher_usage_log`, `verifyCartTotalsStep` (shrink-guard giữ nguyên).

## 2. Data model

**voucher_config — field voucher-only (nguồn sự thật tại đây):**
`max_discount_amount`, `min_order_value`, `stackable_with_promotions`, `per_user_limit`,
`applicable_product_ids`/`applicable_category_ids` (OR-scope — native target_rules là AND, cả 2 nhánh đã
verify không diễn tả được), `user_segment_conditions`, `usage_count` (bộ đếm atomic).

**Field dùng chung — deprecated, NGỪNG ĐỌC nhưng KHÔNG XÓA CỘT** (tránh migration phá hủy; dọn ở phase sau):
`code`, `discount_type`, `discount_value`, `valid_from`, `valid_to`, `is_active`, `usage_limit`.

**Resolver mới `workflows/voucher-engine/lib/resolve-voucher-runtime.ts`:**

- Lookup theo code: `promotion.code` (uppercase) → Link → voucher_config.
- V1 ← `promotion.status === "active"` + voucher_config tồn tại (chưa soft-delete).
- V2 ← `campaign.starts_at/ends_at`.
- V3: limit ← `promotion.limit`; bộ đếm ← `voucher_config.usage_count` (atomic của mình).
- %/fixed ← `application_method.type/value`; percent → bps = `value × 100` (giữ toán integer bps nội bộ).
- `per_user_limit` Ở WIDGET, không đọc campaign budget (budget không sửa được sau tạo + registerUsage
  native không atomic — đã verify ở nhánh đồng nghiệp).

## 3. Widget "Voucher settings" — `src/admin/widgets/voucher-settings.tsx`

- Zone: `promotion.details.side.after` (1 trong 6 zone promotion đã verify trên @medusajs/admin-shared 2.16).
- Promotion hợp lệ (type `standard`, method %/fixed, KHÔNG automatic):
  - Chưa là voucher: nút **Enable as voucher** + form voucher-only → `POST /admin/vouchers {promotion_id, …}`.
  - Đã là voucher: form sửa voucher-only (`PUT /admin/vouchers/:id`), usage `x/∞`, nút Analytics (tái dùng
    drawer), nút **Disable voucher** (soft-delete voucher_config; promotion giữ nguyên).
- Promotion không hợp lệ (Buy X Get Y / Free shipping / automatic): thông báo không hỗ trợ.
- Banner: "Promotion này là voucher — không bao giờ tự áp vào giỏ; giảm giá đi qua Voucher Engine (credit line)."

## 4. Trang Vouchers + API

- `routes/vouchers/page.tsx`: giữ list + Analytics; cột Code/Discount/Validity đọc từ promotion qua Link
  (backend enrich trong `GET /admin/vouchers`); click dòng → promotion detail; nút Create → CTA
  "Tạo từ Promotions › Create". Gỡ `create-voucher-modal.tsx` khỏi luồng (xóa file sau khi widget chạy).
- `POST /admin/vouchers`: thêm **mode attach** `{promotion_id, ...voucher-only}`; GIỮ mode full-body cũ
  (tự provision promotion như hiện tại) cho seed/script/contract SRS §6.2.
- Mới: `PUT /admin/vouchers/:id` (chỉ nhận field voucher-only). Xóa/disable: soft-delete.
- 3 voucher seed hiện có đã đủ promotion_id/campaign_id → read-through chạy ngay, không cần migrate data.

## 5. Guardrail bắt buộc — chặn attach voucher-promotion qua đường native

Voucher giờ là promotion code thật → khách có thể gửi code vào API cart-promotions native, Medusa sẽ
attach promotion (né V1–V8/cap/rate-limit, tái hiện bug Rule 11). Bịt:

1. Khi enable-as-voucher (và trong build-backing-promotion mode cũ): set `metadata.voucher_engine = true`
   lên Promotion.
2. Middleware trên route store cart-promotions: mã thuộc promotion có cờ → 400 với message
   "Mã này là voucher — vui lòng nhập ở ô mã voucher."
3. HTTP test chứng minh bị chặn.

## 6. Port từ nhánh đồng nghiệp

- `GET /store/customers/me/vouchers`: thêm `estimated_savings` (loadPreviewLines + `calculateVoucherDiscount`
  với `global_cap_bps` — có áp trần) + sort eligible-trước/tiết-kiệm-giảm-dần. Adapt cho read-through
  (describeVoucher lấy %/type từ runtime view).
- Storefront: `available-vouchers-modal.tsx` hiện "Tiết kiệm ~X₫"; `modules/voucher/types.ts` thêm field.

## 7. Kiểm thử

- Unit: resolver (percent→bps, window, status, limit, lookup-by-code), eligibility widget rules (pure fn).
- HTTP: enable-as-voucher end-to-end; **sửa % promotion 10→25 → apply dùng 25 ngay** (hết drift — test đinh);
  guardrail native-attach 400; PUT voucher-only; estimated_savings + sort; mode cũ POST /admin/vouchers còn chạy.
- Regression PHẢI xanh nguyên trạng: apply-remove 7/7 (Rule-11), resolve 6/6, revalidate 7/7,
  record-usage 3/3, service 14/14.

## 8. SPEC governance

Thiết kế re-scope Decision C (promotion: "bản sao advisory" → "nguồn config chung") và mô hình §5.1 →
cần **Decision I** trong SPEC, đi qua `voucher-spec-advisor` như một bước trong implementation plan.
Decision H (credit-line) KHÔNG đổi.

## Ngoài phạm vi

Discount Cap Config admin (để nhánh đồng nghiệp merge); xóa cột deprecated (phase sau); Edit/Delete
promotion-side đồng bộ sâu (native tự quản); tax assumption [NV#17] giữ nguyên.
