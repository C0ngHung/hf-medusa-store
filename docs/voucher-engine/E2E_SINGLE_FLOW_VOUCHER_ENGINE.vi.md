# Kịch bản test E2E một luồng liên tục — VoucherEngine

> **Mục tiêu:** Chạy **một mạch duy nhất** từ Admin → Storefront → checkout → audit, sao cho
> **một vòng bao trọn toàn bộ Voucher Engine trong SRS**: §4 (VOUCH-001..005, V1–V8),
> §7.2 (applyVoucher 9 bước), §7.3 (revalidateVoucherOnCartChange), §8 (edge cases voucher),
> §10.2 (T-VOUCH-01..12). Thiết kế để **không phải làm đi làm lại** — cart mới chỉ tạo khi bắt
> buộc số liệu khác nhau; các case lỗi được gom vào chung cart; thao tác đổi cart chính là bài
> test §7.3.
>
> So với 2 tài liệu sẵn có: bản này là **hợp nhất** — cấu trúc một-luồng của
> `DEMO_TEST_SCRIPT.vi.md` + độ phủ đầy đủ của `MANUAL_TEST_SCRIPT_VOUCHER_ENGINE.vi.md`, cộng
> traceability tường minh tới từng requirement.

## ⚠️ 3 điểm hệ thống thực tế LỆCH SRS v1.0 (đọc trước khi ghi kết quả)

Kịch bản này **bám hệ thống thực tế** (đã verify trong code), không bám worked-example của SRS.
Ba chỗ lệch có chủ đích:

| #   | Chủ đề                                   | SRS v1.0                                     | Hệ thống thực tế (dùng trong kịch bản)                                                                    | Nguồn code                                                                                        |
| --- | ---------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1   | Global cap mặc định                      | **50%** (5000 bps)                           | **40%** (4000 bps) — CR Phase 5                                                                           | `modules/voucher-engine/constants.ts` (`DEFAULT_CAP_PCT = 4000`), seed `initial-data-seed.ts:693` |
| 2   | EC-03 khi item promo một mình ăn hết cap | "giảm voucher về 0, không reject"            | **Reject `VOUCHER_CAP_EXHAUSTED` (422)** — CR 2026-07-22                                                  | `workflows/voucher-engine/steps/assert-cap-not-exhausted.ts`                                      |
| 3   | EC-04 concurrency                        | apply voucher tranh chấp với xoá item native | Lock **chỉ phủ race giữa 2 workflow VoucherEngine**, chưa phủ race với mutation cart native → **partial** | `workflows/voucher-engine/revalidate-voucher-on-cart-change.ts`                                   |

> Khi ban giám khảo/QA hỏi "sao không khớp SRS worked-example", chỉ vào bảng này. Nếu muốn kịch
> bản khớp SRS nguyên bản (cap 50%, floor-to-0), đó là **task sửa code riêng**, ngoài phạm vi
> doc này.

---

## 0. Chuẩn bị (làm 1 lần)

### 0.1 Chạy stack

```bash
cd hf-medusa-store          # workspace root (thư mục trong)
pnpm backend:dev            # backend  http://localhost:9000/app
pnpm storefront:dev         # storefront http://localhost:8008
pnpm backend:seed           # seed đầy đủ voucher + AUTO promo + sản phẩm (idempotent)
```

### 0.2 Dữ liệu seed dùng xuyên suốt (đã có sẵn sau `backend:seed`)

**Global cap:** `DiscountCapConfig.max_discount_percentage = 4000` bps = **40%**.

**Voucher** (đều là native Promotion code-based `is_automatic=false` + VoucherConfig enabled):

| Code        | Discount      | Config VoucherEngine                                           | Dùng ở              |
| ----------- | ------------- | -------------------------------------------------------------- | ------------------- |
| `SAVE10`    | 10%           | per-user 10, không scope                                       | Cart 1, 2           |
| `MEGA20`    | 20%           | per-user 10, không scope                                       | Cart 1 (replace), 3 |
| `MEGA40`    | 40%           | `max_discount_amount = 500.000`, per-user 10                   | phụ lục (Rule 5)    |
| `MEGA50`    | 50%           | per-user 10, không scope                                       | Cart 4              |
| `FIX100K`   | fixed 100.000 | per-user 10                                                    | phụ lục (fixed)     |
| `RACKET20`  | 20%           | scope `Rackets`, per-user 10                                   | V7 (tuỳ chọn)       |
| `SHUTTLE20` | 20%           | scope `Shuttlecocks`, `min_order_value = 200.000`, per-user 10 | Cart 1, 5           |
| `ONCE10`    | 10%           | `per_user_limit = 1`                                           | Cart 6              |
| `OLDEXP10`  | 10%           | validity ở quá khứ (hết hạn)                                   | Cart 1              |

**Automatic Promotion** (bật/tắt theo bảng toggle §0.4):

| Code               | Discount | Category |
| ------------------ | -------- | -------- |
| `AUTO20_RACKET`    | 20%      | Rackets  |
| `AUTO40_RACKET`    | 40%      | Rackets  |
| `AUTO30_STRING`    | 30%      | Strings  |
| `AUTO50_SUGGESTED` | 50%      | Strings  |

**Sản phẩm** (giá gốc đã verify trong `initial-data-seed.ts`):

| Sản phẩm              | Category     |   Giá gốc | Vai trò                                                             |
| --------------------- | ------------ | --------: | ------------------------------------------------------------------- |
| `Yonex Astrox 99 Pro` | Rackets      | 4.500.000 | item có auto promo (stacking)                                       |
| `Yonex BG80 Power`    | Strings      |   150.000 | item thứ 2 (vượt cap / cap exhausted)                               |
| `Victor GR262`        | Grips        |    70.000 | item **không** auto promo nào target — happy path/replace/min-order |
| `Yonex Mavis 350`     | Shuttlecocks |   350.000 | item scope `SHUTTLE20`                                              |

### 0.3 Quy ước ghi số (bắt buộc cho các bước có tính toán)

Với mỗi bước stacking, ghi lại **9 biến** rồi so với bảng kỳ vọng (không chỉ nhìn UI — phải đối
chiếu network response `POST /store/carts/:id/voucher`):

`original_subtotal` · `item_promotion_discount` · `post_promotion_subtotal` ·
`eligible_post_promotion_subtotal` · `raw_voucher_discount` · `voucher_discount_after_voucher_cap`
· `maximum_combined_discount` (= `original_subtotal × 40%`) · `final_voucher_discount` · `final_total`.

### 0.4 ⚠️ Bảng toggle Automatic Promotion theo từng cart

Seed để **cả 4 AUTO promo active cùng lúc** → 2 cặp trùng category cộng dồn, sai số liệu. **Trước
mỗi cart, vào Admin → Promotions và set đúng trạng thái**:

| Cart       | AUTO20_RACKET | AUTO40_RACKET | AUTO30_STRING | AUTO50_SUGGESTED |
| ---------- | ------------- | ------------- | ------------- | ---------------- |
| Cart 1     | Inactive      | Inactive      | Inactive      | Inactive         |
| **Cart 2** | **Active**    | Inactive      | Inactive      | Inactive         |
| **Cart 3** | Inactive      | **Active**    | **Active**    | Inactive         |
| **Cart 4** | Inactive      | Inactive      | Inactive      | **Active**       |
| Cart 5, 6  | Inactive      | Inactive      | Inactive      | Inactive         |

> **Dọn dẹp sau khi test xong:** set cả 4 AUTO promo về **Active** (trạng thái seed ban đầu).

---

## PHẦN A — Admin: ranh giới Promotion ↔ VoucherEngine (1 lần)

### A1. Xác nhận môi trường — `US-05`

1. Admin → Promotions → thấy đủ 9 voucher + 4 AUTO promo ở §0.2.
2. Admin → route **Voucher settings** → xác nhận global cap = `4000` (40%).

### A2. Bật/tắt VoucherEngine trên Promotion Detail — `US-05`, `§6.2 admin`

1. Mở Promotion `SAVE10` → widget **VoucherEngine settings**.
2. Kỳ vọng: badge **Enabled**; các field VoucherEngine-specific (per-user limit, min order,
   scope…) nằm trong widget; `code`/discount/validity vẫn ở Promotion UI gốc — **không** có form
   nhập trùng.
3. Bấm **Disable** → confirm → toast `VoucherEngine disabled for this Promotion.` → badge
   **Disabled**.
4. Bấm **Enable** lại → toast `VoucherEngine enabled for this Promotion.` → **dùng lại đúng
   VoucherConfig/history cũ, không tạo row trùng**.

### A3. Automatic Promotion KHÔNG enable được VoucherEngine — `US-05`

1. Mở Promotion `AUTO20_RACKET` → widget VoucherEngine.
2. Kỳ vọng: badge/label **Not eligible**, có lý do "Promotion automatic không thể enable
   VoucherEngine", **không** có nút/form Save.

### A4. DiscountCapConfig validation — `§6.2 admin`

1. Route Voucher settings → section global cap.
2. Nhập invalid (rỗng / `10001` / số thập phân) → inline validation, **không** gửi request.
3. Nhập `5000` → Save → toast success → refresh vẫn `5000`, `updated_at`/`updated_by` cập nhật.
4. **Đặt lại về `4000`** trước khi sang PHẦN B (để số liệu stacking đúng).

---

## PHẦN B — Storefront: một session đăng nhập liên tục

### B0. Available vouchers modal (guest → login) — `VOUCH-001` (My Vouchers)

1. Guest: mở cart/checkout → **Available vouchers** → kỳ vọng empty state
   `No vouchers available right now.` (không lỗi đỏ, không crash).
2. Đăng nhập customer A → mở lại → kỳ vọng hiển thị voucher active/eligible; mỗi row có code, mô
   tả discount, điều kiện min/scope; voucher không đủ điều kiện hiện reason/disabled.

---

### Cart 1 — V-chain + happy path + replace + §7.3 giữ voucher

> Toggle: **tất cả AUTO Inactive.** Item khởi đầu: `Victor GR262` (70.000, Grips — không promo).

| Bước | Thao tác                                                                            | Kỳ vọng                                                                                                                                                                          | Nhãn                                      |
| ---- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 1.1  | Nhập `KHONGTONTAI` → Apply                                                          | `404` · `VOUCHER_NOT_FOUND` · `Mã giảm giá không đúng. Bạn kiểm tra lại giúp nhé!` · cart không đổi                                                                              | `§7.2 s2` · `T-VOUCH-02`                  |
| 1.2  | Nhập `OLDEXP10` → Apply                                                             | `422` · `VOUCHER_EXPIRED` · `Mã giảm giá đã hết hạn rồi. Bạn xem thêm mã trong "Ví voucher" nhé!`                                                                                | `§7.2 s3` · `T-VOUCH-03`                  |
| 1.3  | Nhập `SHUTTLE20` → Apply (cart = 70.000 < 200.000)                                  | `422` · `VOUCHER_MIN_ORDER_NOT_MET` · `Mua thêm 130.000 nữa để dùng được mã này nhé!` (200.000 − 70.000)                                                                         | `§7.2 s5(min)` · `T-VOUCH-05`             |
| 1.4  | **Add** `Yonex Astrox 99 Pro` → cart = 4.570.000 (vẫn không Shuttlecock, giờ ≥ min) | (chỉ add, chưa apply)                                                                                                                                                            | —                                         |
| 1.5  | Nhập `SHUTTLE20` → Apply                                                            | `422` · `VOUCHER_NO_ELIGIBLE_ITEMS` · `Mã này chỉ áp dụng cho một số sản phẩm/danh mục nhất định. Giỏ hàng chưa có sản phẩm phù hợp.` (V5 pass, V6 fail — đúng thứ tự fail-fast) | `§7.2 s5(scope)` · `T-VOUCH-06`           |
| 1.6  | Nhập `save10` (chữ thường — minh hoạ case-insensitive) → Apply                      | `200` · savings = 10% × 4.570.000 = **457.000** · total 4.113.000 · không cap explanation                                                                                        | `§7.2 s1–s9` · `VOUCH-001` · `T-VOUCH-01` |
| 1.7  | Bấm remove trên voucher tag                                                         | `DELETE …/voucher` `200` · total về 4.570.000 · **`usage_count` không tăng, chưa có `VoucherUsageLog`**                                                                          | `VOUCH-004` · `T-VOUCH-10`                |
| 1.8  | Nhập lại `SAVE10` → Apply                                                           | `200` thành công (chưa đặt hàng nên chưa tính per-user limit)                                                                                                                    | `EC-06`                                   |
| 1.9  | Nhập `MEGA20` khi `SAVE10` đang active → Apply                                      | `409` · `VOUCHER_REPLACE_REQUIRED` · `Bạn đang dùng mã SAVE10. Thay bằng mã mới chứ?`                                                                                            | `VOUCH-001(replace)` · `V8`               |
| 1.10 | Modal xác nhận → bấm **Cancel**                                                     | Modal đóng · `SAVE10` vẫn active · total không đổi                                                                                                                               | —                                         |
| 1.11 | Nhập lại `MEGA20` → Confirm                                                         | `POST …/voucher?replace=true` `200` · tag đổi `SAVE10`→`MEGA20` · **không** có 2 voucher cùng lúc                                                                                | `VOUCH-001(replace)`                      |
| 1.12 | Tăng quantity `Astrox` (hoặc thêm item)                                             | `cart.updated` → revalidate: `MEGA20` **vẫn active, savings tính lại** theo cart mới · **không** có auto-remove notice                                                           | `§7.3 s2+s3a` · `VOUCH-005(giữ)`          |
| 1.13 | Remove `MEGA20` (dọn cart 1)                                                        | voucher tag biến mất, total về subtotal                                                                                                                                          | —                                         |

---

### Cart 2 — stacking DƯỚI cap — `T-VOUCH-07`

> Toggle: **AUTO20_RACKET Active**, còn lại Inactive. Cart mới: chỉ `Yonex Astrox 99 Pro`.

**Trước khi apply:** xác nhận automatic discount = 900.000, cart còn 3.600.000, chưa có voucher row.

Nhập `SAVE10` → Apply. Bảng kỳ vọng:

| Biến                              |                                 Giá trị |
| --------------------------------- | --------------------------------------: |
| `original_subtotal`               |                               4.500.000 |
| `item_promotion_discount`         |               900.000 (20% × 4.500.000) |
| `post_promotion_subtotal`         |                               3.600.000 |
| `raw_voucher_discount`            |               360.000 (10% × 3.600.000) |
| `maximum_combined_discount` (40%) |                               1.800.000 |
| combined trước cap                | 1.260.000 (< 1.800.000 → **không** cap) |
| `final_voucher_discount`          |                                 360.000 |
| `final_total`                     |                           **3.240.000** |

**UI:** dòng automatic discount riêng + dòng voucher `360.000`, không cap explanation,
`discount_capped = false`. **Nhãn:** `§7.2 s7+s8(dưới cap)` · `VOUCH-003 r1–4` · `EC-01(một phần)`.

---

### Cart 3 — stacking VƯỢT cap 40% (điểm nhấn) — `T-VOUCH-08`

> Toggle: **AUTO40_RACKET + AUTO30_STRING Active**, còn lại Inactive. Cart mới: `Astrox` + `BG80 Power`.

**Trước khi apply:** Racket auto = 1.800.000 (40%), String auto = 45.000 (30%), tổng auto = 1.845.000.

Nhập `MEGA20` → Apply. Bảng kỳ vọng:

| Biến                              |                                Giá trị |
| --------------------------------- | -------------------------------------: |
| `original_subtotal`               |                              4.650.000 |
| `item_promotion_discount`         |         1.845.000 (1.800.000 + 45.000) |
| `post_promotion_subtotal`         |                              2.805.000 |
| `raw_voucher_discount`            |              561.000 (20% × 2.805.000) |
| `maximum_combined_discount` (40%) |            1.860.000 (40% × 4.650.000) |
| combined trước cap                | 2.406.000 (> 1.860.000 → **vượt cap**) |
| cap còn lại cho voucher           |         15.000 (1.860.000 − 1.845.000) |
| `final_voucher_discount`          |                             **15.000** |
| `final_total`                     |                          **2.790.000** |

**UI:**

- Automatic discount **giữ nguyên 1.845.000** (không bị đụng vào — nếu bị giảm ⇒ **FAIL**).
- Voucher hiển thị savings cuối **15.000** (không phải 561.000).
- Có `cap_explanation`, ví dụ: _"Giảm giá voucher được điều chỉnh từ 561.000₫ xuống 15.000₫ vì
  tổng mức giảm (gồm khuyến mãi tự động) không vượt quá 40% giá trị đơn hàng."_
- Response: `original_discount = 561.000`, `discount_capped = true`.

> **Callout lệch SRS #1:** SRS worked-example dùng cap **50%** → voucher còn 490.000, total
> 2.350.000. Hệ thống dùng cap **40%** → voucher còn 15.000, total 2.790.000. Số khác nhau là
> **đúng theo CR Phase 5**, không phải bug.

**Nhãn:** `§7.2 s8(giảm voucher)` · `VOUCH-003 r6` · `EC-01`.

---

### Cart 4 — cap exhausted (item promo một mình đã ăn hết cap) — `T-VOUCH-09` / `EC-03`

> Toggle: **AUTO50_SUGGESTED Active**, còn lại Inactive. Cart mới: chỉ `BG80 Power` (150.000).

**Trước khi apply:** automatic discount = 75.000 (50%), cart còn 75.000.

| Biến                              |                                 Giá trị |
| --------------------------------- | --------------------------------------: |
| `original_subtotal`               |                                 150.000 |
| `item_promotion_discount`         |                  75.000 (50% × 150.000) |
| `maximum_combined_discount` (40%) |                                  60.000 |
| `item_promotion_discount ≥ cap`?  | **true** → `cap_exhausted_by_promotion` |

Nhập `MEGA50` → Apply. Kỳ vọng: **bị từ chối ngay**, `422` · `VOUCHER_CAP_EXHAUSTED` ·
`Giỏ hàng của bạn đã đạt mức giảm giá tối đa từ chương trình khuyến mãi hiện tại, không thể áp dụng
thêm voucher.` · automatic discount vẫn 75.000, cart total vẫn 75.000 (**không âm, không về 0**).

> **Callout lệch SRS #2:** SRS §10.2/EC-03 nói "giảm voucher về 0, không reject". CR 2026-07-22
> đổi thành **reject thẳng** để tránh hiển thị voucher "áp dụng thành công" nhưng savings = 0đ gây
> hiểu lầm. (Tuỳ chọn minh hoạ chủ động: mở Available vouchers trên cart này → trường
> `cap_status.cap_exhausted_by_promotion = true` để storefront tắt sẵn ô nhập mã.)

**Nhãn:** `§7.2 s8 → assert-cap-not-exhausted` · `VOUCH-003 r6` · `EC-03` · `T-VOUCH-09`.

---

### Cart 5 — SHUTTLE20 success + auto-remove khi cart đổi — `T-VOUCH-11` / `EC-02`

> Toggle: tất cả AUTO Inactive. Cart mới: `Yonex Mavis 350` (350.000, Shuttlecocks).

1. Nhập `SHUTTLE20` → Apply → `200` · savings = 20% × 350.000 = **70.000** · total 280.000
   (V5 min 200.000 pass, V6 scope pass). — `§7.2 s1–s9` · `VOUCH-003 r1–4`.
2. Thêm tạm 1 `Victor GR262` (để cart không trống hẳn), rồi **xoá `Yonex Mavis 350`**.
3. Kỳ vọng: `cart.updated` → revalidate → **voucher tự bị remove** (không cần bấm tay) · UI hiện
   notice auto-remove `Mã giảm giá SHUTTLE20 đã được tự động xóa vì …` (reason ứng với
   `VOUCHER_NO_ELIGIBLE_ITEMS` — không còn Shuttlecocks) · cart total không còn voucher discount.

> Biến thể (tuỳ chọn) cho reason min-order: cart có Shuttlecocks ≥ 200.000, apply `SHUTTLE20`,
> giảm quantity xuống < 200.000 → auto-remove reason `VOUCHER_MIN_ORDER_NOT_MET`.

**Nhãn:** `§7.3 s1+s2+s3b+s4` · `VOUCH-005` · `EC-02` · `T-VOUCH-11`.

---

### Cart 6 — checkout → audit + per-user limit — `T-VOUCH-04`

> Toggle: tất cả AUTO Inactive. Cart mới: `Victor GR262` (70.000). Vẫn customer A.

1. Nhập `ONCE10` (per_user_limit=1) → Apply → savings 7.000, total 63.000, `was_capped=false`.
2. Hoàn tất checkout (payment test/manual) → order success.
3. **Kiểm DB/API sau order:**
   - `VoucherUsageLog` có đúng **1 row** cho `voucher_id`(ONCE10) + `order_id`.
   - `discount_applied = 7.000`, `was_capped = false`, `original_discount = 7.000`, `applied_at` có timestamp.
   - `usage_count` của `ONCE10` tăng đúng **1**.
   - Re-emit `order.placed` (nếu có công cụ test lại workflow): **không** tạo row trùng, **không**
     tăng `usage_count` lần 2 (idempotency theo voucher + order). — `INT-02` · `INT-04`.
4. Cùng customer A, mở **Available vouchers** → `ONCE10` phải là `eligible = false` với
   `ineligible_reason` "đã hết lượt" (đã redeem đủ per_user_limit=1).
5. Tạo cart mới, nhập `ONCE10` → Apply → `422` · `VOUCHER_PER_USER_LIMIT_REACHED` ·
   `Bạn đã dùng hết lượt cho mã này rồi.`

**Nhãn:** `§7.2 s4` · `VOUCH-004(chỉ tăng khi đặt hàng)` · `T-VOUCH-04`.

---

### B-extra. V3 & V7 (đủ §4 VOUCH-002)

- **V7 — segment:** Admin → widget VoucherEngine của `RACKET20` (hoặc voucher dự phòng) → nhập
  `user_segment_conditions` JSON trỏ tới customer group mà customer A **không** thuộc → Save.
  Storefront (customer A) nhập code đó → `422` · `VOUCHER_SEGMENT_NOT_ELIGIBLE` ·
  `Mã này không áp dụng cho tài khoản của bạn.` **Gỡ segment condition sau khi test.** —
  `§7.2 s6`.
- **V3 — global usage limit:** set `usage_count ≥ usage_limit` cho một voucher test (qua admin
  hoặc script test — khó đạt bằng UI thuần) → nhập code → `422` · `VOUCHER_USAGE_LIMIT_REACHED` ·
  `Mã này đã hết lượt sử dụng. Bạn thử mã khác nhé!` — `§7.2 s4(global)`.

---

### B-last. Rate-limit / brute-force — `T-VOUCH-12` / `EC-10`

> **Đặt CUỐI cùng, hoặc chạy trong tab ẩn danh riêng** — cooldown 30 phút sẽ khoá các bước apply
> phía sau nếu chạy sớm.

1. Cùng browser/customer/IP: nhập mã sai (`KHONGTONTAI…`) **5 lần liên tiếp**.
2. Kỳ vọng: các lần đầu `404 VOUCHER_NOT_FOUND`; từ lần thứ 5 (theo ngưỡng) → `429` · cooldown ~30 phút.
3. Nhập `SAVE10` (mã đúng) ngay sau đó → **vẫn bị chặn trong cooldown** (rate-limit theo
   customer/IP, không theo riêng mã).
4. **Ghi chú quan trọng:** **chỉ `VOUCHER_NOT_FOUND` (404) bị đếm** vào rate-limit; lỗi 422 khác
   (expired, min-order, scope…) **không** bị đếm — ghi nhận đúng hành vi này. — `SEC-02`.

---

## PHẦN C — Admin: analytics sau order — `§6.2 admin`

1. Admin → Promotion Detail `ONCE10` → widget analytics: `total_uses = 1`,
   `total_discount_given = 7.000`, `capped_count` **không** tăng (order này không bị cap).
2. (Tuỳ chọn) checkout cho case Cart 3 (bị cap) rồi mở Promotion Detail `MEGA20` → `capped_count`
   tăng.
3. Nếu `avg_order_value`/`conversion_rate` luôn `0` ⇒ ghi nhận known gap nếu backend chưa có nguồn
   dữ liệu.

---

## PHẦN D — Bước script phụ (ngoài luồng UI tuyến tính)

### D1. EC-04 — concurrency (partial)

Mục tiêu: 2 request đồng thời — (a) apply voucher, (b) xoá item eligible cuối cùng — không tạo
state mâu thuẫn. Vì cần bắn song song nên dùng script, không làm được bằng click UI.

```bash
# Giả định: CART_ID có 1 item eligible + voucher SHUTTLE20 sắp apply; chạy 2 lệnh gần như đồng thời.
curl -s -X POST  "http://localhost:9000/store/carts/$CART_ID/voucher" \
     -H 'x-publishable-api-key: '"$PK" -H 'content-type: application/json' \
     -d '{"code":"SHUTTLE20"}' &
curl -s -X DELETE "http://localhost:9000/store/carts/$CART_ID/line-items/$LINE_ID" \
     -H 'x-publishable-api-key: '"$PK" &
wait
```

Kỳ vọng: cả hai kết thúc **không để cart ở trạng thái nửa vời** — hoặc voucher apply rồi bị
revalidate gỡ (do item eligible đã mất), hoặc apply bị `409 VOUCHER_CART_CHANGED`
(`Giỏ hàng đã thay đổi, cần tính lại. Bạn thử lại nhé!`). **Không** có voucher discount treo trên
cart không còn item eligible.

> **Callout lệch SRS #3 (honest):** lock hiện tại (`revalidateVoucherWorkflow` mutual exclusion)
> chỉ phủ race **giữa 2 workflow VoucherEngine**, **chưa** phủ đúng kịch bản SRS (apply voucher
> tranh chấp với mutation cart **native** của Medusa). Ghi kết quả là **partial** — đúng trạng
> thái repo, chưa quyết kiến trúc lock rộng hơn.

### D2. EC-08 — cascading tier (tuỳ chọn)

1. Admin: tạo thêm 1 automatic promotion **ngưỡng chi tiêu** (vd "chi ≥ 5.000.000 giảm thêm 5%").
2. Storefront: cart có voucher đang active, **thêm item** để tổng vượt ngưỡng.
3. Kỳ vọng: item promo tier mới áp (item-level) → voucher **tính lại** trên post-promo subtotal
   mới → global cap re-check. Khách hưởng cascading discount **tới trần cap**, không vượt. —
   `§7.3 s3a`.

---

## Bảng coverage matrix (đối chiếu cuối vòng — điền PASS/FAIL/BLOCKED)

### §10.2 Voucher Tests

| SRS ID     | Scenario                                       | Bước trong file này | Dữ liệu                     | Kết quả |
| ---------- | ---------------------------------------------- | ------------------- | --------------------------- | ------- |
| T-VOUCH-01 | Valid voucher applied, total updated           | Cart 1.6            | `SAVE10`                    |         |
| T-VOUCH-02 | Invalid code, error message                    | Cart 1.1            | mã sai                      |         |
| T-VOUCH-03 | Expired voucher                                | Cart 1.2            | `OLDEXP10`                  |         |
| T-VOUCH-04 | Per-user limit exceeded                        | Cart 6              | `ONCE10`                    |         |
| T-VOUCH-05 | Below min_order, remaining shown               | Cart 1.3            | `SHUTTLE20`                 |         |
| T-VOUCH-06 | No eligible items, scope error                 | Cart 1.5            | `SHUTTLE20`                 |         |
| T-VOUCH-07 | 20% promo + 10% voucher, under cap             | Cart 2              | `AUTO20_RACKET`+`SAVE10`    |         |
| T-VOUCH-08 | 40% promo + 20% voucher, cap reduces voucher   | Cart 3              | `AUTO40`+`AUTO30`+`MEGA20`  |         |
| T-VOUCH-09 | 50% promo + 50% voucher, cap prevents negative | Cart 4              | `AUTO50_SUGGESTED`+`MEGA50` |         |
| T-VOUCH-10 | Remove voucher, no usage increment             | Cart 1.7            | `SAVE10`                    |         |
| T-VOUCH-11 | Remove eligible items → auto-remove            | Cart 5              | `SHUTTLE20`                 |         |
| T-VOUCH-12 | 5 failed attempts → rate limited               | B-last              | 5 mã sai                    |         |

### §4 (VOUCH / V1–V8) · §7.2 · §7.3 · §8

| Requirement                         | Bước              | Requirement                          | Bước                |
| ----------------------------------- | ----------------- | ------------------------------------ | ------------------- |
| VOUCH-001 apply/My Vouchers/replace | B0, 1.6, 1.9–1.11 | §7.2 s1–s3 (normalize/lookup/expiry) | 1.1, 1.2, 1.6       |
| VOUCH-002 V1                        | 1.1               | §7.2 s4 (usage: global/per-user)     | Cart 6, B-extra(V3) |
| VOUCH-002 V2                        | 1.2               | §7.2 s5 (min/scope)                  | 1.3, 1.5            |
| VOUCH-002 V3                        | B-extra           | §7.2 s6 (segment)                    | B-extra(V7)         |
| VOUCH-002 V4                        | Cart 6            | §7.2 s7 (calculate)                  | Cart 2              |
| VOUCH-002 V5                        | 1.3               | §7.2 s8 (global cap)                 | Cart 2, 3, 4        |
| VOUCH-002 V6                        | 1.5               | §7.2 s9 (attach)                     | 1.6, Cart 2         |
| VOUCH-002 V7                        | B-extra           | §7.3 s2+s3a (giữ voucher)            | 1.12                |
| VOUCH-002 V8 (1 voucher active)     | 1.9               | §7.3 s3b (auto-remove)               | Cart 5              |
| VOUCH-003 r1–6                      | Cart 2, 3, 4      | EC-01                                | Cart 2, 3           |
| VOUCH-004 remove/no-increment       | 1.7, Cart 6       | EC-02                                | Cart 5              |
| VOUCH-005 revalidate                | 1.12, Cart 5      | EC-03                                | Cart 4              |
| SEC-02 rate-limit                   | B-last            | EC-04 (partial)                      | D1                  |
| §6.2 admin (enable/analytics)       | A2, C             | EC-06                                | 1.8                 |
|                                     |                   | EC-08                                | D2                  |
|                                     |                   | EC-10                                | B-last              |

> **Ngoài phạm vi voucher flow này:** EC-05, EC-07, EC-09 là edge case phía **Suggestive Selling**
> (out-of-stock, dismiss, cache stale) — không thuộc Voucher Engine, không cover ở đây.

---

## Bảng đối chiếu message VI (nguồn: `workflows/voucher-engine/lib/errors.ts`)

| Code                             | HTTP | UI phải hiển thị                                                                                                 |
| -------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------- |
| `VOUCHER_NOT_FOUND`              | 404  | Mã giảm giá không đúng. Bạn kiểm tra lại giúp nhé!                                                               |
| `VOUCHER_INACTIVE`               | 422  | Mã giảm giá không đúng. Bạn kiểm tra lại giúp nhé!                                                               |
| `VOUCHER_NOT_YET_VALID`          | 422  | Mã này chưa tới ngày sử dụng. Bạn quay lại sau nhé!                                                              |
| `VOUCHER_EXPIRED`                | 422  | Mã giảm giá đã hết hạn rồi. Bạn xem thêm mã trong "Ví voucher" nhé!                                              |
| `VOUCHER_USAGE_LIMIT_REACHED`    | 422  | Mã này đã hết lượt sử dụng. Bạn thử mã khác nhé!                                                                 |
| `VOUCHER_PER_USER_LIMIT_REACHED` | 422  | Bạn đã dùng hết lượt cho mã này rồi.                                                                             |
| `VOUCHER_MIN_ORDER_NOT_MET`      | 422  | Mua thêm {remaining} nữa để dùng được mã này nhé!                                                                |
| `VOUCHER_NO_ELIGIBLE_ITEMS`      | 422  | Mã này chỉ áp dụng cho một số sản phẩm/danh mục nhất định. Giỏ hàng chưa có sản phẩm phù hợp.                    |
| `VOUCHER_SEGMENT_NOT_ELIGIBLE`   | 422  | Mã này không áp dụng cho tài khoản của bạn.                                                                      |
| `VOUCHER_REPLACE_REQUIRED`       | 409  | Bạn đang dùng mã {current_code}. Thay bằng mã mới chứ?                                                           |
| `VOUCHER_CART_CHANGED`           | 409  | Giỏ hàng đã thay đổi, cần tính lại. Bạn thử lại nhé!                                                             |
| `VOUCHER_CALCULATION_FAILED`     | 400  | Không thể áp dụng mã lúc này, giỏ hàng được giữ nguyên.                                                          |
| `VOUCHER_CAP_EXHAUSTED`          | 422  | Giỏ hàng của bạn đã đạt mức giảm giá tối đa từ chương trình khuyến mãi hiện tại, không thể áp dụng thêm voucher. |
| `VOUCHER_AUTO_REMOVED`           | 200  | Mã giảm giá {code} đã được tự động xóa vì {reason}.                                                              |

---

## Phụ lục — Rule 5 (voucher max cap) & fixed-amount voucher

- **`MEGA40` (`max_discount_amount = 500.000`):** cart eligible ~2.000.000 → raw 40% = 800.000 →
  sau voucher-cap = **500.000** (khác global cap 40%). Nếu global cap không vượt, `discount_capped`
  (global) = false. — `VOUCH-003 r5`.
- **`FIX100K` (fixed 100.000):** cart eligible 300.000 → discount 100.000; cart eligible 80.000 →
  discount **không vượt eligible subtotal** (tối đa 80.000). Fixed voucher không cần
  `max_discount_amount`.

---

## Mẫu ghi nhận kết quả (copy cho từng bước)

```text
Bước / SRS ID:
Ngày | Tester | Môi trường:
Cart ID | Customer | Voucher code:

Kỳ vọng:
Thực tế:

Network:  URL | Status | code | customer_message | details
UI:       Screenshot | Text hiển thị | Toast
DB/API:   VoucherConfig | VoucherUsageLog | Cart metadata

Kết luận: PASS / FAIL / BLOCKED
Ghi chú:
```

## Checklist kết thúc một vòng

- [ ] A: enable/disable VoucherEngine toast đúng; AUTO promo không enable được; cap validation OK.
- [ ] Cart 1: V1/V2/V5/V6 đúng message; apply/remove/re-apply/replace + §7.3 giữ voucher OK.
- [ ] Cart 2/3/4: 3 bảng số học khớp (3.240.000 / 2.790.000 / reject CAP_EXHAUSTED); automatic
      discount **không** bị voucher đụng vào.
- [ ] Cart 5: auto-remove có notice, reason đúng.
- [ ] Cart 6: chỉ tạo `VoucherUsageLog` sau checkout; per-user limit chặn lần 2; idempotency OK.
- [ ] B-extra: V3, V7 message đúng.
- [ ] B-last: rate-limit 429 + cooldown; chỉ `VOUCHER_NOT_FOUND` bị đếm.
- [ ] C: analytics phản ánh usage.
- [ ] D: EC-04 (partial) không để state mâu thuẫn; EC-08 cascading (nếu chạy) đúng.
- [ ] Coverage matrix không còn dòng trống.
- [ ] **Dọn dẹp:** set cả 4 AUTO promotion về Active; gỡ segment condition test.
