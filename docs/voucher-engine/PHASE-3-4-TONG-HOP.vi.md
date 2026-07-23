# VoucherEngine — Tổng hợp Phase 3 & Phase 4 (2026-07-22)

Tài liệu gộp 2 phần:

- **Phase 3** — kết quả audit toàn bộ QA test-case matrix (SRS §8 Edge Cases + §10 Acceptance
  Test Checklist), nguồn: [`docs/qa-test-cases/README.md`](../qa-test-cases/README.md).
- **Phase 4** — bug thật tìm ra và fix ngay trong ngày (global 50% discount cap không hoạt
  động), nguồn: session làm việc 2026-07-22, file sửa
  `apps/backend/src/modules/voucher-engine/lib/calculate-discount.ts`.

---

## PHASE 3 — QA Test-Case Matrix (SRS §8 + §10)

**Phạm vi:** toàn bộ SRS §8 "Edge Cases & Business Rules Matrix" (EC-01→EC-10) + §10 "Acceptance
Test Checklist" (T-VOUCH-01→12, T-SUGG-01→10) — **32/32 hạng mục**, đối chiếu với SRS gốc trên
Google Docs (không dùng bản PDF/md tĩnh trong repo vì có thể lệch).

### Kết quả tổng quan

|                                                      | Số lượng                                                          |
| ---------------------------------------------------- | ----------------------------------------------------------------- |
| ✅ Pass (re-run thật, có bằng chứng)                 | 27 / 32                                                           |
| 🔴 Gap thật, chưa fix                                | 1 (EC-03 / T-VOUCH-09 — sàn 1 VND)                                |
| 🟡 Partially done, chưa fix (blocked chờ quyết định) | 1 (EC-04 — optimistic lock)                                       |
| ❌ Chưa implement (thiếu hạ tầng test)               | 1 (T-SUGG-06 — E2E, không có Playwright)                          |
| ⚠️ SRS annotation sai/lỗi thời (đã đính chính)       | 2 (EC-08 "not done"→thực ra Done; T-SUGG-10 "missing"→thực ra có) |

**Unit test suite (`pnpm test:unit`, re-run 2026-07-21):** 253 passed / 254 total, 21 file (1 fail
= RED test cố ý của EC-03, đã biết trước). Con số này khác với 56 test case liệt kê trong phụ lục
của README gốc — 253 là TẤT CẢ unit test hiện có (kể cả hàm phụ trợ như `money.ts`), 56 là tập con
mỗi cái chứng minh trực tiếp 1 mục SRS §8/§10 cụ thể.

### Tiến độ theo Edge Case (SRS §8)

| EC    | Mô tả ngắn                                                            | Trạng thái audit                                                                      |
| ----- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| EC-01 | Item promo + voucher gần cap 50%                                      | ✅ Pass                                                                               |
| EC-02 | Xoá hết item scope voucher → auto-remove                              | ✅ Pass                                                                               |
| EC-03 | Sàn tối thiểu 1 VND sau combined discount                             | 🔴 Confirmed gap — RED test (TDD), chưa fix                                           |
| EC-04 | Concurrent apply voucher vs xoá item (optimistic lock)                | 🟡 Partially done — blocked chờ quyết định kiến trúc                                  |
| EC-05 | Item thêm từ suggestion (PDP) không bị gợi ý lại ở cart               | ✅ Pass; bug thật tìm thấy + fix ở T-SUGG-01/05 (test thiếu `manage_inventory:false`) |
| EC-06 | Apply→remove→re-apply cùng session, usage_count chỉ tăng khi đặt hàng | ✅ Pass                                                                               |
| EC-07 | Suggested item hết hàng giữa lúc render và tap Add                    | ✅ Pass (2 test mới, route trước đó 0% coverage)                                      |
| EC-08 | Thêm suggested item vượt ngưỡng tier promotion mới                    | ✅ Pass; SRS annotation "not done" là sai/lỗi thời                                    |
| EC-09 | Admin deactivate rule trong khi cache còn hiệu lực                    | ✅ Pass (test mới, route trước đó 0% coverage)                                        |
| EC-10 | Rate limit brute-force voucher                                        | ✅ Pass (real Redis)                                                                  |

### Tiến độ theo Acceptance Test Checklist (SRS §10) — 22/22 hoàn tất, 20/22 pass sạch

| T-ID       | Mô tả ngắn                                                | Trạng thái audit                                                                               |
| ---------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| T-VOUCH-01 | Valid voucher applied → discount + total                  | ✅ Pass                                                                                        |
| T-VOUCH-02 | Invalid code → error                                      | ✅ Pass                                                                                        |
| T-VOUCH-03 | Expired → error + date                                    | ✅ Pass; message không interpolate `{date}` (minor)                                            |
| T-VOUCH-04 | Per-user limit exceeded → error                           | ✅ Pass                                                                                        |
| T-VOUCH-05 | Below min_order → amount needed                           | ✅ Pass                                                                                        |
| T-VOUCH-06 | No eligible items → category error                        | ✅ Pass                                                                                        |
| T-VOUCH-07 | Item promo 20% + voucher 10% → under cap                  | ✅ Pass                                                                                        |
| T-VOUCH-08 | Item promo 40% + voucher 20% → capped                     | ✅ Pass                                                                                        |
| T-VOUCH-09 | Suggested 50% promo + voucher 50% → cap prevents negative | 🟡 Pass nhưng chưa đầy đủ — chỉ chứng minh "không âm", chưa chứng minh "sàn 1 VND" (xem EC-03) |
| T-VOUCH-10 | Remove voucher → reverted, no usage increment             | ✅ Pass                                                                                        |
| T-VOUCH-11 | Remove eligible items → auto-removed                      | ✅ Pass                                                                                        |
| T-VOUCH-12 | 5 failed attempts → rate limited                          | ✅ Pass                                                                                        |
| T-SUGG-01  | 3 manual suggestions → all shown in order                 | 🛠️ Was failing (test bug) — đã fix, giờ Pass                                                   |
| T-SUGG-02  | 1 manual → backfill 2-4 category complements              | ✅ Pass (pure-logic level; chưa có integration test ghép DB thật)                              |
| T-SUGG-03  | Already in cart → excluded                                | ✅ Pass                                                                                        |
| T-SUGG-04  | Out of stock → excluded                                   | ✅ Pass (global stock only, chưa store-scoped — gap đã biết)                                   |
| T-SUGG-05  | Dismissed → not shown again in session                    | 🛠️ Was failing (test bug) — đã fix, giờ Pass                                                   |
| T-SUGG-06  | One-tap add → item in cart, toast shown                   | ❌ Not Implemented — không có Playwright trong repo                                            |
| T-SUGG-07  | Racket no string → CR-01 fires                            | ✅ Pass                                                                                        |
| T-SUGG-08  | Near free-ship threshold → badge shown                    | ✅ Pass                                                                                        |
| T-SUGG-09  | Cart change → suggestions refresh, cache invalidated      | ✅ Pass                                                                                        |
| T-SUGG-10  | Suggestion events tracked                                 | ✅ Pass; đính chính audit code cũ nói "missing" là sai                                         |

### Việc còn tồn đọng cần team quyết định (từ Phase 3)

1. Fix EC-03/T-VOUCH-09 (sàn 1 VND) — vị trí đã biết (`calculate-discount.ts`), RED test sẵn sàng
   cho GREEN.
2. Hướng kiến trúc cho EC-04 (concurrent lock).
3. Viết Playwright cho T-SUGG-06.
4. Cập nhật SRS gốc: EC-08 "not done"→"Done"; T-SUGG-10 "missing"→"Done".
5. Ưu tiên thấp: message lỗi T-VOUCH-03/04 chưa interpolate `{date}`/`{count}`/`{limit}`;
   T-SUGG-02/04 mới test ở tầng pure-logic, chưa có integration test ghép DB thật.

Chi tiết đầy đủ (56 test case, TC ID, dữ liệu đầu vào, ghi chú file:line) ở
[`docs/qa-test-cases/README.md`](../qa-test-cases/README.md) + 32 file `EC-XX.md`/`T-VOUCH-XX.md`/`T-SUGG-XX.md`.

---

## PHASE 4 — Fix: global 50% discount cap không thực sự cap voucher (2026-07-22)

### Bug

Trên cart thật (`localhost:8008/vn/cart`): subtotal ₫1.500.000, cap 50% phải giới hạn tổng
discount ở ₫750.000, nhưng UI hiện `Discount: -₫825.000` (đã vượt cap) và voucher SAVE50 vẫn
claim thêm ₫675.000 savings chồng lên trên.

**Nguyên nhân:** `calculateVoucherDiscount` trong
`apps/backend/src/modules/voucher-engine/lib/calculate-discount.ts` tính "hạn mức cap còn lại
cho voucher" bằng:

```ts
remaining_cap_capacity = clampMin(
  maximum_combined_discount -
    post_promotion_subtotal +
    eligible_post_promotion_subtotal,
);
```

Khi voucher áp dụng cho cả cart (trường hợp phổ biến nhất, không scope theo sản phẩm/category),
`eligible_post_promotion_subtotal` luôn bằng `post_promotion_subtotal` → 2 số hạng triệt tiêu
nhau → `remaining_cap_capacity` luôn bằng đúng `maximum_combined_discount`, **hoàn toàn bỏ qua**
`item_promotion_discount`. Cap không bao giờ bị "ăn bớt" bởi item promotion đã áp trước đó.

**Phát hiện:** Chạy unit test sẵn có của module (`calculate-discount.unit.spec.ts`) thì 4/28 test
đang fail, đúng vào case item-promo + voucher vượt cap (T-VOUCH-08, T-VOUCH-09, 2 case EC-03).
Một test còn ghi chú sẵn công thức đúng: `final_voucher_discount = max(0, cap - item_promotion_discount)`.

### Fix

```ts
// 8. remaining global-cap capacity — the cap threshold minus what item-level
// promotions have already consumed (Rule 9/10).
const remaining_cap_capacity = clampMin(
  maximum_combined_discount - item_promotion_discount,
);
```

Đây là thay đổi 1 công thức duy nhất, trong hàm pure (không I/O). Công thức này chỉ tồn tại ở
đúng 1 nơi trong toàn repo — không có bản sao logic ở `apply-voucher.ts`,
`revalidate-voucher-on-cart-change.ts`, hay nơi khác cần sửa thêm.

### Downstream bị ảnh hưởng (đều dùng chung `calculateVoucherDiscount`)

1. `workflows/voucher-engine/lib/resolve-and-calculate-discount.ts` — dùng chung cho cả
   `apply-voucher.ts`, `revalidate-voucher-on-cart-change.ts`, và
   `steps/calculate-voucher-discount.ts`.
2. `api/store/vouchers/lib/list-available-vouchers.ts` — endpoint `GET /store/vouchers` và
   "My Vouchers" (`estimated_savings` + thứ tự sắp xếp theo savings).

### Kết quả kiểm chứng

| Suite                             | Trước fix    | Sau fix      |
| --------------------------------- | ------------ | ------------ |
| `calculate-discount.unit.spec.ts` | 24/28 pass   | 27/28 pass   |
| `pnpm test:unit` (toàn backend)   | 291/295 pass | 294/295 pass |

Không có regression ở bất kỳ suite khác (suggestive-selling, rate-limit, validators, admin,
analytics... đều pass như cũ).

### Vấn đề còn lại — KHÔNG liên quan đến fix này

1 test fail còn sót (`EC-03: floors expected_final_cart_total at 1 VND`) là mâu thuẫn spec đã có
từ trước Phase 4 (`[NEEDS_VERIFICATION #13]`, chính là gap đã ghi nhận ở Phase 3 mục EC-03/T-VOUCH-09
phía trên) — bản thân file test có 2 chỗ kỳ vọng khác nhau (1 chỗ nói rõ "deliberately NOT floored
to 1", chỗ kia lại expect = 1). Đây là câu hỏi nghiệp vụ cần team quyết định riêng, không tự sửa
trong phiên này.

### Ghi nhận thêm (out of scope, chưa investigate)

Storefront `cart-totals/index.tsx` có prop `discount_subtotal` là dead code — field này không tồn
tại trên `HttpTypes.StoreCart` (chỉ có `discount_total`), nên dòng "Discount" trong summary UI lẽ
ra không bao giờ render được từ build hiện tại trên disk. Giá trị thấy được trên cart thật nhiều
khả năng đến từ 1 dev-server đã chạy từ trước (build cũ) hoặc cache — bug riêng, không liên quan
đến cap 50%, cần theo dõi thêm.

### File đã sửa

- `apps/backend/src/modules/voucher-engine/lib/calculate-discount.ts` (1 công thức, dòng
  `remaining_cap_capacity`).
