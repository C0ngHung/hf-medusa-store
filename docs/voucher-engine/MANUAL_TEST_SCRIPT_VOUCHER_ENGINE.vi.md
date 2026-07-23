# Kịch bản test thủ công VoucherEngine trên giao diện

Tài liệu này dùng để test end-to-end theo SRS: tạo Promotion/VoucherEngine trong
Admin, kiểm tra notification/toast trên Admin, sau đó dùng các voucher đã tạo để
test trên Storefront/checkout và đối chiếu thông báo hiển thị với thông báo SRS.

## 0. Phạm vi và nguyên tắc

- Admin dài hạn dùng native Medusa Promotions làm domain chính.
- VoucherEngine không có domain quản trị riêng dài hạn.
- Một voucher hợp lệ là `Promotion không automatic + VoucherConfig đang enabled`.
- Automatic Promotion là khuyến mãi tự động của Medusa Promotion Module, áp trước
  voucher.
- Voucher áp sau automatic item-level Promotion.
- Chỉ một voucher được active trên cart tại một thời điểm.
- `VoucherUsageLog` chỉ được tạo sau khi đặt hàng thành công, không tạo khi apply
  voucher vào cart.
- Global cap chỉ cắt phần voucher, không cắt automatic Promotion.

## 1. Chuẩn bị môi trường

### 1.1 Chạy backend và storefront

1. Mở terminal tại workspace:

   ```bash
   cd /home/ubuntu/Projects/medusa/hf-medusa-store
   ```

2. Chạy backend:

   ```bash
   pnpm backend:dev
   ```

3. Chạy storefront:

   ```bash
   pnpm storefront:dev
   ```

4. Mở:
   - Admin Dashboard: `http://localhost:9000/app`
   - Storefront: `http://localhost:8008`

5. Đăng nhập Admin bằng tài khoản admin đã seed/tạo sẵn.

### 1.2 Chuẩn bị sản phẩm test

Tạo hoặc xác nhận có ít nhất 3 nhóm sản phẩm:

| Nhóm                | Mục đích                      | Ghi chú                            |
| ------------------- | ----------------------------- | ---------------------------------- |
| Product A           | Test voucher không scope      | Giá nên >= 1.000.000₫ để dễ tính   |
| Racket product      | Test scope category `Rackets` | Phải thuộc category `Rackets`      |
| Shuttlecock product | Test scope/min-order          | Phải thuộc category `Shuttlecocks` |

Ghi lại:

- product name
- category
- giá bán
- URL sản phẩm trên storefront

### 1.3 Dữ liệu voucher cần tạo theo SRS 10.2

Tạo các native Promotions dưới đây, sau đó enable VoucherEngine cho từng
Promotion đủ điều kiện. Bảng này là dữ liệu chuẩn để cover đủ `T-VOUCH-01` đến
`T-VOUCH-12` trong SRS 10.2.

| Code        | Native Promotion                      | VoucherEngine config                                                   | Mục đích                                          |
| ----------- | ------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------- |
| `SAVE10`    | Code Promotion, 10%                   | Không min, không scope, per user 10                                    | `T-VOUCH-01`, `T-VOUCH-07`, remove voucher        |
| `OLDEXP10`  | Code Promotion, 10%                   | Validity đã hết hạn                                                    | `T-VOUCH-03`                                      |
| `ONCE10`    | Code Promotion, 10%                   | `per_user_limit = 1`                                                   | `T-VOUCH-04`                                      |
| `MEGA20`    | Code Promotion, 20%                   | Không max voucher cap, per user 10                                     | `T-VOUCH-08` theo ví dụ SRS                       |
| `MEGA40`    | Code Promotion, 40%                   | `max_discount_amount = 500000`, per user 10                            | Test max voucher cap riêng                        |
| `MEGA50`    | Code Promotion, 50%                   | Không max voucher cap, per user 10                                     | `T-VOUCH-09`                                      |
| `FIX100K`   | Code Promotion, fixed amount `100000` | Không max voucher cap, per user 10                                     | Test fixed amount không cần `max_discount_amount` |
| `RACKET20`  | Code Promotion, 20%                   | Scope category `Rackets`, per user 10                                  | Test V6 scope                                     |
| `SHUTTLE20` | Code Promotion, 20%                   | Scope category `Shuttlecocks`, `min_order_value = 200000`, per user 10 | Test V5 + V6                                      |

Tạo thêm các automatic Promotions:

| Code/name          | Type                                   | Điều kiện                                                 | Mục đích                               |
| ------------------ | -------------------------------------- | --------------------------------------------------------- | -------------------------------------- |
| `AUTO20_RACKET`    | Automatic Promotion, 20% item discount | target item/category `Rackets`                            | `T-VOUCH-07` happy path                |
| `AUTO40_RACKET`    | Automatic Promotion, 40% item discount | target item/category `Rackets`                            | `T-VOUCH-08` cap exceeded              |
| `AUTO30_STRING`    | Automatic Promotion, 30% item discount | target item/category `Strings` hoặc suggested string item | `T-VOUCH-08`, suggested item           |
| `AUTO50_SUGGESTED` | Automatic Promotion, 50% item discount | target suggested item/category                            | `T-VOUCH-09` negative-total prevention |

Nếu môi trường chỉ cho tạo một vài Promotion trước, ưu tiên theo thứ tự:
`SAVE10`, `OLDEXP10`, `ONCE10`, `RACKET20`, `SHUTTLE20`, `AUTO20_RACKET`,
`AUTO40_RACKET`, `AUTO30_STRING`, `MEGA20`, `MEGA50`.

## 2. Admin: tạo native Promotion để bật VoucherEngine

Lặp lại mục này cho toàn bộ code-based Promotions trong bảng 1.3.

### 2.1 Tạo native code-based Promotion

1. Vào Admin Dashboard.
2. Mở `Promotions`.
3. Bấm native action `Create Promotion`.
4. Chọn loại Promotion code-based, không automatic.
5. Nhập:
   - Code: ví dụ `SAVE10`
   - Discount type/value: ví dụ percentage `10`
   - Application: order hoặc items tùy native UI yêu cầu
   - Status: active
   - Campaign/validity: ngày hiện tại đến một ngày trong tương lai
6. Save Promotion.
7. Kỳ vọng:
   - Promotion tạo thành công.
   - Admin chuyển hoặc cho phép mở Promotion Detail.
   - Promotion hiển thị `is_automatic = false` theo UI/native state.

### 2.2 Bật VoucherEngine trên Promotion Detail

1. Mở Promotion Detail của Promotion vừa tạo.
2. Tìm section/widget `VoucherEngine settings`.
3. Xác nhận trạng thái ban đầu:
   - Badge/label: `Disabled`
   - Text tương đương: Promotion đủ điều kiện nhưng chưa bật VoucherEngine.
4. Bật toggle hoặc action `Enable VoucherEngine`.
5. Form inline xuất hiện.
6. Nhập chỉ các field thuộc VoucherEngine, không nhập lại code/discount/date:

   Với `SAVE10`:

   | Field                        | Value    |
   | ---------------------------- | -------- |
   | Minimum order value          | bỏ trống |
   | Maximum voucher discount     | bỏ trống |
   | Applicable product ids       | bỏ trống |
   | Applicable category ids      | bỏ trống |
   | Per-user limit               | `10`     |
   | User segment conditions JSON | bỏ trống |

   Với `MEGA40`:

   | Field                    | Value    |
   | ------------------------ | -------- |
   | Maximum voucher discount | `500000` |
   | Per-user limit           | `10`     |

   Với `RACKET20`:

   | Field                   | Value                     |
   | ----------------------- | ------------------------- |
   | Applicable category ids | category id của `Rackets` |
   | Per-user limit          | `10`                      |

   Với `SHUTTLE20`:

   | Field                   | Value                          |
   | ----------------------- | ------------------------------ |
   | Minimum order value     | `200000`                       |
   | Applicable category ids | category id của `Shuttlecocks` |
   | Per-user limit          | `10`                           |

7. Bấm Save.
8. Kỳ vọng notification/toast:

   ```text
   VoucherEngine enabled for this Promotion.
   ```

9. Kỳ vọng UI sau khi save:
   - Badge/label chuyển thành `Enabled`.
   - Widget hiển thị các field VoucherEngine vừa nhập.
   - `code`, discount type/value, validity, status vẫn nằm ở native Promotion UI,
     không có form nhập trùng trong widget.
   - Widget analytics xuất hiện hoặc sẵn sàng hiển thị trạng thái chưa có usage.

### 2.3 Test validation trên form Enable VoucherEngine

Thực hiện trên một Promotion test riêng hoặc tắt/bật lại một Promotion chưa dùng
ở storefront.

| Case                   | Bước                                     | Kỳ vọng                                                          |
| ---------------------- | ---------------------------------------- | ---------------------------------------------------------------- |
| Per-user limit invalid | Nhập `0` hoặc số âm                      | Inline error: `Must be a positive number`; không gọi API         |
| JSON invalid           | Nhập `{abc` vào segment JSON             | Inline error: `Must be valid JSON`; không gọi API                |
| Cancel                 | Mở form rồi bấm Cancel                   | Form đóng, không thay đổi trạng thái                             |
| Save API lỗi           | Ngắt network hoặc dùng data không hợp lệ | Toast lỗi: `Failed to enable VoucherEngine.` hoặc message từ API |

### 2.4 Test Disable/Enable notification

1. Trên Promotion đã enabled, tắt VoucherEngine.
2. Kỳ vọng UI hỏi xác nhận:

   ```text
   Disable VoucherEngine for this Promotion?
   ```

3. Confirm.
4. Kỳ vọng toast:

   ```text
   VoucherEngine disabled for this Promotion.
   ```

5. Kỳ vọng:
   - Badge/label chuyển về `Disabled`.
   - Settings/usage history vẫn được giữ.
   - Analytics widget không hiển thị hoặc không còn active.
6. Bật lại VoucherEngine.
7. Kỳ vọng toast:

   ```text
   VoucherEngine enabled for this Promotion.
   ```

8. Kỳ vọng:
   - Re-enable dùng lại cùng VoucherConfig/history, không tạo row trùng.

## 3. Admin: tạo Automatic Promotion ban đầu

### 3.1 Tạo automatic item-level Promotion

1. Vào Admin Dashboard.
2. Mở `Promotions`.
3. Bấm native action `Create Promotion`.
4. Tạo lần lượt các Promotion tự động trong bảng 1.3:
   - `AUTO20_RACKET`
   - `AUTO40_RACKET`
   - `AUTO30_STRING`
   - `AUTO50_SUGGESTED`
5. Với từng Promotion, bảo đảm:
   - `is_automatic = true`
   - Discount đúng percentage trong bảng 1.3
   - Target đúng item/category tương ứng
   - Status: active
   - Validity: hiện tại đến tương lai
6. Save.
7. Mở Promotion Detail.
8. Kiểm tra `VoucherEngine settings`.
9. Kỳ vọng:
   - Không cho bật VoucherEngine.
   - Badge/label tương đương `Not eligible`.
   - Có lý do rõ ràng: Promotion automatic không thể enable VoucherEngine.
   - Không có nút/form Save VoucherEngine.

### 3.2 Kiểm tra Automatic Promotion không bị lẫn với Voucher

1. Mở native Promotion list.
2. Xác nhận các mã `AUTO*` vẫn là native/automatic Promotion.
3. Mở Storefront, thêm sản phẩm thuộc `Rackets` vào cart.
4. Kỳ vọng cart có automatic discount trước khi nhập voucher.
5. Không có voucher row hiển thị nếu chưa nhập voucher code.

## 4. Storefront: kiểm tra UI chung trước khi apply voucher

### 4.1 Mở checkout/cart

1. Vào Storefront.
2. Thêm Product A vào cart.
3. Đi tới cart/checkout.
4. Tìm discount section.
5. Kỳ vọng:
   - Có đúng một block discount/voucher.
   - Có một input `discount-input`.
   - Có một nút Apply.
   - Không có panel voucher riêng thứ hai.
   - Có nút/link `Available vouchers`.

### 4.2 Kiểm tra Available vouchers modal

1. Nếu đang guest, bấm `Available vouchers`.
2. Kỳ vọng:

   ```text
   No vouchers available right now.
   ```

   hoặc empty state tương đương, không hiện lỗi đỏ.

3. Đăng nhập customer.
4. Mở lại `Available vouchers`.
5. Kỳ vọng:
   - Hiển thị các voucher đang active/eligible.
   - Mỗi row có code, mô tả discount, điều kiện min/scope nếu có.
   - Voucher không đủ điều kiện cart hiển thị reason, không áp được hoặc có
     trạng thái disabled theo UI.

## 5. Storefront: apply voucher happy path

### 5.1 Apply `SAVE10`

1. Cart có Product A, không có automatic Promotion.
2. Nhập `save10` chữ thường vào discount input.
3. Bấm Apply.
4. Kỳ vọng network:
   - `POST /store/carts/:id/voucher`
   - status `200`
5. Kỳ vọng UI:
   - Có success message:

     ```text
     Mã giảm giá đã được áp dụng.
     ```

     Nếu implementation dùng biến thể khác, ghi lại text thực tế.

   - Có voucher row riêng, không hiển thị mã ephemeral/internal.
   - Badge/code hiển thị `SAVE10`.
   - Savings đúng 10% trên subtotal eligible.
   - Cart total giảm đúng.
   - Không có cap explanation.

### 5.2 `T-VOUCH-10`: Remove `SAVE10`

1. Bấm remove ở voucher row.
2. Kỳ vọng network:
   - `DELETE /store/carts/:id/voucher`
   - status `200`
3. Kỳ vọng UI:
   - Voucher row biến mất.
   - Success message:

     ```text
     Mã giảm giá đã được gỡ.
     ```

     Nếu implementation trả message khác từ backend, ghi lại text thực tế.

   - Cart total trở về trước khi apply voucher.

4. Kiểm tra DB/API sau đó:
   - `usage_count` chưa tăng.
   - Chưa có `VoucherUsageLog`.

### 5.3 Apply lại sau remove

1. Nhập lại `SAVE10`.
2. Bấm Apply.
3. Kỳ vọng:
   - Vẫn thành công.
   - Không bị chặn per-user limit, vì chưa đặt hàng.

## 6. Storefront: replace voucher và thông báo xác nhận

### 6.1 Apply voucher thứ hai khi đang có voucher active

1. Đảm bảo `SAVE10` đang active trên cart.
2. Nhập `MEGA40`.
3. Bấm Apply.
4. Kỳ vọng network đầu tiên:
   - `POST /store/carts/:id/voucher`
   - status `409`
   - code `VOUCHER_REPLACE_REQUIRED`
5. Kỳ vọng UI:
   - Modal xác nhận replace xuất hiện.
   - Message phải giống SRS/backend:

     ```text
     Bạn đang dùng mã SAVE10. Thay bằng mã mới chứ?
     ```

6. Bấm Cancel.
7. Kỳ vọng:
   - Modal đóng.
   - `SAVE10` vẫn active.
   - Cart total không đổi.

### 6.2 Confirm replace

1. Nhập lại `MEGA40`.
2. Bấm Apply.
3. Khi modal xuất hiện, bấm Confirm.
4. Kỳ vọng network:
   - Request sau confirm gọi `POST /store/carts/:id/voucher?replace=true`
   - status `200`
5. Kỳ vọng UI:
   - Voucher row đổi từ `SAVE10` sang `MEGA40`.
   - Không có hai voucher cùng lúc.
   - Cart total tính theo voucher mới.

## 7. Storefront: thông báo lỗi theo SRS

Mỗi case nên test trên cart mới hoặc remove voucher trước khi test. Với mỗi case,
ghi lại:

- code HTTP
- `code` trong response
- `customer_message`
- text hiển thị trên UI
- screenshot UI

### 7.1 `T-VOUCH-02`: Mã không tồn tại

1. Nhập `KHONGTONTAI`.
2. Bấm Apply.
3. Kỳ vọng:
   - HTTP `404`
   - code `VOUCHER_NOT_FOUND`
   - UI hiển thị:

     ```text
     Mã giảm giá không đúng. Bạn kiểm tra lại giúp nhé!
     ```

   - Cart total không đổi.

### 7.2 Voucher disabled/inactive

1. Vào Admin, mở Promotion `SAVE10`.
2. Disable VoucherEngine trong widget.
3. Quay lại Storefront, nhập `SAVE10`.
4. Kỳ vọng:
   - HTTP `422` hoặc lỗi business tương ứng.
   - code `VOUCHER_INACTIVE`.
   - UI hiển thị:

     ```text
     Mã giảm giá không đúng. Bạn kiểm tra lại giúp nhé!
     ```

5. Bật lại VoucherEngine sau khi test.

### 7.3 Voucher chưa tới ngày dùng

1. Vào Admin, chỉnh native Promotion/Campaign validity của một Promotion voucher
   sang tương lai.
2. Nhập code đó ở Storefront.
3. Kỳ vọng:
   - code `VOUCHER_NOT_YET_VALID`
   - UI hiển thị:

     ```text
     Mã này chưa tới ngày sử dụng. Bạn quay lại sau nhé!
     ```

### 7.4 `T-VOUCH-03`: Voucher hết hạn

1. Dùng `OLDEXP10`, hoặc vào Admin chỉnh native Promotion/Campaign validity của một
   Promotion test về quá khứ.
2. Nhập code đó.
3. Kỳ vọng:
   - code `VOUCHER_EXPIRED`
   - Nếu response có ngày hết hạn, UI phải hiển thị hoặc message phải giải thích
     rõ voucher đã hết hạn.
   - UI hiển thị:

     ```text
     Mã giảm giá đã hết hạn rồi. Bạn xem thêm mã trong "Ví voucher" nhé!
     ```

### 7.5 Hết global usage limit

1. Dùng voucher test có `usage_limit = 1`, hoặc set usage count/limit bằng script
   test nếu UI chưa hỗ trợ.
2. Làm cho `usage_count >= usage_limit`.
3. Nhập code ở Storefront.
4. Kỳ vọng:
   - code `VOUCHER_USAGE_LIMIT_REACHED`
   - UI hiển thị:

     ```text
     Mã này đã hết lượt sử dụng. Bạn thử mã khác nhé!
     ```

### 7.6 `T-VOUCH-04`: Hết per-user limit

1. Đăng nhập customer A.
2. Đặt hàng thành công một lần với `ONCE10` hoặc voucher có `per_user_limit = 1`.
3. Tạo cart mới với cùng customer A.
4. Nhập lại code đó.
5. Kỳ vọng:
   - code `VOUCHER_PER_USER_LIMIT_REACHED`
   - UI hiển thị:

     ```text
     Bạn đã dùng hết lượt cho mã này rồi.
     ```

### 7.7 `T-VOUCH-05`: Chưa đạt min order

1. Cart có tổng dưới `200000`.
2. Nhập `SHUTTLE20`.
3. Kỳ vọng:
   - code `VOUCHER_MIN_ORDER_NOT_MET`
   - UI hiển thị:

     ```text
     Mua thêm {remaining} nữa để dùng được mã này nhé!
     ```

   - `{remaining}` phải được thay bằng số tiền thực tế còn thiếu.

### 7.8 `T-VOUCH-06`: Sai product/category scope

1. Cart chỉ có Product A, không có `Rackets` hoặc `Shuttlecocks`.
2. Nhập `RACKET20` hoặc `SHUTTLE20`.
3. Kỳ vọng:
   - code `VOUCHER_NO_ELIGIBLE_ITEMS`
   - UI hiển thị:

     ```text
     Mã này chỉ áp dụng cho một số sản phẩm/danh mục nhất định. Giỏ hàng chưa có sản phẩm phù hợp.
     ```

### 7.9 Customer không thuộc segment

1. Vào Admin widget VoucherEngine của một voucher test.
2. Nhập segment JSON:

   ```json
   {
     "customer_group_ids": [
       "<customer_group_id_ma_customer_hien_tai_khong_thuoc>"
     ]
   }
   ```

3. Save.
4. Đăng nhập customer không thuộc group đó.
5. Nhập voucher code.
6. Kỳ vọng:
   - code `VOUCHER_SEGMENT_NOT_ELIGIBLE`
   - UI hiển thị:

     ```text
     Mã này không áp dụng cho tài khoản của bạn.
     ```

7. Gỡ segment condition hoặc dùng customer đúng group để tránh ảnh hưởng các case
   sau.

### 7.10 `T-VOUCH-12`: Rate limit khi đoán mã sai

1. Trên cùng browser/customer/IP, nhập mã không tồn tại 5 lần liên tiếp.
2. Kỳ vọng lần thứ 5 hoặc sau ngưỡng:
   - HTTP `429`
   - UI hiển thị message rate-limit nếu backend trả envelope.
3. Nhập mã đúng ngay sau đó.
4. Kỳ vọng vẫn bị chặn trong cooldown.
5. Ghi chú: nếu chỉ các lỗi `VOUCHER_NOT_FOUND` bị tính vào rate limit, còn lỗi
   min-order/expired không bị tính, ghi nhận đúng hành vi thực tế để business xác
   nhận.

## 8. Storefront: SRS 10.2 `T-VOUCH-07` đến `T-VOUCH-09`

Phần này là bộ test bắt buộc cho VOUCH-003. Tester phải ghi số trước và sau
khi apply voucher, không chỉ nhìn message thành công.

### 8.1 Công thức đối chiếu bắt buộc

Với mọi case trong mục 8, tính và ghi lại:

| Biến                                 | Cách tính                                                              |
| ------------------------------------ | ---------------------------------------------------------------------- |
| `original_subtotal`                  | Tổng giá gốc của các line item trước mọi discount                      |
| `item_promotion_discount`            | Tổng discount từ native automatic item-level Promotion                 |
| `post_promotion_subtotal`            | `original_subtotal - item_promotion_discount`                          |
| `eligible_post_promotion_subtotal`   | Tổng post-promotion subtotal của các item eligible với voucher         |
| `raw_voucher_discount`               | Percentage/fixed voucher tính trên `eligible_post_promotion_subtotal`  |
| `voucher_discount_after_voucher_cap` | Voucher sau `max_discount_amount`, nếu có                              |
| `maximum_combined_discount`          | `original_subtotal * DiscountCapConfig.max_discount_percentage`        |
| `final_voucher_discount`             | Phần voucher cuối cùng sau global cap                                  |
| `final_total`                        | `original_subtotal - item_promotion_discount - final_voucher_discount` |

Điều kiện pass chung:

1. Native automatic Promotion áp trước voucher.
2. Voucher chỉ tính trên `eligible_post_promotion_subtotal`.
3. Nếu combined discount vượt global cap, chỉ giảm `final_voucher_discount`.
4. `item_promotion_discount` trước và sau apply voucher phải giữ nguyên.
5. Không có case nào làm cart total âm hoặc giảm sai automatic Promotion.

### 8.2 `T-VOUCH-07`: item promo 20% + voucher 10%, dưới cap

Setup:

1. Đảm bảo `DiscountCapConfig.max_discount_percentage = 5000` tương đương 50%.
2. Dùng cart mới.
3. Thêm:
   - Racket: giá gốc `4.500.000`, match `AUTO20_RACKET`.
   - String/suggested item: giá gốc `200.000`, không có automatic promo.
4. Trước voucher, xác nhận:
   - Racket có automatic discount `900.000`.
   - String không có automatic discount.
   - Không có voucher row.

Apply:

1. Nhập `SAVE10`.
2. Bấm Apply.

Kỳ vọng tính toán theo SRS:

| Biến                        | Giá trị kỳ vọng |
| --------------------------- | --------------: |
| `original_subtotal`         |     `4.700.000` |
| `item_promotion_discount`   |       `900.000` |
| `post_promotion_subtotal`   |     `3.800.000` |
| `raw_voucher_discount`      |       `380.000` |
| `maximum_combined_discount` |     `2.350.000` |
| `final_voucher_discount`    |       `380.000` |
| Combined discount           |     `1.280.000` |
| `final_total`               |     `3.420.000` |

Kỳ vọng UI:

1. Hiển thị success message apply voucher.
2. Có dòng automatic Promotion discount riêng hoặc discount item-level trong cart.
3. Có dòng voucher `SAVE10`, savings `380.000`.
4. Không hiển thị cap explanation vì chưa bị cap.
5. Nếu kiểm tra network response, `discount_capped` phải là `false`.

### 8.3 `T-VOUCH-08`: item promo 40% + 30% suggested promo + voucher 20%, vượt cap

Setup:

1. Đảm bảo `DiscountCapConfig.max_discount_percentage = 5000`.
2. Dùng cart mới.
3. Thêm:
   - Racket: giá gốc `4.500.000`, match `AUTO40_RACKET`.
   - Suggested String: giá gốc `200.000`, match `AUTO30_STRING`.
4. Trước voucher, xác nhận:
   - Racket automatic discount `1.800.000`.
   - Suggested String automatic discount `60.000`.
   - Tổng automatic discount `1.860.000`.

Apply:

1. Nhập `MEGA20`.
2. Bấm Apply.

Kỳ vọng tính toán theo SRS:

| Biến                        | Giá trị kỳ vọng |
| --------------------------- | --------------: |
| `original_subtotal`         |     `4.700.000` |
| `item_promotion_discount`   |     `1.860.000` |
| `post_promotion_subtotal`   |     `2.840.000` |
| `raw_voucher_discount`      |       `568.000` |
| `maximum_combined_discount` |     `2.350.000` |
| Cap còn lại cho voucher     |       `490.000` |
| `final_voucher_discount`    |       `490.000` |
| Combined discount           |     `2.350.000` |
| `final_total`               |     `2.350.000` |

Kỳ vọng UI:

1. Automatic discount vẫn là `1.860.000` sau khi apply voucher.
2. Voucher hiển thị final savings `490.000`, không phải `568.000`.
3. Có cap explanation, ví dụ:

   ```text
   Giảm giá đã được điều chỉnh từ 568.000₫ xuống 490.000₫ theo chính sách giảm tối đa 50%.
   ```

4. Nếu network response có `original_discount`, giá trị phải là `568.000`.
5. Nếu network response có `discount_capped`, giá trị phải là `true`.
6. Nếu automatic discount bị giảm xuống dưới `1.860.000`, case này FAIL.

### 8.4 `T-VOUCH-09`: suggested item 50% + voucher 50%, cap ngăn total âm

Setup:

1. Đảm bảo `DiscountCapConfig.max_discount_percentage = 5000`.
2. Dùng cart mới.
3. Thêm một suggested item giá gốc `1.000.000`, match `AUTO50_SUGGESTED`.
4. Trước voucher:
   - Automatic discount `500.000`.
   - Cart còn `500.000`.

Apply:

1. Nhập `MEGA50`.
2. Bấm Apply.

Kỳ vọng:

| Biến                        | Giá trị kỳ vọng |
| --------------------------- | --------------: |
| `original_subtotal`         |     `1.000.000` |
| `item_promotion_discount`   |       `500.000` |
| `post_promotion_subtotal`   |       `500.000` |
| `raw_voucher_discount`      |       `250.000` |
| `maximum_combined_discount` |       `500.000` |
| Cap còn lại cho voucher     |             `0` |
| `final_voucher_discount`    |             `0` |
| Combined discount           |       `500.000` |
| `final_total`               |       `500.000` |

Kỳ vọng UI:

1. Automatic Promotion vẫn giữ `500.000`.
2. Voucher không được làm total giảm xuống `250.000` hoặc số âm.
3. Nếu implementation cho phép voucher applied với savings `0`, UI phải giải thích do global cap.
4. Nếu implementation reject voucher vì final discount bằng `0`, ghi nhận message thực tế để business xác nhận; không được làm sai tổng tiền.

### 8.5 Percentage voucher có `max_discount_amount`

Case này không nằm riêng trong bảng 10.2 nhưng kiểm tra Rule 5 của VOUCH-003.

1. Tạo cart mới có subtotal/post-promotion eligible đủ lớn, ví dụ `2.000.000`.
2. Apply `MEGA40`, có `max_discount_amount = 500000`.
3. Tính:
   - Raw voucher 40% của `2.000.000` = `800.000`.
   - Sau voucher cap = `500.000`.
4. Kỳ vọng:
   - Voucher savings không vượt `500.000`.
   - Nếu global cap không bị vượt, `discount_capped` theo global cap là `false`.
   - Nếu UI có explanation, phải phân biệt voucher max cap và global combined cap.

### 8.6 Fixed amount voucher không cần `max_discount_amount`

1. Tạo cart mới có eligible subtotal `300.000`.
2. Apply `FIX100K`.
3. Kỳ vọng voucher discount = `100.000`.
4. Tạo cart khác có eligible subtotal `80.000`.
5. Apply `FIX100K`.
6. Kỳ vọng voucher discount không vượt eligible subtotal, tối đa `80.000`.
7. Không yêu cầu nhập `max_discount_amount` cho fixed amount voucher.

### 8.7 Scope category + automatic Promotion

1. Tạo cart gồm:
   - Racket eligible với `RACKET20`, có automatic Promotion nếu match.
   - Shuttlecock không eligible với `RACKET20`.
2. Apply `RACKET20`.
3. Kỳ vọng:
   - Voucher chỉ tính trên post-promotion subtotal của Racket.
   - Shuttlecock không bị voucher discount.
   - Automatic Promotion của các item vẫn giữ nguyên.
4. Nếu voucher tính trên toàn cart hoặc tính trên giá trước automatic Promotion, case FAIL.

## 9. Storefront: auto-remove khi cart thay đổi

### 9.1 Auto-remove do sai scope

1. Tạo cart có sản phẩm thuộc `Shuttlecocks`.
2. Đảm bảo cart >= `200000`.
3. Apply `SHUTTLE20`.
4. Kỳ vọng voucher active.
5. Xóa toàn bộ sản phẩm thuộc `Shuttlecocks` khỏi cart.
6. Kỳ vọng:
   - Voucher tự động bị gỡ.
   - Voucher row biến mất.
   - UI hiển thị notice:

     ```text
     Mã giảm giá SHUTTLE20 đã được tự động xóa vì ...
     ```

   - Nội dung reason phải tương ứng `VOUCHER_NO_ELIGIBLE_ITEMS`.
   - Cart total không còn voucher discount.

### 9.2 Auto-remove do min order

1. Tạo cart có `Shuttlecocks`, tổng >= `200000`.
2. Apply `SHUTTLE20`.
3. Giảm quantity để cart xuống dưới `200000`.
4. Kỳ vọng:
   - Voucher tự động bị gỡ.
   - UI hiển thị notice auto-remove.
   - Reason tương ứng `VOUCHER_MIN_ORDER_NOT_MET`.

### 9.3 Cart change vẫn giữ voucher nếu còn eligible

1. Tạo cart đủ điều kiện `SAVE10`.
2. Apply `SAVE10`.
3. Tăng quantity hoặc thêm Product A khác.
4. Kỳ vọng:
   - Voucher vẫn active.
   - Savings được tính lại theo cart mới.
   - Không có auto-remove notice.

## 10. Storefront: Available vouchers modal

### 10.1 Logged-in customer

1. Đăng nhập customer.
2. Tạo cart có Product A.
3. Mở `Available vouchers`.
4. Kỳ vọng:
   - `SAVE10` và `MEGA40` xuất hiện.
   - `RACKET20` hoặc `SHUTTLE20` có thể hiện ineligible reason nếu cart không
     có đúng category/min-order.
   - Savings badge hiển thị nếu backend trả `estimated_savings > 0`.

### 10.2 Apply từ modal

1. Trong modal, bấm Apply trên `SAVE10`.
2. Kỳ vọng:
   - Modal gọi cùng path apply như input thủ công.
   - Voucher row xuất hiện ở checkout.
   - Modal đóng hoặc state loading kết thúc rõ ràng.
   - Success/error message giống apply bằng input.

### 10.3 Guest user

1. Logout hoặc mở cửa sổ incognito.
2. Mở cart/checkout.
3. Mở `Available vouchers`.
4. Kỳ vọng:
   - Không crash.
   - Không hiển thị lỗi đỏ.
   - Empty state:

     ```text
     No vouchers available right now.
     ```

## 11. Checkout/order success và usage log

### 11.1 Apply voucher rồi hoàn tất checkout

1. Đăng nhập customer.
2. Tạo cart mới.
3. Apply `SAVE10`.
4. Hoàn tất checkout bằng payment test/manual.
5. Kỳ vọng order success page:
   - Tổng tiền cuối cùng có voucher discount.
   - Không mất thông tin discount.

### 11.2 Kiểm tra usage sau order

Sau khi order thành công, kiểm tra backend bằng DB/API/script:

1. `VoucherUsageLog` có đúng 1 row cho `order_id` + `voucher_id`.
2. `discount_applied` bằng final voucher discount.
3. `was_capped` đúng với kết quả apply.
4. `original_discount` bằng voucher discount trước global cap.
5. `applied_at` có timestamp.
6. `usage_count` tăng đúng 1.
7. Gửi lại event/order workflow lần nữa nếu có thể:
   - Không tạo row trùng.
   - Không tăng `usage_count` lần hai.

## 12. Admin: analytics widget sau khi có order

1. Quay lại Admin.
2. Mở Promotion Detail của voucher vừa được dùng.
3. Kiểm tra widget analytics.
4. Kỳ vọng:
   - `total_uses` tăng.
   - `total_discount_given` tăng đúng.
   - `capped_count` tăng nếu voucher bị global cap.
   - Recent usage/metrics không crash khi chưa có usage.
5. Nếu `avg_order_value` hoặc `conversion_rate` luôn là `0`, ghi nhận là known
   gap nếu backend chưa có nguồn dữ liệu cho hai field này.

## 13. Admin: global DiscountCapConfig

1. Vào route `Voucher settings` hoặc global settings tương ứng.
2. Kiểm tra section global discount cap.
3. Nhập invalid value:
   - rỗng
   - `10001`
   - số thập phân
4. Kỳ vọng:
   - Có inline validation.
   - Không gửi request save.
5. Nhập `5000`.
6. Save.
7. Kỳ vọng toast:

   ```text
   Discount cap saved
   ```

   hoặc toast success tương ứng từ implementation.

8. Refresh trang.
9. Kỳ vọng value vẫn là `5000`, `updated_at`/`updated_by` cập nhật.

## 14. Bảng đối chiếu notification/message theo SRS

| Case                     | Code                             | UI phải hiển thị                                                                                |
| ------------------------ | -------------------------------- | ----------------------------------------------------------------------------------------------- |
| Mã không tồn tại         | `VOUCHER_NOT_FOUND`              | `Mã giảm giá không đúng. Bạn kiểm tra lại giúp nhé!`                                            |
| Voucher inactive         | `VOUCHER_INACTIVE`               | `Mã giảm giá không đúng. Bạn kiểm tra lại giúp nhé!`                                            |
| Chưa tới ngày            | `VOUCHER_NOT_YET_VALID`          | `Mã này chưa tới ngày sử dụng. Bạn quay lại sau nhé!`                                           |
| Hết hạn                  | `VOUCHER_EXPIRED`                | `Mã giảm giá đã hết hạn rồi. Bạn xem thêm mã trong "Ví voucher" nhé!`                           |
| Hết lượt global          | `VOUCHER_USAGE_LIMIT_REACHED`    | `Mã này đã hết lượt sử dụng. Bạn thử mã khác nhé!`                                              |
| Hết lượt user            | `VOUCHER_PER_USER_LIMIT_REACHED` | `Bạn đã dùng hết lượt cho mã này rồi.`                                                          |
| Chưa đủ min order        | `VOUCHER_MIN_ORDER_NOT_MET`      | `Mua thêm {remaining} nữa để dùng được mã này nhé!`                                             |
| Sai scope                | `VOUCHER_NO_ELIGIBLE_ITEMS`      | `Mã này chỉ áp dụng cho một số sản phẩm/danh mục nhất định. Giỏ hàng chưa có sản phẩm phù hợp.` |
| Sai segment              | `VOUCHER_SEGMENT_NOT_ELIGIBLE`   | `Mã này không áp dụng cho tài khoản của bạn.`                                                   |
| Cần replace              | `VOUCHER_REPLACE_REQUIRED`       | `Bạn đang dùng mã {current_code}. Thay bằng mã mới chứ?`                                        |
| Cart đổi trong lúc apply | `VOUCHER_CART_CHANGED`           | `Giỏ hàng đã thay đổi, cần tính lại. Bạn thử lại nhé!`                                          |
| Không thể tính/apply     | `VOUCHER_CALCULATION_FAILED`     | `Không thể áp dụng mã lúc này, giỏ hàng được giữ nguyên.`                                       |
| Auto-remove              | `VOUCHER_AUTO_REMOVED`           | `Mã giảm giá {code} đã được tự động xóa vì {reason}.`                                           |

## 15. Coverage matrix SRS 10.2 Voucher Tests

Mỗi dòng dưới đây phải có kết quả `PASS / FAIL / BLOCKED` sau một vòng test.
Nếu một case dùng automated test thay vì manual UI, vẫn ghi link/log vào cột
evidence.

| SRS ID       | Scenario trong SRS 10.2                                             | Kịch bản manual trong file này | Dữ liệu chính                              | Evidence bắt buộc                                                                |
| ------------ | ------------------------------------------------------------------- | ------------------------------ | ------------------------------------------ | -------------------------------------------------------------------------------- |
| `T-VOUCH-01` | Valid voucher applied, discount shown, total updated                | Mục 5.1, 8.2                   | `SAVE10`                                   | Screenshot voucher row, total trước/sau, network response success                |
| `T-VOUCH-02` | Invalid code, specific error message                                | Mục 7.1                        | Mã không tồn tại                           | Message `Mã giảm giá không đúng...`, HTTP/error envelope                         |
| `T-VOUCH-03` | Expired voucher, expiry error with date                             | Mục 7.4                        | `OLDEXP10`                                 | Message hết hạn, không có voucher row, cart total không đổi                      |
| `T-VOUCH-04` | Per-user limit exceeded, usage count error                          | Mục 7.6, 11.2                  | `ONCE10`                                   | Order đầu tạo usage log, lần sau báo hết lượt user                               |
| `T-VOUCH-05` | Cart below min_order, amount needed shown                           | Mục 7.7                        | `SHUTTLE20`                                | Message có `{remaining}`, không apply voucher                                    |
| `T-VOUCH-06` | No eligible items, category error                                   | Mục 7.8                        | `RACKET20` trên cart không có Rackets      | Message sai scope, không apply voucher                                           |
| `T-VOUCH-07` | Item promo 20% + voucher 10%, under cap                             | Mục 8.2                        | `AUTO20_RACKET` + `SAVE10`                 | Số khớp `3.420.000`, không cap explanation                                       |
| `T-VOUCH-08` | Item promo 40% + voucher 20%, voucher reduced by cap                | Mục 8.3                        | `AUTO40_RACKET`, `AUTO30_STRING`, `MEGA20` | Automatic discount giữ `1.860.000`, voucher còn `490.000`, có cap explanation    |
| `T-VOUCH-09` | Suggested item 50% promo + voucher 50%, cap prevents negative total | Mục 8.4                        | `AUTO50_SUGGESTED` + `MEGA50`              | Total không âm, automatic discount không bị giảm                                 |
| `T-VOUCH-10` | Remove voucher, totals reverted, no usage increment                 | Mục 5.2, 11.2                  | `SAVE10`                                   | Voucher row biến mất, total revert, không có `VoucherUsageLog` khi chưa checkout |
| `T-VOUCH-11` | Remove eligible items after voucher applied, voucher auto-removed   | Mục 9.1, 9.2                   | `RACKET20` hoặc `SHUTTLE20`                | Notice auto-remove, reason đúng, cart total không còn voucher                    |
| `T-VOUCH-12` | 5 failed attempts, rate limited                                     | Mục 7.10                       | 5 mã sai liên tiếp                         | HTTP `429` hoặc UI rate-limit message, mã đúng sau đó vẫn bị cooldown            |

Điều kiện hoàn tất SRS 10.2:

1. Không dòng nào trong bảng trên bị bỏ trống.
2. Tất cả notification/message phải được chụp lại hoặc ghi exact text.
3. Các case `T-VOUCH-07`, `T-VOUCH-08`, `T-VOUCH-09` phải có bảng tính số
   tiền, không chỉ screenshot UI.
4. Với `T-VOUCH-10`, phải chứng minh apply/remove chưa tạo `VoucherUsageLog`.
5. Với `T-VOUCH-11`, phải chứng minh auto-remove không xóa automatic Promotion.
6. Với `T-VOUCH-12`, phải ghi rõ cooldown thực tế và so với SRS.

## 16. Mẫu ghi nhận kết quả test

Copy block này cho từng case:

```text
Case:
Ngày test:
Tester:
Môi trường:
Promotion/Voucher code:
Cart ID:
Customer:

Các bước đã chạy:
1.
2.
3.

Kết quả kỳ vọng:

Kết quả thực tế:

Network response:
- URL:
- Status:
- code:
- customer_message:
- details:

UI evidence:
- Screenshot:
- Text hiển thị:
- Toast/notification:

DB/API evidence:
- VoucherConfig:
- VoucherUsageLog:
- Cart metadata:

SRS ID:
Kết luận: PASS / FAIL / BLOCKED
Ghi chú:
```

## 17. Checklist kết thúc một vòng manual test

- Admin tạo được native code Promotion.
- Admin bật được VoucherEngine từ Promotion Detail.
- Admin hiển thị toast enable/disable đúng.
- Automatic Promotion không bật được VoucherEngine.
- Storefront chỉ có một input discount/voucher.
- Apply voucher hợp lệ thành công.
- Remove voucher thành công.
- Replace voucher có modal xác nhận.
- Tất cả lỗi V1-V7 hiển thị tiếng Việt đúng SRS.
- Automatic Promotion áp trước voucher.
- Global cap chỉ cắt voucher.
- Auto-remove voucher có notice trên UI.
- Available vouchers modal hoạt động cho logged-in user và guest.
- Checkout thành công mới tạo `VoucherUsageLog`.
- Analytics widget phản ánh usage sau order.
- Global DiscountCapConfig save/validation hoạt động.
- Coverage matrix SRS 10.2 không còn dòng trống.
