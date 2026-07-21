# Tóm tắt Voucher Engine từ SRS

Nguồn chính: `docs/SRS_SuggestiveSelling_Voucher_v1.0.pdf`  
Phạm vi tài liệu này: chỉ tóm tắt phần **Voucher at Checkout / Voucher Engine** từ SRS, bao gồm yêu cầu chức năng, user story, model, API contract, workflow, edge cases, non-functional requirements và acceptance tests.

## 1. Mục tiêu của Voucher Engine

Voucher Engine cho phép khách hàng áp dụng một mã voucher tại bước checkout và nhìn thấy tổng tiền cập nhật ngay lập tức.

Module này phải xử lý đúng các trường hợp phức tạp khi giỏ hàng có đồng thời:

- sản phẩm thường;
- sản phẩm được thêm từ Suggestive Selling;
- item-level promotions;
- voucher tại checkout;
- giới hạn tổng discount toàn hệ thống.

Mục tiêu quan trọng nhất là tính đúng thứ tự discount:

```text
Giá gốc
  -> item-level promotions áp dụng trước
  -> voucher áp dụng sau trên subtotal sau item promotion
  -> voucher-specific cap nếu có
  -> global discount cap
  -> cart total cuối cùng
```

## 2. User Stories liên quan

### US-03

Là khách hàng ở checkout, tôi muốn áp dụng voucher code và thấy tổng tiền cập nhật ngay, để biết chính xác mình tiết kiệm bao nhiêu.

### US-04

Là khách hàng, tôi muốn hệ thống tự xử lý xung đột discount, để tôi luôn nhận được deal hợp lệ tốt nhất mà không phải tự tính.

### US-05

Là admin, tôi muốn cấu hình thông số voucher qua API, để có thể chạy các chương trình khuyến mãi mà không cần thay đổi code.

## 3. Phạm vi chức năng

Voucher Engine nằm trong phạm vi SRS ở các phần:

- validate voucher;
- apply voucher;
- remove voucher;
- tính discount với stacking rules;
- xử lý conflict giữa item promotion và voucher;
- enforce global discount cap;
- auto revalidate voucher khi cart thay đổi;
- tăng usage count khi order thành công;
- tạo usage log sau khi order thành công;
- hỗ trợ admin cấu hình voucher qua API.

Các phần nằm ngoài phạm vi:

- payment processing;
- order tracking;
- delivery;
- authentication/account management;
- catalog management;
- store locator.

## 4. Khái niệm chính

| Khái niệm | Ý nghĩa |
| --- | --- |
| Voucher | Mã giảm giá áp dụng tại checkout, có rule về scope, hạn dùng, min order và usage limit. |
| Discount Cap | Giới hạn tổng discount tối đa từ mọi nguồn, tính theo phần trăm của subtotal gốc. |
| Stacking | Việc voucher kết hợp với item-level promotions hoặc các nguồn discount khác. |
| Item-level Promotion | Discount có sẵn trên từng item, áp dụng trước voucher. |
| Suggested Item | Sản phẩm được thêm vào cart từ Suggestive Selling; vẫn có thể có item-level promotion riêng. |
| VoucherUsageLog | Log audit được tạo sau khi order thành công, không tạo khi chỉ apply voucher vào cart. |

## 5. Functional Requirements

## 5.1 VOUCH-001: Apply Voucher Code

Khách hàng có thể áp dụng voucher tại checkout bằng một trong hai cách:

- nhập code thủ công;
- chọn từ danh sách "My Vouchers".

Yêu cầu:

- chỉ một voucher được active tại một thời điểm;
- nếu áp dụng voucher mới khi đã có voucher cũ, hệ thống cần xác nhận việc thay thế;
- sau khi apply thành công, cart total phải cập nhật ngay;
- voucher hiển thị như một tag có thể remove;
- tag hiển thị code và số tiền tiết kiệm.

Ví dụ từ SRS:

```text
Voucher: SHUTTLE20
Discount: 20% cho category Shuttlecocks
Min order: 200.000đ
Max discount: 100.000đ

Cart:
  - Shuttlecocks: 150.000đ
  - Racket: 4.500.000đ

Discount = 20% x 150.000 = 30.000đ
Cart total = 4.650.000 -> 4.620.000đ
```

## 5.2 VOUCH-002: Voucher Validation Rules

Voucher phải được validate theo đúng thứ tự V1 -> V8.

Nguyên tắc quan trọng:

- tất cả rule phải pass thì voucher mới được apply;
- dừng ngay ở rule đầu tiên bị fail;
- không validate tiếp các rule sau khi đã fail;
- error message phải cụ thể theo rule bị fail;
- tiếng Việt là ngôn ngữ chính, tiếng Anh là phụ.

| Rule | Điều kiện | Error message theo SRS |
| --- | --- | --- |
| V1 | Code tồn tại và active | This voucher code doesn't exist. Please check and try again. |
| V2 | Thời gian hiện tại nằm trong `valid_from` và `valid_to` | This voucher expired on {date}. Check 'My Vouchers' for active ones. |
| V3 | Global usage count chưa vượt `usage_limit` | This voucher has been fully redeemed and is no longer available. |
| V4 | Customer chưa vượt `per_user_limit` | You've already used this voucher {count}/{limit} times. |
| V5 | Cart subtotal đạt `min_order_value` | Add {remaining} more to use this voucher (minimum order: {min_order_value}). |
| V6 | Cart có ít nhất một item thuộc product/category áp dụng | This voucher only applies to {categories}. Your cart has no matching items. |
| V7 | Customer thỏa điều kiện segment nếu có | This voucher is not available for your account type. |
| V8 | Không có conflict stacking với discount hiện tại | This voucher can't be combined with your current discount. Remove it first? |

## 5.3 VOUCH-003: Discount Stacking và Conflict Resolution

Đây là rule phức tạp nhất của Voucher Engine.

Cart có thể gồm:

- regular items có item-level promotions;
- suggested items từ Suggestive Selling, cũng có thể có item-level promotions;
- voucher được áp dụng ở checkout.

Các rule bắt buộc:

| Rule | Nội dung |
| --- | --- |
| 1 | Item-level promotions luôn áp dụng trước, trên giá gốc. |
| 2 | Voucher discount áp dụng sau item-level promotions, trên post-promotion subtotal. |
| 3 | Chỉ một voucher active tại một thời điểm. |
| 4 | Percentage voucher chỉ tính trên post-promotion price của eligible items. |
| 5 | Nếu voucher có `max_discount_amount`, voucher discount bị cap bởi giá trị đó. |
| 6 | Tổng discount từ mọi nguồn không được vượt `max_discount_percentage` của original subtotal. |
| 7 | Nếu vượt global cap, chỉ giảm voucher discount, không giảm item-level promotion. |

### Ví dụ stacking happy path

```text
Cart:
  - Racket: 4.500.000đ, item promo 20% -> discount 900.000đ
  - String: 200.000đ, không item promo

Voucher:
  - SAVE10: 10% toàn cart

Tính toán:
  Original subtotal = 4.700.000đ
  Item promotion discount = 900.000đ
  Post-promotion subtotal = 3.800.000đ
  Voucher discount = 10% x 3.800.000 = 380.000đ
  Combined discount = 1.280.000đ
  Cap 50% của original subtotal = 2.350.000đ

Kết quả:
  Combined discount < cap
  Customer pays = 3.420.000đ
```

### Ví dụ cap exceeded

```text
Cart:
  - Racket: 4.500.000đ, item promo 40% -> discount 1.800.000đ
  - String: 200.000đ, item promo 30% -> discount 60.000đ

Voucher:
  - MEGA20: 20% toàn cart

Tính toán:
  Original subtotal = 4.700.000đ
  Item promotion discount = 1.860.000đ
  Post-promotion subtotal = 2.840.000đ
  Raw voucher discount = 568.000đ
  Combined discount before cap = 2.428.000đ
  Global cap 50% = 2.350.000đ
  Final voucher discount = 2.350.000 - 1.860.000 = 490.000đ

Kết quả:
  Voucher bị giảm từ 568.000đ xuống 490.000đ
  Item promotion không bị giảm
  Customer pays = 2.350.000đ
```

## 5.4 VOUCH-004: Remove Voucher

Khách hàng có thể remove voucher bằng cách nhấn nút remove trên voucher tag.

Khi remove:

- voucher discount được gỡ khỏi cart;
- cart total được tính lại;
- usage count không tăng;
- toast hiển thị thông báo voucher đã được remove.

Điểm quan trọng: usage count chỉ tăng sau khi order thành công, không tăng khi apply vào cart.

## 5.5 VOUCH-005: Auto-Invalidation on Cart Change

Khi cart thay đổi sau khi voucher đã được áp dụng, hệ thống phải revalidate voucher.

Các trường hợp cần auto-remove:

- cart subtotal giảm xuống dưới `min_order_value`;
- khách remove hết item thuộc category/product mà voucher áp dụng;
- khách remove suggested item duy nhất đủ điều kiện cho voucher.

Thông báo ví dụ:

```text
Voucher {code} removed — no eligible items remaining in cart.
```

## 6. Data Model theo SRS

## 6.1 VoucherConfig

`VoucherConfig` mô tả cấu hình voucher.

| Field | Ý nghĩa |
| --- | --- |
| `id` | ID voucher. |
| `code` | Mã voucher, unique, indexed, case-insensitive, lưu uppercase. |
| `discount_type` | `percentage` hoặc `fixed_amount`. |
| `discount_value` | Giá trị discount; percentage dùng basis points, fixed amount dùng integer money. |
| `min_order_value` | Giá trị đơn hàng tối thiểu, nullable. |
| `max_discount_amount` | Cap riêng của voucher, nullable. |
| `applicable_category_ids` | Danh sách category áp dụng, nullable. |
| `applicable_product_ids` | Danh sách product áp dụng, nullable. |
| `stackable_with_promotions` | Voucher có được stack với item-level promotions hay không. |
| `per_user_limit` | Giới hạn số lần mỗi customer được dùng. |
| `usage_limit` | Giới hạn số lần dùng global. |
| `usage_count` | Số lần đã dùng. |
| `user_segment_conditions` | Điều kiện segment, nullable. |
| `valid_from` | Thời gian bắt đầu hiệu lực. |
| `valid_to` | Thời gian hết hiệu lực. |
| `is_active` | Voucher đang active hay không. |
| `created_at` / `updated_at` | Audit timestamps. |

Lưu ý kiến trúc sau khi đọc Medusa Promotion docs:

- nhiều field trong bảng trên có thể map sang Promotion/Campaign native;
- không nên duplicate nếu Promotion Module đã là source of truth;
- custom module chỉ nên giữ phần SRS-specific chưa có native.

## 6.2 VoucherUsageLog

`VoucherUsageLog` là audit log cho lần redeem voucher thành công.

Tạo khi:

- order đã đặt thành công;
- voucher thực sự được dùng trong order.

Không tạo khi:

- customer chỉ apply voucher vào cart;
- customer remove voucher trước khi order;
- apply thất bại.

Fields theo SRS:

| Field | Ý nghĩa |
| --- | --- |
| `id` | ID log. |
| `voucher_id` | Voucher được dùng. |
| `customer_id` | Customer đã dùng voucher. |
| `order_id` | Order sử dụng voucher. |
| `discount_applied` | Discount thực tế đã áp dụng. |
| `was_capped` | Voucher có bị global cap giảm hay không. |
| `original_discount` | Discount trước khi bị global cap. |
| `applied_at` | Thời điểm áp dụng thành công. |

Yêu cầu dữ liệu:

- append-only;
- không update sau khi tạo;
- dùng để audit và tính per-user usage.

## 6.3 DiscountCapConfig

`DiscountCapConfig` là cấu hình global cap.

| Field | Ý nghĩa |
| --- | --- |
| `id` | ID config. |
| `max_discount_percentage` | Phần trăm discount tối đa, ví dụ 5000 = 50.00%. |
| `is_active` | Config đang active. |
| `updated_at` | Thời điểm cập nhật. |
| `updated_by` | Admin cập nhật. |

Global cap mặc định trong SRS: 50%.

## 7. API Contract theo SRS

## 7.1 Apply Voucher

```http
POST /store/cart/voucher
```

Request:

```json
{
  "code": "SHUTTLE20"
}
```

Response chính:

```json
{
  "success": true,
  "discount_amount": 30000,
  "discount_capped": false,
  "cap_explanation": null,
  "updated_cart_total": 4620000,
  "voucher_details": {
    "code": "SHUTTLE20",
    "type": "percentage",
    "value": 2000,
    "expires_at": "2026-07-31T23:59:59.000Z"
  }
}
```

Ghi chú: trong thiết kế Medusa route thực tế, nên chuẩn hóa theo Medusa convention:

```http
POST /store/carts/:id/voucher
```

## 7.2 Remove Voucher

```http
DELETE /store/cart/voucher
```

Response:

```json
{
  "success": true,
  "updated_cart_total": 4650000,
  "message": "Voucher removed"
}
```

Ghi chú route thực tế nên là:

```http
DELETE /store/carts/:id/voucher
```

## 7.3 My Vouchers

```http
GET /store/customer/vouchers
```

Response:

```json
{
  "vouchers": [
    {
      "code": "SHUTTLE20",
      "description": "20% off Shuttlecocks",
      "discount_type": "percentage",
      "discount_value": 2000,
      "valid_to": "2026-07-31T23:59:59.000Z",
      "min_order": 200000,
      "applicable_categories": ["Shuttlecocks"]
    }
  ]
}
```

Ghi chú route thực tế trong spec hiện tại đã được chuẩn hóa theo Medusa:

```http
GET /store/customers/me/vouchers
```

## 7.4 Admin Create Voucher

```http
POST /admin/vouchers
```

Request gồm các field của `VoucherConfig`.

Nếu không truyền code, hệ thống có thể generate code.

## 7.5 Admin Voucher Analytics

```http
GET /admin/vouchers/:id/analytics
```

Response:

```json
{
  "total_uses": 100,
  "total_discount_given": 12000000,
  "avg_order_value": 850000,
  "capped_count": 12,
  "conversion_rate": 0.18
}
```

## 8. Workflow theo SRS

## 8.1 applyVoucher Workflow

Trigger:

```text
POST /store/cart/voucher
```

Các bước:

| Step | Hành động |
| --- | --- |
| 1 | Normalize code: trim và uppercase. |
| 2 | Lookup voucher theo code. |
| 3 | Validate expiry. |
| 4 | Validate global usage và per-user usage. |
| 5 | Validate cart: min order và product/category eligibility. |
| 6 | Validate segment conditions. |
| 7 | Calculate raw voucher discount. |
| 8 | Enforce global cap. |
| 9 | Attach voucher discount vào cart và update cart total. |

## 8.2 revalidateVoucherOnCartChange Workflow

Trigger:

```text
cart.updated
```

Các bước:

| Step | Hành động |
| --- | --- |
| 1 | Kiểm tra cart có active voucher không. |
| 2 | Revalidate cart và segment rules. |
| 3a | Nếu vẫn valid, recalculate discount và global cap. |
| 3b | Nếu invalid, remove voucher khỏi cart. |
| 4 | Notify frontend để hiển thị cart state mới hoặc toast auto-remove. |

## 8.3 recordVoucherUsage Workflow

Trigger:

```text
order placed successfully
```

Các bước logic:

- xác định order có dùng voucher không;
- kiểm tra idempotency để tránh ghi log trùng;
- increment usage count;
- tạo `VoucherUsageLog`;
- đảm bảo usage chỉ tăng sau khi order thành công.

## 9. Edge Cases

| ID | Scenario | Expected Behavior | Priority |
| --- | --- | --- | --- |
| EC-01 | Suggested item có item promo 30%, customer cũng có voucher 20%, combined discount gần 50% cap. | Item promo áp dụng trước, voucher áp dụng sau, nếu vượt cap thì giảm voucher, không giảm item promo. | Must |
| EC-02 | Voucher scoped category Strings, customer remove hết strings khỏi cart. | `cart.updated` trigger revalidation, voucher auto-removed vì không còn eligible item. | Must |
| EC-03 | Voucher 50%, suggested item có item promo 50%, combined discount có thể thành 100%. | Global cap 50% chặn total discount, cart total không âm hoặc về 0 bất hợp lý. | Must |
| EC-04 | Hai request đồng thời: apply voucher và remove eligible item cuối cùng. | Dùng optimistic locking/concurrency control, sau mutation phải revalidate để không có inconsistent cart state. | Must |
| EC-06 | Customer apply voucher, remove voucher, apply lại trong cùng session. | Được phép, vì usage count chỉ tăng sau order placement. | Must |
| EC-08 | Thêm suggested item làm cart đủ điều kiện promotion tier mới. | Promotion tier mới áp dụng trước, voucher recalculate sau, global cap check lại. | Should |
| EC-10 | Customer thử nhiều voucher code random. | Rate limit 5 failed attempts / 15 phút, sau đó 429 và cooldown 30 phút. | Must |

## 10. Non-Functional Requirements

## 10.1 Performance

| Metric | Target |
| --- | --- |
| Voucher validation apply | < 400ms p95 |
| Cart total recalculation sau voucher/discount change | < 300ms |

Redis được dùng cho:

- cache voucher validation result TTL 30 giây;
- usage check nếu cần;
- brute-force rate limit.

## 10.2 Security

Yêu cầu:

- discount calculation phải chạy server-side;
- frontend chỉ hiển thị thông tin, không quyết định số tiền;
- tampering frontend không ảnh hưởng actual charge;
- voucher code brute-force phải bị rate limit;
- voucher code case-insensitive;
- voucher code tối thiểu 6 ký tự, alphanumeric;
- admin APIs cần authentication và admin role.

## 10.3 Data Integrity

Yêu cầu:

- monetary values dùng integer, không dùng floating point;
- VND: 1 = 1 VND;
- usage count tăng atomic;
- usage count chỉ tăng sau order thành công;
- cart total phải được tính lại từ source values, không patch incremental;
- `VoucherUsageLog` append-only và immutable.

## 11. Acceptance Tests theo SRS

| Test ID | Scenario | Validates | Type |
| --- | --- | --- | --- |
| T-VOUCH-01 | Valid voucher applied, discount shown, total updated. | VOUCH-001 | Integration |
| T-VOUCH-02 | Invalid code returns specific error. | VOUCH-002 V1 | Unit |
| T-VOUCH-03 | Expired voucher returns expiry error with date. | VOUCH-002 V2 | Unit |
| T-VOUCH-04 | Per-user limit exceeded. | VOUCH-002 V4 | Unit |
| T-VOUCH-05 | Cart below min order. | VOUCH-002 V5 | Unit |
| T-VOUCH-06 | No eligible items in cart. | VOUCH-002 V6 | Unit |
| T-VOUCH-07 | Item promo 20% + voucher 10%, both apply under cap. | VOUCH-003 happy path | Unit |
| T-VOUCH-08 | Item promo 40% + voucher 20%, voucher reduced by cap. | VOUCH-003 cap exceeded | Unit |
| T-VOUCH-09 | Suggested item 50% promo + voucher 50%, cap prevents invalid total. | EC-03 | Unit |
| T-VOUCH-10 | Remove voucher, totals reverted, no usage increment. | VOUCH-004 | Integration |
| T-VOUCH-11 | Remove eligible items after voucher applied, voucher auto-removed. | VOUCH-005 | Integration |
| T-VOUCH-12 | 5 failed attempts triggers rate limit. | EC-10 | Integration |

## 12. Những điểm cần đối chiếu lại với Promotion Module

Sau khi đọc Promotion Module docs, một số field trong SRS có thể đã có native trong Medusa Promotion/Campaign:

| Nhu cầu trong SRS | Có thể map sang Medusa native |
| --- | --- |
| Code | Promotion `code` |
| Active/inactive | Promotion status |
| Discount type/value | Application Method |
| Product/category scope | Target Rules |
| Min order value | Promotion numeric rule |
| Global usage limit | Promotion `limit` hoặc Campaign Budget |
| Per-user limit | Campaign Budget với `Limit usage per = Customer` |
| Valid from/to | Campaign start/end date |
| Customer segment | Promotion rules / customer groups |

Voucher Engine nên tập trung vào phần chưa có native hoặc cần behavior riêng theo SRS:

- fail-fast V1 -> V8 và response message riêng;
- global discount cap kiểu SRS, giảm voucher nhưng không giảm item promotion;
- brute-force rate limit;
- My Vouchers / CRM assignment nếu không map được vào customer groups/campaign;
- append-only audit snapshot chi tiết;
- storefront response contract;
- auto-remove messaging khi cart thay đổi;
- analytics riêng cho voucher.

## 13. Rủi ro chính

| Rủi ro | Mô tả |
| --- | --- |
| Duplicate Promotion fields | Nếu VoucherConfig tự lưu code, min order, usage limit, per-user limit... có thể lệch với Promotion/Campaign native. |
| Stacking behavior | Medusa Promotion engine có logic stacking riêng; cần kiểm chứng có thỏa Rule 11 của SRS hay không. |
| Global cap | Campaign spend budget không giống global discount cap của SRS, vì SRS yêu cầu giảm voucher để fit cap. |
| Concurrency | Apply/remove voucher và cart mutation đồng thời có thể gây inconsistent state nếu không có lock/revalidation. |
| Usage timing | SRS yêu cầu usage count chỉ tăng sau order thành công; cần xác nhận native Promotion/Campaign usage tăng ở thời điểm nào. |
| Tax behavior | Cách carrier discount ảnh hưởng đến tax, `discount_total`, adjustments và order records. |

## 14. Tóm tắt định hướng

Từ SRS, Voucher Engine cần đảm bảo:

- tính đúng voucher discount;
- giữ đúng thứ tự item promotion trước, voucher sau;
- chỉ giảm voucher khi vượt global cap;
- không tăng usage khi chỉ apply cart;
- auto revalidate khi cart thay đổi;
- audit đầy đủ sau order thành công;
- chống brute-force;
- trả lỗi rõ ràng theo đúng validation rule.

Từ Medusa Promotion docs, Voucher Engine không nên làm lại những phần Promotion/Campaign đã có. Hướng hợp lý là:

```text
Promotion/Campaign
  làm source of truth cho discount native, code, rules, campaign, usage/campaign budget

Voucher Engine
  mở rộng bằng custom module/link/workflow cho các rule và audit đặc thù từ SRS
```
