# QA Test Case Matrix — Edge Cases & Business Rules (SRS §8)

## 📋 Tổng hợp báo cáo cho Team (2026-07-21)

**Phạm vi đã audit:** toàn bộ SRS §8 "Edge Cases & Business Rules Matrix" (EC-01→EC-10) +
§10 "Acceptance Test Checklist" (T-VOUCH-01→12, T-SUGG-01→10) — **32/32 hạng mục**, đối chiếu với
SRS gốc trên Google Docs (không dùng bản PDF/md tĩnh trong repo vì có thể lệch).

**Kết quả tổng quan:**

|                                                      | Số lượng                                                          |
| ---------------------------------------------------- | ----------------------------------------------------------------- |
| ✅ Pass (re-run thật, có bằng chứng)                 | 27 / 32                                                           |
| 🔴 Gap thật, chưa fix                                | 1 (EC-03 / T-VOUCH-09 — sàn 1 VND)                                |
| 🟡 Partially done, chưa fix (blocked chờ quyết định) | 1 (EC-04 — optimistic lock)                                       |
| ❌ Chưa implement (thiếu hạ tầng test)               | 1 (T-SUGG-06 — E2E, không có Playwright)                          |
| ⚠️ SRS annotation sai/lỗi thời (đã đính chính)       | 2 (EC-08 "not done"→thực ra Done; T-SUGG-10 "missing"→thực ra có) |

**Kiểm kê toàn bộ Unit Test suite (`pnpm test:unit`, re-run 2026-07-21 để xác nhận số hiện tại):**
**253 passed / 254 total, 21 file** (1 fail = đúng RED test của EC-03 đã biết, xem bảng dưới).
Đây là toàn bộ unit test đang có trong backend VoucherEngine + SuggestiveSelling — khác với 56 test
case ở phụ lục cuối trang (56 test case đó là tập con được chọn ra vì mỗi cái chứng minh trực tiếp
1 mục cụ thể trong SRS §8/§10; 253 là TẤT CẢ, kể cả test cho các hàm phụ trợ không gắn với 1 SRS ID
cụ thể nào, ví dụ `money.ts`, `normalize.ts`, `gen-code.ts`).

| #   | File                                                                                     | Pass    | Fail  | Tổng    |
| --- | ---------------------------------------------------------------------------------------- | ------- | ----- | ------- |
| 1   | `src/modules/voucher-engine/lib/__tests__/money.unit.spec.ts`                            | 32      | 0     | 32      |
| 2   | `src/modules/suggestive-selling/__tests__/pipeline.unit.spec.ts`                         | 32      | 0     | 32      |
| 3   | `src/workflows/voucher-engine/__tests__/validators.unit.spec.ts`                         | 28      | 0     | 28      |
| 4   | `src/api/store/carts/[id]/voucher/__tests__/validators.unit.spec.ts`                     | 28      | 0     | 28      |
| 5   | `src/modules/voucher-engine/lib/__tests__/calculate-discount.unit.spec.ts`               | 25      | **1** | 26      |
| 6   | `src/modules/suggestive-selling/__tests__/cart-rules.unit.spec.ts`                       | 19      | 0     | 19      |
| 7   | `src/lib/__tests__/suggestion-cache.unit.spec.ts`                                        | 12      | 0     | 12      |
| 8   | `src/workflows/voucher-engine/admin/lib/__tests__/build-backing-promotion.unit.spec.ts`  | 10      | 0     | 10      |
| 9   | `src/workflows/voucher-engine/__tests__/revalidate-voucher.unit.spec.ts`                 | 8       | 0     | 8       |
| 10  | `src/workflows/suggestive-selling/__tests__/evaluate.unit.spec.ts`                       | 8       | 0     | 8       |
| 11  | `src/api/admin/vouchers/__tests__/validators.unit.spec.ts`                               | 7       | 0     | 7       |
| 12  | `src/lib/__tests__/compute-sales-ranking.unit.spec.ts`                                   | 7       | 0     | 7       |
| 13  | `src/workflows/voucher-engine/__tests__/auto-remove-notice.unit.spec.ts`                 | 5       | 0     | 5       |
| 14  | `src/workflows/voucher-engine/__tests__/assert-cart-unchanged.unit.spec.ts`              | 5       | 0     | 5       |
| 15  | `src/workflows/voucher-engine/__tests__/analytics.unit.spec.ts`                          | 5       | 0     | 5       |
| 16  | `src/workflows/voucher-engine/lib/__tests__/hydrate-voucher-from-promotion.unit.spec.ts` | 4       | 0     | 4       |
| 17  | `src/workflows/voucher-engine/__tests__/rate-limit-policy.unit.spec.ts`                  | 4       | 0     | 4       |
| 18  | `src/workflows/voucher-engine/lib/__tests__/has-stale-voucher-promotion.unit.spec.ts`    | 4       | 0     | 4       |
| 19  | `src/workflows/voucher-engine/__tests__/normalize.unit.spec.ts`                          | 4       | 0     | 4       |
| 20  | `src/workflows/voucher-engine/__tests__/gen-code.unit.spec.ts`                           | 4       | 0     | 4       |
| 21  | `src/api/middlewares/__tests__/voucher-rate-limit.unit.spec.ts`                          | 2       | 0     | 2       |
|     | **TỔNG**                                                                                 | **253** | **1** | **254** |

Lệnh: `pnpm test:unit` (không chỉ định file, chạy toàn bộ suite gate bởi `TEST_TYPE=unit`), từ
`apps/backend`. File #5 chứa RED test cố ý của EC-03 (chưa fix, xem [[EC-03]]) — 20/21 file sạch
100%.

**Unit/Integration test đã viết hoặc sửa trong phiên này** (5 file, +76 dòng, chưa commit):

| File                                                                       | Loại thay đổi                  | Số test case            | Ghi chú                                                                                                                                                                |
| -------------------------------------------------------------------------- | ------------------------------ | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `integration-tests/http/add-suggested-item.spec.ts`                        | 🆕 File hoàn toàn mới          | 3                       | Route `POST /store/carts/:id/suggested-items` trước đó **0% coverage**. Test: in-stock baseline, out-of-stock 409 (EC-07), rule bị deactivate vẫn add được (EC-09).    |
| `integration-tests/http/voucher-suggestion-tier-cascade.spec.ts`           | 🆕 File hoàn toàn mới          | 1                       | EC-08: thêm suggested item vượt ngưỡng tier promotion → voucher tính lại đúng trên subtotal mới + cap. Trước đó chỉ có demo script thủ công.                           |
| `integration-tests/http/apply-remove-voucher.spec.ts`                      | ➕ Bổ sung test mới            | 1                       | EC-06: apply→remove→re-apply cùng session với `per_user_limit=1` phải được cho phép.                                                                                   |
| `src/modules/voucher-engine/lib/__tests__/calculate-discount.unit.spec.ts` | ➕ Bổ sung test mới (RED, TDD) | 1                       | EC-03: xác nhận sàn 1 VND **CHƯA** được implement — test cố ý fail (`Expected: 1, Received: 0`) làm bằng chứng, **chưa fix code**.                                     |
| `integration-tests/http/suggestion.spec.ts`                                | 🐛 Sửa bug trong test cũ       | 0 (fix, không thêm mới) | Test cũ thiếu `manage_inventory: false` khiến route suggestion lọc oan mọi sản phẩm là hết hàng → 3 test (T-SUGG-01, T-SUGG-05 ×2) fail oan. Đã sửa, cả file 9/9 pass. |

**Việc còn tồn đọng cần team quyết định:**

1. **Fix EC-03 / T-VOUCH-09** (sàn 1 VND) — vị trí đã biết (`calculate-discount.ts`), RED test sẵn sàng cho bước GREEN.
2. **Hướng kiến trúc cho EC-04** (concurrent lock) — cần bàn trước khi code/test tiếp.
3. **Viết Playwright cho T-SUGG-06** — cần setup E2E framework mới hoàn toàn, chưa tồn tại trong repo.
4. Cập nhật SRS gốc: EC-08 annotation "not done" → "Done"; T-SUGG-10 annotation liên quan "missing" → "Done".
5. (Thấp ưu tiên) Message lỗi T-VOUCH-03/04 chưa interpolate literal `{date}`/`{count}`/`{limit}`; T-SUGG-02/04 mới test ở tầng pure-logic, chưa có integration test ghép DB thật; admin cache-invalidation stub + SUGG-002(b) store-scoping (từ Step-1 audit, ngoài phạm vi EC/T-ID).

Chi tiết đầy đủ từng hạng mục ở 2 bảng dưới + 32 file `EC-XX.md`/`T-VOUCH-XX.md`/`T-SUGG-XX.md`.

---

Nguồn chuẩn (source of truth): SRS gốc trên Google Docs
(`1cXsHQfqrKBhx6E-B6DQN1zUeUXVjdpXhBp2ivocng3c`), mục §8 "Edge Cases & Business Rules Matrix"
(EC-01 → EC-10). Mỗi file `EC-XX.md` trong folder này ghi lại (các) test case đã xác minh cho
1 Edge Case, theo đúng cấu trúc cột dưới đây — copy/paste thẳng bảng markdown vào Excel để có
`.xlsx` báo cáo (mỗi `|...|` row → 1 hàng, mỗi cột → 1 cột).

## Cấu trúc cột (áp dụng cho mọi file `EC-XX.md`)

| Cột                  | Ý nghĩa                                                                               |
| -------------------- | ------------------------------------------------------------------------------------- |
| STT                  | Số thứ tự trong file                                                                  |
| Mã Test Case (TC ID) | Định dạng `TC_<MODULE>_EC<NN>_<seq>`, vd `TC_VOUCH_EC01_01`                           |
| Hạng mục / Chức năng | Nhóm chức năng + SRS ID liên quan (VOUCH-003, SUGG-002, …)                            |
| Mô tả kịch bản test  | Kịch bản test bằng tiếng Việt, ngắn gọn                                               |
| Dữ liệu đầu vào      | Input cụ thể (số tiền, mã voucher, cấu hình…)                                         |
| Kết quả mong muốn    | Expected result theo đúng SRS                                                         |
| Kết quả thực tế      | Actual result — chỉ điền sau khi **đã chạy test thật**, không suy đoán                |
| Trạng thái           | `Pass` / `Failed` / `Blocked` / `Not Implemented`                                     |
| Ghi chú              | File:line của test + implementation, lệnh đã chạy, thời điểm chạy, ghi chú lỗi nếu có |

**Nguyên tắc:** "Kết quả thực tế" + "Trạng thái" chỉ được điền dựa trên một lần chạy test thật
trong phiên làm việc (không copy từ báo cáo cũ mà không re-run), theo
`superpowers:verification-before-completion` — evidence trước khi assertion.

## Tiến độ theo Edge Case (SRS §8)

| EC    | Mô tả ngắn                                                            | Priority | Annotation trong SRS gốc | File                 | Trạng thái audit                                                          |
| ----- | --------------------------------------------------------------------- | -------- | ------------------------ | -------------------- | ------------------------------------------------------------------------- |
| EC-01 | Item promo + voucher gần cap 50%                                      | Must     | Done                     | [EC-01.md](EC-01.md) | ✅ Verified — Pass (re-run 2026-07-21)                                    |
| EC-02 | Xoá hết item scope voucher → auto-remove                              | Must     | Done                     | [EC-02.md](EC-02.md) | ✅ Verified — Pass (re-run 2026-07-21)                                    |
| EC-03 | Sàn tối thiểu 1 VND sau combined discount                             | Must     | Not done                 | [EC-03.md](EC-03.md) | 🔴 Confirmed gap — RED test (TDD), chưa fix                               |
| EC-04 | Concurrent apply voucher vs xoá item (optimistic lock)                | Must     | Not done                 | [EC-04.md](EC-04.md) | 🟡 Partially done — documented, blocked on architecture decision          |
| EC-05 | Item thêm từ suggestion (PDP) không bị gợi ý lại ở cart               | Must     | Done                     | [EC-05.md](EC-05.md) | ✅ Verified — Pass; adjacent T-SUGG-01/05 fail found + FIXED (test bug)   |
| EC-06 | Apply→remove→re-apply cùng session, usage_count chỉ tăng khi đặt hàng | Must     | Done                     | [EC-06.md](EC-06.md) | ✅ Verified — Pass (new regression test added + re-run 2026-07-21)        |
| EC-07 | Suggested item hết hàng giữa lúc render và tap Add                    | Must     | Done                     | [EC-07.md](EC-07.md) | ✅ Verified — Pass (2 brand-new tests added, route had 0 coverage before) |
| EC-08 | Thêm suggested item vượt ngưỡng tier promotion mới                    | Should   | Not done                 | [EC-08.md](EC-08.md) | ✅ Verified — Pass (new test added); SRS annotation "not done" is stale   |
| EC-09 | Admin deactivate rule trong khi cache còn hiệu lực                    | Should   | Done                     | [EC-09.md](EC-09.md) | ✅ Verified — Pass (new test added, route had 0 coverage for this case)   |
| EC-10 | Rate limit brute-force voucher                                        | Must     | Done                     | [EC-10.md](EC-10.md) | ✅ Verified — Pass (re-run 2026-07-21, real Redis)                        |

**EC-01 → EC-10: hoàn tất.** Xem "Tổng kết vòng EC-01 → EC-10" cuối [EC-10.md](EC-10.md) cho việc
còn tồn đọng cần quyết định tiếp theo (EC-03 fix, EC-04 hướng kiến trúc, T-SUGG-01/05 điều tra, SRS
annotation EC-08 cần sửa).

## Tiến độ theo Acceptance Test Checklist (SRS §10)

Cùng cấu trúc cột như trên. File `T-VOUCH-XX.md` / `T-SUGG-XX.md`.

| T-ID       | Mô tả ngắn                                                | Validates              | Type        | File                           | Trạng thái audit                                                                 |
| ---------- | --------------------------------------------------------- | ---------------------- | ----------- | ------------------------------ | -------------------------------------------------------------------------------- |
| T-VOUCH-01 | Valid voucher applied → discount + total                  | VOUCH-001              | Integration | [T-VOUCH-01.md](T-VOUCH-01.md) | ✅ Verified — Pass                                                               |
| T-VOUCH-02 | Invalid code → error                                      | V1                     | Unit        | [T-VOUCH-02.md](T-VOUCH-02.md) | ✅ Verified — Pass                                                               |
| T-VOUCH-03 | Expired → error + date                                    | V2                     | Unit        | [T-VOUCH-03.md](T-VOUCH-03.md) | ✅ Verified — Pass; message không interpolate {date} (minor)                     |
| T-VOUCH-04 | Per-user limit exceeded → error                           | V4                     | Unit        | [T-VOUCH-04.md](T-VOUCH-04.md) | ✅ Verified — Pass                                                               |
| T-VOUCH-05 | Below min_order → amount needed                           | V5                     | Unit        | [T-VOUCH-05.md](T-VOUCH-05.md) | ✅ Verified — Pass                                                               |
| T-VOUCH-06 | No eligible items → category error                        | V6                     | Unit        | [T-VOUCH-06.md](T-VOUCH-06.md) | ✅ Verified — Pass                                                               |
| T-VOUCH-07 | Item promo 20% + voucher 10% → under cap                  | VOUCH-003 happy        | Unit        | [T-VOUCH-07.md](T-VOUCH-07.md) | ✅ Verified — Pass                                                               |
| T-VOUCH-08 | Item promo 40% + voucher 20% → capped                     | VOUCH-003 cap exceeded | Unit        | [T-VOUCH-08.md](T-VOUCH-08.md) | ✅ Verified — Pass                                                               |
| T-VOUCH-09 | Suggested 50% promo + voucher 50% → cap prevents negative | EC-03                  | Unit        | [T-VOUCH-09.md](T-VOUCH-09.md) | 🟡 Pass but incomplete — only proves "not negative", not "min 1 VND" (see EC-03) |
| T-VOUCH-10 | Remove voucher → reverted, no usage increment             | VOUCH-004              | Integration | [T-VOUCH-10.md](T-VOUCH-10.md) | ✅ Verified — Pass                                                               |
| T-VOUCH-11 | Remove eligible items → auto-removed                      | VOUCH-005              | Integration | [T-VOUCH-11.md](T-VOUCH-11.md) | ✅ Verified — Pass                                                               |
| T-VOUCH-12 | 5 failed attempts → rate limited                          | EC-10                  | Integration | [T-VOUCH-12.md](T-VOUCH-12.md) | ✅ Verified — Pass                                                               |
| T-SUGG-01  | 3 manual suggestions → all shown in order                 | SUGG-001 Tier1         | Integration | [T-SUGG-01.md](T-SUGG-01.md)   | 🛠️ Was failing (test bug) — FIXED, now Pass                                      |
| T-SUGG-02  | 1 manual → backfill 2-4 category complements              | SUGG-001 Tier2         | Integration | [T-SUGG-02.md](T-SUGG-02.md)   | ✅ Verified — Pass (pure-logic level; workflow/DB layer not integration-tested)  |
| T-SUGG-03  | Already in cart → excluded                                | SUGG-002(a)            | Unit        | [T-SUGG-03.md](T-SUGG-03.md)   | ✅ Verified — Pass                                                               |
| T-SUGG-04  | Out of stock → excluded                                   | SUGG-002(b)            | Unit        | [T-SUGG-04.md](T-SUGG-04.md)   | ✅ Verified — Pass (global stock only, not store-scoped — known gap)             |
| T-SUGG-05  | Dismissed → not shown again in session                    | SUGG-002(c)            | Integration | [T-SUGG-05.md](T-SUGG-05.md)   | 🛠️ Was failing (test bug) — FIXED, now Pass                                      |
| T-SUGG-06  | One-tap add → item in cart, toast shown                   | SUGG-003               | E2E         | [T-SUGG-06.md](T-SUGG-06.md)   | ❌ Not Implemented — no Playwright in repo; backend half covered via EC-07       |
| T-SUGG-07  | Racket no string → CR-01 fires                            | SUGG-004 CR-01         | Unit        | [T-SUGG-07.md](T-SUGG-07.md)   | ✅ Verified — Pass                                                               |
| T-SUGG-08  | Near free-ship threshold → badge shown                    | SUGG-004 CR-02         | Unit        | [T-SUGG-08.md](T-SUGG-08.md)   | ✅ Verified — Pass                                                               |
| T-SUGG-09  | Cart change → suggestions refresh, cache invalidated      | SUGG-005               | Integration | [T-SUGG-09.md](T-SUGG-09.md)   | ✅ Verified — Pass                                                               |
| T-SUGG-10  | Suggestion events tracked                                 | SUGG-006               | Integration | [T-SUGG-10.md](T-SUGG-10.md)   | ✅ Verified — Pass; đính chính audit code cũ nói "missing" là sai                |

**§10 (22/22): hoàn tất.** 20/22 Pass sạch. Việc còn tồn đọng:

1. **T-VOUCH-09 / EC-03** — sàn 1 VND chưa fix (đã có RED test, xem [[EC-03]]).
2. **T-SUGG-06** — E2E chưa viết được (không có Playwright trong repo); phần backend đã có test qua EC-07.
3. **T-SUGG-01/05 — bug thật đã tìm thấy VÀ SỬA** trong phiên này: test cũ thiếu `manage_inventory: false` khiến route lọc oan mọi suggestion là hết hàng. Đã sửa `suggestion.spec.ts`, 9/9 pass.
4. Message error T-VOUCH-03/04 không interpolate literal {date}/{count}/{limit} như câu chữ SRS (minor, có `details` object thay thế).
5. T-SUGG-02, T-SUGG-04 chỉ có test ở tầng pure-logic/global — chưa có integration test ghép với DB thật (category_top_seller) hoặc store-scoping.

---

## 📎 Phụ lục — Toàn bộ 56 Test Case (chi tiết đầy đủ, không cần mở file riêng)

Gộp lại từ tất cả 32 file `EC-XX.md` / `T-VOUCH-XX.md` / `T-SUGG-XX.md` ở trên, để team đọc 1 file
duy nhất là đủ. Cột đầu (`EC` hoặc `T-ID`) cho biết row đó thuộc hạng mục nào — bấm vào file tương
ứng ở 2 bảng phía trên nếu cần xem thêm ngữ cảnh/bằng chứng đầy đủ hơn.

### A. SRS §8 — Edge Cases (19 test case)

| EC    | STT | Mã Test Case (TC ID) | Hạng mục / Chức năng                                                                               | Mô tả kịch bản test                                                                                                                                                                                                                 | Dữ liệu đầu vào                                                                                                                                                                                     | Kết quả mong muốn                                                                                                                                                             | Kết quả thực tế                                                                                                             | Trạng thái                             | Ghi chú                                                                                                                                                                                                             |
| ----- | --- | -------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EC-01 | 1   | TC_VOUCH_EC01_01     | VoucherEngine — Discount Stacking, Rule 11 (VOUCH-003 Rule 1-6)                                    | Áp voucher % lên cart đã có 1 item-promotion % (test hồi quy Rule 11 — đảm bảo credit-line carrier không làm co lại discount của item promotion, khác với carrier ephemeral-promotion cũ bị compound qua `computeActions`)          | Cart: "Racket" 1,000,000₫ x1. Promotion `ITEMPROMO40` (percentage, target_type=items, allocation=across, value=40%). Voucher `STACK20` (percentage, discount_value=2000=20%)                        | HTTP 200; `discount_amount=100,000`; `discount_capped=true`; `updated_cart_total=500,000`; adjustment của item promotion KHÔNG đổi (vẫn 400,000, không bị voucher làm co lại) | Khớp 100%: `discount_amount=100000`, `discount_capped=true`, `updated_cart_total=500000`, item-promo adjustment vẫn 400,000 | Pass                                   | Test: `apply-remove-voucher.spec.ts:155`. Chạy 2026-07-21 11:09, 7/7 suite pass, 6832 ms.                                                                                                                           |
| EC-01 | 2   | TC_VOUCH_EC01_02     | VoucherEngine — Discount Stacking, worked example dưới cap (VOUCH-003 §4.1 happy path, T-VOUCH-07) | Tính discount thuần (pure function) cho cart có 1 dòng đã có item promotion, 1 dòng không, áp voucher % toàn bộ, tổng discount dưới cap 50%                                                                                         | Lines: racket 4,500,000 (`item_promotion_discount=900,000`), string 200,000 (không promo). Voucher: percentage 10%, global cap mặc định 50%                                                         | `raw_voucher_discount=380,000`; `final_voucher_discount=380,000`; `discount_capped=false`; `expected_final_cart_total=3,420,000`; `combined_discount=1,280,000`               | Khớp 100%                                                                                                                   | Pass                                   | Test: `calculate-discount.unit.spec.ts:98-141` (T-VOUCH-07). Chạy 2026-07-21, 25/25 pass, 0.329s.                                                                                                                   |
| EC-02 | 1   | TC_VOUCH_EC02_01     | VoucherEngine — Auto-invalidation on cart change (VOUCH-005)                                       | Voucher scope 1 sản phẩm. Thêm sản phẩm khác (ngoài scope), xoá đúng sản phẩm trong scope → cart chỉ còn item không hợp lệ → revalidate                                                                                             | Cart: Racket (scope) 2,000,000₫ x1. Voucher `RACKETONLY10` (10%, scoped). Thêm Shoes (ngoài scope) 1,500,000₫, xoá dòng Racket                                                                      | `cart.metadata.voucher` bị xoá; `voucher_notice.code="VOUCHER_AUTO_REMOVED"`; `reason_code="VOUCHER_NO_ELIGIBLE_ITEMS"`                                                       | Khớp 100% cả 3 field                                                                                                        | Pass                                   | Test: `revalidate-voucher-workflow.spec.ts:307`. Chạy 2026-07-21 11:12, 7/7 pass, 6195 ms.                                                                                                                          |
| EC-03 | 1   | TC_VOUCH_EC03_01     | VoucherEngine — Global cap floor (SRS §8 EC-03)                                                    | [TDD RED] Item promotion chiếm 100% subtotal → tổng cuối phải floor ở 1 VND, không phải 0                                                                                                                                           | Line: unit_price=1,000,000, item_promotion_discount=1,000,000. Voucher 50%, global cap 50%                                                                                                          | `expected_final_cart_total = 1`                                                                                                                                               | `expected_final_cart_total = 0`                                                                                             | **Failed (RED, chưa fix)**             | Test mới: `calculate-discount.unit.spec.ts:257-280`. Cần sửa `calculate-discount.ts` (`clampMin(..., {floor:1})`). Chạy 2026-07-21: 1 failed, 25 passed, 26 total. **Chờ quyết định Cealus.**                       |
| EC-03 | 2   | TC_VOUCH_EC03_02     | VoucherEngine — Admin warning log (EC-03, phần log cảnh báo)                                       | Chưa viết — cần quyết định layer chịu trách nhiệm log (pure fn không được có I/O)                                                                                                                                                   | —                                                                                                                                                                                                   | —                                                                                                                                                                             | —                                                                                                                           | **Not Implemented**                    | Chưa viết, cần bàn kiến trúc trước.                                                                                                                                                                                 |
| EC-04 | 1   | TC_VOUCH_EC04_01     | VoucherEngine — Lock mutual exclusion (SPEC §14.2-C, phạm vi hẹp hơn EC-04 SRS)                    | 2 lệnh `revalidateVoucherWorkflow` cùng lúc trên 1 cart — xác nhận 1 thắng lock, 1 thua fail-fast                                                                                                                                   | Cart: Racket 2,000,000₫. Voucher `LOCKRACE10` (10%, unscoped). Fire 2 `revalidateVoucherWorkflow` đồng thời                                                                                         | 1 fulfilled, 1 rejected `/Failed to acquire lock/`; `cart.total=3,600,000`; `discount_amount=400,000`                                                                         | Khớp 100%                                                                                                                   | Pass                                   | Test: `revalidate-voucher-workflow.spec.ts:368`. **Lưu ý:** chỉ test race giữa 2 workflow VoucherEngine, KHÔNG phải race với native Medusa cart-mutation như SRS literal. Chạy 2026-07-21 11:12, 7/7 pass, 5816 ms. |
| EC-04 | 2   | TC_VOUCH_EC04_02     | VoucherEngine — literal "apply vs native item-removal" race (đúng kịch bản SRS)                    | Chưa viết                                                                                                                                                                                                                           | —                                                                                                                                                                                                   | Cả 2 request cùng thành công, không inconsistent state                                                                                                                        | —                                                                                                                           | **Blocked — chờ quyết định kiến trúc** | Cealus quyết định (2026-07-21): document only, chưa test/fix — chờ hướng kiến trúc (version column? mở rộng lock?).                                                                                                 |
| EC-05 | 1   | TC_SUGG_EC05_01      | SuggestiveSelling — Filter đã có trong cart (SUGG-002a, T-SUGG-03)                                 | Sản phẩm gợi ý đã có trong cart → bị loại với reason `in_cart`                                                                                                                                                                      | Candidate `product_id:"in_cart"`; `cartProductIds=Set(["in_cart"])`                                                                                                                                 | Candidate bị drop với `reason:"in_cart"`                                                                                                                                      | Khớp 100%                                                                                                                   | Pass                                   | Test: `pipeline.unit.spec.ts:167-174`. Chạy 2026-07-21, 32/32 pass.                                                                                                                                                 |
| EC-05 | 2   | TC_SUGG_EC05_02      | SuggestiveSelling — Cache invalidation cơ chế lõi (SUGG-005, T-SUGG-09)                            | Cache cart-suggestions bị xoá ngay khi gọi `invalidateCartSuggestions` (real cache)                                                                                                                                                 | Seed cache key `cart:{cartId}:suggestions` dữ liệu giả                                                                                                                                              | `cache.get(key)` → `null`                                                                                                                                                     | Khớp 100%                                                                                                                   | Pass                                   | Test: `suggestion.spec.ts:292-299`. Chạy 2026-07-21 11:36, 5556 ms.                                                                                                                                                 |
| EC-05 | 3   | TC_SUGG_EC05_03      | SuggestiveSelling — Subscriber `cart.updated` gọi invalidate (SUGG-005)                            | Gọi trực tiếp handler với event `cart.updated` → cache bị xoá                                                                                                                                                                       | Cache đã seed; event `{data:{id:CART_ID}}`                                                                                                                                                          | `cache.get(key)` → `null`                                                                                                                                                     | Khớp 100%                                                                                                                   | Pass                                   | Test: `suggestion.spec.ts:301-313`. Cùng lần chạy, 5433 ms.                                                                                                                                                         |
| EC-05 | 4   | TC_SUGG_EC05_04      | SuggestiveSelling — Wiring end-to-end qua Event Bus thật (SUGG-005)                                | Emit `cart.updated` qua Event Bus thật → subscriber thực sự nhận                                                                                                                                                                    | `eventBus.emit({name:"cart.updated", data:{id:CART_ID}})`                                                                                                                                           | Cache bị xoá trong 8000ms                                                                                                                                                     | Khớp 100%                                                                                                                   | Pass                                   | Test: `suggestion.spec.ts:315-326`. Cùng lần chạy, 7144 ms.                                                                                                                                                         |
| EC-06 | 1   | TC_VOUCH_EC06_01     | VoucherEngine — Re-apply cùng session (EC-06, per_user_limit) [test MỚI]                           | Apply voucher `per_user_limit=1` → 200. Remove → 200. Apply lại cùng session → vẫn phải 200                                                                                                                                         | Cart: Racket 1,000,000₫. Voucher `REAPPLY10` (10%, `per_user_limit=1`)                                                                                                                              | Cả 3 request 200; lần apply 2, `discount_amount=100,000`                                                                                                                      | Khớp 100%                                                                                                                   | Pass                                   | **Test mới** trong `apply-remove-voucher.spec.ts`. Chạy 2026-07-21: 8/8 pass, 6179 ms.                                                                                                                              |
| EC-06 | 2   | TC_VOUCH_EC06_02     | VoucherEngine — Apply không tăng usage (task 3.6.11, Rule 12)                                      | Apply voucher (global usage_limit) → `usage_count`/`VoucherUsageLog` phải vẫn 0                                                                                                                                                     | Cart: Racket 2,000,000₫. Voucher `NOINCREMENT10` (usage_limit=100)                                                                                                                                  | `usage_count=0`; `logCount=0`                                                                                                                                                 | Khớp 100%                                                                                                                   | Pass                                   | Test: `revalidate-voucher-workflow.spec.ts:435`. Chạy 2026-07-21 11:12, 5811 ms.                                                                                                                                    |
| EC-06 | 3   | TC_VOUCH_EC06_03     | VoucherEngine — Remove không tăng usage (tasks 3.4.2/3.4.10)                                       | Remove voucher đã apply → total revert, usage_count không tăng                                                                                                                                                                      | (dùng chung dữ liệu apply trước đó)                                                                                                                                                                 | `usage_count` không tăng sau remove                                                                                                                                           | Khớp 100%                                                                                                                   | Pass                                   | Test: `apply-remove-voucher.spec.ts:330`. Cùng lô 8/8 pass.                                                                                                                                                         |
| EC-07 | 1   | TC_SUGG_EC07_01      | SuggestiveSelling — One-tap add baseline, còn hàng [test MỚI]                                      | Sản phẩm còn 10 tồn kho tại stock location đúng sales channel → add thành công                                                                                                                                                      | Product manage_inventory:true, stocked_quantity:10; cart cùng sales channel                                                                                                                         | HTTP 200; `line_item` không null, `quantity=1`                                                                                                                                | Khớp 100%                                                                                                                   | Pass                                   | **Test mới**: `add-suggested-item.spec.ts` (file hoàn toàn mới). Chạy 2026-07-21: 2/2 pass, 3246 ms.                                                                                                                |
| EC-07 | 2   | TC_SUGG_EC07_02      | SuggestiveSelling — Hết hàng tại thời điểm add (EC-07) [test MỚI]                                  | `stocked_quantity:0` (vừa hết hàng) → add phải bị từ chối                                                                                                                                                                           | Product manage_inventory:true, stocked_quantity:0                                                                                                                                                   | HTTP 409, `code:"SUGGESTION_STOCK_CONFLICT"`                                                                                                                                  | Khớp 100%                                                                                                                   | Pass                                   | **Test mới**, cùng file trên. Cùng lần chạy, 6170 ms.                                                                                                                                                               |
| EC-08 | 1   | TC_VOUCH_EC08_01     | VoucherEngine × SuggestiveSelling — Cascading tier + voucher + cap (EC-08) [test MỚI]              | Cart có voucher 10% (dưới ngưỡng tier). Seed automatic Promotion "spend 5,000,000→5% off order". Thêm item String qua `addToCartWorkflow` thật → vượt ngưỡng. Không gọi `revalidateVoucherWorkflow` tay — chờ subscriber tự trigger | Racket 4,000,000₫ + voucher TIER10 (10%) đã áp (discount=400,000, total=3,600,000). Promotion TIER5M5 (automatic, order 5%, rule item_total≥5,000,000). Thêm String 1,500,000₫ → subtotal 5,500,000 | Item promo=275,000 (5%×5,500,000). Voucher tính lại trên post-promo mới (5,225,000): `discount_amount=522,500`, `discount_capped=false`. `cart.total=4,702,500`               | Khớp 100% tất cả                                                                                                            | Pass                                   | **Test mới**: `voucher-suggestion-tier-cascade.spec.ts` (file hoàn toàn mới). Pass sau 2 lần sửa test (lock race + thiếu `metadata` trong `select`). Chạy 2026-07-21: 1/1 pass, 3441 ms.                            |
| EC-09 | 1   | TC_SUGG_EC09_01      | SuggestiveSelling — Add vẫn hoạt động khi rule đã bị deactivate (EC-09) [test MỚI]                 | Rule `is_active=false` (admin đã tắt) → khách vẫn tap Add với `attribution.rule_id` trỏ rule đó → phải thành công, chỉ bỏ attribution                                                                                               | Product còn hàng (10). Rule is_active:false. Body add có `attribution.rule_id`                                                                                                                      | HTTP 200; `line_item` không null; `line_item.metadata.suggestion_rule_id=null`                                                                                                | Khớp 100%                                                                                                                   | Pass                                   | **Test mới**, cùng file `add-suggested-item.spec.ts`. Chạy 2026-07-21: 3/3 pass, 5661 ms.                                                                                                                           |
| EC-10 | 1   | TC_VOUCH_EC10_01     | VoucherEngine — Rate limit brute-force (SEC-02/EC-10)                                              | 5 lần mã voucher sai liên tiếp → vẫn 404. Lần 6 → phải bị chặn                                                                                                                                                                      | Cart trống. `{code:"NOTREAL123"}` gửi 6 lần                                                                                                                                                         | 5 lần đầu 404; lần 6: 429, `code:"VOUCHER_RATE_LIMITED"`                                                                                                                      | Khớp 100%                                                                                                                   | Pass                                   | Test: `voucher-rate-limit.spec.ts:81` (cần Redis thật). Chạy 2026-07-21: 1/1 pass, 2738 ms.                                                                                                                         |

### B. SRS §10 — T-VOUCH-01→12 (21 test case)

| T-ID       | STT | Mã Test Case (TC ID)        | Hạng mục / Chức năng                                   | Mô tả kịch bản test                                                      | Dữ liệu đầu vào                                                                   | Kết quả mong muốn                                                                                       | Kết quả thực tế               | Trạng thái                                | Ghi chú                                                                          |
| ---------- | --- | --------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------- |
| T-VOUCH-01 | 1   | TC_VOUCH_T01_01             | VoucherEngine — Apply Voucher Code (VOUCH-001)         | Áp voucher percentage hợp lệ (code lowercase) lên cart 1 item            | Cart: Racket 1,000,000₫. Voucher `HTTPAPPLY10` (10%). Body `{code:"httpapply10"}` | HTTP 200; `discount_amount=100,000`; `updated_cart_total=900,000`; `voucher_details.code="HTTPAPPLY10"` | Khớp 100%                     | Pass                                      | Test: `apply-remove-voucher.spec.ts:123`. 8/8 pass, 5787 ms.                     |
| T-VOUCH-02 | 1   | TC_VOUCH_T02_01             | VoucherEngine — V1 exists+active                       | Voucher `null` → lỗi cụ thể                                              | `v1Exists(null)`                                                                  | `{ok:false, code:"VOUCHER_NOT_FOUND", http_status:404}`                                                 | Khớp 100%                     | Pass                                      | Test: `validators.unit.spec.ts:93-100`. 28/28 pass.                              |
| T-VOUCH-02 | 2   | TC_VOUCH_T02_02             | VoucherEngine — V1 anti-enumeration                    | `is_active=false` → CÙNG message như not-found                           | `v1Exists(voucher({is_active:false}))`                                            | `{code:"VOUCHER_INACTIVE", http_status:422}`, message giống NOT_FOUND                                   | Khớp 100%                     | Pass                                      | Cùng file.                                                                       |
| T-VOUCH-03 | 1   | TC_VOUCH_T03_01             | VoucherEngine — V2 date window                         | `valid_to` đã qua → EXPIRED                                              | `v2Window(voucher({valid_to:"2026-07-13"}), NOW)`                                 | `{code:"VOUCHER_EXPIRED"}`                                                                              | Khớp                          | Pass                                      | 28/28 pass. Message không interpolate `{date}` (minor).                          |
| T-VOUCH-03 | 2   | TC_VOUCH_T03_02             | VoucherEngine — V2 chưa hiệu lực                       | `valid_from` tương lai → NOT_YET_VALID                                   | `v2Window(voucher({valid_from:"2026-08-01"}), NOW)`                               | `{code:"VOUCHER_NOT_YET_VALID"}`                                                                        | Khớp                          | Pass                                      | Cùng file.                                                                       |
| T-VOUCH-03 | 3   | TC_VOUCH_T03_03             | VoucherEngine — V2 biên                                | `now==valid_from`/`now==valid_to` đều pass                               | 2 case boundary                                                                   | Cả 2 `{ok:true}`                                                                                        | Khớp                          | Pass                                      | Cùng file.                                                                       |
| T-VOUCH-04 | 1   | TC_VOUCH_T04_01             | VoucherEngine — V4 per-user limit                      | `user_usage_count==per_user_limit` → lỗi kèm details                     | `v4UserLimit(voucher({per_user_limit:1}),1)`                                      | `{code:"VOUCHER_PER_USER_LIMIT_REACHED"}`, `details={count:1,limit:1}`                                  | Khớp 100%                     | Pass                                      | 28/28 pass. Message không interpolate count/limit (minor, có details).           |
| T-VOUCH-04 | 2   | TC_VOUCH_T04_02             | VoucherEngine — V4 dưới limit                          | `2<3` → pass                                                             | `v4UserLimit(voucher({per_user_limit:3}),2)`                                      | `{ok:true}`                                                                                             | Khớp                          | Pass                                      | Cùng file.                                                                       |
| T-VOUCH-05 | 1   | TC_VOUCH_T05_01             | VoucherEngine — V5 min order                           | subtotal<min → lỗi kèm remaining chính xác                               | `v5MinOrder(voucher({min_order_value:200000}), cart({original_subtotal:150000}))` | `{code:"VOUCHER_MIN_ORDER_NOT_MET"}`, `details={remaining:50000,min_order_value:200000}`                | Khớp 100%                     | Pass                                      | 28/28 pass. Message CÓ interpolate `{remaining}` (đúng SRS).                     |
| T-VOUCH-05 | 2   | TC_VOUCH_T05_02             | VoucherEngine — V5 biên                                | `subtotal==min` → pass                                                   | boundary case                                                                     | `{ok:true}`                                                                                             | Khớp                          | Pass                                      | Cùng file.                                                                       |
| T-VOUCH-05 | 3   | TC_VOUCH_T05_03             | VoucherEngine — V5 không giới hạn                      | `min_order_value=null` → luôn pass                                       | null case                                                                         | `{ok:true}`                                                                                             | Khớp                          | Pass                                      | Cùng file.                                                                       |
| T-VOUCH-06 | 1   | TC_VOUCH_T06_01             | VoucherEngine — V6 scope, không item hợp lệ            | Category không khớp → lỗi kèm category list                              | `v6Scope(voucher({applicable_category_ids:["cat_shuttlecock"]}), cart())`         | `{code:"VOUCHER_NO_ELIGIBLE_ITEMS"}`, `details={applicable_categories:[...]}`                           | Khớp 100%                     | Pass                                      | 28/28 pass.                                                                      |
| T-VOUCH-06 | 2   | TC_VOUCH_T06_02             | VoucherEngine — V6 unscoped                            | Cả 2 mảng null → mọi item hợp lệ                                         | `v6Scope(voucher(), cart())`                                                      | `{ok:true}`                                                                                             | Khớp                          | Pass                                      | Cùng file.                                                                       |
| T-VOUCH-06 | 3   | TC_VOUCH_T06_03             | VoucherEngine — V6 category/product match              | Category/product khớp → pass                                             | 2 case                                                                            | Cả 2 `{ok:true}`                                                                                        | Khớp                          | Pass                                      | Cùng file.                                                                       |
| T-VOUCH-07 | 1   | TC_VOUCH_T07_01             | VoucherEngine — Stacking happy path (VOUCH-003 §4.1)   | Item promo 900,000 + voucher 10% → cả 2 áp, dưới cap                     | Lines racket/string. Voucher 10%, cap 50%                                         | `final_voucher_discount=380,000`; `expected_final_cart_total=3,420,000`                                 | Khớp 100%                     | Pass                                      | `calculate-discount.unit.spec.ts:98-141`. 25/26 pass (1 fail = EC-03 RED riêng). |
| T-VOUCH-08 | 1   | TC_VOUCH_T08_01             | VoucherEngine — Stacking cap exceeded (VOUCH-003 §4.1) | Item promo 1,860,000 + voucher 20% → vượt cap → voucher giảm còn 490,000 | Lines racket/string. Voucher 20%, cap 50%                                         | `final_voucher_discount=490,000`; `discount_capped=true`; `cap_explanation` tiếng Việt đúng             | Khớp 100% kể cả message       | Pass                                      | Cùng file:144-196. Cùng lần chạy.                                                |
| T-VOUCH-09 | 1   | TC_VOUCH_T09_01 (test cũ)   | VoucherEngine — cap ngăn tổng âm (nửa đầu EC-03)       | Item promo ăn hết cap → voucher giảm về 0, tổng không âm                 | Line 4,700,000, item_promo=2,350,000. Voucher 50%                                 | `final_voucher_discount=0`; tổng không âm (=2,350,000)                                                  | Khớp — chỉ đúng "không âm"    | Pass (nhưng KHÔNG chứng minh "min 1 VND") | Cùng file:199-232.                                                               |
| T-VOUCH-09 | 2   | TC_VOUCH_EC03_01 (test MỚI) | VoucherEngine — sàn 1 VND (nửa sau EC-03)              | Item promo 100% subtotal → tổng phải floor ở 1                           | Line 1,000,000, item_promo=1,000,000. Voucher 50%                                 | `expected_final_cart_total=1`                                                                           | `expected_final_cart_total=0` | **Failed (RED, chưa fix)**                | Xem [[EC-03]]. 1 fail, 25 passed, 26 total.                                      |
| T-VOUCH-10 | 1   | TC_VOUCH_T10_01             | VoucherEngine — Remove Voucher (VOUCH-004)             | Remove → total revert, usage_count không tăng                            | Cart đã apply voucher                                                             | `updated_cart_total`=tổng trước apply; usage_count không tăng                                           | Khớp                          | Pass                                      | `apply-remove-voucher.spec.ts:330`. 8/8 pass, 5819 ms.                           |
| T-VOUCH-11 | 1   | TC_VOUCH_T11_01             | VoucherEngine — Auto-invalidation (VOUCH-005)          | Xoá item scope duy nhất → voucher tự gỡ                                  | Racket(scope)+Shoes(ngoài scope). Xoá Racket                                      | `voucher` bị xoá; `notice.code="VOUCHER_AUTO_REMOVED"`                                                  | Khớp 100%                     | Pass                                      | `revalidate-voucher-workflow.spec.ts:307`. 7/7 pass, 6195 ms.                    |
| T-VOUCH-12 | 1   | TC_VOUCH_T12_01             | VoucherEngine — Rate limit (SEC-02/EC-10)              | 5 lần sai → 404. Lần 6 → 429                                             | 6 lần POST voucher sai                                                            | 5×404, lần 6: 429 `VOUCHER_RATE_LIMITED`                                                                | Khớp 100%                     | Pass                                      | `voucher-rate-limit.spec.ts:81`. 1/1 pass, 2738 ms.                              |

### C. SRS §10 — T-SUGG-01→10 (16 test case)

| T-ID      | STT | Mã Test Case (TC ID) | Hạng mục / Chức năng                                                | Mô tả kịch bản test                                                                        | Dữ liệu đầu vào                             | Kết quả mong muốn                                                     | Kết quả thực tế     | Trạng thái          | Ghi chú                                                                                                           |
| --------- | --- | -------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------- | --------------------------------------------------------------------- | ------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| T-SUGG-01 | 1   | TC_SUGG_T01_01       | SuggestiveSelling — Tier 1 manual, display_order (SUGG-001)         | Rule 3 item, display_order cố ý không theo thứ tự → route phải trả đúng thứ tự sắp xếp lại | Rule manual, items display_order=[1,0,2]    | `suggestions.map(product_id)=[s1,s2,s3]`; `label="Best Match"` cho s1 | Khớp 100% (SAU FIX) | Pass                | `suggestion.spec.ts:117-132`. **Trước fix:** 3 failed/9. **Sau fix `manage_inventory:false`:** 9/9 pass, 3019 ms. |
| T-SUGG-02 | 1   | TC_SUGG_T02_01       | SuggestiveSelling — Tier 2 category backfill (SUGG-001)             | 1 manual → lấp đầy đến limit 5 bằng category complement, loại dup+source                   | 1 manual + 7 complement candidates (có dup) | 5 phần tử: manual + 4 category đầu                                    | Khớp 100%           | Pass                | `evaluate.unit.spec.ts:53-94`. 8/8 pass. Chỉ pin logic thuần, chưa integration với DB.                            |
| T-SUGG-03 | 1   | TC_SUGG_T03_01       | SuggestiveSelling — Filter in-cart (SUGG-002a)                      | Candidate đã trong cart → drop reason `in_cart`                                            | candidate in_cart                           | `dropped[0].reason="in_cart"`                                         | Khớp 100%           | Pass                | `pipeline.unit.spec.ts:167-174`. 32/32 pass.                                                                      |
| T-SUGG-04 | 1   | TC_SUGG_T04_01       | SuggestiveSelling — Filter out-of-stock (SUGG-002b)                 | `in_stock=false` → drop reason `out_of_stock`                                              | candidate in_stock:false                    | `dropped[0].reason="out_of_stock"`                                    | Khớp 100%           | Pass                | `pipeline.unit.spec.ts:176-183`. 32/32 pass. Chỉ test logic thuần, chưa store-scoped (gap đã biết).               |
| T-SUGG-05 | 1   | TC_SUGG_T05_01       | SuggestiveSelling — Dismiss persist cùng session (SUGG-002c)        | Dismiss s2 → GET lại cùng session → s2 biến mất, s1/s3 còn                                 | dismiss event s2, session A                 | s2 vắng mặt; s1,s3 còn                                                | Khớp 100%           | Pass                | `suggestion.spec.ts:141-177`. Sau fix: 9/9 pass, 6550 ms.                                                         |
| T-SUGG-05 | 2   | TC_SUGG_T05_02       | SuggestiveSelling — Dismiss scoped theo session (SUGG-002c)         | Session khác chưa dismiss → vẫn thấy s2                                                    | GET session khác                            | `suggestions` chứa s2                                                 | Khớp 100%           | Pass                | Cùng file. 7266 ms.                                                                                               |
| T-SUGG-06 | 1   | TC_SUGG_T06_01       | SuggestiveSelling — One-tap add E2E (SUGG-003)                      | Tap Add trên storefront thật → item vào cart, toast hiện                                   | — (chưa làm được)                           | Item trong cart; toast đúng; Undo hoạt động                           | —                   | **Not Implemented** | Không có Playwright trong repo. Backend đã test qua EC-07.                                                        |
| T-SUGG-07 | 1   | TC_SUGG_T07_01       | SuggestiveSelling — CR-01 category_missing (SUGG-004)               | Category theo dõi có trong cart → fires; category khác → không fires                       | 2 context                                   | true / false đúng                                                     | Khớp 100%           | Pass                | `cart-rules.unit.spec.ts:80-91`. 19/19 pass.                                                                      |
| T-SUGG-07 | 2   | TC_SUGG_T07_02       | SuggestiveSelling — CR-01 không cấu hình category                   | Rule thiếu source_category_ids → never fires                                               | condition_params:{}                         | false                                                                 | Khớp                | Pass                | Cùng file.                                                                                                        |
| T-SUGG-08 | 1   | TC_SUGG_T08_01       | SuggestiveSelling — CR-02 threshold_near (SUGG-004)                 | Trong band 15% + percentage hợp lệ → fires; percentage sai/thiếu → không fires             | 3 case (0.15, 2, {})                        | true/false/false đúng                                                 | Khớp 100% cả 3      | Pass                | `cart-rules.unit.spec.ts:103-129`. 19/19 pass.                                                                    |
| T-SUGG-09 | 1   | TC_SUGG_T09_01       | SuggestiveSelling — Cache invalidation lõi (SUGG-005)               | Gọi `invalidateCartSuggestions` → cache xoá ngay                                           | seed cache                                  | `cache.get→null`                                                      | Khớp                | Pass                | `suggestion.spec.ts:292-299`. 9/9 pass, 6660 ms.                                                                  |
| T-SUGG-09 | 2   | TC_SUGG_T09_02       | SuggestiveSelling — Subscriber cart.updated (SUGG-005)              | Gọi handler trực tiếp → cache xoá                                                          | event data                                  | `cache.get→null`                                                      | Khớp                | Pass                | Cùng file. 5841 ms.                                                                                               |
| T-SUGG-09 | 3   | TC_SUGG_T09_03       | SuggestiveSelling — Wiring Event Bus thật (SUGG-005)                | Emit event bus thật → subscriber nhận                                                      | eventBus.emit                               | Cache xoá trong 8000ms                                                | Khớp                | Pass                | Cùng file. 5770 ms.                                                                                               |
| T-SUGG-10 | 1   | TC_SUGG_T10_01       | SuggestiveSelling — Track đủ 4 action (SUGG-006)                    | Batch 4 event → ghi đúng payload                                                           | events:[impression,tap,add_to_cart,dismiss] | `{accepted:4,rejected:0}`; 4 dòng ghi đúng                            | Khớp 100%           | Pass                | `suggestion.spec.ts:202-244`. 9/9 pass, 6748 ms.                                                                  |
| T-SUGG-10 | 2   | TC_SUGG_T10_02       | SuggestiveSelling — Reject event lỗi riêng lẻ (SEC-04)              | 1 hợp lệ + 2 lỗi → chỉ lỗi bị reject                                                       | 3 events                                    | `{accepted:1,rejected:2}`                                             | Khớp 100%           | Pass                | Cùng file. 7155 ms.                                                                                               |
| T-SUGG-10 | 3   | TC_SUGG_T10_03       | SuggestiveSelling — Dismiss event → dismissal set (bug-fix, BR-02c) | Event dismiss qua endpoint events → cập nhật dismissal set                                 | dismiss event                               | `getDismissed` chứa product                                           | Khớp 100%           | Pass                | Cùng file. 6666 ms.                                                                                               |

---

## 📎 Phụ lục B — Chi tiết TOÀN BỘ 253 Unit Test (từng test một, không gộp)

Đây là phần "đầy đủ, toàn bộ" của **253 unit test pass / 254 total** đã nêu ở bảng kiểm kê đầu trang
— liệt kê **từng `it()` một**, không chỉ đếm theo file. 21 file, đúng thứ tự như bảng kiểm kê.
File #5 có 1 test **Failed** (RED, cố ý, của EC-03 — xem [[EC-03]]), 20 file còn lại sạch 100%.

Đây KHÁC với Phụ lục A ở trên: Phụ lục A (56 dòng) là tập được chọn lọc vì mỗi dòng chứng minh
trực tiếp 1 mục SRS §8/§10 cụ thể. Phụ lục B (253 dòng dưới đây) là **kiểm kê toàn bộ**, không lọc —
gồm cả các test cho hàm phụ trợ (`money.ts`, `normalize.ts`, `gen-code.ts`, schema validators,
`analytics.ts`...) không gắn với 1 SRS ID cụ thể nào nhưng vẫn là một phần sức khỏe của bộ test.

#### 1. `src/modules/voucher-engine/lib/__tests__/money.unit.spec.ts` (32 test)

| STT | Tên test (describe > it)                                                                                                                                                 | Trạng thái |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| 1   | voucher-engine lib/money source hygiene never calls parseFloat, Number.parseFloat, or toFixed                                                                            | Pass       |
| 2   | voucher-engine lib/money toInt normalizes a plain integer number                                                                                                         | Pass       |
| 3   | voucher-engine lib/money toInt normalizes a numeric string (BigNumberRawValue.value)                                                                                     | Pass       |
| 4   | voucher-engine lib/money toInt normalizes an IBigNumber-shaped object via .numeric                                                                                       | Pass       |
| 5   | voucher-engine lib/money toInt normalizes a BigNumberJS-like object via .toNumber()                                                                                      | Pass       |
| 6   | voucher-engine lib/money toInt rejects a non-integer monetary value                                                                                                      | Pass       |
| 7   | voucher-engine lib/money toInt rejects a non-finite monetary value                                                                                                       | Pass       |
| 8   | voucher-engine lib/money toInt rejects an unrecognized value shape                                                                                                       | Pass       |
| 9   | voucher-engine lib/money toInt rejects an unsafe integer                                                                                                                 | Pass       |
| 10  | voucher-engine lib/money assertSafeInt passes for a safe integer                                                                                                         | Pass       |
| 11  | voucher-engine lib/money assertSafeInt throws for an unsafe integer (e.g. 1e20)                                                                                          | Pass       |
| 12  | voucher-engine lib/money assertSafeInt throws for a non-integer number                                                                                                   | Pass       |
| 13  | voucher-engine lib/money bps — basis-point percentage (floor rounding) computes 10% (1000 bps) of 3,800,000 -> 380,000 (SPEC §10.4)                                      | Pass       |
| 14  | voucher-engine lib/money bps — basis-point percentage (floor rounding) computes 20% (2000 bps) of 2,840,000 -> 568,000 (SPEC §10.5)                                      | Pass       |
| 15  | voucher-engine lib/money bps — basis-point percentage (floor rounding) floors a fractional result instead of rounding                                                    | Pass       |
| 16  | voucher-engine lib/money bps — basis-point percentage (floor rounding) rejects basisPoints outside 0..10000                                                              | Pass       |
| 17  | voucher-engine lib/money bps — basis-point percentage (floor rounding) detects overflow before dividing                                                                  | Pass       |
| 18  | voucher-engine lib/money clampMin returns the value when above the floor                                                                                                 | Pass       |
| 19  | voucher-engine lib/money clampMin clamps a negative value to 0 by default                                                                                                | Pass       |
| 20  | voucher-engine lib/money clampMin clamps to a custom floor                                                                                                               | Pass       |
| 21  | voucher-engine lib/money sumInts sums a list of integers                                                                                                                 | Pass       |
| 22  | voucher-engine lib/money sumInts throws when an element is not a safe integer                                                                                            | Pass       |
| 23  | voucher-engine lib/money sumInts throws on running-total overflow                                                                                                        | Pass       |
| 24  | voucher-engine lib/money toRawNumber unwraps the same BigNumberValue shapes toInt does, without the integer check                                                        | Pass       |
| 25  | voucher-engine lib/money toRawNumber does NOT reject a non-integer numeric value (unlike toInt)                                                                          | Pass       |
| 26  | voucher-engine lib/money toRawNumber rejects an unrecognized value shape                                                                                                 | Pass       |
| 27  | voucher-engine lib/money sumRawToInt sums exact integers to their exact total                                                                                            | Pass       |
| 28  | voucher-engine lib/money sumRawToInt reproduces the scoped-voucher across-split repro: two fractional per-line adjustments summing to the exact integer voucher discount | Pass       |
| 29  | voucher-engine lib/money sumRawToInt tolerates BigNumberValue-shaped per-line inputs, not just raw numbers                                                               | Pass       |
| 30  | voucher-engine lib/money sumRawToInt rejects a total that is genuinely fractional, not just an allocation artifact                                                       | Pass       |
| 31  | voucher-engine lib/money sumRawToInt rejects a non-finite element                                                                                                        | Pass       |
| 32  | voucher-engine lib/money sumRawToInt rejects an unsafe integer total                                                                                                     | Pass       |

#### 2. `src/modules/suggestive-selling/__tests__/pipeline.unit.spec.ts` (32 test)

| STT | Tên test (describe > it)                                                                                                                       | Trạng thái |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | rankAndLimit — BR-01 (T-SUGG-01) keeps three manual suggestions in display_order                                                               | Pass       |
| 2   | rankAndLimit — BR-01 (T-SUGG-01) orders Tier-1 manual ahead of Tier-2 category regardless of display_order                                     | Pass       |
| 3   | rankAndLimit — BR-01 (T-SUGG-01) dedupes by product_id keeping the highest-priority slot                                                       | Pass       |
| 4   | rankAndLimit — BR-01 (T-SUGG-01) caps at the requested limit                                                                                   | Pass       |
| 5   | backfill interleaves with the filter — SUGG-002 / SPEC A.5 (regression) refills out-of-stock manual slots from Tier-2 up to the limit          | Pass       |
| 6   | backfill interleaves with the filter — SUGG-002 / SPEC A.5 (regression) keeps only Tier-1 when all curated items survive (Tier-2 stays hidden) | Pass       |
| 7   | applyBr02Filter — SUGG-002 (T-SUGG-03/04/05) drops a product already in the cart (a)                                                           | Pass       |
| 8   | applyBr02Filter — SUGG-002 (T-SUGG-03/04/05) drops an out-of-stock product (b)                                                                 | Pass       |
| 9   | applyBr02Filter — SUGG-002 (T-SUGG-03/04/05) drops a dismissed product (c)                                                                     | Pass       |
| 10  | applyBr02Filter — SUGG-002 (T-SUGG-03/04/05) drops a recently-bought durable but keeps a recently-bought consumable (d)                        | Pass       |
| 11  | applyBr02Filter — SUGG-002 (T-SUGG-03/04/05) drops the source product itself (e)                                                               | Pass       |
| 12  | applyBr02Filter — SUGG-002 (T-SUGG-03/04/05) drops an unpublished product (f)                                                                  | Pass       |
| 13  | applyBr02Filter — SUGG-002 (T-SUGG-03/04/05) keeps a clean candidate                                                                           | Pass       |
| 14  | enrichProductRow — inventory stock checks (BR-02b) in_stock=true when available (stocked − reserved) > 0                                       | Pass       |
| 15  | enrichProductRow — inventory stock checks (BR-02b) in_stock=false when stocked=0 (BG65 originally reported)                                    | Pass       |
| 16  | enrichProductRow — inventory stock checks (BR-02b) in_stock=false when fully reserved (stocked=1, reserved=1 → available 0)                    | Pass       |
| 17  | enrichProductRow — inventory stock checks (BR-02b) in_stock=true when partly reserved (stocked=5, reserved=2 → available 3)                    | Pass       |
| 18  | enrichProductRow — inventory stock checks (BR-02b) in_stock=true when manage_inventory=false (untracked)                                       | Pass       |
| 19  | enrichProductRow — inventory stock checks (BR-02b) in_stock=true when allow_backorder=true despite 0 available                                 | Pass       |
| 20  | enrichProductRow — inventory stock checks (BR-02b) in_stock=true if ANY variant has availability                                               | Pass       |
| 21  | enrichProductRow — inventory stock checks (BR-02b) in_stock=false when product has no variants                                                 | Pass       |
| 22  | isConsumable — BR-02(d) matches case-insensitively                                                                                             | Pass       |
| 23  | resolveVariant — SUGG-003 auto-selects a single variant                                                                                        | Pass       |
| 24  | resolveVariant — SUGG-003 requires selection when there are multiple variants                                                                  | Pass       |
| 25  | resolveVariant — SUGG-003 handles a product with no variants                                                                                   | Pass       |
| 26  | computePriceFields — API Contract §1.1 / INT-01 returns null discount_price when there is no item promotion                                    | Pass       |
| 27  | computePriceFields — API Contract §1.1 / INT-01 exposes discount_price when calculated < original                                              | Pass       |
| 28  | computePriceFields — API Contract §1.1 / INT-01 uses the cheapest variant as the "from" price                                                  | Pass       |
| 29  | computePriceFields — API Contract §1.1 / INT-01 floors fractional amounts to integer VND (D1)                                                  | Pass       |
| 30  | computePriceFields — API Contract §1.1 / INT-01 returns nulls when no variant is priced                                                        | Pass       |
| 31  | toProductSuggestion / finalizeSuggestions — task 4 response shape projects the mandated display fields and 1-based display_order               | Pass       |
| 32  | toProductSuggestion / finalizeSuggestions — task 4 response shape runs filter → rank → limit → project end to end                              | Pass       |

#### 3. `src/workflows/voucher-engine/__tests__/validators.unit.spec.ts` (28 test)

| STT | Tên test (describe > it)                                                                                                 | Trạng thái |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ---------- |
| 1   | VoucherEngine · code format (3.2.2) accepts 6+ uppercase alphanumerics after normalize                                   | Pass       |
| 2   | VoucherEngine · code format (3.2.2) rejects too-short / non-alnum, collapsing to VOUCHER_NOT_FOUND                       | Pass       |
| 3   | VoucherEngine · V1 exists+active (3.2.4) null voucher ⇒ NOT_FOUND (404)                                                  | Pass       |
| 4   | VoucherEngine · V1 exists+active (3.2.4) inactive voucher ⇒ INACTIVE (422), same message as NOT_FOUND                    | Pass       |
| 5   | VoucherEngine · V1 exists+active (3.2.4) active voucher passes                                                           | Pass       |
| 6   | VoucherEngine · V2 date window (3.2.5) before valid_from ⇒ NOT_YET_VALID                                                 | Pass       |
| 7   | VoucherEngine · V2 date window (3.2.5) after valid_to ⇒ EXPIRED                                                          | Pass       |
| 8   | VoucherEngine · V2 date window (3.2.5) inclusive boundaries: now == valid_from and now == valid_to both pass             | Pass       |
| 9   | VoucherEngine · V3 global usage limit (3.2.6) usage_count >= usage_limit ⇒ USAGE_LIMIT_REACHED                           | Pass       |
| 10  | VoucherEngine · V3 global usage limit (3.2.6) null usage_limit ⇒ unlimited ⇒ pass                                        | Pass       |
| 11  | VoucherEngine · V3 global usage limit (3.2.6) under limit passes                                                         | Pass       |
| 12  | VoucherEngine · V4 per-user limit (3.2.7) user_usage >= per_user_limit ⇒ PER_USER_LIMIT_REACHED with details             | Pass       |
| 13  | VoucherEngine · V4 per-user limit (3.2.7) under per-user limit passes                                                    | Pass       |
| 14  | VoucherEngine · V5 min order value (3.2.8) subtotal < min ⇒ MIN_ORDER_NOT_MET with integer remaining                     | Pass       |
| 15  | VoucherEngine · V5 min order value (3.2.8) subtotal == min ⇒ pass (boundary)                                             | Pass       |
| 16  | VoucherEngine · V5 min order value (3.2.8) null min_order_value ⇒ pass                                                   | Pass       |
| 17  | VoucherEngine · V6 item scope (3.2.9) unscoped (both null) ⇒ all eligible ⇒ pass                                         | Pass       |
| 18  | VoucherEngine · V6 item scope (3.2.9) category scope match ⇒ pass                                                        | Pass       |
| 19  | VoucherEngine · V6 item scope (3.2.9) product scope match ⇒ pass                                                         | Pass       |
| 20  | VoucherEngine · V6 item scope (3.2.9) scoped but no matching item ⇒ NO_ELIGIBLE_ITEMS                                    | Pass       |
| 21  | VoucherEngine · V7 segment (3.2.10, stub) always passes in Day 3 (segment source undefined)                              | Pass       |
| 22  | VoucherEngine · V8 stacking conflict (3.2.11) non-stackable + cart has promo ⇒ STACKING_CONFLICT                         | Pass       |
| 23  | VoucherEngine · V8 stacking conflict (3.2.11) non-stackable but no promo ⇒ pass                                          | Pass       |
| 24  | VoucherEngine · V8 stacking conflict (3.2.11) stackable ⇒ pass even with promo                                           | Pass       |
| 25  | VoucherEngine · validateVoucher fail-fast (3.2.12) all rules pass ⇒ ok                                                   | Pass       |
| 26  | VoucherEngine · validateVoucher fail-fast (3.2.12) null voucher ⇒ NOT_FOUND (format+V1)                                  | Pass       |
| 27  | VoucherEngine · validateVoucher fail-fast (3.2.12) returns only the FIRST failure: expired (V2) wins over min-order (V5) | Pass       |
| 28  | VoucherEngine · validateVoucher fail-fast (3.2.12) V1 short-circuits before V3: inactive wins over usage-limit           | Pass       |

#### 4. `src/api/store/carts/[id]/voucher/__tests__/validators.unit.spec.ts` (28 test)

| STT | Tên test (describe > it)                                                                                                                        | Trạng thái |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | store cart voucher validators ApplyVoucherSchema accepts a minimal valid apply body                                                             | Pass       |
| 2   | store cart voucher validators ApplyVoucherSchema rejects a code shorter than 6 characters (SEC-03)                                              | Pass       |
| 3   | store cart voucher validators ApplyVoucherSchema rejects a non-alphanumeric code (SEC-03)                                                       | Pass       |
| 4   | store cart voucher validators ApplyVoucherSchema rejects a missing code                                                                         | Pass       |
| 5   | store cart voucher validators ApplyVoucherSchema rejects a cart_id in the body (belongs in the route param)                                     | Pass       |
| 6   | store cart voucher validators ApplyVoucherSchema rejects a client-supplied pricing/identity/eligibility field: discount_amount                  | Pass       |
| 7   | store cart voucher validators ApplyVoucherSchema rejects a client-supplied pricing/identity/eligibility field: final_voucher_discount           | Pass       |
| 8   | store cart voucher validators ApplyVoucherSchema rejects a client-supplied pricing/identity/eligibility field: original_discount                | Pass       |
| 9   | store cart voucher validators ApplyVoucherSchema rejects a client-supplied pricing/identity/eligibility field: expected_final_cart_total        | Pass       |
| 10  | store cart voucher validators ApplyVoucherSchema rejects a client-supplied pricing/identity/eligibility field: cart_total                       | Pass       |
| 11  | store cart voucher validators ApplyVoucherSchema rejects a client-supplied pricing/identity/eligibility field: eligible_post_promotion_subtotal | Pass       |
| 12  | store cart voucher validators ApplyVoucherSchema rejects a client-supplied pricing/identity/eligibility field: post_promotion_subtotal          | Pass       |
| 13  | store cart voucher validators ApplyVoucherSchema rejects a client-supplied pricing/identity/eligibility field: item_promotion_discount          | Pass       |
| 14  | store cart voucher validators ApplyVoucherSchema rejects a client-supplied pricing/identity/eligibility field: promotion_id                     | Pass       |
| 15  | store cart voucher validators ApplyVoucherSchema rejects a client-supplied pricing/identity/eligibility field: voucher_id                       | Pass       |
| 16  | store cart voucher validators ApplyVoucherSchema rejects a client-supplied pricing/identity/eligibility field: eligible_item_ids                | Pass       |
| 17  | store cart voucher validators ApplyVoucherSchema rejects a client-supplied pricing/identity/eligibility field: customer_id                      | Pass       |
| 18  | store cart voucher validators ApplyVoucherSchema rejects a client-supplied pricing/identity/eligibility field: usage_count                      | Pass       |
| 19  | store cart voucher validators ApplyVoucherSchema rejects a client-supplied pricing/identity/eligibility field: min_order_value                  | Pass       |
| 20  | store cart voucher validators ApplyVoucherSchema rejects a client-supplied pricing/identity/eligibility field: discount_capped                  | Pass       |
| 21  | store cart voucher validators ApplyVoucherSchema rejects a client-supplied pricing/identity/eligibility field: confirm_replace                  | Pass       |
| 22  | store cart voucher validators ApplyVoucherQuerySchema accepts an empty query (replace defaults to falsy)                                        | Pass       |
| 23  | store cart voucher validators ApplyVoucherQuerySchema accepts ?replace=true coerced from a query string                                         | Pass       |
| 24  | store cart voucher validators ApplyVoucherQuerySchema accepts ?replace=false and parses it as false, not true (z.coerce.boolean regression)     | Pass       |
| 25  | store cart voucher validators ApplyVoucherQuerySchema rejects an unrecognized query field                                                       | Pass       |
| 26  | store cart voucher validators RemoveVoucherSchema accepts an empty body                                                                         | Pass       |
| 27  | store cart voucher validators RemoveVoucherSchema rejects a client-supplied pricing field                                                       | Pass       |
| 28  | store cart voucher validators RemoveVoucherSchema rejects a cart_id in the body (belongs in the route param)                                    | Pass       |

#### 5. `src/modules/voucher-engine/lib/__tests__/calculate-discount.unit.spec.ts` (26 test)

| STT | Tên test (describe > it)                                                                                                                                                                                              | Trạng thái |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | voucher-engine lib/calculate-discount calculateOriginalSubtotal sums unit_price \* quantity across lines                                                                                                              | Pass       |
| 2   | voucher-engine lib/calculate-discount calculateItemPromotionDiscount sums per-line item-promotion discounts (voucher's own adjustment already excluded upstream)                                                      | Pass       |
| 3   | voucher-engine lib/calculate-discount calculateEligiblePostPromotionSubtotal only sums eligible lines, net of their item promotion discount                                                                           | Pass       |
| 4   | voucher-engine lib/calculate-discount calculateEligiblePostPromotionSubtotal clamps a line to 0 when its promotion discount exceeds its original total                                                                | Pass       |
| 5   | voucher-engine lib/calculate-discount calculateVoucherDiscount — SPEC §10.4 worked example (under global cap) reproduces 380,000 discount / 3,420,000 final total (T-VOUCH-07)                                        | Pass       |
| 6   | voucher-engine lib/calculate-discount calculateVoucherDiscount — SPEC §10.5 worked example (global cap exceeded) reproduces 490,000 final discount (capped from 568,000) / 2,350,000 final total (T-VOUCH-08)         | Pass       |
| 7   | voucher-engine lib/calculate-discount calculateVoucherDiscount — SPEC §10.6 / EC-03 (would-be negative total) clamps final_voucher_discount to 0 when item promo alone already consumes the global cap (T-VOUCH-09)   | Pass       |
| 8   | voucher-engine lib/calculate-discount calculateVoucherDiscount — SPEC §10.6 / EC-03 (would-be negative total) item promotion consuming the entire cap alone (no voucher headroom) -> final voucher discount is 0      | Pass       |
| 9   | voucher-engine lib/calculate-discount calculateVoucherDiscount — EC-03 (SRS §8: cart total floors at 1 VND, never 0) floors expected_final_cart_total at 1 VND when item promotion alone consumes the entire subtotal | **Failed** |
| 10  | voucher-engine lib/calculate-discount calculateVoucherDiscount — fixed-amount voucher (SRS §22.2) does not exceed the eligible post-promotion subtotal                                                                | Pass       |
| 11  | voucher-engine lib/calculate-discount calculateVoucherDiscount — voucher-specific max_discount_amount (Rule 8) caps the voucher discount before the global cap is applied                                             | Pass       |
| 12  | voucher-engine lib/calculate-discount calculateVoucherDiscount — discount_capped semantics matrix (task 3.3.12) false when neither cap binds                                                                          | Pass       |
| 13  | voucher-engine lib/calculate-discount calculateVoucherDiscount — discount_capped semantics matrix (task 3.3.12) false when only the voucher's own max_discount_amount binds                                           | Pass       |
| 14  | voucher-engine lib/calculate-discount calculateVoucherDiscount — discount_capped semantics matrix (task 3.3.12) true when only the global cap binds                                                                   | Pass       |
| 15  | voucher-engine lib/calculate-discount calculateVoucherDiscount — discount_capped semantics matrix (task 3.3.12) true when the voucher cap binds first but the global cap binds tighter                                | Pass       |
| 16  | voucher-engine lib/calculate-discount postPromotionLineValue (task 3.3.4) returns unit_price \* quantity minus the line's item promotion discount                                                                     | Pass       |
| 17  | voucher-engine lib/calculate-discount postPromotionLineValue (task 3.3.4) floors at 0 when the discount exceeds the line's original total                                                                             | Pass       |
| 18  | voucher-engine lib/calculate-discount resolveEligibleItems (task 3.3.5) marks every line eligible when the voucher is unscoped                                                                                        | Pass       |
| 19  | voucher-engine lib/calculate-discount resolveEligibleItems (task 3.3.5) marks only the matching line eligible for a product-scoped voucher                                                                            | Pass       |
| 20  | voucher-engine lib/calculate-discount resolveEligibleItems (task 3.3.5) marks only the matching line eligible for a category-scoped voucher                                                                           | Pass       |
| 21  | voucher-engine lib/calculate-discount resolveEligibleItems (task 3.3.5) combines product and category scope with OR                                                                                                   | Pass       |
| 22  | voucher-engine lib/calculate-discount resolveEligibleItems (task 3.3.5) duplicate ids in the scope arrays do not change the eligibility outcome                                                                       | Pass       |
| 23  | voucher-engine lib/calculate-discount resolveEligibleItems (task 3.3.5) leaves a line ineligible when it has no product_id/category_ids and the voucher is scoped                                                     | Pass       |
| 24  | voucher-engine lib/calculate-discount resolveEligibleItems (task 3.3.5) does not mutate the input lines                                                                                                               | Pass       |
| 25  | voucher-engine lib/calculate-discount formatVnd (task 3.3.13) formats with dot thousands separators and a ₫ suffix, no space, no decimals                                                                             | Pass       |
| 26  | voucher-engine lib/calculate-discount DEFAULT_GLOBAL_CAP_BPS (task 3.3.10) defaults to 50% (5000 bps), matching SRS §5.2 DiscountCapConfig default                                                                    | Pass       |

#### 6. `src/modules/suggestive-selling/__tests__/cart-rules.unit.spec.ts` (19 test)

| STT | Tên test (describe > it)                                                                                | Trạng thái |
| --- | ------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | cr02Fires — D5 (within 15% of threshold) fires at the lower edge threshold×0.85                         | Pass       |
| 2   | cr02Fires — D5 (within 15% of threshold) fires just below the threshold                                 | Pass       |
| 3   | cr02Fires — D5 (within 15% of threshold) does not fire at/above the threshold                           | Pass       |
| 4   | cr02Fires — D5 (within 15% of threshold) does not fire below the band                                   | Pass       |
| 5   | cr02Fires — D5 (within 15% of threshold) never fires for a non-positive threshold                       | Pass       |
| 6   | cr02Band — D4 (remaining ≤ price ≤ remaining×2) bands from remaining to remaining×2 by default          | Pass       |
| 7   | cr02Band — D4 (remaining ≤ price ≤ remaining×2) honours a custom multiplier                             | Pass       |
| 8   | matchesCartCondition CR-01 category_missing fires when a watched source category is in the cart (2.4.2) | Pass       |
| 9   | matchesCartCondition CR-01 does not fire without configured source categories                           | Pass       |
| 10  | matchesCartCondition CR-02 threshold_near fires inside the band and rejects invalid pct (2.4.3)         | Pass       |
| 11  | matchesCartCondition CR-03 brand_match fires only when exactly one distinct brand is present (2.4.5)    | Pass       |
| 12  | matchesCartCondition CR-04 consumable_upsell fires for a low-qty line in scope (2.4.6)                  | Pass       |
| 13  | matchesCartCondition CR-04 without a category scope accepts any low-qty line                            | Pass       |
| 14  | matchesCartRule — AND semantics (2.4.7) fires only when every condition matches                         | Pass       |
| 15  | matchesCartRule — AND semantics (2.4.7) an empty rule never fires                                       | Pass       |
| 16  | mergeDedupeCart — 2.4.8 / BR-04 projects to the wire shape with tier=cart and rule_id=null              | Pass       |
| 17  | mergeDedupeCart — 2.4.8 / BR-04 dedupes by product keeping the FIRST rule's code and badge (BR-04)      | Pass       |
| 18  | mergeDedupeCart — 2.4.8 / BR-04 caps at the limit (default CART_LIMIT = 3)                              | Pass       |
| 19  | mergeDedupeCart — 2.4.8 / BR-04 preserves fire order across rules                                       | Pass       |

#### 7. `src/lib/__tests__/suggestion-cache.unit.spec.ts` (12 test)

| STT | Tên test (describe > it)                                                                                                                                      | Trạng thái |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | dismissal persistence — T-SUGG-05 (SUGG-002 / BR-02(c)) remembers a dismissal across requests, then the filter hides it (roundtrip)                           | Pass       |
| 2   | dismissal persistence — T-SUGG-05 (SUGG-002 / BR-02(c)) writes the dismissal set under the 24h session TTL (D6)                                               | Pass       |
| 3   | dismissal persistence — T-SUGG-05 (SUGG-002 / BR-02(c)) is idempotent — dismissing the same product twice stores it once                                      | Pass       |
| 4   | dismissal persistence — T-SUGG-05 (SUGG-002 / BR-02(c)) isolates contexts — a product dismissed in cart still shows on the PDP                                | Pass       |
| 5   | dismissal persistence — T-SUGG-05 (SUGG-002 / BR-02(c)) scopes by customer when logged in, else by session (BR-08 / SF-05)                                    | Pass       |
| 6   | dismissal persistence — T-SUGG-05 (SUGG-002 / BR-02(c)) undo removes a dismissal so the product can show again                                                | Pass       |
| 7   | dismissal persistence — T-SUGG-05 (SUGG-002 / BR-02(c)) degrades safely when the cache module is absent (BR-10 / D11)                                         | Pass       |
| 8   | cart-suggestion cache invalidation — 5.3.7 / T-SUGG-09 (SUGG-005) caches then invalidates a single cart (cart.updated path)                                   | Pass       |
| 9   | cart-suggestion cache invalidation — 5.3.7 / T-SUGG-09 (SUGG-005) invalidates ONLY the target cart, leaving others cached                                     | Pass       |
| 10  | cart-suggestion cache invalidation — 5.3.7 / T-SUGG-09 (SUGG-005) bumping the cart-rule version makes every existing cart key unreachable (bulk invalidation) | Pass       |
| 11  | cart-suggestion cache invalidation — 5.3.7 / T-SUGG-09 (SUGG-005) invalidates a product's raw buffer (rule targeting it changed)                              | Pass       |
| 12  | cart-suggestion cache invalidation — 5.3.7 / T-SUGG-09 (SUGG-005) invalidation degrades to a no-op when the cache is absent (BR-10 / D11)                     | Pass       |

#### 8. `src/workflows/voucher-engine/admin/lib/__tests__/build-backing-promotion.unit.spec.ts` (10 test)

| STT | Tên test (describe > it)                                                                                                                                      | Trạng thái |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | buildBackingPromotion (Decision H / Phase 2 backing promotion) converts a basis-points percentage to a Medusa percent value (2000 -> 20)                      | Pass       |
| 2   | buildBackingPromotion (Decision H / Phase 2 backing promotion) uses a fixed_amount value verbatim as raw VND                                                  | Pass       |
| 3   | buildBackingPromotion (Decision H / Phase 2 backing promotion) maps V3 usage_limit to Promotion.limit; omits it when null                                     | Pass       |
| 4   | buildBackingPromotion (Decision H / Phase 2 backing promotion) maps V5 min_order_value to an item_total gte rule; omits rules when null                       | Pass       |
| 5   | buildBackingPromotion (Decision H / Phase 2 backing promotion) V6 product-only scope -> items.product.id target_rule                                          | Pass       |
| 6   | buildBackingPromotion (Decision H / Phase 2 backing promotion) V6 category-only scope -> items.product.categories.id target_rule                              | Pass       |
| 7   | buildBackingPromotion (Decision H / Phase 2 backing promotion) V6 MIXED product+category scope -> NO native target_rules (cross-attribute OR not expressible) | Pass       |
| 8   | buildBackingPromotion (Decision H / Phase 2 backing promotion) provisions the Campaign window + V4 per-customer use_by_attribute budget                       | Pass       |
| 9   | buildBackingPromotion (Decision H / Phase 2 backing promotion) reflects is_active=false as an inactive Promotion status                                       | Pass       |
| 10  | buildBackingPromotion (Decision H / Phase 2 backing promotion) stamps voucher_engine metadata for guardrail + identification                                  | Pass       |

#### 9. `src/workflows/voucher-engine/__tests__/revalidate-voucher.unit.spec.ts` (8 test)

| STT | Tên test (describe > it)                                                                                                                                          | Trạng thái |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | revalidateVoucherOnCartChange (task 3.5.1/3.5.7/3.5.8, SPEC §9.2) passes even when the GLOBAL usage_count is already at/over usage_limit (V3 skipped)             | Pass       |
| 2   | revalidateVoucherOnCartChange (task 3.5.1/3.5.7/3.5.8, SPEC §9.2) passes regardless of user_usage_count vs per_user_limit (V4 skipped)                            | Pass       |
| 3   | revalidateVoucherOnCartChange (task 3.5.1/3.5.7/3.5.8, SPEC §9.2) still fails V1 when the voucher has been deactivated since apply                                | Pass       |
| 4   | revalidateVoucherOnCartChange (task 3.5.1/3.5.7/3.5.8, SPEC §9.2) still fails V2 when the voucher has expired since apply                                         | Pass       |
| 5   | revalidateVoucherOnCartChange (task 3.5.1/3.5.7/3.5.8, SPEC §9.2) still fails V5 when the cart drops below min_order_value (auto-remove trigger, task 3.5.7)      | Pass       |
| 6   | revalidateVoucherOnCartChange (task 3.5.1/3.5.7/3.5.8, SPEC §9.2) still fails V6 when no cart item matches a scoped voucher (auto-remove trigger, task 3.5.8)     | Pass       |
| 7   | revalidateVoucherOnCartChange (task 3.5.1/3.5.7/3.5.8, SPEC §9.2) still fails V8 on a stacking conflict                                                           | Pass       |
| 8   | revalidateVoucherOnCartChange (task 3.5.1/3.5.7/3.5.8, SPEC §9.2) fails V1 NOT_FOUND when the voucher is null (defensive — should not normally reach this subset) | Pass       |

#### 10. `src/workflows/suggestive-selling/__tests__/evaluate.unit.spec.ts` (8 test)

| STT | Tên test (describe > it)                                                                                                                                                                           | Trạng thái |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | SuggestiveSelling · product-level evaluation (SUGG-001) T-SUGG-01 — product with 3 manual suggestions returns all 3, ordered by display_order, preserving custom_label                             | Pass       |
| 2   | SuggestiveSelling · product-level evaluation (SUGG-001) T-SUGG-01 — product with 3 manual suggestions rankAndLimit keeps all 3 in order (no truncation under the cap)                              | Pass       |
| 3   | SuggestiveSelling · product-level evaluation (SUGG-001) T-SUGG-01 — product with 3 manual suggestions excludes the source product if it appears in its own rule                                    | Pass       |
| 4   | SuggestiveSelling · product-level evaluation (SUGG-001) T-SUGG-02 — product with 1 manual suggestion → category backfill keeps the manual first and backfills category complements up to the limit | Pass       |
| 5   | SuggestiveSelling · product-level evaluation (SUGG-001) T-SUGG-02 — product with 1 manual suggestion → category backfill backfills 2–4 complements when only a couple are available (SRS: 2–4)     | Pass       |
| 6   | SuggestiveSelling · product-level evaluation (SUGG-001) T-SUGG-02 — product with 1 manual suggestion → category backfill does NOT backfill when Tier-1 already has ≥ 3                             | Pass       |
| 7   | SuggestiveSelling · product-level evaluation (SUGG-001) rankAndLimit — ordering, dedupe, cap orders manual before category, de-dupes by product, caps at limit                                     | Pass       |
| 8   | SuggestiveSelling · product-level evaluation (SUGG-001) rankAndLimit — ordering, dedupe, cap caps to the limit                                                                                     | Pass       |

#### 11. `src/api/admin/vouchers/__tests__/validators.unit.spec.ts` (7 test)

| STT | Tên test (describe > it)                                                                          | Trạng thái |
| --- | ------------------------------------------------------------------------------------------------- | ---------- |
| 1   | CreateVoucherSchema (3.4.13) accepts a valid percentage voucher (10%)                             | Pass       |
| 2   | CreateVoucherSchema (3.4.13) rejects discount_value = 0 (meaningless voucher)                     | Pass       |
| 3   | CreateVoucherSchema (3.4.13) rejects negative discount_value                                      | Pass       |
| 4   | CreateVoucherSchema (3.4.13) rejects percentage > 100% (10000 bps) — e.g. 9999999                 | Pass       |
| 5   | CreateVoucherSchema (3.4.13) accepts percentage at the 100% boundary (10000 bps)                  | Pass       |
| 6   | CreateVoucherSchema (3.4.13) allows a large fixed_amount (> 10000 VND) — bound is percentage-only | Pass       |
| 7   | CreateVoucherSchema (3.4.13) still rejects an inverted validity window                            | Pass       |

#### 12. `src/lib/__tests__/compute-sales-ranking.unit.spec.ts` (7 test)

| STT | Tên test (describe > it)                                                                                                                   | Trạng thái |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| 1   | computeSalesRanking (Tier-2 top-seller aggregation, SPEC A.6) sums quantities per product across orders and fans out to categories         | Pass       |
| 2   | computeSalesRanking (Tier-2 top-seller aggregation, SPEC A.6) emits one row per category for multi-category products                       | Pass       |
| 3   | computeSalesRanking (Tier-2 top-seller aggregation, SPEC A.6) drops products with no categories or zero sales, and ignores null product_id | Pass       |
| 4   | computeSalesRanking (Tier-2 top-seller aggregation, SPEC A.6) handles empty input                                                          | Pass       |
| 5   | computeSalesRanking (Tier-2 top-seller aggregation, SPEC A.6) reads quantity from items.detail.quantity (Medusa graph shape)               | Pass       |
| 6   | computeSalesRanking (Tier-2 top-seller aggregation, SPEC A.6) prefers a direct quantity but falls back to detail across mixed shapes       | Pass       |
| 7   | computeSalesRanking (Tier-2 top-seller aggregation, SPEC A.6) treats a missing/undefined quantity as 0 (item dropped, not NaN)             | Pass       |

#### 13. `src/workflows/voucher-engine/__tests__/auto-remove-notice.unit.spec.ts` (5 test)

| STT | Tên test (describe > it)                                                                                                                           | Trạng thái |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | buildAutoRemoveNotice (tasks 3.5.9/3.5.10, SPEC §11.3 step 3b) 3.5.9 — min-order failure yields the min-order reason + a filled VI message         | Pass       |
| 2   | buildAutoRemoveNotice (tasks 3.5.9/3.5.10, SPEC §11.3 step 3b) 3.5.10 — no-eligible-items failure yields the no-eligible reason                    | Pass       |
| 3   | buildAutoRemoveNotice (tasks 3.5.9/3.5.10, SPEC §11.3 step 3b) maps the other revalidation-subset failures (V1/V2/V8) to their own phrases         | Pass       |
| 4   | buildAutoRemoveNotice (tasks 3.5.9/3.5.10, SPEC §11.3 step 3b) falls back to a generic reason when the failure code is missing/unknown (defensive) | Pass       |
| 5   | buildAutoRemoveNotice (tasks 3.5.9/3.5.10, SPEC §11.3 step 3b) exposes the storefront metadata key for the async notice                            | Pass       |

#### 14. `src/workflows/voucher-engine/__tests__/assert-cart-unchanged.unit.spec.ts` (5 test)

| STT | Tên test (describe > it)                                                                                                                                                 | Trạng thái |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| 1   | isCartUnchanged (unit, EC-04) returns true when the marker still matches                                                                                                 | Pass       |
| 2   | isCartUnchanged (unit, EC-04) returns false when the cart was mutated concurrently                                                                                       | Pass       |
| 3   | isCartUnchanged (unit, EC-04) returns false when the cart could not be re-read                                                                                           | Pass       |
| 4   | isCartUnchanged (unit, EC-04) returns true for the same instant even when one side is a Date instance and the other a string (query.graph vs. workflow-marshalled value) | Pass       |
| 5   | isCartUnchanged (unit, EC-04) returns false for different instants regardless of Date/string mix                                                                         | Pass       |

#### 15. `src/workflows/voucher-engine/__tests__/analytics.unit.spec.ts` (5 test)

| STT | Tên test (describe > it)                                                                     | Trạng thái |
| --- | -------------------------------------------------------------------------------------------- | ---------- |
| 1   | computeAnalytics (3.4.12) returns all-zero (not NaN) for an empty log                        | Pass       |
| 2   | computeAnalytics (3.4.12) sums discount, counts uses and capped rows                         | Pass       |
| 3   | computeAnalytics (3.4.12) keeps discount totals integer (Math.floor, INT-01)                 | Pass       |
| 4   | computeAnalytics (3.4.12) avg_order_value: 0 when no row carries an order value (open issue) | Pass       |
| 5   | computeAnalytics (3.4.12) avg_order_value: integer mean of rows that do carry order_value    | Pass       |

#### 16. `src/workflows/voucher-engine/lib/__tests__/hydrate-voucher-from-promotion.unit.spec.ts` (4 test)

| STT | Tên test (describe > it)                                                    | Trạng thái |
| --- | --------------------------------------------------------------------------- | ---------- |
| 1   | overlays code, discount, status, window, limit from promotion (percent→bps) | Pass       |
| 2   | keeps voucher-only fields from config untouched                             | Pass       |
| 3   | fixed_amount: value passes through without ×100                             | Pass       |
| 4   | no promotion → returns config unchanged (defensive)                         | Pass       |

#### 17. `src/workflows/voucher-engine/__tests__/rate-limit-policy.unit.spec.ts` (4 test)

| STT | Tên test (describe > it)                                                              | Trạng thái |
| --- | ------------------------------------------------------------------------------------- | ---------- |
| 1   | decideRateLimit (3.7.4/3.7.5) allows below the threshold (0..4)                       | Pass       |
| 2   | decideRateLimit (3.7.4/3.7.5) blocks + arms cooldown at exactly the threshold (5)     | Pass       |
| 3   | decideRateLimit (3.7.4/3.7.5) stays blocked beyond the threshold                      | Pass       |
| 4   | decideRateLimit (3.7.4/3.7.5) uses the team-unified windows (15m count / 30m penalty) | Pass       |

#### 18. `src/workflows/voucher-engine/lib/__tests__/has-stale-voucher-promotion.unit.spec.ts` (4 test)

| STT | Tên test (describe > it)                                                   | Trạng thái |
| --- | -------------------------------------------------------------------------- | ---------- |
| 1   | returns false for an empty promotions array                                | Pass       |
| 2   | returns false when every promotion is a plain (non-voucher) promotion      | Pass       |
| 3   | returns true when a promotion carries metadata.voucher_engine === true     | Pass       |
| 4   | returns true for a mixed array with one flagged promotion among plain ones | Pass       |

#### 19. `src/workflows/voucher-engine/__tests__/normalize.unit.spec.ts` (4 test)

| STT | Tên test (describe > it)                                                                      | Trạng thái |
| --- | --------------------------------------------------------------------------------------------- | ---------- |
| 1   | VoucherEngine · normalizeCode (SRS §5.2 V1) trims surrounding whitespace and uppercases       | Pass       |
| 2   | VoucherEngine · normalizeCode (SRS §5.2 V1) uppercases mixed-case input                       | Pass       |
| 3   | VoucherEngine · normalizeCode (SRS §5.2 V1) returns empty string for null / undefined / empty | Pass       |
| 4   | VoucherEngine · normalizeCode (SRS §5.2 V1) is idempotent                                     | Pass       |

#### 20. `src/workflows/voucher-engine/__tests__/gen-code.unit.spec.ts` (4 test)

| STT | Tên test (describe > it)                                                                          | Trạng thái |
| --- | ------------------------------------------------------------------------------------------------- | ---------- |
| 1   | generateVoucherCode (3.4.11) matches the accepted format /^[A-Z0-9]{6,}$/                         | Pass       |
| 2   | generateVoucherCode (3.4.11) is at least MIN_CODE_LENGTH chars, even if a shorter length is asked | Pass       |
| 3   | generateVoucherCode (3.4.11) is deterministic for a given RNG stub                                | Pass       |
| 4   | generateVoucherCode (3.4.11) maps the RNG range across the alphabet (uppercase alphanumeric)      | Pass       |

#### 21. `src/api/middlewares/__tests__/voucher-rate-limit.unit.spec.ts` (2 test)

| STT | Tên test (describe > it)                                                                                                        | Trạng thái |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | voucherRateLimitMiddleware — IP source (unit) never derives the rate-limit IP from the client-controlled X-Forwarded-For header | Pass       |
| 2   | voucherRateLimitMiddleware — IP source (unit) returns a 429 body matching the shared ErrorEnvelope contract                     | Pass       |
