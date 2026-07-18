# Kế hoạch VoucherEngine (Option B) — Promotion vs Voucher & lộ trình UI/UX

> Tài liệu tổng hợp toàn bộ vòng đời: **Phân tích → Đề xuất → Thiết kế → Triển khai → Code → Kiểm thử**,
> kèm **danh sách đã-làm / chưa-làm** và **quyết định chỉnh sửa UI/UX** cho Admin + Storefront.
> Nhánh: `feat/voucher-credit-line-carrier`. Ngày: 2026-07-17. Artifact trực quan: [`ke-hoach-voucher.html`](./ke-hoach-voucher.html).

---

## 1. Bối cảnh & mục tiêu

Nền tảng: Medusa 2.16 (Postgres + Redis), monorepo pnpm/Turborepo. VoucherEngine là mã giảm giá có luật
nghiệp vụ chặt (giới hạn lượt, trần 50%, chống dò mã…) mà Promotion gốc của Medusa **không diễn tả đủ**.

Câu hỏi trọng tâm đã làm rõ trong buổi trao đổi:

- **Promotion và Voucher khác nhau ở đâu, vì sao cần cả hai?**
- **Vì sao không nhét voucher thẳng vào Promotion?**
- **Kiến trúc hiện tại (Option B) có phải best practice không?**

Mục tiêu tài liệu: chốt hiểu biết + hiện trạng + lộ trình UI/UX để đội tiếp tục thực thi.

---

## 2. Phân tích yêu cầu (Analyze requirement)

### 2.1 Promotion vs Voucher — bản chất

|                 | **Promotion** (native Medusa)                            | **Voucher** (module `voucher-engine`)         |
| --------------- | -------------------------------------------------------- | --------------------------------------------- |
| Là gì           | Entity built-in của Medusa                               | Entity custom `voucher_config` + engine riêng |
| Quản lý ở       | Admin › **Promotions**                                   | Admin › **Vouchers** (Extensions)             |
| Áp giảm giá qua | `computeActions` → `cart.discount_total`                 | **`cart.credit_lines`** (Decision H)          |
| Cách stack      | Sort theo `application_method.value` DESC + **cộng dồn** | Thứ tự cố định: item → voucher → trần 50%     |
| Attach vào cart | **Có**                                                   | **KHÔNG** (backing promotion chỉ để hiển thị) |

### 2.2 Phần lớn config TRÙNG nhau (9/12 field)

Đối chiếu form Voucher hiện tại với khả năng native Promotion/Campaign (theo docs Medusa):

| Field form Voucher                | Native có? | Ánh xạ native                                           |
| --------------------------------- | ---------- | ------------------------------------------------------- |
| Code                              | ✅         | `promotion.code`                                        |
| Discount type / value             | ✅         | `application_method.type/value`                         |
| Minimum order value               | ✅         | rule `item_total gte`                                   |
| Total usage limit                 | ✅         | `promotion.limit` / campaign usage budget               |
| Start / End date                  | ✅         | campaign `starts_at`/`ends_at`                          |
| Applicable products / categories  | ✅         | `target_rules`                                          |
| **Per-customer usage limit**      | ✅         | campaign `budget use_by_attribute customer_id` (v2.11+) |
| **Max discount amount (cap/đơn)** | ❌         | _không có_                                              |
| **Stackable + thứ tự stack**      | ❌         | _native chỉ compounding_                                |

> Kết luận: overlap rất lớn — kể cả **per-customer limit là tính năng native**. Đây là lý do ban đầu đội định
> dùng thẳng Promotion.

### 2.3 Cái native KHÔNG làm được (lý do tồn tại của Voucher)

1. **Cap theo đơn** — "giảm 20% nhưng tối đa 500.000₫/đơn". Native chỉ có _spend budget_ (trần tổng toàn campaign).
2. **Trần tổng 50% + thứ tự item → voucher → cap (Rule 11)** — native chỉ **cộng dồn**, không ép thứ tự, không cắt riêng voucher.
3. **Chống dò mã (rate-limit)** — 5 lần sai/15 phút → khóa 30 phút. Không thuộc phạm vi promotion.
4. **Audit chống-phát-dư atomic/idempotent + log bất biến** — native _có đếm_ usage nhưng không đảm bảo các tính chất này.

### 2.4 Ví dụ Rule 11 (subtotal 1.000.000₫, item −40%, voucher −20%)

```
Subtotal gốc            1.000.000
① item-promo 40%         −400.000   → còn 600.000   (GIỮ NGUYÊN)
② voucher 20%            −200.000   (tính ra 200.000)
③ trần 50% = tối đa giảm 500.000
   item đã ăn 400.000 → voucher chỉ còn phòng 100.000
   → voucher bị cắt: 200.000 → 100.000
──────────────────────────────────────────
Tổng giảm  400.000 + 100.000 = 500.000  (đúng 50%)
Total cuối = 500.000  ✅  (item 400.000 + voucher 100.000)
```

**Vì sao Promotion native ra số sai:**

- _Không có trần 50%_: item 40% (−400.000) → voucher 20% của 600.000 = −120.000 → tổng giảm 520.000 = **52% > 50%**.
- _Nhét voucher đã-cap dạng promotion cố định_: Medusa áp fixed 100.000 trước → còn 900.000 → item 40% của 900.000 =
  **360.000 (không còn 400.000)** → **phá item-promo** ⇒ vi phạm Rule 11 (CONFLICT-8).

---

## 3. Đề xuất lý tưởng (Proposal ideal)

**Option B = best practice cho bài toán này**, gồm 3 trụ cột:

| Trụ                    | Nội dung                                                                                                          | Cơ chế                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| 1. Config tựa native   | Mỗi voucher tự đẻ 1 Promotion + Campaign gánh: %, min order, targeting, validity, usage limit, per-customer limit | `admin/lib/build-backing-promotion.ts`       |
| 2. Lớp custom mỏng     | Chỉ lo cái native thiếu: cap/đơn, trần 50% + thứ tự, rate-limit, audit atomic                                     | module `voucher-engine`                      |
| 3. Credit-line carrier | Số tiền đã cap → `cart.credit_lines` (không attach promotion vào cart)                                            | `createCartCreditLinesWorkflow` (Decision H) |

**Vì sao KHÔNG đảo "promotion làm chủ"** (dù muốn bớt lặp field): với feature dính tiền, đổi lấy việc bớt ~9 ô
input, ta phải gánh **lệch số** (sửa promotion không sync voucher), **map ngược dễ vỡ** (Buy X Get Y / nhiều rule
không map được về voucher), và **promotion áp nhầm vào cart** (đúng lỗi Rule 11). ⇒ **An toàn > DRY.**

---

## 4. Thiết kế (Design)

### 4.1 Data model

- `voucher_config` (bảng chính, nguồn sự thật) — cột: `code`, `discount_type`, `discount_value`,
  `min_order_value`, `max_discount_amount`, `applicable_product_ids`, `applicable_category_ids`,
  `stackable_with_promotions`, `per_user_limit`, `usage_limit`, `usage_count`, `user_segment_conditions`,
  `valid_from`, `valid_to`, `is_active`, **`promotion_id`**, **`campaign_id`**.
- Liên kết cross-module bằng **Link Module read-only** `src/links/voucher-config-promotion.ts` (KHÔNG dùng DB FK).
- Migration cột `campaign_id`: `Migration20260717080006` (đã apply).

### 4.2 Luồng tạo voucher → backing promotion

`src/workflows/voucher-engine/admin/create-voucher.ts`:

1. `resolveVoucherCodeStep` — chốt code (dùng chung cho promotion + config).
2. `buildBackingPromotion(input, code)` — builder thuần, sinh `CreatePromotionDTO[]`
   (V3→`limit`, V4→campaign `use_by_attribute` budget, V5→`item_total gte`, V6→`target_rule` đơn-thuộc-tính, %bps→percent).
3. `createPromotionsWorkflow.runAsStep` — tạo Promotion + inline Campaign (tự có compensation).
4. `createVoucherStep` — lưu `voucher_config` với `promotion_id`/`campaign_id`.

> Backing Promotion **NEVER attach cart** — chỉ để admin/analytics/hiển thị.

### 4.3 Luồng apply → credit line → order (Decision H)

- Apply: V1–V8 + §10 (gồm trần 50%) → `final_voucher_discount` → `createCartCreditLinesWorkflow`
  (`{ cart_id, amount, reference: "voucher_engine", reference_id: <voucher_id>, metadata }`).
- `cart.total` tự net credit line: `total = subtotal + tax − discount_subtotal − credit_lines_total`.
- Remove/replace/revalidate: `deleteCartCreditLinesWorkflow` (compensatable).
- Redemption: `order.metadata.voucher.voucher_id`; usage_count tăng atomic tại `order.placed`.

### 4.4 Decision H — 3 tradeoff đã chấp nhận

1. **Voucher hiện qua `cart.credit_line_total`, KHÔNG phải `discount_total`.** Store API trả `discount_amount`/
   `updated_cart_total` tường minh; analytics đọc `voucher_usage_log`. → _Storefront cart-summary là follow-up._
2. **Giả định 0% thuế (HARD ASSUMPTION [NV#17]).** Credit line trừ SAU thuế; hiện đúng vì store 0 tax rate.
   Nếu bật thuế → phải revisit `expected_final_cart_total`.
3. **`verifyCartTotalsStep` shrink-guard → invariant phòng thủ.** Giữ lại `VOUCHER_STACKING_UNSUPPORTED` như
   lá chắn fail-closed (đáng lẽ không bao giờ chạm tới với credit line); **không được xoá** (xoá = yếu INT-03).

---

## 5. Hiện trạng triển khai (Implement) — Đã làm / Chưa làm

### 5.1 ✅ Đã làm được

**Backend (Option B — Phase 1/2/4 done+verified, Phase 3 rút gọn):**

- **Phase 1 (credit-line carrier):** `lib/create-voucher-credit-line.ts`; rewire `apply-voucher.ts`,
  `remove-voucher.ts`, `revalidate-voucher-on-cart-change.ts`, `resolve-voucher-discount.ts`;
  `steps/verify-cart-totals.ts` (kiểm tra credit-line + `cart.total` làm oracle). Giữ nguyên
  `lib/calculate-discount.ts`, `lib/money.ts`.
- **Phase 2 (native backing):** `admin/lib/build-backing-promotion.ts`, `admin/create-voucher.ts`,
  migration `Migration20260717080006`, Link `src/links/voucher-config-promotion.ts`.
- **Phase 4 (backfill + seed):** `src/scripts/backfill-voucher-promotions.ts` (idempotent),
  `src/scripts/seed-voucher-engine.ts` (xoá backing cũ khi wipe + provision sau insert).
- **Phase 3:** rút gọn có lý do (`promotion.used` luôn = 0 vì không attach cart → bỏ đọc phòng thủ).

**Admin (`src/admin/`):**

- Route `/vouchers` (`routes/vouchers/page.tsx`) — list 7 cột: Code, Discount, Min order, Usage, Active, Validity, Created + nút Analyze.
- `components/create-voucher-modal.tsx` — form 13 field.
- `components/voucher-analytics-drawer.tsx` — 5 stat: Total uses, Total discount given, Avg. order value, Capped count, Conversion rate.
- Không có widget nào inject vào trang Promotion.

**Storefront (`apps/storefront/src/`):**

- `modules/checkout/components/discount-code/index.tsx` (`DiscountCode`) — input gộp voucher + promotion; dòng "You saved…" đọc từ `cart.metadata.voucher`.
- `.../available-vouchers-modal.tsx`, `.../replace-confirm-modal.tsx`.
- `lib/data/voucher.ts` — `applyVoucher` (`POST /store/carts/:id/voucher`), `removeVoucher` (`DELETE`), `fetchAvailableVouchers` (`GET /store/customers/me/vouchers`).
- `modules/order/components/order-summary/index.tsx` (`OrderSummary`) — **hiển thị đúng** `order.credit_line_total` thành dòng "Voucher" riêng.

**Test hiện tại:** unit 243/244 (COOLDOWN_S đã fix trên disk → cần chạy lại xác nhận không còn 1 fail),
voucher-admin HTTP 12/12, apply-remove 7/7 (có regression Rule-11), resolve 6/6, revalidate 7/7,
record-usage 3/3, module service 14/14, `build-backing-promotion` unit 10/10, `tsc` clean.

### 5.2 ❌ Chưa làm / gap

| #   | Khu vực    | Gap                                                                                                      |
| --- | ---------- | -------------------------------------------------------------------------------------------------------- |
| G1  | Backend    | Nhánh `feat/voucher-credit-line-carrier` **chưa commit + chưa MR** develop                               |
| G2  | Backend    | Giả định 0% thuế [NV#17] — điều kiện, không phải blocker                                                 |
| G3  | Admin      | Thiếu **Edit / Deactivate / Delete** voucher (chỉ có Create + Analyze)                                   |
| G4  | Admin      | Backing promotion **không có metadata cờ** → vẫn lộ trong list Promotions ("1 mã 2 nơi")                 |
| G5  | Storefront | `CartTotals` (cart + checkout) chỉ đọc `discount_subtotal` → **voucher không hiện trong khối tổng tiền** |
| G6  | Storefront | `cap_explanation` mất khi reload (chỉ có từ response apply)                                              |
| G7  | Storefront | Auto-remove notice không hiện lại sau reload (backend không clear key)                                   |

---

## 6. Chi tiết code (Coding) — bản đồ file

**Backend workflows** (`apps/backend/src/workflows/voucher-engine/`):

- Top-level: `apply-voucher.ts`, `remove-voucher.ts`, `revalidate-voucher-on-cart-change.ts`,
  `resolve-voucher-discount.ts`, `record-voucher-usage.ts`.
- `lib/`: `create-voucher-credit-line.ts` (⇐ `createCartCreditLinesWorkflow`), `voucher-cart-metadata.ts`,
  `read-voucher-cart-metadata.ts`, `calculate-discount.ts`, `money.ts`, `rate-limit-policy.ts`,
  `auto-remove-notice.ts`, `errors.ts`, `validators.ts`.
- `admin/`: `create-voucher.ts`, `voucher-analytics.ts`, `admin/lib/build-backing-promotion.ts`.
- `steps/verify-cart-totals.ts` — kiểm tra credit-line + shrink-guard invariant.

**Admin** (`apps/backend/src/admin/`): `routes/vouchers/page.tsx`, `components/create-voucher-modal.tsx`,
`components/voucher-analytics-drawer.tsx`, `components/{category,product}-multi-select.tsx`, `lib/{api,types,use-categories,use-products}.ts`.

**Storefront** (`apps/storefront/src/`): `modules/checkout/components/discount-code/*`, `lib/data/voucher.ts`,
`modules/voucher/{types,errors}.ts`, `modules/common/components/cart-totals/index.tsx`,
`modules/order/components/order-summary/index.tsx`, `modules/cart/templates/summary.tsx`,
`modules/checkout/templates/checkout-summary/index.tsx`.

---

## 7. Kiểm thử (Testing)

- **Đang có:** unit (`*.unit.spec.ts`), module integration (`src/modules/voucher-engine/__tests__/`),
  HTTP integration (`integration-tests/http/*.spec.ts`). Chạy bằng `pnpm test:unit` /
  `pnpm test:integration:modules` / `pnpm test:integration:http` (từ `apps/backend/`).
- **Cần bổ sung khi làm A–D:**
  - **A (CartTotals):** test storefront render dòng "Voucher (MÃ)" trừ đúng `credit_line_total` ở cart + checkout.
  - **B (Edit/Delete):** HTTP test `PUT`/`DELETE /admin/vouchers/:id` cập nhật voucher_config + đồng bộ backing promotion; test soft-delete.
  - **C (metadata):** unit `build-backing-promotion` assert `metadata.voucher_engine=true`.
  - **D (notice/cap):** integration đảm bảo `cap_explanation` + `voucher_notice` còn sau reload.
- **StackingEngine** vẫn phải khớp fixture SRS tới VND (item 40% + voucher 20% → total 500.000; các fixture khác).

---

## 8. Chi tiết chỉnh sửa phía Admin

### B — Edit / Deactivate / Delete voucher (gap G3)

- **UI:** `routes/vouchers/page.tsx` thêm row-action menu (Edit / Toggle active / Delete). Modal Edit tái dùng
  field của `create-voucher-modal.tsx`, điền sẵn giá trị hiện tại.
- **Backend (mô tả, code ở bước sau):** endpoint `PUT /admin/vouchers/:id` + `DELETE /admin/vouchers/:id`;
  workflow cập nhật `voucher_config` **và đồng bộ backing promotion** (`updatePromotionsWorkflow` /
  `deletePromotionsWorkflow`), giữ nguyên tắc voucher là chủ.
- **Ràng buộc:** một số field khó đổi (đổi `code` sẽ phải đổi cả promotion code; `usage_limit` native
  `promotion.limit` là immutable sau tạo → nêu rõ giới hạn cho user).

### C — Giảm nhầm lẫn backing promotion (gap G4)

- **Backend:** `build-backing-promotion.ts` gắn `metadata: { voucher_engine: true, voucher_code }` cho backing promotion.
- **Admin:** trên trang Vouchers thêm chỉ dẫn "Backed by promotion: `<code>`" để làm rõ quan hệ.
- **Đã làm hôm nay:** script `src/scripts/cleanup-orphan-veph-promotions.ts` đã dọn 7 promotion `VEPH-*` mồ côi (kiến trúc cũ).

---

## 9. Chi tiết chỉnh sửa phía Storefront

### A — CartTotals hiển thị voucher (gap G5, follow-up đã ghi trong SPEC)

- **Sửa `modules/common/components/cart-totals/index.tsx`:** thêm dòng **"Voucher (MÃ)"** trừ vào tổng, đọc
  `credit_line_total` (hoặc `discount_amount` từ `cart.metadata.voucher`) — **theo đúng pattern `OrderSummary`**
  (nơi đã làm đúng).
- **Truyền field** từ `modules/cart/templates/summary.tsx` và `modules/checkout/templates/checkout-summary/index.tsx`
  vào `CartTotals`.

### D — Giữ notice/cap khi reload (gap G6, G7)

- **Backend (mô tả):** ghi `cap_explanation` vào `cart.metadata.voucher`; giữ `voucher_notice` đến khi được ack (thêm cơ chế clear/ack).
- **Storefront:** `DiscountCode` đọc `cap_explanation` từ metadata (không chỉ từ response); hiện auto-remove notice khi reload dưới dạng banner tắt được.

---

## 10. Quyết định UI/UX (chốt)

1. **Voucher là dòng riêng, tách khỏi "Discount" (promotion)** — ở cart, checkout, order-details đều dùng dòng
   **"Voucher (MÃ)" màu xanh**, đồng nhất một ngôn ngữ hiển thị.
2. **Giữ trang Vouchers riêng** (không gộp vào form Promotion) — vì Medusa không export form built-in; chấp nhận
   lặp ~9 ô input để đổi lấy UX 1 form + 1 nguồn sự thật (an toàn hơn cho tiền bạc).
3. **Không hack bảng Promotions native** để ẩn backing promotion — thay vào đó gắn metadata nhận diện + chú thích
   quan hệ trên trang Vouchers (trung thực với giới hạn framework).
4. **Voucher luôn là "chủ", backing promotion là bản sao 1 chiều** — mọi thao tác Edit/Delete xuất phát từ Voucher,
   rồi đồng bộ xuống promotion; không cho sửa promotion độc lập.
5. **Thông báo cho khách phải bền** — cap explanation + auto-remove notice sống sót qua reload.

---

## 11. Backlog & rủi ro

- **G1:** commit (3 commit logic: carrier swap / native backing / backfill+seed) + MR `feat/voucher-credit-line-carrier` → develop. _Agent không tự push — Cealus thực hiện._
- **G2 / [NV#17]:** giả định 0% thuế — nếu bật thuế phải revisit `expected_final_cart_total` + ngữ nghĩa credit line.
- **Phase 3 rút gọn:** defense-in-depth `promotion.used` (luôn 0) — theo dõi, chưa cần làm.
- **Rủi ro A–D:** đều là thay đổi bổ sung (additive), không đụng luật §10 đã verify; test regression Rule-11 phải luôn xanh.
- **`verifyCartTotalsStep` shrink-guard:** không được xoá.

---

_Xem bản trực quan: [`ke-hoach-voucher.html`](./ke-hoach-voucher.html)._
