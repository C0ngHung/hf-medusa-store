# T-SUGG-06 — Add suggested product via one-tap → item in cart, toast shown (SRS §10.1 / SUGG-003)

**SRS gốc:** "Add suggested product via one-tap → item in cart, toast shown." Validates **SUGG-003**.
Type: **E2E**.

**Kết luận: NOT IMPLEMENTED — xác nhận lại, không phải mới phát hiện.** Đã kiểm tra: **không có
Playwright (hay bất kỳ E2E framework nào) được cấu hình trong repo** (`find ... -iname "playwright*"`
→ 0 kết quả). Đúng như `docs/tasks_grouped.md` dòng 361 đã ghi từ trước.

**Tin tốt — không phải 100% chưa test gì:** phần **backend** của one-tap-add (SUGG-003) đã có test
integration thật trong phiên này (xem [[EC-07]], [[EC-09]] — file `add-suggested-item.spec.ts`, viết
mới hoàn toàn vì route trước đó có 0% coverage): route thêm đúng variant mặc định, trả về line_item +
cart total, xử lý hết hàng (409), xử lý rule bị deactivate. Cái CÒN THIẾU thật sự chỉ là phần
**storefront/UI** (checkmark "Added" 3 giây, toast "Undo", bottom sheet chọn variant) — những cái này
BẮT BUỘC phải test bằng trình duyệt thật (Playwright), không thể test bằng HTTP integration.

| STT | Mã Test Case (TC ID) | Hạng mục / Chức năng                           | Mô tả kịch bản test (Description)                                                                                                          | Dữ liệu đầu vào (Input Data)            | Kết quả mong muốn (Expected Result)                               | Kết quả thực tế (Actual Result) | Trạng thái (Status) | Ghi chú (Notes / Error Log)                                                                                                                                                                                                                                                                                                                     |
| --- | -------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- | ----------------------------------------------------------------- | ------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | TC_SUGG_T06_01       | SuggestiveSelling — One-tap add E2E (SUGG-003) | Khách tap "Add" trên 1 suggestion card ở storefront thật → item xuất hiện trong cart, toast "{Product} added to cart" hiện ra kèm nút Undo | — (chưa thực hiện được, cần Playwright) | Item trong cart; toast hiển thị đúng; Undo hoạt động trong 3 giây | —                               | **Not Implemented** | Cần cài đặt Playwright (chưa có trong repo) + viết test browser thật nhắm vào `apps/storefront`. Phần backend tương đương đã test qua `integration-tests/http/add-suggested-item.spec.ts` (xem [[EC-07]]) nhưng đó không thay thế được E2E vì không xác nhận được UI (checkmark, toast, Undo, bottom sheet) thực sự chạy đúng trên trình duyệt. |
