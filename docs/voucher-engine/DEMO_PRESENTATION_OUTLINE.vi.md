# Outline thuyết trình demo — VoucherEngine

Tài liệu này là dàn ý **nói gì khi demo**, không phải kịch bản click từng bước
(xem `DEMO_TEST_SCRIPT.vi.md` cho phần đó). Nguồn requirement:
`docs/Phan-tich-SRS-Suggestive-Selling-Voucher.md` (SRS §4 VOUCH-001..005, §8
Edge Cases, §9 NFR, §10 Acceptance Tests). Nguồn trạng thái hiện tại của repo:
`.claude/specs/voucher-engine/rebuild-decisions.md` (code + decision log thắng,
`SPEC.md` chỉ là tài liệu planning đã cũ).

## 1. Mở đầu — vấn đề & yêu cầu (2-3 phút)

Nói ngắn gọn bài toán, không đọc lại toàn bộ SRS:

- Khách hàng cần áp mã giảm giá ở checkout, thấy total cập nhật ngay
  (US-03/US-04).
- Cái khó không phải là "trừ % vào tổng tiền" — mà là **thứ tự & giới hạn**
  khi cart có đồng thời: item-level promotion (kể cả trên suggested item từ
  module Suggestive Selling) + voucher + một trần giảm giá toàn cục.
- Business rule cố định: **item promotion luôn tính trước, voucher tính sau
  trên phần còn lại, và nếu tổng giảm giá vượt trần thì chỉ được cắt bớt
  voucher — không bao giờ đụng vào item promotion.**
- Đây là phần dễ sai nhất nếu làm thủ công (cộng dồn % sai thứ tự, hoặc để
  total âm) — nên SRS dành hẳn 3 acceptance test số cho riêng phần này
  (T-VOUCH-07/08/09).

## 2. Vì sao không tự build lại "Promotion" — quan hệ với Medusa native (2 phút)

Điểm hay để nhấn khi ban giám khảo hỏi "sao không code hết trong module riêng":

- Medusa đã có sẵn **Promotion + Campaign module** làm source of truth cho:
  code, discount type/value, product/category scope, ngày hiệu lực, trạng
  thái active — không nên duplicate field này ở module riêng (tránh 2 nguồn
  sự thật lệch nhau).
- `VoucherEngine` (custom module) chỉ mở rộng phần SRS yêu cầu mà Promotion
  native **không có**:
  - validate theo đúng thứ tự V1→V8, fail-fast, message tiếng Việt riêng.
  - trần giảm giá toàn cục kiểu "giảm voucher để fit cap" (Promotion/Campaign
    budget không có khái niệm này).
  - audit log append-only riêng (`VoucherUsageLog`) + chống rate-limit brute
    force mã code.
  - `usage_limit`/`usage_count` global vẫn nằm trên `VoucherConfig`, không
    lấy trực tiếp từ `Promotion.limit` lúc runtime — vì V3 (check global
    limit) phải là một atomic UPDATE trên đúng 1 dòng để tránh race
    condition khi nhiều khách redeem cùng lúc.
- Kết nối 2 module không dùng DB foreign key — dùng **Link Module**
  (`defineLink(... readOnly: true)`) để giữ 2 module tách rời, đúng
  triết lý Medusa v2.
- Một Promotion **automatic** (tự động áp, không cần nhập code) thì **không
  được phép** bật VoucherEngine — vì voucher theo SRS luôn là "khách chủ động
  nhập/chọn mã", còn automatic Promotion chính là "item-level promotion" ở
  vế đầu của rule stacking.

## 3. Giới thiệu feature theo luồng người dùng (phần chính, 8-10 phút)

Đi theo đúng thứ tự demo ở `DEMO_TEST_SCRIPT.vi.md`, nhưng khi nói, nhấn vào
**yêu cầu SRS nào** đang được chứng minh ở mỗi bước, không chỉ mô tả UI:

1. **Admin tạo voucher** — tạo native Promotion (code, %, ngày hiệu lực) rồi
   bật VoucherEngine trên Promotion Detail, chỉ nhập thêm field
   SRS-specific (min order, max discount, scope, per-user limit, segment
   JSON). → minh hoạ US-05 + phần "field nào thuộc Promotion, field nào
   thuộc VoucherEngine" ở mục 2.
2. **Nhập mã sai / rate limit** → V1 + EC-10/SEC-02 (5 lần sai trong 15 phút
   → 429, cooldown 30 phút). Đây là câu trả lời sẵn cho câu hỏi "chống được
   brute-force mã voucher không".
3. **Apply voucher hợp lệ, không có item promotion** → VOUCH-001 happy path,
   tag hiển thị code + số tiền tiết kiệm, total cập nhật ngay.
4. **Remove voucher** → VOUCH-004; nhấn mạnh: usage_count **không** tăng ở
   bước này — chỉ tăng sau khi đặt hàng thành công (khác biệt quan trọng hay
   bị hỏi).
5. **Apply lại khi đã có 1 voucher active (replace)** → V8 + rule "chỉ 1
   voucher active tại 1 thời điểm", modal xác nhận thay thế.
6. **Stacking dưới cap** (item promo 20% + voucher 10%) → VOUCH-003 rule
   1-4, số liệu khớp chính xác SRS.
7. **Stacking vượt cap, cap cắt đúng voucher** — dùng số liệu mới với
   **cap mặc định 40%** (Phase 5 requirement change, xem mục 4 bên dưới) →
   VOUCH-003 rule 6-7 + EC-01/EC-03, hiển thị `cap_explanation`.
8. **Sai scope / chưa đủ min order** → V5/V6, message có số tiền còn thiếu
   thực tế (`{remaining}`), không phải text tĩnh.
9. **Cart thay đổi tự làm mất điều kiện voucher (auto-remove)** → VOUCH-005 +
   EC-02, cart tự revalidate qua subscriber `cart.updated`, không cần khách
   tự remove tay.
10. **Checkout xong** → `VoucherUsageLog` được tạo (append-only), usage_count
    tăng atomic đúng 1 lần dù gửi lại event nhiều lần (idempotency theo
    voucher + order) → NFR data integrity + audit.
11. **Admin xem lại analytics widget** trên Promotion Detail sau khi có order
    → total_uses/total_discount_given/capped_count cập nhật.

## 4. Điểm nhấn riêng: Requirement Change "trần giảm giá 40%" (2 phút)

Đây là phần đáng nói nhất nếu ban giám khảo hỏi về khả năng đáp ứng thay đổi
yêu cầu giữa chừng — chuẩn bị sẵn câu trả lời ngắn:

- Yêu cầu mới: "Tổng discount không được vượt quá 40% giá trị đơn hàng"
  (trước đó default là 50%).
- Vì trần giảm giá **đã được thiết kế tham số hoá từ đầu**
  (`DiscountCapConfig`, admin chỉnh được 0-100%, hàm tính toán
  `calculateVoucherDiscount` nhận `global_cap_bps` là input tường minh) —
  thay đổi này **chỉ là đổi 1 giá trị default** (`DEFAULT_CAP_PCT`: 5000 →
  4000 basis points), không phải sửa lại business logic.
- Admin cũ vẫn giữ nguyên cấu hình cap của họ (không bị ép về 40% hồi tố) —
  chỉ ảnh hưởng seed mới / môi trường chưa từng set cap.
- Đây cũng là ví dụ tốt để nói về cách phân tích impact trước khi code: xác
  nhận Suggestive Selling **không** bị ảnh hưởng bởi thay đổi này (module đó
  không có discount-cap logic, "cap" của nó là giới hạn số lượng gợi ý, khác
  khái niệm).

## 5. Bảo mật & tính toàn vẹn dữ liệu (1-2 phút, nói nhanh nếu hết giờ)

- Tất cả tính toán discount chạy **server-side**; frontend chỉ hiển thị,
  không tự tính hay gửi số tiền lên.
- Toàn bộ tiền dùng số nguyên (1 = 1 VND), làm tròn bằng `Math.floor`, không
  bao giờ dùng float.
- Cart total luôn được **tính lại từ đầu** mỗi lần thay đổi, không patch
  cộng dồn — tránh drift.
- `VoucherUsageLog` append-only, không update/delete.

## 6. Kết — câu hỏi thường gặp nên chuẩn bị sẵn

- "Nếu 2 request apply/remove đồng thời thì sao?" → optimistic locking theo
  version column trên cart (EC-04).
- "Vì sao usage_limit không lấy trực tiếp từ Promotion?" → tránh
  TOCTOU/race khi check-and-increment phải atomic trên 1 bảng.
- "Điều gì xảy ra nếu Redis không có?" → toàn bộ cache/rate-limit là
  optional, có in-memory fallback, không phải hard dependency.
- "Test coverage thế nào?" → mục tiêu ≥20/22 acceptance test SRS §10, unit
  test StackingEngine khớp chính xác từng VND với fixture SRS.
