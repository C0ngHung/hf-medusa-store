# Tổng hợp kiến thức Medusa Promotion Module

Ngày đọc tài liệu: 2026-07-17  
Phạm vi: Medusa Promotion Module, Promotion Admin User Guide, Campaigns, Application Method, Module Links, Extend Promotion Data Model.

## 1. Kết luận nhanh cho Voucher Engine

Không nên xây dựng Voucher Engine như một hệ thống coupon tách rời hoàn toàn khỏi Promotion Module.

Kiến trúc nên dùng:

```text
Promotion Module
  Là entity discount gốc của Medusa:
  Mã code, trạng thái (status), phương thức manual/automatic, fixed/percentage, đối tượng (target), các quy tắc (rules), chiến dịch (campaign), giới hạn sử dụng (usage limit).

Voucher Engine custom module
  Là phần mở rộng domain voucher:
  Kiểm toán (audit), gán CRM (CRM assignment), giới hạn giảm giá toàn cục riêng của SRS (global discount cap), bảo vệ chống brute-force (brute-force protection),
  hợp đồng phản hồi (response contract), Vouchers của tôi (My Vouchers), điều phối nghiệp vụ (business orchestration) và các quy tắc đặc thù không có sẵn.
```

Nói cách khác: Voucher Engine nên **mở rộng (extend) Promotion** bằng cách sử dụng custom module kết hợp với module link, thay vì tạo subclass, tạo bảng voucher độc lập hoàn toàn, hoặc sao chép dư thừa (duplicate) những trường dữ liệu mà Promotion/Campaign đã hỗ trợ sẵn.

## 2. Promotion Module có sẵn những gì

Medusa Promotion Module là một Commerce Module chuyên dụng dùng để quản lý các chương trình giảm giá (discount). Promotion có thể thực hiện giảm giá cho:

- Các mục trong giỏ hàng (cart items)
- Phương thức vận chuyển (shipping methods)
- Toàn bộ đơn hàng (entire order)

Promotion được chia làm hai loại chính:

- `standard`: Các chương trình khuyến mãi thông thường đi kèm với hệ thống quy tắc (rules).
- `buyget`: Chương trình Mua X Tặng Y (Buy X Get Y).

Trang quản trị (Admin) của Medusa đã hỗ trợ sẵn các kiểu cấu hình promotion sau:

- Giảm số tiền cụ thể theo sản phẩm (Amount off products)
- Giảm số tiền cụ thể theo đơn hàng (Amount off order)
- Giảm theo tỷ lệ phần trăm của sản phẩm (Percentage off product)
- Giảm theo tỷ lệ phần trăm của đơn hàng (Percentage off order)
- Mua X Tặng Y (Buy X Get Y)
- Miễn phí vận chuyển (Free Shipping)

Promotion có thể được áp dụng thông qua:

- `Promotion code`: Khách hàng tự nhập mã code tại bước thanh toán (checkout).
- `Automatic`: Hệ thống tự động áp dụng nếu giỏ hàng thỏa mãn đầy đủ các điều kiện cấu hình.

Nguồn: Tổng quan Medusa Promotion, Các khái niệm (Concepts), Hướng dẫn tạo Promotion cho User.

## 3. Application Method

Thành phần `ApplicationMethod` quy định cách thức mà một chương trình giảm giá được áp dụng vào đối tượng cụ thể:

| Thuộc tính | Ý nghĩa | Giá trị có thể nhận |
| --- | --- | --- |
| `type` | Loại hình giảm giá | `fixed` (số tiền cố định), `percentage` (phần trăm) |
| `target_type` | Đối tượng áp dụng trực tiếp | `items` (sản phẩm), `shipping_methods` (vận chuyển), `order` (đơn hàng) |
| `allocation` | Cách thức phân bổ giảm giá | `each` (mỗi mục), `across` (chia đều), `once` (một lần) |

Khi thiết lập `target_type = items` hoặc `shipping_methods`, cấu hình Promotion sẽ đi kèm các `target_rules` để giới hạn chính xác sản phẩm hoặc phương thức vận chuyển nào được phép áp dụng giảm giá.

Các thuộc tính quy tắc (Rule attributes) quan trọng cần lưu ý:

- Quy tắc cấp giỏ hàng (Cart-level rules): `customer.groups.id`, `region.id`, `shipping_address.country_code`, `sales_channel_id`, `currency_code`
- Quy tắc đối tượng sản phẩm (Item target rules): `items.product.id`, `items.product.categories.id`, `items.product.collection_id`, `items.product.type_id`, `items.product.tags.id`
- Quy tắc đối tượng vận chuyển (Shipping target rules): `shipping_methods.shipping_option.shipping_option_type_id`

Lưu ý đặc biệt quan trọng: Quy tắc đối tượng của sản phẩm bắt buộc phải có tiền tố `items.`. Ví dụ, phải sử dụng chính xác cú pháp `items.product.id`, không được dùng `product_id`.

## 4. Giá trị đơn hàng tối thiểu đã có trong Promotion rules

Hệ thống quy tắc của Medusa Promotion hoàn toàn có thể sử dụng tổng giá trị tính toán của giỏ hàng (cart computed totals) để giới hạn chương trình khuyến mãi theo giá trị đơn hàng mong muốn.

Tài liệu hướng dẫn nêu rõ ngữ cảnh giỏ hàng (cart context) cung cấp sẵn các giá trị tổng tích lũy như:

- `item_subtotal`
- `subtotal`
- `item_total`
- `total`

Nhờ đó, lập trình viên có thể tạo ra các quy tắc số học (numeric rule) kết hợp với các toán tử so sánh:

- `gte` (Lớn hơn hoặc bằng)
- `lte` (Nhỏ hơn hoặc bằng)
- `gt` (Lớn hơn)
- `lt` (Nhỏ hơn)

Ví dụ về logic cấu hình giá trị đơn hàng tối thiểu (min order):

```text
rules:
  attribute: item_subtotal
  operator: gte
  values: ["100"]
```

Điều này đồng nghĩa với việc trường dữ liệu `min_order_value` trong Voucher Engine không nên là một trường dữ liệu trùng lặp bắt buộc nếu chúng ta hoàn toàn có thể ánh xạ (map) trực tiếp sang cấu hình quy tắc của Promotion. Trong trường hợp hệ thống SRS yêu cầu hiển thị thông báo lỗi tùy chỉnh dạng "Hãy mua thêm X để nhận ưu đãi...", Voucher Engine có thể chủ động đọc và đánh giá (evaluate) quy tắc này để sinh mã thông báo riêng, nhưng nguồn dữ liệu gốc (source-of-truth) vẫn nên ưu tiên lưu trữ tại Promotion rule.

## 5. Giới hạn lượt sử dụng toàn cục và giới hạn theo từng user đã được hỗ trợ sẵn

Medusa cung cấp nhiều tầng quản lý và giới hạn lượt sử dụng (usage).

### 5.1 Thuộc tính `limit` của Promotion

Mỗi Promotion sở hữu một thuộc tính `limit` nhằm giới hạn tổng số lần mà chương trình khuyến mãi đó được phép sử dụng trên phạm vi toàn bộ hệ thống đơn hàng (across all orders).

Trong giao diện Admin khi Tạo Promotion, mục `Usage Limit` quy định:

- Giới hạn tổng số lần mã khuyến mãi được sử dụng thành công trên tất cả các đơn hàng của mọi khách hàng.
- Nếu bỏ trống thì hệ thống hiểu là không giới hạn (unlimited), hoặc sẽ bị giới hạn gián tiếp bởi chiến dịch (campaign) nếu promotion đó thuộc về một campaign cụ thể.
- Thuộc tính này không thể chỉnh sửa (update) sau khi promotion đã được khởi tạo thành công.

=> Do đó, trường dữ liệu `usage_limit` và một phần logic của `usage_count` trong `VoucherConfig` cần được xem xét và đánh giá lại. Bản thân cơ chế Native Promotion/Campaign của Medusa đã tự tích hợp sẵn bộ đếm và quản lý số lượng sử dụng này.

### 5.2 Ngân sách chiến dịch (Campaign budget)

Một chiến dịch (Campaign) có thể bao gồm nhiều chương trình khuyến mãi (promotions) khác nhau cùng chia sẻ chung một mục tiêu marketing. Một Campaign cấu hình gồm có:

- Tên chiến dịch (name)
- Mã định danh (identifier)
- Mô tả (description)
- Ngày bắt đầu (start date)
- Ngày kết thúc (end date)
- Ngân sách chiến dịch (budget)

Ngân sách chiến dịch hỗ trợ hai loại giới hạn toàn cục:

- `usage`: Giới hạn dựa trên tổng số lần áp dụng thành công.
- `spend`: Giới hạn dựa trên tổng số tiền đã thực hiện giảm giá (discount amount).

Cấu hình chi tiết của Campaign budget bao gồm:

- `limit`: Hạn mức tối đa được phép.
- `used`: Số lượng hoặc số tiền thực tế đã tiêu tốn.

Ngay khi ngân sách chiến dịch vượt quá hạn mức (`limit`), toàn bộ các chương trình khuyến mãi nằm trong chiến dịch đó sẽ tự động bị vô hiệu hóa và không thể tiếp tục áp dụng.

### 5.3 Giới hạn lượt sử dụng theo từng khách hàng / từng email

Hệ thống quản lý ngân sách lượt sử dụng của Campaign cung cấp tùy chọn "Giới hạn sử dụng theo" (`Limit usage per`):

- Không chọn: Áp dụng giới hạn toàn cục (global limit).
- `Customer`: Mỗi khách hàng sẽ có một hạn mức sử dụng riêng biệt được định danh dựa trên `customer_id`.
- `Customer Email`: Mỗi địa chỉ email sẽ có một hạn mức sử dụng riêng biệt dựa trên thông tin email.

Ở cấp độ phát triển module, tính năng quản lý ngân sách dựa trên thuộc tính (attribute-based budget) sử dụng trường `use_by_attribute` với các thuộc tính hợp lệ được phép cấu hình bao gồm:

- `customer_id`
- `customer_email`

Số lượng sử dụng thực tế sẽ được theo dõi sát sao trong bảng `CampaignBudgetUsage` dựa theo cặp giá trị `attribute_value` và `used`.

=> Yêu cầu về `per_user_limit` của SRS hoàn toàn có tính năng tương đương được hỗ trợ sẵn mặc định (native equivalent) thông qua cơ chế Campaign usage budget kết hợp với thiết lập `Limit usage per = Customer`. Voucher Engine không cần thiết phải xây dựng lại logic này một cách trùng lặp, trừ phi dự án phát sinh các yêu cầu kiểm toán chuyên sâu hoặc các hành vi đặc thù khác biệt hoàn toàn với logic mặc định của hệ thống.

## 6. Ngày bắt đầu/kết thúc của Campaign thay thế hoàn hảo cho valid_from/valid_to trong nhiều trường hợp

Mỗi Campaign đều quy định rõ ràng mốc thời gian bắt đầu và kết thúc:

- Ngày bắt đầu (start date): Các chương trình khuyến mãi thuộc chiến dịch chỉ có hiệu lực và được phép sử dụng sau thời điểm này.
- Ngày kết thúc (end date): Các chương trình khuyến mãi thuộc chiến dịch sẽ tự động hết hạn ngay sau thời điểm này.

Trạng thái hệ thống (status) của một Promotion có thể chuyển đổi linh hoạt giữa:

- Bản nháp (Draft)
- Đang hoạt động (Active)
- Ngừng hoạt động (Inactive)
- Đã lên lịch (Scheduled)
- Đã hết hạn (Expired)

Các trạng thái tự động như `Scheduled` (Đã lên lịch) và `Expired` (Đã hết hạn) có thể được tính toán và quyết định trực tiếp dựa trên cấu hình thời gian thực tế của campaign (campaign date).

=> Các trường dữ liệu quy định thời hạn của SRS như `valid_from` và `valid_to` nên được ưu tiên thiết kế để ánh xạ trực tiếp sang cấu hình ngày bắt đầu/kết thúc của Campaign nếu như voucher đó hoạt động phụ thuộc vào chiến dịch (campaign-driven). Chỉ trong trường hợp một mã voucher cụ thể đòi hỏi một khung thời gian hiệu lực hoàn toàn độc lập và tách biệt hoàn toàn với chiến dịch chung, chúng ta mới thực sự cần mở rộng thêm trường dữ liệu riêng.

## 7. Các quy tắc Promotion thay thế cho nhiều trường dữ liệu xác thực voucher riêng lẻ

Tại giao diện quản trị Medusa Admin, câu hỏi điều kiện "Ai có thể sử dụng mã này?" (`Who can use this code?`) đã được tích hợp sẵn các tiêu chí sàng lọc mạnh mẽ:

- Nhóm khách hàng (Customer Group)
- Vùng địa lý (Region)
- Quốc gia (Country)
- Kênh bán hàng (Sales Channel)
- Mã tiền tệ (Currency Code)

Các quy tắc giới hạn phạm vi áp dụng cho từng mặt hàng (Item scope rules) bao gồm:

- Sản phẩm cụ thể (Product)
- Danh mục sản phẩm (Product Category)
- Bộ sưu tập sản phẩm (Product Collection)
- Loại sản phẩm (Product Type)
- Thẻ sản phẩm (Product Tag)

Các quy tắc giới hạn phạm vi áp dụng cho phương thức vận chuyển (Shipping scope rules) bao gồm:

- Loại tùy chọn vận chuyển (Shipping Option Type)

=> Các trường dữ liệu cấu hình cũ trong `VoucherConfig` như `applicable_product_ids`, `applicable_category_ids`, `user_segment_conditions`, và `min_order_value` cần được xem xét kỹ lưỡng để chuyển hướng ánh xạ sang hệ thống Promotion rules hoặc `ApplicationMethod` target_rules thay vì tự xây dựng và duy trì các trường dữ liệu trùng lặp.

## 8. Các hành động Promotion và khả năng tích hợp chặt chẽ vào giỏ hàng/đơn hàng

Promotion Module sở hữu phương thức cốt lõi `computeActions` để tính toán chính xác các hành động cần thiết hành xử lên thực thể giỏ hàng hoặc đơn hàng.

Các hành động hệ thống (Actions) quan trọng bao gồm:

- `addItemAdjustment`: Thêm điều chỉnh giảm giá cho sản phẩm.
- `removeItemAdjustment`: Loại bỏ điều chỉnh giảm giá của sản phẩm.
- `addShippingMethodAdjustment`: Thêm điều chỉnh giảm giá cho phương thức vận chuyển.
- `removeShippingMethodAdjustment`: Loại bỏ điều chỉnh giảm giá của phương thức vận chuyển.
- `campaignBudgetExceeded`: Thông báo trạng thái ngân sách chiến dịch đã vượt quá giới hạn cho phép.

Hành động `addItemAdjustment` sẽ tự động khởi tạo bản ghi `LineItemAdjustment` trong Cart Module hoặc bản ghi `OrderLineItemAdjustment` nằm trong Order Module.

Promotion Module đã được thiết lập sẵn các liên kết dữ liệu mặc định (links) bao gồm:

- Giỏ hàng <-> Khuyến mãi (Cart <-> Promotion): Được lưu trữ dưới dạng quan hệ nhiều-nhiều (many-to-many).
- Điều chỉnh sản phẩm -> Khuyến mãi (LineItemAdjustment -> Promotion): Mối quan hệ đọc duy nhất (read-only has one).
- Đơn hàng <-> Khuyến mãi (Order <-> Promotion): Được lưu trữ dưới dạng quan hệ nhiều-nhiều (many-to-many).

=> Ngay cả khả năng truy vết, kiểm toán dòng dữ liệu của giỏ hàng/đơn hàng/các khoản điều chỉnh (cart/order/adjustment traceability) sẽ hoạt động chuẩn xác và đồng bộ theo đúng mô hình thiết kế chuẩn của Medusa nếu mã voucher được định nghĩa dựa trên cơ chế Native Promotion gốc, tối ưu hơn so với việc tự thiết kế một thực thể mang thông tin giảm giá độc lập (discount carrier).

## 9. Cách thức mở rộng Promotion tuân thủ theo tiêu chuẩn của Medusa

Tài liệu chính thức của Medusa hướng dẫn quy trình mở rộng mô hình dữ liệu (extend Promotion data model) chuẩn chỉnh như sau:

1. Khởi tạo một custom data model riêng biệt nằm bên trong custom module.
2. Định nghĩa mối liên kết module (module link) giữa điểm nối mặc định `PromotionModule.linkable.promotion` và custom model vừa tạo.
3. Thực hiện tạo mới và chạy các tệp dịch chuyển cơ sở dữ liệu (generate/run migrations).
4. Sử dụng và lắng nghe sự kiện thông qua hook `promotionsCreated` được cung cấp bởi `createPromotionsWorkflow`.
5. Tận dụng thuộc tính `additional_data` trong các cổng Admin API create/update promotion để truyền tải mượt mà các trường tùy chỉnh (custom fields).
6. Bổ sung thêm các logic kiểm tra, xác thực dữ liệu (validation) cho thuộc tính `additional_data` tại tệp cấu hình `src/api/middlewares.ts`.
7. Thực hiện truy vấn và lấy về các trường tùy chỉnh đã liên kết thông qua cú pháp chỉ định trường `fields=+custom.*` hoặc thông qua công cụ Query `promotion` với quan hệ (relation) custom tương ứng.

Tài liệu cũng chỉ rõ rằng mô hình phát triển (pattern) tương tự hoàn toàn có thể áp dụng thành công cho thực thể chiến dịch `Campaign`.

=> Định hướng kiến trúc chuẩn: Voucher Engine nên được thiết kế dưới dạng một custom extension model được liên kết trực tiếp (linked) với Promotion, tuyệt đối không nên đóng vai trò là một owner độc lập tự quản lý các thông tin cốt lõi như mã code, trạng thái giảm giá, số lượng sử dụng hay thời gian hiệu lực nếu như native Promotion đã hỗ trợ đầy đủ.

## 10. Giao diện quản trị Admin UX nên được tích hợp trực tiếp trong phân hệ Promotions

Hệ thống quản trị mặc định Medusa Admin đã quy hoạch sẵn khu vực chức năng chuyên biệt:

```text
Promotions (Các chương trình khuyến mãi)
  Overview (Tổng quan)
  Create Promotion (Tạo khuyến mãi)
  Manage Promotion (Quản lý khuyến mãi)
  Manage Campaigns (Quản lý chiến dịch)
```

Vì bản chất cốt lõi của voucher là một dạng giảm giá thông qua mã khuyến mãi (promotion-code discount), màn hình điều khiển (dashboard) của Voucher nên được quy hoạch gọn gàng nằm ngay trong phân hệ Promotions:

- Bổ sung thêm tab hiển thị hoặc bộ lọc phân loại chuyên biệt mang tên `Vouchers`.
- Hoặc thực hiện thêm mới một kiểu/kiểu phụ khuyến mãi (promotion type/subtype) mang định danh `Voucher`.
- Hoặc linh hoạt tích hợp thêm các thẻ giao diện tùy chỉnh / các thành phần cấu hình trường dữ liệu voucher (widget/section voucher fields) ngay trên trang tạo mới hoặc trang chi tiết của Promotion.

Hạn chế tối đa việc tạo riêng một thanh điều hướng bên (sidebar) độc lập mang tên "Voucher Engine" nếu góc nhìn vận hành thực tế của doanh nghiệp luôn coi voucher là một nhánh con nằm trong các chương trình khuyến mãi tổng thể.

## 11. Ảnh hưởng cụ thể tới thiết kế hệ thống Voucher Engine hiện tại

Chúng ta cần giữ lại và tập trung phát triển custom Voucher Engine cho những bài toán nghiệp vụ chuyên sâu mà tính năng mặc định (native) của Medusa chưa bao phủ hoặc chưa hỗ trợ:

- Bảng ghi chép lịch sử `VoucherUsageLog` để phục vụ công tác kiểm toán (audit) chuyên sâu theo chuẩn SRS, đáp ứng nhu cầu lưu giữ các snapshot dữ liệu đầy đủ và chi tiết hơn nhiều so với bảng theo dõi budget usage mặc định.
- Cơ chế áp dụng hạn mức giảm giá toàn cục (global discount cap) theo quy định của SRS: Đảm bảo tổng số tiền giảm giá của sản phẩm (item promotion) + mã voucher không được vượt quá X% giá trị subtotal ban đầu, và thực hiện giảm trừ ưu tiên vào phần giá trị của voucher.
- Thiết lập cơ chế kiểm tra nhanh và trả về phản hồi lỗi ngay lập tức (fail-fast V1-V8 response contract) dựa theo thứ tự ưu tiên và các câu thông báo lỗi đặc thù theo yêu cầu từ nghiệp vụ.
- Xây dựng lớp bảo mật ngăn chặn tấn công dò mã (brute-force protection) đối với các hành vi cố tình thử nhiều mã code liên tục trong thời gian ngắn.
- Tính năng "Vouchers của tôi" (My Vouchers) hoặc cơ chế tự động gán phân hệ khách hàng từ hệ thống CRM (CRM assignment) nếu các logic này không thể ánh xạ một cách đơn giản vào nhóm khách hàng (customer groups) hay các thuộc tính chiến dịch (campaign attributes).
- Thiết kế một cấu trúc phản hồi API storefront riêng biệt (storefront API envelope): Hỗ trợ ngôn ngữ tiếng Việt có dấu cho các thông báo, xử lý thay thế xác nhận, hoặc thông báo tự động gỡ bỏ mã giảm giá khi không còn thỏa mãn điều kiện.
- Xây dựng hệ thống báo cáo số liệu phân tích chuyên sâu (analytics) dành riêng cho cấu hình voucher.

Đồng thời, thực hiện chuyển đổi hoặc ánh xạ (map) trực tiếp sang các tính năng gốc native Promotion/Campaign đối với các thành phần sau:

- Trường mã code `code` -> Ánh xạ sang thuộc tính `code` của Promotion.
- Cấu hình loại và giá trị giảm giá `discount_type` / `discount_value` -> Ánh xạ sang thuộc tính `type` / `value` nằm trong `ApplicationMethod`.
- Phạm vi áp dụng theo sản phẩm/danh mục (product/category scope) -> Ánh xạ sang thuộc tính `target_rules` của `ApplicationMethod`.
- Giá trị đơn hàng tối thiểu (min order) -> Ánh xạ thành một quy tắc Promotion rule dựa trên `item_subtotal`/`subtotal` kết hợp với toán tử so sánh lớn hơn hoặc bằng `gte`.
- Giới hạn lượt sử dụng toàn cục (global usage limit) -> Ánh xạ sang thuộc tính `limit` của Promotion hoặc cấu hình ngân sách sử dụng của Campaign (Campaign usage budget).
- Giới hạn lượt sử dụng trên từng user (per-user limit) -> Tận dụng cấu hình `use_by_attribute` / `Limit usage per = Customer` trong Campaign usage budget.
- Khung thời gian hiệu lực `valid_from` / `valid_to` -> Ánh xạ sang mốc thời gian ngày bắt đầu/kết thúc của Campaign (Campaign start/end date) nếu hoạt động theo mô hình phụ thuộc chiến dịch.
- Các điều kiện ràng buộc về nhóm khách hàng / vùng địa lý / quốc gia / kênh bán hàng / tiền tệ -> Ánh xạ toàn bộ sang hệ thống quy tắc mặc định Promotion rules.

## 12. Khuyến nghị mô hình kiến trúc mới

```text
Promotion (Thực thể gốc mặc định)
  Đóng vai trò là nguồn dữ liệu gốc (source of truth) quản lý cho:
  Mã code, trạng thái hoạt động (active/draft/inactive status), phương thức giảm giá, đối tượng áp dụng, quy tắc phạm vi,
  giới hạn sử dụng mặc định, thời gian chiến dịch, ngân sách chiến dịch, hạn mức ngân sách theo từng khách hàng.

VoucherExtension / VoucherConfig (Mô hình mở rộng tùy chỉnh)
  Được thiết lập liên kết quan hệ 1-1 trực tiếp với thực thể Promotion, chỉ tập trung lưu trữ các trường dữ liệu đặc thù của SRS:
  Loại hiển thị của voucher (voucher_display_type), thông tin định danh gán CRM (CRM assignment metadata), mã chính sách hạn mức toàn cục (global_cap_policy_id),
  cấu hình ghi chép kiểm toán và thông báo lỗi (audit/message config), có thể cân nhắc lưu trữ trường số tiền giảm giá tối đa (max_discount_amount) nếu như tính năng mặc định không đáp ứng được trọn vẹn yêu cầu nghiệp vụ,
  các thông tin siêu dữ liệu (metadata) hỗ trợ hiển thị cho tính năng "Vouchers của tôi" trên giao diện Storefront.

VoucherUsageLog (Nhật ký sử dụng tùy chỉnh)
  Thành phần tùy chọn nhưng rất khuyến khích triển khai nhằm đáp ứng trọn vẹn yêu cầu của SRS về việc lưu trữ các bản ghi snapshot kiểm toán dưới dạng append-only chi tiết.

DiscountCapConfig (Cấu hình hạn mức giảm giá toàn cục)
  Thiết kế dưới dạng một custom singleton hoặc cấu hình global config, bởi vì cơ chế campaign spend budget mặc định của Medusa không có sự đồng nhất hoàn toàn với cách thức hoạt động của chính sách hạn mức global cap từ SRS.
```

## 13. Các hạng mục cần tiếp tục kiểm chứng thực tế trong mã nguồn Medusa 2.16 của dự án

Các tài liệu hướng dẫn hiện hành phần lớn đang được biên soạn dựa trên phiên bản Medusa v2.17.2, trong khi hệ thống của dự án hiện tại đang vận hành ở phiên bản Medusa 2.16.0. Chính vì vậy, trước khi tiến hành chỉnh sửa hoặc bắt tay vào triển khai thực tế, lập trình viên bắt buộc phải kiểm tra và xác thực lại trong thư mục `node_modules` của chính dự án các điểm mấu chốt sau:

- Cấu trúc dữ liệu đầu vào và đầu ra chính xác (exact input/output) của quy trình `createPromotionsWorkflow`.
- Hình dáng cấu trúc dữ liệu chuẩn (exact shape) của tính năng campaign budget cũng như cơ chế quản lý ngân sách theo thuộc tính (attribute-based budget) trên phiên bản 2.16.0.
- Khả năng hỗ trợ định tuyến giao diện (Admin UI route) cũng như bộ công cụ SDK đối với thuộc tính dữ liệu mở rộng `additional_data`.
- Danh sách các thuộc tính quy tắc thực tế (actual rule attributes) được hệ thống hỗ trợ sẵn trong phiên bản 2.16.0.
- Cơ chế hoạt động của `updateCartPromotionsWorkflow` khi thực hiện tính toán cộng dồn hoặc sắp xếp thứ tự áp dụng (stacking/order) đối với các trường hợp giỏ hàng sử dụng nhiều chương trình khuyến mãi cùng lúc (multiple promotions).
- Xác định rõ ràng thời điểm (chính xác tại bước áp dụng vào giỏ hàng hay đợi đến khi hoàn thành đơn hàng) mà bộ đếm lượt sử dụng mặc định của Promotion hoặc số tiền tiêu tốn của campaign budget thực hiện tăng giá trị `used`.

## 14. Nguồn tài liệu tham khảo

- Tổng quan về Promotion Module: https://docs.medusajs.com/resources/commerce-modules/promotion
- Các khái niệm cốt lõi của Promotion: https://docs.medusajs.com/resources/commerce-modules/promotion/concepts
- Phương thức áp dụng Application Method: https://docs.medusajs.com/resources/commerce-modules/promotion/application-method
- Các hành động trong hệ thống Promotion Actions: https://docs.medusajs.com/resources/commerce-modules/promotion/actions
- Tài liệu kỹ thuật về Campaign module: https://docs.medusajs.com/resources/commerce-modules/promotion/campaign
- Mối liên kết giữa Promotion và các module khác: https://docs.medusajs.com/resources/commerce-modules/promotion/links-to-other-modules
- Hướng dẫn chi tiết cách mở rộng mô hình dữ liệu Promotion: https://docs.medusajs.com/resources/commerce-modules/promotion/extend
- Hướng dẫn dành cho người dùng Admin - Phân hệ Promotions: https://docs.medusajs.com/user-guide/promotions
- Hướng dẫn dành cho người dùng Admin - Quy trình tạo mới Promotion: https://docs.medusajs.com/user-guide/promotions/create
- Hướng dẫn dành cho người dùng Admin - Quy trình quản lý Promotion: https://docs.medusajs.com/user-guide/promotions/manage
- Hướng dẫn dành cho người dùng Admin - Quản lý các chiến dịch Campaigns: https://docs.medusajs.com/user-guide/promotions/campaigns