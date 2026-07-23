# Hướng dẫn Promotion Module trong Medusa

Tài liệu này tổng hợp kiến thức nền về **Promotion Module** của Medusa, dùng để hiểu đúng năng lực có sẵn trước khi thiết kế hoặc chỉnh sửa các tính năng voucher, coupon, khuyến mãi, hoặc discount custom.

Ngày tổng hợp: 2026-07-17  
Phiên bản Medusa tham chiếu từ tài liệu: Medusa v2.x  
Lưu ý: dự án hiện tại đang dùng Medusa 2.16.0, nên trước khi triển khai cần kiểm chứng chi tiết API/workflow trong `node_modules` của dự án.

## 1. Promotion Module là gì?

Promotion Module là Commerce Module có sẵn của Medusa, chịu trách nhiệm cho domain **khuyến mãi và giảm giá**.

Một promotion có thể giảm giá trên:

- sản phẩm trong giỏ hàng;
- phương thức vận chuyển;
- toàn bộ đơn hàng.

Trong Medusa Admin, người vận hành có thể tạo và quản lý nhiều loại khuyến mãi khác nhau như:

- giảm một số tiền cố định trên sản phẩm;
- giảm một số tiền cố định trên đơn hàng;
- giảm phần trăm trên sản phẩm;
- giảm phần trăm trên đơn hàng;
- mua X tặng Y;
- miễn phí vận chuyển.

Promotion có thể được áp dụng theo hai cách:

- **Promotion code**: khách hàng nhập mã tại checkout.
- **Automatic**: hệ thống tự áp dụng nếu giỏ hàng thỏa điều kiện.

## 2. Promotion là entity giảm giá gốc

Trong Medusa, Promotion không chỉ là một mã giảm giá đơn giản. Nó là entity trung tâm để mô tả:

- mã khuyến mãi;
- trạng thái khuyến mãi;
- loại khuyến mãi;
- cách tính giảm giá;
- đối tượng được áp dụng;
- điều kiện áp dụng;
- giới hạn số lần sử dụng;
- liên kết với campaign;
- liên kết với cart, order và adjustment.

Vì vậy, khi xây dựng tính năng voucher hoặc coupon, cần tránh tạo một hệ thống mã giảm giá hoàn toàn tách rời nếu các yêu cầu nghiệp vụ có thể biểu diễn bằng Promotion Module.

## 3. Các loại Promotion

Medusa có hai loại promotion chính ở tầng module:

| Loại | Ý nghĩa |
| --- | --- |
| `standard` | Khuyến mãi tiêu chuẩn, ví dụ giảm 10% đơn hàng hoặc giảm 50.000đ cho sản phẩm. |
| `buyget` | Khuyến mãi mua X tặng Y, ví dụ mua 3 sản phẩm tặng 1 sản phẩm. |

Ở tầng Admin UI, các lựa chọn được trình bày thân thiện hơn:

| Loại trong Admin | Ý nghĩa |
| --- | --- |
| Amount off products | Giảm số tiền cố định trên các sản phẩm thỏa điều kiện. |
| Amount off order | Giảm số tiền cố định trên toàn đơn hàng. |
| Percentage off product | Giảm phần trăm trên các sản phẩm thỏa điều kiện. |
| Percentage off order | Giảm phần trăm trên toàn đơn hàng. |
| Buy X Get Y | Mua nhóm sản phẩm X để nhận nhóm sản phẩm Y miễn phí hoặc giảm giá. |
| Free Shipping | Miễn phí vận chuyển nếu thỏa điều kiện. |

## 4. Application Method

`ApplicationMethod` định nghĩa cách một promotion được áp dụng.

Ba thuộc tính quan trọng:

| Thuộc tính | Ý nghĩa | Giá trị thường gặp |
| --- | --- | --- |
| `type` | Loại giá trị giảm giá | `fixed`, `percentage` |
| `target_type` | Promotion áp dụng vào đâu | `items`, `shipping_methods`, `order` |
| `allocation` | Cách phân bổ discount | `each`, `across`, `once` |

Giải thích:

- `fixed`: giảm một số tiền cố định.
- `percentage`: giảm theo phần trăm.
- `items`: áp dụng lên line items.
- `shipping_methods`: áp dụng lên shipping methods.
- `order`: áp dụng lên toàn bộ đơn hàng.
- `each`: áp dụng cho từng item thỏa điều kiện.
- `across`: phân bổ tổng discount trên các item thỏa điều kiện.
- `once`: áp dụng một lần theo số lượng tối đa được cấu hình.

## 5. Promotion code và automatic promotion

Khi tạo promotion, Medusa cho phép chọn phương thức áp dụng:

### Promotion code

Khách hàng phải nhập mã trong checkout. Ví dụ:

```text
SAVE10
FREESHIP
RACKET20
```

Promotion chỉ được áp dụng khi mã được gửi lên cart và các điều kiện khác đều thỏa.

### Automatic

Promotion tự động áp dụng nếu cart thỏa điều kiện. Ví dụ:

- khách thuộc nhóm VIP được giảm 10%;
- đơn hàng ở region cụ thể được miễn phí vận chuyển;
- sản phẩm thuộc category cụ thể đang có sale.

## 6. Promotion Rules

Promotion Rules dùng để giới hạn khi nào promotion được phép áp dụng.

Một rule thường có:

- `attribute`: thuộc tính cần kiểm tra;
- `operator`: toán tử;
- `values`: danh sách giá trị hợp lệ.

Ví dụ:

```text
attribute: customer.groups.id
operator: in
values: [VIP]
```

Ý nghĩa: promotion chỉ áp dụng nếu customer thuộc group VIP.

## 7. Rule áp dụng ở cấp cart

Các rule cấp cart kiểm tra thông tin của giỏ hàng hoặc khách hàng.

Các attribute thường dùng:

- `customer.groups.id`
- `region.id`
- `shipping_address.country_code`
- `sales_channel_id`
- `currency_code`

Ví dụ nghiệp vụ:

- chỉ áp dụng cho khách hàng thuộc nhóm VIP;
- chỉ áp dụng cho region Việt Nam;
- chỉ áp dụng cho đơn hàng dùng VND;
- chỉ áp dụng cho sales channel cụ thể;
- chỉ áp dụng cho địa chỉ giao hàng ở một quốc gia cụ thể.

## 8. Rule theo giá trị đơn hàng

Promotion Module có thể dùng các computed totals của cart để tạo điều kiện theo giá trị đơn hàng.

Các field có thể dùng:

- `item_subtotal`
- `subtotal`
- `item_total`
- `total`

Các toán tử số học có thể dùng:

- `gte`: lớn hơn hoặc bằng;
- `lte`: nhỏ hơn hoặc bằng;
- `gt`: lớn hơn;
- `lt`: nhỏ hơn.

Ví dụ điều kiện đơn hàng tối thiểu:

```text
attribute: item_subtotal
operator: gte
values: ["500000"]
```

Ý nghĩa: promotion chỉ áp dụng nếu subtotal của item đạt ít nhất 500.000đ.

Điểm quan trọng: yêu cầu kiểu `min_order_value` thường không cần tạo field riêng trong custom module nếu có thể biểu diễn bằng Promotion Rule.

## 9. Target Rules cho sản phẩm

Khi `target_type = items`, có thể dùng `target_rules` để giới hạn promotion chỉ áp dụng cho một số item.

Các attribute item phổ biến:

- `items.product.id`
- `items.product.categories.id`
- `items.product.collection_id`
- `items.product.type_id`
- `items.product.tags.id`

Ví dụ:

```text
attribute: items.product.categories.id
operator: in
values: [category_strings]
```

Ý nghĩa: promotion chỉ áp dụng cho sản phẩm thuộc category dây cầu lông.

Lưu ý quan trọng: attribute phải có prefix `items.`. Không dùng `product_id` hoặc `product.categories.id` nếu tài liệu yêu cầu `items.product.id` hoặc `items.product.categories.id`.

## 10. Target Rules cho shipping

Khi `target_type = shipping_methods`, có thể giới hạn promotion theo shipping method.

Attribute thường dùng:

- `shipping_methods.shipping_option.shipping_option_type_id`

Ví dụ:

```text
attribute: shipping_methods.shipping_option.shipping_option_type_id
operator: in
values: [express_shipping_type]
```

Ý nghĩa: promotion chỉ áp dụng cho phương thức vận chuyển express.

## 11. Usage Limit của Promotion

Mỗi promotion có thể có `Usage Limit`.

Ý nghĩa:

- giới hạn tổng số lần promotion được sử dụng trên tất cả đơn hàng;
- nếu để trống thì promotion không bị giới hạn ở cấp promotion;
- nếu promotion thuộc campaign, nó vẫn có thể bị giới hạn bởi campaign budget;
- usage limit của promotion không thể chỉnh sửa sau khi tạo trong Admin.

Ví dụ:

```text
Usage Limit = 10
```

Promotion chỉ được dùng tối đa 10 lần trên toàn hệ thống.

## 12. Campaign là gì?

Campaign là nhóm các promotions cùng thuộc một mục tiêu marketing hoặc sales.

Campaign có thể quản lý:

- tên campaign;
- identifier;
- mô tả;
- ngày bắt đầu;
- ngày kết thúc;
- ngân sách sử dụng;
- danh sách promotions thuộc campaign.

Ví dụ:

```text
Campaign: Summer Sale 2026
Promotions:
  - SAVE10
  - FREESHIP
  - RACKET20
```

## 13. Campaign date

Campaign có thể có:

- start date;
- end date.

Ý nghĩa:

- trước start date, promotion thuộc campaign ở trạng thái scheduled;
- sau end date, promotion thuộc campaign hết hạn;
- campaign date có thể dùng để thay thế nhiều nhu cầu kiểu `valid_from` và `valid_to`.

## 14. Campaign Budget

Campaign Budget giúp giới hạn usage hoặc tổng tiền discount của các promotions trong campaign.

Có hai loại budget chính:

| Loại budget | Ý nghĩa |
| --- | --- |
| `usage` | Giới hạn số lần promotions trong campaign được sử dụng. |
| `spend` | Giới hạn tổng số tiền được discount bởi promotions trong campaign. |

Budget có:

- `limit`: giới hạn tối đa;
- `used`: số đã sử dụng.

Ví dụ:

```text
Campaign Budget Type: usage
Limit: 100
```

Tổng cộng các promotions trong campaign chỉ được dùng 100 lần.

Ví dụ khác:

```text
Campaign Budget Type: spend
Currency: VND
Limit: 10000000
```

Tổng tiền giảm giá của campaign không vượt quá 10.000.000đ.

## 15. Per-customer và per-email usage limit

Với campaign budget kiểu `usage`, Medusa Admin cho phép cấu hình `Limit usage per`.

Các lựa chọn:

| Lựa chọn | Ý nghĩa |
| --- | --- |
| Không chọn | Limit áp dụng global cho toàn campaign. |
| Customer | Mỗi customer có quota riêng theo `customer_id`. |
| Customer Email | Mỗi email có quota riêng theo email. |

Ví dụ:

```text
Budget Type: usage
Limit: 5
Limit usage per: Customer
```

Mỗi customer có thể dùng promotions trong campaign tối đa 5 lần.

Điểm quan trọng: nhu cầu kiểu `per_user_limit` đã có năng lực tương ứng trong Campaign Budget. Không nên duplicate field này trong custom module nếu không có lý do nghiệp vụ rõ ràng.

## 16. Attribute-based budget

Ở tầng module, Medusa hỗ trợ attribute-based budget bằng `use_by_attribute`.

Các attribute được hỗ trợ:

- `customer_id`
- `customer_email`

Medusa dùng `CampaignBudgetUsage` để track usage theo từng giá trị attribute.

Ví dụ:

```text
attribute: customer_id
attribute_value: cus_123
used: 2
```

Ý nghĩa: customer `cus_123` đã dùng budget này 2 lần.

## 17. Promotion status

Promotion có thể có các trạng thái:

| Trạng thái | Ý nghĩa |
| --- | --- |
| Draft | Chưa active, không dùng được. |
| Active | Đang active, có thể dùng. |
| Inactive | Đã bị tắt thủ công, không dùng được. |
| Scheduled | Campaign có start date trong tương lai. |
| Expired | Campaign đã qua end date hoặc limit đã hết. |

Khi kiểm tra một promotion có dùng được hay không, không nên chỉ nhìn một field `is_active`. Cần xét cả status, campaign date, usage limit và campaign budget.

## 18. Promotion Actions

Promotion Module có phương thức tính toán actions cần áp dụng vào cart hoặc order.

Các action quan trọng:

- `addItemAdjustment`
- `removeItemAdjustment`
- `addShippingMethodAdjustment`
- `removeShippingMethodAdjustment`
- `campaignBudgetExceeded`

`addItemAdjustment` có nghĩa là tạo một adjustment trên line item.

`addShippingMethodAdjustment` có nghĩa là tạo một adjustment trên shipping method.

`campaignBudgetExceeded` có nghĩa là campaign budget đã hết và promotion không còn dùng được.

## 19. Liên kết với Cart, Order và Adjustment

Promotion Module có sẵn liên kết với các module khác:

| Liên kết | Loại | Ý nghĩa |
| --- | --- | --- |
| Cart - Promotion | Stored many-to-many | Cart có thể có promotions được áp dụng. |
| LineItemAdjustment - Promotion | Read-only has one | Adjustment trên line item có thể truy ra promotion tạo ra nó. |
| Order - Promotion | Stored many-to-many | Order có thể lưu promotions đã áp dụng. |

Điều này rất quan trọng cho:

- hiển thị discount trên cart;
- truy vết promotion trên order;
- báo cáo promotion usage;
- tính lại totals theo cơ chế native của Medusa.

## 20. Mở rộng Promotion đúng cách

Medusa không khuyến khích sửa trực tiếp table của Commerce Module hoặc tạo quan hệ database chặt giữa module custom và module core.

Cách đúng để mở rộng Promotion:

1. Tạo custom module.
2. Tạo custom data model chứa field bổ sung.
3. Tạo module link giữa Promotion và custom model.
4. Generate và chạy migration.
5. Dùng workflow hook như `promotionsCreated` hoặc `promotionsUpdated`.
6. Dùng `additional_data` để truyền field custom khi create/update promotion.
7. Thêm validation cho `additional_data` trong `src/api/middlewares.ts`.
8. Query dữ liệu mở rộng bằng field relation, ví dụ `+custom.*`.

Mẫu khái niệm:

```text
Promotion
  id
  code
  status
  application_method
  rules
  campaign

PromotionExtension
  id
  custom_field_1
  custom_field_2

Link:
  Promotion <-> PromotionExtension
```

## 21. Admin UI của Promotion

Medusa Admin đã có khu vực Promotions.

Các màn hình chính:

- Promotions overview;
- Create Promotion;
- Manage Promotion;
- Manage Campaigns.

Khi cần thêm thông tin custom cho promotion, nên ưu tiên:

- thêm field vào flow tạo/sửa promotion;
- thêm widget vào promotion detail;
- thêm section trong Promotions;
- thêm tab hoặc filter nếu cần phân biệt loại promotion.

Không nên tạo một khu vực admin hoàn toàn tách rời nếu nghiệp vụ vẫn là quản lý khuyến mãi.

## 22. Những gì nên dùng native thay vì tự làm lại

Nên ưu tiên dùng Promotion/Campaign native cho:

- mã promotion;
- trạng thái draft/active/inactive;
- fixed amount discount;
- percentage discount;
- amount off products;
- amount off order;
- percentage off products;
- percentage off order;
- free shipping;
- buy X get Y;
- product/category/collection/type/tag scope;
- customer group/region/country/sales channel/currency condition;
- min order value qua numeric rule;
- global usage limit;
- campaign start/end date;
- campaign usage budget;
- campaign spend budget;
- per-customer usage limit;
- per-email usage limit;
- cart/order/adjustment traceability.

## 23. Khi nào cần custom module?

Cần custom module khi nghiệp vụ vượt quá năng lực native của Promotion.

Ví dụ:

- cần audit snapshot riêng rất chi tiết;
- cần logic cap đặc thù không giống campaign spend budget;
- cần contract lỗi riêng theo thứ tự fail-fast;
- cần tích hợp CRM assignment riêng;
- cần danh sách "My Vouchers" theo campaign/CRM;
- cần rate limit chống brute-force nhập mã;
- cần analytics riêng cho voucher;
- cần workflow riêng để revalidate khi cart thay đổi;
- cần response tiếng Việt theo format business yêu cầu.

Custom module nên bổ sung phần thiếu, không nên duplicate phần Promotion/Campaign đã có sẵn.

## 24. Checklist trước khi thiết kế tính năng discount mới

Trước khi thêm field hoặc table mới, kiểm tra:

- Promotion đã có field/code/status tương ứng chưa?
- ApplicationMethod đã biểu diễn được loại discount chưa?
- Promotion Rules đã biểu diễn được điều kiện chưa?
- Target Rules đã biểu diễn được product/category scope chưa?
- Campaign đã xử lý được start/end date chưa?
- Promotion `limit` hoặc Campaign Budget đã xử lý được usage limit chưa?
- `Limit usage per = Customer` đã xử lý được per-user limit chưa?
- Campaign spend budget có đủ cho giới hạn tổng tiền discount chưa?
- Cần audit riêng hay native usage tracking đủ?
- Cần message lỗi riêng hay native error đủ?
- Cần Storefront API riêng hay native promotion endpoint đủ?

## 25. Cách dùng tài liệu này khi thiết kế Voucher Engine

Khi thiết kế Voucher Engine, nên bắt đầu từ câu hỏi:

```text
Yêu cầu này đã có trong Promotion/Campaign chưa?
```

Nếu đã có, hãy map sang Promotion/Campaign.

Nếu chưa có, mới đưa vào Voucher Engine extension.

Ví dụ mapping hợp lý:

| Nhu cầu voucher | Nên map sang |
| --- | --- |
| Code | Promotion `code` |
| Active/inactive | Promotion `status` |
| Discount percentage/fixed | ApplicationMethod |
| Product/category scope | ApplicationMethod `target_rules` |
| Min order | Promotion numeric rule |
| Global usage limit | Promotion `limit` hoặc Campaign usage budget |
| Per-user limit | Campaign usage budget theo `customer_id` |
| Valid from/to | Campaign start/end date |
| Customer group | Promotion rule |
| Audit snapshot riêng | Custom module |
| Global discount cap theo SRS | Custom module |
| Brute-force protection | Custom module |
| My Vouchers từ CRM | Custom module hoặc integration layer |

## 26. Nguồn tham khảo

- Promotion Module: https://docs.medusajs.com/resources/commerce-modules/promotion
- Promotion Concepts: https://docs.medusajs.com/resources/commerce-modules/promotion/concepts
- Application Method: https://docs.medusajs.com/resources/commerce-modules/promotion/application-method
- Promotion Actions: https://docs.medusajs.com/resources/commerce-modules/promotion/actions
- Campaign: https://docs.medusajs.com/resources/commerce-modules/promotion/campaign
- Links between Promotion Module and Other Modules: https://docs.medusajs.com/resources/commerce-modules/promotion/links-to-other-modules
- Extend Promotion Data Model: https://docs.medusajs.com/resources/commerce-modules/promotion/extend
- Promotions in Medusa Admin: https://docs.medusajs.com/user-guide/promotions
- Create Promotion: https://docs.medusajs.com/user-guide/promotions/create
- Manage Promotion: https://docs.medusajs.com/user-guide/promotions/manage
- Manage Campaigns: https://docs.medusajs.com/user-guide/promotions/campaigns
