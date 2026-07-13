# TÀI LIỆU PHÂN TÍCH CHUYÊN SÂU SRS
## Client E-Commerce Application — Badminton Equipment & Accessories Store
### Feature Set: Suggestive Selling + Voucher at Checkout (MedusaJS v2)

**Phiên bản phân tích:** 1.0 | **Ngày:** 07/07/2026
**Nguồn:** SRS v1.0 — Suggestive Selling + Voucher at Checkout
**Vai trò phân tích:** Senior Solution Architect · Senior Business Analyst · Technical Lead · Product Manager

---

## ⚠️ GHI CHÚ QUAN TRỌNG VỀ PHẠM VI TÀI LIỆU NGUỒN

Trước khi đi vào phân tích, cần khẳng định một điểm mấu chốt để tránh hiểu sai: **SRS này KHÔNG phải là SRS của toàn bộ hệ thống e-commerce**, mà chỉ đặc tả **2 feature liên kết chặt chẽ**:

1. **Suggestive Selling** (gợi ý bán kèm/bán thêm)
2. **Voucher at Checkout** (áp dụng voucher tại bước thanh toán)

SRS liệt kê rõ trong mục 1.2 rằng các phần sau **nằm ngoài phạm vi**: quản lý catalog & duyệt menu, xác thực người dùng & quản lý tài khoản, xử lý thanh toán (MoMo, Payoo, COD), theo dõi đơn hàng & giao hàng, store locator & quản lý địa chỉ.

Do yêu cầu phân tích của bạn (template 14 module: Authentication, Product, Review, Search, Notification...) rộng hơn phạm vi SRS, tài liệu này sẽ:

- **Phân tích đầy đủ, chi tiết** những gì SRS mô tả (2 feature + các điểm tích hợp với Cart/Product/Promotion của MedusaJS).
- **Đánh dấu rõ ràng "❌ Không có trong SRS"** với những module SRS không đề cập — tuân thủ nguyên tắc *"Không được giả định khi tài liệu chưa mô tả rõ"*.
- Đưa các phần thiếu vào danh sách **cần clarify với khách hàng** (Phần 11).

---

# 1. EXECUTIVE SUMMARY

## 1.1 Bối cảnh

Đây là dự án xây dựng 2 tính năng tăng trưởng doanh thu cho một cửa hàng thương mại điện tử bán thiết bị & phụ kiện cầu lông, nền tảng **MedusaJS v2**, thị trường Việt Nam (đơn vị tiền VND, i18n tiếng Việt là ngôn ngữ chính, tiếng Anh phụ).

Hai feature này **phụ thuộc lẫn nhau về mặt nghiệp vụ**: Suggestive Selling đẩy thêm sản phẩm (có thể đang có khuyến mãi riêng) vào giỏ hàng, còn Voucher Engine phải tính đúng giảm giá khi giỏ hàng trộn lẫn sản phẩm thường + sản phẩm gợi ý + khuyến mãi item-level + voucher — bao gồm **giải quyết xung đột giảm giá (conflict resolution)** và **trần giảm giá tổng (discount cap, mặc định 50%)**.

## 1.2 Giá trị kinh doanh

- **Tăng giá trị đơn hàng trung bình (AOV):** gợi ý sản phẩm bổ trợ ngay tại trang chi tiết ("Complete Your Setup") và trang giỏ hàng ("You Might Also Need"), có cơ chế đẩy giỏ hàng vượt ngưỡng freeship (rule CR-02).
- **Tăng tỷ lệ chuyển đổi tại checkout:** voucher áp dụng tức thì, thông báo lỗi cụ thể theo từng điều kiện fail, tự động chọn phương án giảm giá hợp lệ tốt nhất (US-04).
- **Bảo vệ biên lợi nhuận:** trần giảm giá tổng 50% (cấu hình được) chặn kịch bản chồng khuyến mãi làm đơn hàng về 0đ hoặc âm (EC-03).
- **Vận hành linh hoạt không cần code:** admin cấu hình suggestion rule & voucher qua API (US-05), CRM gán voucher theo campaign.
- **Đo lường được:** analytics đầy đủ vòng đời gợi ý (impression → tap → add_to_cart → dismiss) và analytics voucher (tổng lượt dùng, tổng giảm giá, tỷ lệ bị cap, conversion rate).

## 1.3 Điểm phức tạp cao nhất (theo chính SRS thừa nhận)

**VOUCH-003 — Discount Stacking & Conflict Resolution** được SRS gọi là *"business rule phức tạp nhất hệ thống"*. Chuỗi tính toán bắt buộc:

```
Giá gốc → (1) Item-level promotions (áp trước, trên giá gốc, KHÔNG bao giờ bị cắt giảm)
        → (2) Voucher (áp sau, trên subtotal hậu-khuyến-mãi, chỉ trên item đủ điều kiện)
        → (3) Cap riêng của voucher (max_discount_amount)
        → (4) Cap toàn cục: tổng mọi nguồn giảm ≤ max_discount_percentage × subtotal GỐC
              → nếu vượt: CHỈ cắt phần voucher, trả flag discount_capped=true + giải thích
```

## 1.4 Khuyến nghị tổng thể

| Hạng mục | Khuyến nghị |
|---|---|
| Kiến trúc | 2 custom module MedusaJS (`SuggestiveSelling`, `VoucherEngine` extends Promotion), giao tiếp qua Link Module + event subscriber, **không** ràng buộc DB trực tiếp — đúng như SRS 2.1 |
| Ưu tiên triển khai | VoucherEngine trước (giá trị nghiệp vụ độc lập, testable thuần bằng unit test), SuggestiveSelling sau, tích hợp stacking cuối |
| Rủi ro lớn nhất | Logic cap 50% + concurrency (EC-04), mâu thuẫn tiềm ẩn giữa cache theo product và filter theo customer (chi tiết Phần 11) |
| Ước lượng | ~8–10 tuần cho 1 team 3–4 dev (backend-heavy), chi tiết Phần 9–10 |

---

# 2. REQUIREMENT ANALYSIS

## 2.1 Mục tiêu hệ thống (theo SRS §1.1, §2.2)

**Bài toán giải quyết:**
- Khách xem/mua 1 sản phẩm thường thiếu đồ đi kèm (vợt cần cước, quấn cán, bao vợt) → hệ thống chủ động gợi ý để hoàn thiện "setup" trong 1 lần mua (US-01, US-02).
- Khách có voucher nhưng sợ tính sai/không biết tiết kiệm bao nhiêu → hiển thị tổng tiền cập nhật tức thì (US-03).
- Khi nhiều nguồn giảm giá chồng nhau, khách không phải tự tính — hệ thống tự giải quyết xung đột và luôn cho deal hợp lệ tốt nhất (US-04).
- Admin chạy promotion targeted mà không cần thay đổi code (US-05).

**Đối tượng sử dụng:**
- **Customer** (khách mua hàng): tương tác với gợi ý và voucher trên storefront.
- **Admin**: cấu hình rule/voucher qua API (SRS ghi rõ *"API only"* — không có admin UI trong scope).
- **Hệ thống CRM** (ngoại vi, được nhắc đến ở VOUCH-001): gán voucher vào tài khoản khách theo campaign — cơ chế tích hợp cụ thể **không được mô tả** trong SRS.

## 2.2 Phạm vi dự án (theo SRS §1.2, trích nguyên văn cấu trúc)

**In Scope:**
1. Suggestion rules cấp product và cấp cart
2. Hiển thị, tương tác và analytics tracking cho gợi ý
3. Validate, apply, remove voucher tại checkout
4. Tính giảm giá với stacking rules và cap enforcement
5. Conflict resolution: giảm giá từ gợi ý vs giảm giá voucher
6. Pattern triển khai MedusaJS Module/Workflow/Subscriber
7. CMS/admin quản lý rule — **chỉ API**

**Out of Scope:**
1. Quản lý catalog sản phẩm & duyệt menu
2. Xác thực người dùng & quản lý tài khoản
3. Xử lý thanh toán (MoMo, Payoo, COD)
4. Theo dõi đơn hàng & giao hàng
5. Store locator & quản lý địa chỉ

## 2.3 Các Actor

### Actor 1 — Customer (Khách hàng)

| Khía cạnh | Nội dung |
|---|---|
| Vai trò | Người mua trên storefront |
| Quyền hạn | Chỉ truy cập dữ liệu của chính mình (SEC-04: *"Customer-facing APIs are scoped to the authenticated customer's data only"*) |
| Chức năng | Xem gợi ý ở trang product detail (SUGG-001) và cart (SUGG-004); dismiss gợi ý (SUGG-002c); one-tap add to cart kèm Undo (SUGG-003); nhập/chọn voucher từ "My Vouchers" (VOUCH-001); gỡ voucher (VOUCH-004); nhận thông báo khi voucher bị tự động gỡ (VOUCH-005) |
| Ghi chú | SRS có cả `customer_id` lẫn `session_id` trong SuggestionEvent → ngầm hỗ trợ guest session, nhưng vì Authentication out-of-scope, **hành vi với guest chưa được đặc tả rõ** (xem Phần 11) |

### Actor 2 — Admin

| Khía cạnh | Nội dung |
|---|---|
| Vai trò | Người vận hành promotion/merchandising |
| Quyền hạn | Yêu cầu authentication + admin role (SEC-04) |
| Chức năng | CRUD suggestion rule (POST/PUT/DELETE `/admin/suggestion-rules`); tạo voucher (POST `/admin/vouchers`); xem analytics voucher (GET `/admin/vouchers/:id/analytics`); quản lý DiscountCapConfig (SRS §5.2: *"Managed via admin API"*, endpoint cụ thể **không được liệt kê** — cần bổ sung) |

### Actor 3 — Hệ thống (System actors)

| Actor | Vai trò theo SRS |
|---|---|
| **cart.updated subscriber** | Kích hoạt re-evaluate suggestions (SUGG-005) và revalidate voucher (VOUCH-005, workflow §7.3) |
| **Redis** | Cache suggestion (TTL 5 phút), cache kết quả validate voucher (TTL 30 giây), stock availability; atomic usage check (INT-02) |
| **CRM (external)** | Gán voucher cho khách theo campaign (VOUCH-001b) — chi tiết tích hợp không có trong SRS |
| **Security monitoring** | Nhận log IP + customer_id khi brute-force voucher code (EC-10) |

## 2.4 Functional Requirements — phân nhóm theo module

> **Lưu ý phạm vi:** Theo template yêu cầu, các module dưới đây được rà soát toàn bộ. Module nào SRS không đặc tả sẽ đánh dấu ❌ và không suy diễn thêm.

| Module (template) | Trạng thái trong SRS |
|---|---|
| Authentication | ❌ Out of scope (§1.2). Chỉ có ràng buộc SEC-04 rằng API admin cần auth + role |
| Product | ⚠️ Chỉ ở mức "đọc" qua Product Module built-in của Medusa (nguồn dữ liệu cho gợi ý). Quản lý catalog out of scope |
| Cart | ✅ Được mở rộng (extended): nhận event từ 2 custom module, recalculate giá khi voucher/suggestion thay đổi. Chi tiết bên dưới |
| Checkout | ✅ Chỉ phần voucher (VOUCH-001→005) |
| Order | ⚠️ Chỉ chạm tới ở điểm: usage_count tăng khi đặt hàng thành công; VoucherUsageLog tạo tại thời điểm đặt hàng. Order tracking out of scope |
| Customer | ⚠️ Chỉ dùng làm điều kiện: per_user_limit, segment conditions (V7), lịch sử mua 30 ngày (SUGG-002d), "My Vouchers" |
| Admin | ✅ API quản lý rule + voucher + analytics (không có UI) |
| Inventory | ⚠️ Chỉ dùng để filter gợi ý hết hàng (SUGG-002b) và re-check stock khi add (EC-07). Quản lý tồn kho out of scope |
| Payment | ❌ Out of scope (MoMo, Payoo, COD được nêu tên nhưng loại khỏi phạm vi) |
| Promotion | ✅ VoucherEngine **extends** Promotion Module built-in; item-level promotion được coi là "đã tồn tại" và là input cho stacking logic |
| Review | ❌ Không xuất hiện trong SRS |
| Search | ❌ Không xuất hiện trong SRS |
| Notification | ⚠️ Chỉ ở mức toast/push cart state tới frontend (SUGG-003, VOUCH-004, workflow §7.3 bước 4). Không có email/SMS/notification center |
| Reporting | ✅ Một phần: SuggestionEvent analytics (SUGG-006) + voucher analytics endpoint |

### 2.4.1 Module SUGGESTIVE SELLING

---

#### [SUGG-001] Complementary Product Recommendations — Must Have

| Khía cạnh | Nội dung |
|---|---|
| **Mục tiêu** | Trang product detail hiển thị section "Complete Your Setup" với 3–5 sản phẩm bổ trợ |
| **Input** | `product_id` đang xem, `store_id` (filter tồn kho), cấu hình rule của admin, dữ liệu bán chạy theo category |
| **Output** | Danh sách 3–5 sản phẩm: ảnh, tên, giá, nút "Add to Cart" one-tap, sắp theo `display_order` |
| **Business Rules** | Đánh giá theo 3 tier ưu tiên: **Tier 1 — Manual Curation** (admin link sản phẩm→sản phẩm, luôn hiện trước); **Tier 2 — Category Complement** (nếu Tier 1 < 3 kết quả, bù bằng top-selling từ category bổ trợ: Rackets→Strings/Grips/Bags; Shoes→Socks/Insoles; Shuttlecocks→Tubes bulk); **Tier 3 — Behavioral** (Phase 2, ngoài scope release đầu nhưng data model phải hỗ trợ sẵn) |
| **Validation** | Kết quả cuối phải qua bộ lọc SUGG-002 |
| **Edge Cases** | Chỉ có 1 manual suggestion → hiện 1 manual trước + 2–4 category complement bù vào (AC thứ 2); admin deactivate rule khi cache còn sống → chấp nhận stale tối đa 5 phút (EC-09) |

#### [SUGG-002] Suggestion Filtering Rules — Must Have

| Khía cạnh | Nội dung |
|---|---|
| **Mục tiêu** | Loại sản phẩm gợi ý không phù hợp khỏi hiển thị |
| **Input** | Danh sách candidate, giỏ hàng hiện tại, tồn kho tại store được gán, danh sách dismissed trong session, lịch sử mua 30 ngày |
| **Output** | Danh sách đã lọc; slot trống được bù bằng sản phẩm eligible kế tiếp (Tier 1 rồi Tier 2) |
| **Business Rules** | Loại nếu **BẤT KỲ** điều nào đúng: (a) đã có trong cart; (b) hết hàng tại store được gán của khách; (c) khách đã dismiss gợi ý này trong session hiện tại (tap X / swipe); (d) khách đã mua sản phẩm này trong 30 ngày gần nhất |
| **Edge Cases** | Khái niệm "assigned store" không được định nghĩa ở đâu khác trong SRS (store locator out of scope) → cần clarify; nơi lưu trạng thái dismiss (client hay server) không được chỉ định |

#### [SUGG-003] One-Tap Add from Suggestion — Must Have

| Khía cạnh | Nội dung |
|---|---|
| **Mục tiêu** | Thêm sản phẩm gợi ý vào giỏ trong 1 chạm, không rời ngữ cảnh |
| **Input** | Tap nút "Add to Cart" trên card gợi ý |
| **Output** | Variant mặc định (hoặc duy nhất) vào cart với quantity 1; card chuyển trạng thái ✓ "Added" trong 3 giây rồi trở lại bình thường; toast `"{Product Name} added to cart"` kèm nút **Undo** hiệu lực 3 giây |
| **Business Rules** | Nhiều variant + không có default → mở **variant selector dạng compact** (bottom sheet trên mobile) thay vì điều hướng sang product detail |
| **Validation** | Re-check stock tại thời điểm thực thi (không tin cache) — EC-07 |
| **Edge Cases** | Hết hàng giữa lúc render và lúc tap → API trả **409** với message *"{Product} just went out of stock. We've updated your suggestions."* và frontend refresh section gợi ý |

#### [SUGG-004] Cart-Based Cross-Sell Recommendations — Must Have

| Khía cạnh | Nội dung |
|---|---|
| **Mục tiêu** | Trang cart hiển thị "You Might Also Need" với tối đa 3 gợi ý dựa trên nội dung tổng thể giỏ hàng |
| **Input** | Toàn bộ cart items, tổng giỏ, ngưỡng khuyến mãi (vd freeship), brand các item, quantity của consumable |
| **Output** | ≤3 gợi ý unique; kèm `badge_text` (vd "Add for FREE shipping!") và `threshold_info {target, current, remaining}` |
| **Business Rules (4 rule, đánh giá theo thứ tự CR-01→CR-04):** | **CR-01**: cart có category X nhưng thiếu category bổ trợ Y → gợi ý top-selling của Y (có vợt, không có cước → gợi ý cước). **CR-02**: tổng giỏ trong phạm vi 15% của một ngưỡng khuyến mãi → gợi ý item giá vừa đủ đẩy giỏ vượt ngưỡng, gắn badge. **CR-03**: mọi item cùng brand → gợi ý phụ kiện cùng brand. **CR-04**: có consumable quantity 1 → gợi ý bundle/multipack cùng loại với đơn giá tốt hơn |
| **Validation** | Nhiều rule cùng fire → lấy top 3 unique across rules; <3 thì hiện những gì có; **0 gợi ý → ẩn toàn bộ section** (không bao giờ hiện section rỗng) |
| **Edge Cases** | AC ví dụ: giỏ 6.700.000₫, ngưỡng freeship 7.000.000₫ → CR-01 và CR-02 cùng fire, thứ tự hiển thị: (1) cước top-selling [CR-01], (2) item <400K với badge freeship [CR-02], (3) kết quả kế tiếp của CR-01 hoặc CR-03. ⚠️ Định nghĩa "within 15% of threshold" và giới hạn giá item gợi ý trong ví dụ CR-02 chưa nhất quán — xem Phần 11 |

#### [SUGG-005] Suggestion Refresh on Cart Change — Must Have

| Khía cạnh | Nội dung |
|---|---|
| **Mục tiêu** | Gợi ý luôn phản ánh giỏ hàng hiện tại |
| **Trigger** | Subscriber `cart.updated` (add/remove/đổi quantity) |
| **Business Rules** | Cache Redis key `cart:{cart_id}:suggestions`, TTL 5 phút; **invalidate ngay lập tức khi cart đổi**, không chờ TTL |

#### [SUGG-006] Suggestion Analytics — Should Have

| Khía cạnh | Nội dung |
|---|---|
| **Mục tiêu** | Track toàn bộ vòng đời tương tác gợi ý để đo hiệu quả rule |
| **Events** | `impression` (render trên màn hình), `tap` (chạm card), `add_to_cart`, `dismiss` |
| **Payload mỗi event** | `suggestion_rule_id, source_context (product_view\|cart), source_product_id` (hoặc 'cart'), `suggested_product_id, customer_id, session_id, timestamp, action` |
| **Ghi chú kỹ thuật** | Bảng SuggestionEvent write-heavy, append-only, SRS gợi ý partition theo `created_at` |

### 2.4.2 Module VOUCHER AT CHECKOUT

---

#### [VOUCH-001] Apply Voucher Code — Must Have

| Khía cạnh | Nội dung |
|---|---|
| **Mục tiêu** | Khách áp voucher tại checkout, thấy tổng tiền cập nhật ngay |
| **Input** | (a) nhập mã thủ công + nút Apply, hoặc (b) chọn từ danh sách "My Vouchers" (voucher gán qua CRM campaign) |
| **Output** | Tag voucher removable dạng `"SHUTTLE20 — Save 30,000₫"`; tổng giỏ cập nhật |
| **Business Rules** | **Chỉ 1 voucher active tại một thời điểm.** Áp voucher mới thay thế voucher cũ, có xác nhận: *"Replace current voucher {code}?"* |
| **Ví dụ chuẩn (AC)** | Voucher SHUTTLE20 (20% off Shuttlecocks, min order 200K, max discount 100K); giỏ: Mavis 350 (150K) + Astrox 99 Pro (4.5M) → discount = 20% × 150.000 = **30.000₫** (chỉ item thuộc scope Shuttlecocks); tổng 4.650.000 → 4.620.000₫ |

#### [VOUCH-002] Voucher Validation Rules — Must Have

Chuỗi 8 validation, chạy tuần tự V1→V8, **fail-fast** (fail cái nào trả lỗi cái đó ngay, không chạy tiếp). Message hỗ trợ i18n (Việt chính, Anh phụ):

| # | Rule | Error message |
|---|---|---|
| V1 | Code tồn tại & active | "This voucher code doesn't exist. Please check and try again." |
| V2 | now ∈ [valid_from, valid_to] | "This voucher expired on {date}. Check 'My Vouchers' for active ones." |
| V3 | usage_count toàn cục < usage_limit | "This voucher has been fully redeemed and is no longer available." |
| V4 | Số lần dùng của user < per_user_limit | "You've already used this voucher {count}/{limit} times." |
| V5 | Cart subtotal ≥ min_order_value | "Add {remaining} more to use this voucher (minimum order: {min_order_value})." |
| V6 | Cart có ≥1 item khớp applicable_categories / applicable_product_ids (nếu voucher có scope) | "This voucher only applies to {categories}. Your cart has no matching items." |
| V7 | Khách thỏa segment conditions (loyalty tier, new customer...) nếu cấu hình | "This voucher is not available for your account type." |
| V8 | Không xung đột stacking với discount hiện có trong cart (theo VOUCH-003) | "This voucher can't be combined with your current discount. Remove it first?" |

⚠️ **Điểm chưa rõ:** V5 dùng subtotal **trước hay sau** item-level promotion? SRS không nói. V8 tương tác thế nào với field `stackable_with_promotions` (default true) trong VoucherConfig? — xem Phần 11.

#### [VOUCH-003] Discount Stacking & Conflict Resolution — Must Have ⭐ (phức tạp nhất hệ thống)

**6 rule bất biến:**

1. Item-level promotion (giảm giá tự động) **luôn áp trước**, trên giá gốc — kể cả promotion của sản phẩm được thêm qua gợi ý.
2. Voucher áp **sau**, trên subtotal hậu-khuyến-mãi.
3. Chỉ **1 voucher** — không voucher-chồng-voucher.
4. Voucher %: tính trên giá hậu-khuyến-mãi của **riêng các item đủ điều kiện**.
5. Có `max_discount_amount` → discount voucher bị chặn tại đó bất kể kết quả %.
6. **CRITICAL** — Tổng giảm từ MỌI nguồn (item promo + voucher) ≤ `max_discount_percentage` cấu hình toàn hệ thống (mặc định **50%**) tính trên **subtotal GỐC**. Nếu vượt: **chỉ cắt phần voucher** (không bao giờ cắt item promo), trả `discount_capped: true` + giải thích.

**Ví dụ số học chuẩn từ SRS (dùng làm test fixture):**

*Happy path:* Vợt 4.500.000 (promo 20% → giảm 900.000) + Cước gợi ý 200.000 (không promo). Voucher SAVE10 (10% toàn giỏ, không cap riêng):
- Post-promo subtotal = 3.800.000 → voucher = 380.000
- Tổng giảm = 1.280.000 / 4.700.000 = 27,2% < 50% ✅
- **Khách trả: 3.420.000₫**

*Cap exceeded:* Vợt 4.500.000 (promo 40% → giảm 1.800.000) + Cước gợi ý 200.000 (promo 30% → giảm 60.000). Voucher MEGA20 (20%):
- Item promo tổng = 1.860.000; post-promo = 2.840.000 → voucher thô = 568.000
- Tổng = 2.428.000 / 4.700.000 = **51,6% > 50%** → vượt cap
- Trần tổng giảm = 4.700.000 × 50% = 2.350.000 → voucher cắt còn **490.000**
- **Khách trả: 2.350.000₫**; UI hiển thị: *"Voucher discount adjusted from 568,000₫ to 490,000₫ due to maximum 50% discount policy"*

#### [VOUCH-004] Remove Voucher — Must Have

- Tap "X" trên tag voucher → (a) đảo ngược discount ngay, (b) tổng giỏ về mức trước voucher, (c) **usage count KHÔNG tăng** (chỉ tăng khi đặt hàng thành công), (d) toast *"Voucher {code} removed"*.
- Hệ quả thiết kế (EC-06): apply → remove → apply lại trong cùng session với voucher per_user_limit=1 vẫn **được phép** — chủ đích, để không phạt khách đang "khám phá".

#### [VOUCH-005] Voucher Auto-Invalidation on Cart Change — Must Have

Cart đổi sau khi voucher đã áp → re-validate. Fail → tự gỡ voucher + notification *"Voucher {code} removed — {reason}"*. Ba tình huống cụ thể:
- (a) Bỏ item → giỏ tụt dưới min_order_value → *"Cart no longer meets minimum {amount}"*
- (b) Bỏ hết item thuộc category áp dụng của voucher → *"No eligible items remaining in cart"*
- (c) Bỏ **item gợi ý** vốn là item đủ điều kiện duy nhất → như (b) — đây là điểm giao thoa trực tiếp 2 feature.

### 2.4.3 Bảng Edge Cases & Business Rules (SRS §8 — 10 EC)

| ID | Kịch bản | Hành vi kỳ vọng | Ưu tiên |
|---|---|---|---|
| EC-01 | Item gợi ý có promo 30% + voucher 20%, tiến sát cap 50% | Item promo trước → voucher trên post-promo → check cap → vượt thì **chỉ cắt voucher**, hiển thị giải thích | Must |
| EC-02 | Voucher scope "Strings", khách bỏ hết cước (kể cả cước thêm từ gợi ý) | `cart.updated` → revalidate → fail V6 → auto-remove kèm message | Must |
| EC-03 | Voucher 50% + item promo 50% → tổng 100% → giỏ về 0/âm | Cap toàn cục chặn; cắt voucher; **tổng giỏ luôn > 0 (tối thiểu 1 VND)**; log warning cho admin | Must |
| EC-04 | 2 request đồng thời: apply voucher vs remove item eligible cuối | **Optimistic locking** trên cart entity; request sau trigger revalidation; cả 2 thao tác atomic, không có trạng thái lệch | Must |
| EC-05 | Thêm item gợi ý từ product page → sang cart, cart không được re-suggest chính item đó | Bước filterCandidates check cart hiện tại; cache invalidate bởi `cart.updated` | Must |
| EC-06 | per_user_limit=1, apply→remove→apply lại cùng session | Được phép (count chỉ tăng lúc đặt hàng) — by design | Must |
| EC-07 | Item gợi ý hết hàng giữa lúc render và lúc tap Add | Re-check stock tại execution; 409 + refresh suggestions | Must |
| EC-08 | Thêm item gợi ý đẩy tổng vượt tier promo mới ("Spend 5M get extra 5% off") | Tier promo áp như item-level; voucher recalculate trên post-promo mới; re-check cap; khách hưởng cascading discount tới cap | Should |
| EC-09 | Admin deactivate rule khi cache còn sống | Eventual consistency qua TTL 5 phút; worst case stale 5 phút; add to cart vẫn hoạt động; không lỗi phía khách | Should |
| EC-10 | Brute-force mã voucher | Rate limit 5 lần fail / khách / cửa sổ 15 phút → 429 *"Too many attempts..."*; log IP + customer_id | Must |

### 2.4.4 Non-Functional Requirements (SRS §9)

**Performance (p95):**

| Metric | Target |
|---|---|
| Load gợi ý product-level | < 800ms (cache Redis; cold miss: DB < 500ms + ghi cache) |
| Đánh giá gợi ý cart-level | < 600ms (async qua subscriber; frontend hiện skeleton loader) |
| Validate voucher (apply) | < 400ms (usage check trên Redis; DB chỉ cho lookup config) |
| Recalculate tổng giỏ | < 300ms (số học ở application layer, không DB write khi tính) |
| Cache hit rate gợi ý | > 85% |

**Security:** SEC-01 mọi tính toán discount **server-side only** (frontend chỉ hiển thị); SEC-02 brute-force: 5 fail/15 phút → cooldown 30 phút + log; SEC-03 mã voucher case-insensitive, lưu UPPERCASE, tối thiểu 6 ký tự alphanumeric; SEC-04 admin API cần auth + role, store API scope theo khách đã đăng nhập.

**Data Integrity:** INT-01 mọi giá trị tiền là **integer đơn vị nhỏ nhất** (VND: 1 = 1₫), tuyệt đối không floating-point trong tính discount; INT-02 usage_count tăng **atomic** (Redis INCR hoặc UPDATE...WHERE); INT-03 **cart total là nguồn sự thật về giá**, recalculate từ đầu (không incremental) mỗi lần đổi để tránh drift; INT-04 VoucherUsageLog append-only, immutable — audit trail.

---

# 3. USER FLOW

## 3.1 Customer Journey (qua lăng kính 2 feature trong SRS)

> Các bước Landing/Browse/Payment chi tiết nằm ngoài scope SRS — dưới đây chỉ mô tả điểm chạm mà 2 feature can thiệp vào journey chuẩn.

```
Landing → Browse → PRODUCT DETAIL → ADD TO CART → CART → CHECKOUT → Payment → Order Success
                        ▲ SUGG-001/002/003        ▲ SUGG-004/005      ▲ VOUCH-001→005        ▲ usage_count++, UsageLog
```

**Bước 1 — Product Detail (SUGG-001, 002, 003):**
1. Khách mở trang chi tiết (vd "Yonex Astrox 99 Pro").
2. Backend chạy workflow `evaluateSuggestions` (hoặc trả cache `product:{id}:suggestions`): resolve context → load rule active → Tier 1 manual → bù Tier 2 category complement → lọc (đã trong cart / hết hàng tại assigned store / đã dismiss trong session / đã mua 30 ngày) → rank theo tier + display_order → limit 5 → enrich giá & stock → cache TTL 5 phút.
3. Section "Complete Your Setup" render 3–5 card; mỗi lần render bắn event `impression`.
4. Khách tap card → event `tap`; tap "Add" → nếu 1 variant/có default: vào giỏ ngay, card ✓ "Added" 3 giây, toast + Undo 3 giây, event `add_to_cart`; nếu nhiều variant: bottom sheet chọn variant. Tap X/swipe → event `dismiss`, không hiện lại trong session.
5. Nếu item vừa hết hàng: 409, toast thông báo, section refresh (EC-07).

**Bước 2 — Cart (SUGG-004, 005 + VOUCH-005):**
1. Mỗi thay đổi giỏ phát `cart.updated` → (a) invalidate cache gợi ý ngay + re-evaluate 4 rule CR-01→CR-04; (b) nếu đang có voucher: chạy workflow `revalidateVoucherOnCartChange`.
2. Section "You Might Also Need" hiện ≤3 gợi ý unique (ẩn hẳn nếu 0); CR-02 kèm badge "Add for FREE shipping!" và info còn thiếu bao nhiêu.
3. Item vừa thêm từ product page **không** bị re-suggest (EC-05).

**Bước 3 — Checkout (VOUCH-001→003):**
1. Khách nhập mã hoặc chọn từ "My Vouchers".
2. Workflow `applyVoucher`: normalize (UPPERCASE, trim) → lookup → validate V1→V8 fail-fast → tính discount thô (% trên eligible items post-promo, hoặc fixed) → áp `max_discount_amount` → **enforce global cap 50%** → attach vào cart, recalculate tổng (< 400ms p95).
3. UI: tag "SHUTTLE20 — Save 30.000₫" removable; nếu bị cap: banner giải thích số bị điều chỉnh.
4. Áp mã khác → confirm "Replace current voucher {code}?".
5. Khách quay lại sửa giỏ → auto-revalidate; fail → voucher tự gỡ + toast lý do (VOUCH-005).

**Bước 4 — Order Success:** usage_count tăng atomic; tạo VoucherUsageLog (discount_applied, was_capped, original_discount) — **chỉ tại thời điểm này**, không phải lúc apply.

## 3.2 Admin Journey (API-only theo SRS)

> SRS không có admin UI trong scope. Các nghiệp vụ Product Management / Inventory / Orders / Customers / Reports tổng quát ❌ không thuộc SRS; dưới đây là flow admin đúng theo tài liệu.

**Flow A — Quản lý Suggestion Rules:**
1. `POST /admin/suggestion-rules` tạo rule: `{name, type: product|cart, tier, items: [{product_id, display_order, label}], conditions}` (conditions cho type=cart, dạng jsonb: `{category: 'strings', threshold_pct: 15}`).
2. `PUT /admin/suggestion-rules/:id` cập nhật → **trigger cache invalidation** cho product/cart bị ảnh hưởng.
3. `DELETE /admin/suggestion-rules/:id` → soft delete (`is_active=false`) + cache invalidation; khách đang có cache cũ chấp nhận stale ≤5 phút (EC-09).

**Flow B — Quản lý Voucher:**
1. `POST /admin/vouchers` với đầy đủ VoucherConfig (code tự sinh nếu không cung cấp; ≥6 ký tự alphanumeric, lưu UPPERCASE).
2. Theo dõi hiệu quả: `GET /admin/vouchers/:id/analytics` → `{total_uses, total_discount_given, avg_order_value, capped_count, conversion_rate}`.
3. Điều chỉnh trần giảm giá toàn cục qua DiscountCapConfig (singleton, admin API — endpoint cụ thể chưa được SRS liệt kê, cần bổ sung vào API contract).

**Flow C — Giám sát:** review warning log khi tổng discount chạm cap bất thường (EC-03); review security log brute-force (EC-10); phân tích SuggestionEvent để đo funnel impression→add_to_cart theo rule.

---

# 4. DOMAIN ANALYSIS

## 4.1 Phân tầng domain

| Tầng | Thành phần | Lý do xếp loại |
|---|---|---|
| **Core Domain** (khác biệt cạnh tranh, tự xây) | **Discount Orchestration** (stacking 6 rule + global cap + conflict resolution — VOUCH-003, EC-01/03/08) và **Suggestion Engine** (3 tier + 4 cart rule + filtering + threshold nudging) | Đây chính là 2 feature SRS tồn tại để đặc tả; logic nghiệp vụ riêng của shop, không có sẵn trong Medusa |
| **Supporting Domain** | Suggestion Analytics (SuggestionEvent), Voucher Usage Audit (VoucherUsageLog), Cache strategy (Redis TTL/invalidation), Rate limiting & security monitoring | Phục vụ core nhưng không phải khác biệt cạnh tranh |
| **Generic Domain** (dùng built-in Medusa) | Product, Cart, Promotion (base), Pricing, Customer, Order, Inventory | SRS §2.1 chỉ định rõ tương tác qua Link Module + subscriber, không đụng DB của nhau |

## 4.2 Phân tích thực thể domain và quan hệ

> Theo template: Product, Category, Brand, Variant, Inventory, Order, Payment, Shipment, Coupon, Customer, Review. Các thực thể SRS không đặc tả được ghi chú rõ.

| Thực thể | Vai trò trong SRS | Ghi chú |
|---|---|---|
| **Product** | Đối tượng được gợi ý & là scope voucher (`applicable_product_ids`). Liên kết tới SuggestionRuleItem qua **Link Module** | Quản lý catalog out of scope |
| **Category** | Nền tảng của Tier 2 (category complement mapping) và CR-01; scope voucher (`applicable_category_ids`); V6 validation | Mapping bổ trợ (Rackets→Strings...) là dữ liệu cấu hình |
| **Brand** | Điều kiện CR-03 (cart toàn 1 brand → gợi ý phụ kiện cùng brand) | SRS không nói brand là entity riêng hay attribute — cần xác nhận cách model trong Medusa |
| **Variant** | SUGG-003: add variant mặc định; nhiều variant → bottom sheet chọn | |
| **Inventory** | Filter SUGG-002b (hết hàng tại assigned store); re-check EC-07; cache stock trong Redis | Khái niệm "assigned store" chưa định nghĩa |
| **Order** | Mốc tăng usage_count + sinh VoucherUsageLog; nguồn dữ liệu "đã mua 30 ngày" (SUGG-002d) | Order lifecycle out of scope |
| **Payment** | ❌ Out of scope (MoMo/Payoo/COD chỉ được nêu tên) | |
| **Shipment** | Chỉ gián tiếp: ngưỡng free shipping là threshold của CR-02 | Logic shipping thật out of scope |
| **Coupon/Voucher** | VoucherConfig extends Promotion; quan hệ 1-N với VoucherUsageLog | |
| **Customer** | Điều kiện per_user_limit, segment (V7), lịch sử mua, "My Vouchers" (CRM gán) | Account management out of scope |
| **Review** | ❌ Không xuất hiện trong SRS | |

**Sơ đồ quan hệ trọng tâm:**

```
SuggestionRule 1──N SuggestionRuleItem N──(Link Module)──1 Product
SuggestionRule 1──N CartSuggestionCondition   (khi type = cart)
SuggestionRule 1──N SuggestionEvent

Promotion (Medusa) ◄─extends─ VoucherConfig 1──N VoucherUsageLog N──1 Customer
                                                VoucherUsageLog N──1 Order
DiscountCapConfig (singleton toàn cục)

Cart ──events (cart.updated)──► [SuggestiveSelling subscriber, VoucherEngine subscriber]
VoucherEngine ──reads──► SuggestiveSelling (kiểm tra item gợi ý có promo riêng không — SRS §2.1)
```

---

# 5. DATABASE DESIGN

## 5.1 Entity List

| Entity | Purpose | Nguồn |
|---|---|---|
| `suggestion_rule` | Định nghĩa rule gợi ý (product/cart, tier, priority, hiệu lực thời gian) | SRS §5.1 |
| `suggestion_rule_item` | Sản phẩm được gợi ý trong 1 rule + thứ tự hiển thị + label tùy chỉnh ("Best Match") | SRS §5.1 |
| `cart_suggestion_condition` | Điều kiện cho rule type=cart (jsonb params — mở rộng không cần đổi schema) | SRS §5.1 |
| `suggestion_event` | Log tương tác gợi ý (append-only, write-heavy, partition theo created_at) | SRS §5.1 |
| `voucher_config` | Cấu hình voucher, extends Promotion; code unique + indexed | SRS §5.2 |
| `voucher_usage_log` | Audit trail redemption — tạo duy nhất khi đặt hàng thành công | SRS §5.2 |
| `discount_cap_config` | Singleton trần giảm giá toàn cục (5000 = 50.00%) | SRS §5.2 |
| Link table: `suggestion_rule_item ↔ product` | Quan hệ cross-module chuẩn Medusa Link Module | SRS §2.1, §5.1 |

## 5.2 Chi tiết schema (đúng theo SRS)

**suggestion_rule**: `id uuid PK, name string, type enum(product|cart), tier enum(manual|category|behavioral), priority int, is_active bool, valid_from datetime NULL, valid_to datetime NULL, created_at, updated_at`

**suggestion_rule_item**: `id uuid PK, rule_id FK→suggestion_rule, suggested_product_id (FK→Product qua Link), display_order int, custom_label string NULL`

**cart_suggestion_condition**: `id uuid PK, rule_id FK, condition_type enum(category_missing|threshold_near|brand_match|consumable_upsell), condition_params jsonb`

**suggestion_event**: `id uuid PK, rule_id FK, source_context enum(product_view|cart), source_product_id uuid NULL, suggested_product_id uuid, customer_id uuid, session_id string, action enum(impression|tap|add_to_cart|dismiss), created_at`

**voucher_config** (extends Promotion): `id uuid PK, code string UNIQUE INDEXED (uppercase), discount_type enum(percentage|fixed_amount), discount_value int (2000 = 20.00% hoặc 50000 = 50.000₫), min_order_value int NULL, max_discount_amount int NULL, applicable_category_ids uuid[] NULL, applicable_product_ids uuid[] NULL, stackable_with_promotions bool DEFAULT true, per_user_limit int DEFAULT 1, usage_limit int NULL, usage_count int DEFAULT 0, user_segment_conditions jsonb NULL, valid_from, valid_to, is_active bool, created_at, updated_at`

**voucher_usage_log**: `id uuid PK, voucher_id FK, customer_id FK, order_id FK, discount_applied int, was_capped bool, original_discount int, applied_at datetime`

**discount_cap_config**: `id uuid PK, max_discount_percentage int, is_active bool, updated_at, updated_by string` — 1 record active duy nhất, lịch sử theo updated_at.

## 5.3 Relationship Analysis

| Loại | Quan hệ |
|---|---|
| **One-to-One** | `voucher_config` ↔ `promotion` (extends — mỗi voucher là 1 promotion mở rộng); `discount_cap_config` là singleton (0..1 record active) |
| **One-to-Many** | `suggestion_rule` → `suggestion_rule_item`; `suggestion_rule` → `cart_suggestion_condition`; `suggestion_rule` → `suggestion_event`; `voucher_config` → `voucher_usage_log`; `customer` → `voucher_usage_log`; `order` → `voucher_usage_log` (thực tế 1 order – 1 log vì chỉ 1 voucher/cart, nhưng schema để N cho tổng quát); Cart → 0..1 voucher active |
| **Many-to-Many** | `suggestion_rule` ↔ `product` (qua bảng trung gian suggestion_rule_item + Link Module); `voucher_config` ↔ `category`/`product` (qua mảng uuid[] `applicable_*` — dạng M-N phi chuẩn hóa, chấp nhận theo SRS) |

## 5.4 Phân loại bảng

| Nhóm | Bảng | Đặc điểm vận hành |
|---|---|---|
| **Core Tables** | suggestion_rule, suggestion_rule_item, cart_suggestion_condition, voucher_config | Read-heavy, thay đổi bởi admin, đi kèm cache invalidation |
| **Transaction Tables** | suggestion_event, voucher_usage_log | Append-only, write-heavy; suggestion_event nên partition theo created_at (khuyến nghị của chính SRS) |
| **Audit Tables** | voucher_usage_log (INT-04: immutable sau khi tạo), discount_cap_config (history qua updated_at/updated_by) | Không UPDATE/DELETE ở tầng ứng dụng |
| **Lookup/Config Tables** | discount_cap_config; mapping category complement (Rackets→Strings/Grips/Bags...) — SRS mô tả mapping nhưng **không chỉ định nơi lưu** → khuyến nghị bảng config hoặc jsonb setting, cần chốt với khách |

**Chỉ mục đề xuất (suy ra trực tiếp từ truy vấn SRS mô tả):** `voucher_config(code)` unique (SRS yêu cầu indexed); `suggestion_rule(type, is_active, priority)` cho bước loadActiveRules; `suggestion_event(rule_id, created_at)` + partition cho analytics; `voucher_usage_log(voucher_id, customer_id)` cho check V4 per-user.

---

# 6. API DESIGN

> SRS §6 định nghĩa 11 endpoint. Các nhóm API template yêu cầu nhưng ngoài scope (Auth, Payment, Order, Search, Review, full Product CRUD...) được đánh dấu ❌ — không suy diễn.

## 6.1 Suggestion APIs (Store)

| Method | Endpoint | Mô tả | Request | Response | Permission |
|---|---|---|---|---|---|
| GET | `/store/products/:id/suggestions` | Gợi ý product-level | Query: `store_id` (lọc tồn kho) | `{suggestions: [{product_id, name, image_url, price, discount_price, label, display_order}]}` | Customer/guest (scope theo SEC-04) |
| GET | `/store/cart/suggestions` | Gợi ý cart-level | Query: `limit` (default 3) | `{suggestions: [{product_id, name, image_url, price, rule_id, badge_text}], threshold_info: {target, current, remaining}}` | Chủ cart |
| POST | `/store/suggestions/:id/events` | Track tương tác | `{action: impression\|tap\|add_to_cart\|dismiss, source_context, source_product_id, session_id}` | `201 Created` | Chủ session |

## 6.2 Suggestion APIs (Admin)

| Method | Endpoint | Mô tả | Ghi chú |
|---|---|---|---|
| POST | `/admin/suggestion-rules` | Tạo rule | Body: `{name, type, tier, items[], conditions}` |
| PUT | `/admin/suggestion-rules/:id` | Cập nhật (partial) | **Trigger cache invalidation** cho product/cart bị ảnh hưởng |
| DELETE | `/admin/suggestion-rules/:id` | Soft delete (`is_active=false`) | Trigger cache invalidation |

Permission cả 3: **auth + admin role** (SEC-04).

## 6.3 Voucher APIs (Store)

| Method | Endpoint | Mô tả | Request | Response |
|---|---|---|---|---|
| POST | `/store/cart/voucher` | Áp voucher vào cart | `{code: "SHUTTLE20"}` | `{success, discount_amount, discount_capped, cap_explanation, updated_cart_total, voucher_details: {code, type, value, expires_at}}` |
| DELETE | `/store/cart/voucher` | Gỡ voucher | — | `{success, updated_cart_total, message: "Voucher removed"}` |
| GET | `/store/customer/vouchers` | "My Vouchers" của khách hiện tại | — | `{vouchers: [{code, description, discount_type, discount_value, valid_to, min_order, applicable_categories}]}` |

Mã lỗi đặc thù: `404` code không tồn tại (bước lookupVoucher), `409` hết hàng khi add gợi ý (EC-07), `429` rate limit (EC-10), lỗi validate V1–V8 kèm message i18n.

## 6.4 Voucher APIs (Admin)

| Method | Endpoint | Mô tả | Response |
|---|---|---|---|
| POST | `/admin/vouchers` | Tạo voucher | Voucher đã tạo, code tự sinh nếu không cung cấp |
| GET | `/admin/vouchers/:id/analytics` | Analytics | `{total_uses, total_discount_given, avg_order_value, capped_count, conversion_rate}` |

## 6.5 Khoảng trống API cần bổ sung (SRS ngầm yêu cầu nhưng không liệt kê)

1. **CRUD DiscountCapConfig** — §5.2 nói "Managed via admin API" nhưng §6 không có endpoint.
2. **GET/PUT/DELETE voucher (admin)** — chỉ có POST + analytics; vòng đời voucher (sửa, deactivate, list) thiếu.
3. **GET list suggestion rules (admin)** — cần cho vận hành, không được liệt kê.
4. **API quản lý category complement mapping** — Tier 2 mapping là dữ liệu cấu hình, chưa có endpoint.
5. ❌ Auth / Payment / Order / Search / Review / Dashboard tổng quát: out of scope, không thiết kế.

---

# 7. FRONTEND ANALYSIS

> SRS không đặc tả sitemap toàn site; dưới đây là các page/vùng UI mà 2 feature **chạm vào**, cùng component & API tương ứng đúng theo yêu cầu chức năng.

## 7.1 Sitemap (phần liên quan)

```
/products/[slug]        ← section "Complete Your Setup" (SUGG-001/002/003)
/cart                   ← section "You Might Also Need" (SUGG-004/005)
/checkout               ← khối Voucher (VOUCH-001→005)
(các route khác: /, /categories/[slug], /orders, /profile, /admin ... — ngoài scope SRS)
```

## 7.2 Chi tiết từng vùng

### /products/[slug] — Product Detail

| Khía cạnh | Nội dung |
|---|---|
| Chức năng | Hiển thị 3–5 gợi ý bổ trợ; one-tap add; dismiss; track events |
| Components | `CompleteYourSetupSection`, `SuggestionCard` (ảnh, tên, giá, discount_price, custom_label, nút Add, nút X), `VariantBottomSheet` (mobile, khi nhiều variant không default), `AddedCheckmark` (state 3s), `UndoToast` (3s), `ImpressionObserver` (bắn event khi card vào viewport) |
| API | GET `/store/products/:id/suggestions?store_id=`; POST `/store/suggestions/:id/events`; add-to-cart API của Medusa (re-check stock, xử lý 409) |
| State | Danh sách suggestions + trạng thái từng card (normal/added/dismissed); danh sách dismissed **trong session**; hàng đợi Undo (giữ action 3s trước khi chốt); loading skeleton |

### /cart — Cart Page

| Khía cạnh | Nội dung |
|---|---|
| Chức năng | ≤3 gợi ý cart-level; badge ngưỡng freeship; ẩn section khi 0 gợi ý; refresh khi giỏ đổi; hiển thị voucher đang áp và cảnh báo auto-remove |
| Components | `YouMightAlsoNeedSection`, `SuggestionCard` (kèm `badge_text`), `ThresholdProgress` (dùng `threshold_info {target, current, remaining}`), `VoucherRemovedToast` |
| API | GET `/store/cart/suggestions?limit=3`; POST events; cart mutation APIs |
| State | Cart state là nguồn trigger; sau mỗi mutation → refetch suggestions (backend đã invalidate cache); skeleton loader trong lúc re-evaluate (NFR: <600ms p95) |

### /checkout — Checkout

| Khía cạnh | Nội dung |
|---|---|
| Chức năng | Nhập mã / chọn từ My Vouchers; hiển thị tag voucher + số tiền tiết kiệm; giải thích khi bị cap; confirm khi replace; gỡ voucher |
| Components | `VoucherInput` (text + nút Apply, hiển thị lỗi V1–V8 i18n vi/en), `MyVouchersList`, `VoucherTag` ("SHUTTLE20 — Save 30.000₫", nút X), `CapExplanationBanner` ("Voucher discount adjusted from ... due to maximum 50% discount policy"), `ReplaceVoucherConfirmDialog`, `RateLimitNotice` (429) |
| API | POST/DELETE `/store/cart/voucher`; GET `/store/customer/vouchers` |
| State | Voucher hiện tại + `discount_capped`/`cap_explanation`; **tổng tiền luôn lấy từ cart API response, không tự tính ở client** (SEC-01); error state theo mã lỗi; đếm lùi cooldown khi 429 |

## 7.3 Nguyên tắc xuyên suốt frontend

- Frontend **chỉ hiển thị** — mọi con số discount là informational, nguồn sự thật là response cart API (SEC-01, INT-03).
- Toast/Undo pattern thống nhất: add (3s undo), voucher removed, voucher auto-removed kèm lý do.
- i18n: message lỗi voucher tiếng Việt chính, Anh phụ (VOUCH-002).
- Skeleton loader cho các vùng async (gợi ý cart-level).

---

# 8. KIẾN TRÚC HỆ THỐNG (MedusaJS v2)

## 8.1 Sơ đồ tổng thể (theo SRS §2.1)

```
                        ┌──────────────── Storefront (Next.js) ────────────────┐
                        │  Product Detail   │   Cart Page   │   Checkout       │
                        └───────┬───────────────────┬───────────────┬──────────┘
                                │ Store APIs        │               │
┌───────────────────────────────▼───────────────────▼───────────────▼──────────┐
│                            MedusaJS v2 Backend                               │
│                                                                              │
│  ┌─ SuggestiveSelling Module (custom) ─┐   ┌─ VoucherEngine Module (custom, │
│  │ SuggestionRule / RuleItem /         │   │   extends Promotion) ──────────│
│  │ CartSuggestionCondition / Event     │   │ VoucherConfig / UsageLog /     │
│  │ Workflow: evaluateSuggestions       │◄──┤ DiscountCapConfig              │
│  │                                     │   │ Workflows: applyVoucher,       │
│  └──────────┬──────────────────────────┘   │ revalidateVoucherOnCartChange  │
│             │ Link Module (product↔rule)   └──────────┬─────────────────────┘
│  ┌──────────▼──────────────────────────────────────────▼─────────────────┐  │
│  │  Built-in: Product · Cart (extended) · Promotion · Pricing · Order    │  │
│  └──────────────────────────────┬────────────────────────────────────────┘  │
│              event bus: cart.updated → subscribers của cả 2 module           │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                   ▼
                    Redis: product/cart suggestions (TTL 5m),
                    voucher validation (TTL 30s), stock cache,
                    atomic usage counter, rate-limit counters
```

**Nguyên tắc bắt buộc từ SRS:** hai custom module giao tiếp với built-in module qua **Link Module + event-driven subscriber**, *"no direct database coupling between modules"*. VoucherEngine đọc SuggestiveSelling chỉ để biết item gợi ý có promotion riêng hay không (input cho stacking).

## 8.2 Ánh xạ thành phần MedusaJS

| Primitive | Thành phần cụ thể | Nguồn SRS |
|---|---|---|
| **Core Modules (dùng nguyên)** | Product (đọc sản phẩm/variant/category), Pricing (giá hiện hành), Promotion (nền cho voucher + item promo), Order (mốc redemption), Customer, Inventory (stock check) | §2.1 |
| **Extended Module** | Cart — nhận event, recalculate từ đầu mỗi thay đổi (INT-03), optimistic locking (EC-04), giữ tham chiếu voucher active | §2.1, §8 |
| **Custom Module 1** | `SuggestiveSelling`: 4 data model, service đánh giá rule 3 tier + 4 cart rule, API routes §6.1 | §2.1, §5.1 |
| **Custom Module 2** | `VoucherEngine` extends Promotion: 3 data model, service validate V1–V8 + stacking engine 6 rule, API routes §6.2 | §2.1, §5.2 |
| **Workflows** (compensatable, resume/rollback từ bất kỳ step nào) | `evaluateSuggestions` (7 step, compensation duy nhất: xóa cache key); `applyVoucher` (9 step, compensation ở attachToCart: gỡ voucher + revert totals); `revalidateVoucherOnCartChange` (4 step, nhánh 3a recalculate / 3b removeVoucher) | §7.1–7.3 |
| **Subscribers** | `cart.updated` → (1) invalidate + re-evaluate suggestions (SUGG-005), (2) revalidate voucher (VOUCH-005). Fire-and-forget notify frontend ở bước 4 workflow 7.3 | §7.3 |
| **Scheduled Jobs** | SRS **không** định nghĩa job nào. Ứng viên đề xuất (cần khách duyệt): dọn SuggestionEvent/partition cũ, sync usage_count Redis↔DB, quét voucher hết hạn để tắt is_active | — |
| **API Routes** | 11 endpoint §6 + các endpoint bổ sung mục 6.5 | §6 |

## 8.3 Chiến lược cache (Redis)

| Key pattern | TTL | Invalidation |
|---|---|---|
| `product:{id}:suggestions` | 5 phút | Khi admin sửa/xóa rule liên quan (PUT/DELETE trigger) |
| `cart:{cart_id}:suggestions` | 5 phút | **Ngay lập tức** khi cart.updated (không chờ TTL) |
| Voucher validation result | 30 giây | — |
| Stock availability (sản phẩm gợi ý) | (SRS không nêu TTL) | Add-to-cart luôn re-check DB, không tin cache (EC-07) |
| Usage counter / rate-limit | — | Atomic INCR (INT-02, EC-10) |

## 8.4 Xử lý đồng thời & toàn vẹn

- **Optimistic locking trên cart** (EC-04): apply voucher và remove item chạy song song vẫn hội tụ về trạng thái nhất quán — request thua trigger revalidation.
- **Recalculate-from-scratch** (INT-03): không cộng dồn incremental → loại bỏ drift.
- **Integer arithmetic** (INT-01): discount_value 2000 = 20.00%; mọi phép chia % cần quy ước làm tròn thống nhất (SRS chưa chỉ định — xem Phần 11).
- **Fail-fast validation V1→V8**: rẻ trước (lookup, expiry) → đắt sau (cart scan, segment), khớp target <400ms.

---

# 9. BREAKDOWN TASK THỰC TẾ (PHASE PLAN)

> Template gốc đề xuất 8 phase toàn hệ thống (Setup→Auth→Catalog→...). Vì SRS chỉ scope 2 feature trên nền Medusa **được giả định đã có sẵn thương mại cơ bản** (cart, product, promotion built-in), phase plan dưới đây được điều chỉnh trung thực theo phạm vi SRS. Các phase Auth/Catalog/Payment đầy đủ ❌ không thuộc dự án này.

### Phase 1 — Project Setup & Nền tảng
- **Mục tiêu:** Medusa v2 backend chạy được, Redis, event bus, seed catalog cầu lông mẫu (racket/string/grip/bag/shoes/shuttlecock đủ để test rule), khung 2 custom module rỗng + Link Module.
- **Deliverables:** repo + CI, docker-compose (Postgres/Redis), 2 module scaffold, seed script, khung integration test.
- **Dependencies:** không. | **Ưu tiên:** P0 | **Độ khó:** Thấp | **Ước lượng:** 1 tuần.

### Phase 2 — VoucherEngine core (validate + apply/remove)
- **Mục tiêu:** VOUCH-001, 002, 004: data model, workflow applyVoucher step 1–7 (chưa global cap), 8 validation fail-fast + i18n message, remove voucher, API store + POST /admin/vouchers.
- **Deliverables:** T-VOUCH-01→06, T-VOUCH-10 pass.
- **Dependencies:** Phase 1. | **Ưu tiên:** P0 | **Độ khó:** Trung bình | **Ước lượng:** 1,5 tuần.

### Phase 3 — Stacking Engine + Global Cap ⭐
- **Mục tiêu:** VOUCH-003 đầy đủ 6 rule; DiscountCapConfig + admin API; step 8 enforceGlobalCap; flag `discount_capped` + `cap_explanation`; sàn 1 VND + warning log (EC-03).
- **Deliverables:** T-VOUCH-07, 08, 09 pass với đúng con số fixture trong SRS (3.420.000₫ và 2.350.000₫ / voucher 490.000₫).
- **Dependencies:** Phase 2; cần item-level promotion hoạt động (Promotion built-in). | **Ưu tiên:** P0 | **Độ khó:** **Cao** | **Ước lượng:** 1,5 tuần.

### Phase 4 — Auto-revalidation + Concurrency
- **Mục tiêu:** VOUCH-005 (3 tình huống a/b/c), workflow revalidateVoucherOnCartChange, subscriber cart.updated, optimistic locking (EC-04), rate limiting EC-10/SEC-02.
- **Deliverables:** T-VOUCH-11, 12 pass; test concurrency (2 request song song).
- **Dependencies:** Phase 3. | **Ưu tiên:** P0 | **Độ khó:** Cao | **Ước lượng:** 1 tuần.

### Phase 5 — SuggestiveSelling product-level
- **Mục tiêu:** SUGG-001 (Tier 1 + Tier 2 backfill), SUGG-002 (4 filter), SUGG-003 (one-tap, variant bottom sheet API contract, 409 EC-07), workflow evaluateSuggestions, cache product-level, admin rule APIs.
- **Deliverables:** T-SUGG-01→06 pass.
- **Dependencies:** Phase 1 (độc lập với voucher — có thể chạy song song Phase 2–4 nếu đủ người). | **Ưu tiên:** P0 | **Độ khó:** Trung bình–Cao | **Ước lượng:** 1,5 tuần.

### Phase 6 — SuggestiveSelling cart-level + refresh
- **Mục tiêu:** SUGG-004 (CR-01→04, top-3 unique, ẩn section rỗng, threshold_info), SUGG-005 (subscriber + invalidate ngay), EC-05.
- **Deliverables:** T-SUGG-07, 08, 09 pass.
- **Dependencies:** Phase 5. | **Ưu tiên:** P0 | **Độ khó:** Trung bình | **Ước lượng:** 1 tuần.

### Phase 7 — Tích hợp chéo 2 feature + Analytics
- **Mục tiêu:** Chuỗi EC-01, 02, 03, 05, 08 end-to-end (item gợi ý có promo + voucher + cap); SUGG-006 analytics events; GET /admin/vouchers/:id/analytics; EC-09.
- **Deliverables:** T-SUGG-10 pass; bộ test EC matrix đầy đủ.
- **Dependencies:** Phase 4 + 6. | **Ưu tiên:** P0 (EC là Must) / P1 (analytics là Should) | **Độ khó:** Cao | **Ước lượng:** 1,5 tuần.

### Phase 8 — Optimization & Hardening
- **Mục tiêu:** Đạt NFR p95 (§9.1), cache hit >85%, partition suggestion_event, load test, security review (SEC-01→04), tài liệu API, UAT theo checklist §10.
- **Dependencies:** Phase 7. | **Ưu tiên:** P0 trước go-live | **Độ khó:** Trung bình | **Ước lượng:** 1 tuần.

**Tổng: ~9–10 tuần tuần tự; ~7–8 tuần nếu 2 track voucher/suggestion chạy song song (team ≥3 backend dev + 1 frontend).**

---

# 10. ROADMAP CHO DEVELOPER (THEO TUẦN)

> Giả định team: 2–3 backend (Medusa/Node/TS), 1 frontend, 1 QA kiêm BA. Track A = Voucher, Track B = Suggestion (song song từ tuần 2).

**Tuần 1 — Nền tảng + học Medusa v2:** dựng môi trường (Postgres, Redis, Medusa v2); cả team nắm 4 primitive: Module (isolated data model + service), Workflow (step + compensation), Subscriber (event), Link Module (quan hệ cross-module không coupling DB). Scaffold 2 module, seed data cầu lông, CI + khung test. *Milestone: `medusa develop` chạy, 2 module đăng ký thành công.*

**Tuần 2 — [A] VoucherConfig + validate V1–V4 · [B] Data model suggestion + Tier 1:** A: migration voucher_config/usage_log, normalize + lookup + expiry + usage check (Redis atomic). B: migration 4 bảng suggestion, Link tới Product, CRUD admin rule, đánh giá Tier 1 manual. *Milestone: T-VOUCH-02/03/04 xanh; admin tạo được rule.*

**Tuần 3 — [A] V5–V8 + apply/remove + i18n · [B] Tier 2 + filters:** A: validate cart/segment, calculateDiscount + max_discount_amount, attach/remove với compensation, message vi/en. B: category complement backfill, 4 filter SUGG-002, rank & limit, enrich pricing. *Milestone: T-VOUCH-01/05/06/10 + T-SUGG-01→04 xanh.*

**Tuần 4 — [A] Stacking + Global Cap ⭐ · [B] Cache + one-tap add:** A: 6 rule VOUCH-003, DiscountCapConfig + admin API, enforceGlobalCap, cap_explanation, sàn 1 VND + warning log; verify đúng fixture SRS. B: Redis cache + invalidation theo rule change, API add từ gợi ý + re-check stock 409. *Milestone: T-VOUCH-07/08/09 + T-SUGG-06 xanh.*

**Tuần 5 — [A] Revalidation + concurrency + rate limit · [B] Cart-level rules:** A: workflow 7.3, subscriber, optimistic locking, 5-fail/15-phút + cooldown 30 phút. B: CR-01→CR-04, top-3 unique, threshold_info, ẩn section rỗng. *Milestone: T-VOUCH-11/12 + T-SUGG-07/08 xanh.*

**Tuần 6 — Tích hợp chéo + frontend wiring:** backend: EC-01/02/03/05/08 end-to-end; SUGG-005 invalidate ngay trên cart change. Frontend: 3 vùng UI (§7.2) nối API thật, toast/undo, cap banner, replace confirm. *Milestone: T-SUGG-09 xanh; demo flow đầy đủ product→cart→checkout→cap.*

**Tuần 7 — Analytics + admin còn thiếu:** SuggestionEvent tracking 4 action + partition; voucher analytics endpoint; các API bổ sung mục 6.5 (sau khi khách duyệt); EC-09 xác nhận hành vi stale. *Milestone: T-SUGG-10 xanh; dashboard số liệu thô truy vấn được.*

**Tuần 8 — Hardening + UAT:** load test đạt p95 §9.1, đo cache hit >85%, security review SEC-01→04, chạy toàn bộ checklist §10 (22 test), fix bug, tài liệu bàn giao. *Milestone: 22/22 acceptance test pass, sẵn sàng release.*

**Tuần 9–10 (buffer):** xử lý phát sinh từ danh sách clarify (Phần 11) — kinh nghiệm thực tế cho thấy các điểm mơ hồ về cap/rounding/assigned-store sẽ tiêu tốn thời gian này.

---

# 11. RỦI RO, KHU VỰC PHỨC TẠP & DANH SÁCH CẦN CLARIFY

## 11.1 Chức năng khó nhất (xếp theo độ rủi ro kỹ thuật)

1. **VOUCH-003 Stacking + Global Cap** — 6 rule tương tác, 2 tầng cap (per-voucher + global), số học integer, yêu cầu đúng đến từng đồng theo fixture SRS. Sai 1 rule thứ tự → sai tiền thật của khách.
2. **EC-04 Concurrency** — apply voucher vs remove item song song; optimistic locking + revalidation phải hội tụ, "no inconsistent state".
3. **EC-08 Cascading discounts** — thêm item gợi ý → kích hoạt tier promo mới → recalculate voucher → re-check cap. Chuỗi phản ứng dây chuyền dễ tạo vòng lặp recalculation nếu thiết kế subscriber không cẩn thận.
4. **Suggestion engine đa tier + backfill** — Tier 1 thiếu thì bù Tier 2, xong còn phải qua 4 filter rồi vẫn đảm bảo 3–5 kết quả; logic "bù slot" (SUGG-002 AC) dễ sót.
5. **Cache invalidation đa chiều** — theo cart change (ngay lập tức), theo admin rule change (targeted), theo TTL; sai invalidation → gợi ý sai hoặc hit rate < 85%.

## 11.2 Requirement dễ gây bug

| Nguồn | Bẫy cụ thể |
|---|---|
| INT-01 + discount_value | 2000 = 20.00%: nhầm 2000 = 2000% hoặc chia sai 100 lần là bug kinh điển. Phép `20% × 150.000` phải ra đúng 30.000 — cần quy ước làm tròn cho các case không chia hết |
| VOUCH-003 Rule 4 vs ví dụ | Rule 4 nói voucher % tính trên "eligible items only", nhưng 2 ví dụ stacking dùng voucher "off entire cart" — dev phải xử lý cả 2 nhánh scoped/unscoped, dễ chỉ code 1 nhánh |
| EC-06 vs V3/V4 | usage_count chỉ tăng lúc **đặt hàng** nhưng V3/V4 check lúc **apply** → cửa sổ: nhiều khách cùng apply hợp lệ rồi cùng đặt hàng có thể vượt usage_limit. SRS không yêu cầu re-validate tại order placement — **lỗ hổng logic cần chốt** |
| Undo 3 giây (SUGG-003) | Undo add-to-cart sau khi `cart.updated` đã bắn → suggestions + voucher đã recalculate → undo phải trigger thêm 1 vòng recalculate nữa. SRS không mô tả cơ chế undo phía backend |
| Ẩn section khi 0 gợi ý | Race giữa skeleton loader và kết quả rỗng → nhấp nháy UI |
| V8 + stackable_with_promotions | Field default `true` nhưng không có mô tả hành vi khi `false`; V8 là validation duy nhất nhắc "stacking conflict" mà không định nghĩa điều kiện fail cụ thể |

## 11.3 ⚠️ Mâu thuẫn / điểm chưa rõ trong SRS — CẦN CLARIFY VỚI KHÁCH HÀNG

**Nhóm A — Mâu thuẫn nội tại:**

1. **Cache product-level vs filter cá nhân hóa:** key `product:{id}:suggestions` là **per-product** (dùng chung mọi khách), nhưng filter SUGG-002 phụ thuộc **từng khách** (cart của họ, lịch sử mua 30 ngày, dismiss trong session). Cache chung thì không thể áp filter cá nhân; cache per-customer thì hit rate >85% khó đạt. → Đề xuất hỏi: cache kết quả thô trước filter, filter chạy runtime? SRS chưa nói.
2. **Rate-limit window:** EC-10 nói "5 fail / cửa sổ 15 phút", SEC-02 nói thêm "→ cooldown **30 phút**". Hai con số 15/30 cần chốt thành một cơ chế (ví dụ: đếm trong 15 phút, phạt 30 phút).
3. **CR-02 ví dụ số học:** giỏ 590K, ngưỡng 700K (thiếu 110K) nhưng gợi ý "items under 150K" — item 100K sẽ không đưa giỏ vượt ngưỡng. AC khác lại dùng "under 400K" khi thiếu 300K. Quy tắc chọn khoảng giá (≥ remaining? ≤ remaining × hệ số?) chưa được định nghĩa.
4. **"within 15% of threshold":** 15% của ngưỡng hay của giỏ? Ví dụ 6.7M/7M chỉ cách 4,3% — mọi cách hiểu đều thỏa, nhưng cần công thức chính xác: `threshold − cart_total ≤ threshold × 15%`?
5. **Cart-level suggestion: sync hay async?** §9.1 nói "triggered async by cart.updated subscriber" nhưng §6.1 có GET `/store/cart/suggestions` đồng bộ. Quan hệ giữa pre-compute qua subscriber và serve qua GET cần vẽ rõ sequence.

**Nhóm B — Thiếu định nghĩa:**

6. **"Assigned store"** (SUGG-002b, query `store_id`): khách được gán store thế nào khi store locator out of scope? Guest thì sao?
7. **Nơi lưu dismiss-in-session:** client-side hay server-side? Ảnh hưởng trực tiếp thiết kế cache.
8. **V5 min_order_value:** so với subtotal **gốc** hay **hậu-item-promotion**? Chênh lệch có thể quyết định voucher hợp lệ hay không.
9. **Cap 50% có tính phí ship không?** "Original cart subtotal" được hiểu là hàng hóa thuần — cần xác nhận.
10. **Quy ước làm tròn:** integer arithmetic + phép % → làm tròn xuống/lên/half-up? Ảnh hưởng từng đồng, đặc biệt khi cap.
11. **Tích hợp CRM "My Vouchers":** cơ chế gán (API? import?), bảng liên kết customer↔voucher không có trong data model §5.
12. **Nguồn "top-selling"** cho Tier 2 và CR-01: cửa sổ thời gian nào, tính theo số lượng hay doanh thu, lấy từ đâu (Order module? analytics ngoài?).
13. **Nơi lưu category complement mapping** (Rackets→Strings...): hardcode, bảng config hay CartSuggestionCondition?
14. **Guest checkout:** per_user_limit, lịch sử mua 30 ngày, "My Vouchers" đều cần customer_id — hành vi với guest chưa đặc tả (auth out of scope).
15. **Endpoint DiscountCapConfig + GET/PUT/DELETE voucher + GET list rules:** thiếu trong §6 (đã nêu mục 6.5).
16. **EC-08 tier promo "Spend 5M":** ngưỡng 5M tính trên subtotal gốc hay hậu-discount? Quyết định có xảy ra vòng lặp recalculate hay không.
17. **Re-validate voucher tại order placement:** để bịt lỗ hổng usage_limit (mục 11.2) — SRS không yêu cầu, đề xuất bổ sung.

## 11.4 Scalability

- **suggestion_event write-heavy:** mỗi lần render bắn `impression` cho tối đa 5 card → 1 page view = 5 insert. Cần batch insert phía API hoặc queue; partition theo created_at như SRS gợi ý; cân nhắc bắn event async fire-and-forget để không chặn render.
- **Redis là single point:** cache suggestion + validate voucher + usage counter + rate limit đều dồn vào Redis; cần chiến lược degrade khi Redis down (SRS chỉ mô tả cold-miss fallback DB cho suggestion, chưa nói cho usage counter).
- **Recalculate-from-scratch mỗi cart change** (INT-03) an toàn nhưng O(n) theo item + promotion; với target <300ms cần giữ toàn bộ tính toán in-memory như SRS yêu cầu.
- **cart.updated fan-out:** 1 event kích 2 workflow (suggestions + voucher revalidation); mua sắm giờ cao điểm cần event bus chịu tải, idempotency cho subscriber.

## 11.5 Security

- SEC-01 là chốt chặn quan trọng nhất: **không bao giờ** tin số tiền từ client; mọi PR frontend cần review theo nguyên tắc này.
- Brute-force voucher (EC-10/SEC-02): triển khai trên Redis counter theo customer_id **và** IP (SRS log cả hai) — nếu chỉ theo customer_id, guest rotation sẽ lách được.
- Voucher code ≥6 ký tự alphanumeric (SEC-03) → không gian mã đủ lớn, nhưng khuyến nghị code sinh tự động dùng charset tránh nhầm lẫn (0/O, 1/I) — ngoài SRS, đề xuất thêm.
- Admin API (SEC-04): cần audit log cho thao tác sửa DiscountCapConfig (đã có updated_by) — thay đổi cap ảnh hưởng trực tiếp doanh thu.
- EC-03: sàn 1 VND + warning log — nên gắn alert cho admin thay vì chỉ log thụ động.

---

# 12. MEDUSAJS IMPLEMENTATION STRATEGY

## 12.1 Mapping Requirement → Medusa Core Module

| Medusa Core Module | Dùng cho requirement | Mức độ |
|---|---|---|
| **Product Module** | Nguồn dữ liệu gợi ý (SUGG-001/004), variant cho one-tap add (SUGG-003), scope voucher V6 | Dùng nguyên (read) |
| **Inventory Module** | Filter hết hàng SUGG-002b, re-check EC-07 | Dùng nguyên (read) |
| **Cart Module** | Trung tâm cả 2 feature: chứa items + promotions + voucher; phát `cart.updated`; recalculation INT-03; optimistic locking EC-04 | **Extended** |
| **Order Module** | Mốc tăng usage_count + tạo VoucherUsageLog; nguồn "đã mua 30 ngày" SUGG-002d | Dùng nguyên + hook/subscriber `order.placed` |
| **Customer Module** | per_user_limit V4, segment V7, My Vouchers | Dùng nguyên (read) |
| **Promotion Module** | Nền tảng item-level promotion (Rule 1 stacking); VoucherConfig **extends** Promotion | Extended qua module custom |
| **Pricing Module** | Enrich giá/discount_price bước 6 workflow 7.1 | Dùng nguyên (read) |
| **Payment / Fulfillment Module** | ❌ Out of scope | — |

## 12.2 Phân định Core vs Custom vs Workflow vs Subscriber vs Job

**Cần CUSTOM MODULE (2):**
- `SuggestiveSelling` — vì rule 3 tier, 4 cart condition, event tracking là domain riêng, Medusa không có sẵn recommendation engine.
- `VoucherEngine` — vì Promotion built-in không có: global discount cap, per-user limit theo mô hình "tăng lúc đặt hàng", validation chain V1–V8 với message i18n tùy chỉnh, usage log audit, segment conditions dạng jsonb.

**Cần WORKFLOW (3, đúng theo SRS §7):**
- `evaluateSuggestions` — 7 step read-only + 1 cache write có compensation (xóa key). Điểm mạnh của workflow ở đây là từng step test độc lập.
- `applyVoucher` — 9 step; compensation thật sự chỉ ở step 9 (attachToCart → gỡ voucher + revert totals); các step validate là read-only nên rollback rẻ.
- `revalidateVoucherOnCartChange` — có rẽ nhánh 3a/3b; bước 4 notify là fire-and-forget.

**Cần SUBSCRIBER:**
- `cart.updated` → 2 handler: invalidate suggestion cache + kick evaluateSuggestions (cart-level); kick revalidateVoucherOnCartChange nếu cart có voucher. Lưu ý idempotency và tránh vòng lặp: revalidation làm đổi totals **không được** phát tiếp cart.updated gây đệ quy — cần cờ nội bộ.
- Khuyến nghị thêm (ngoài SRS, để hiện thực đúng VOUCH-004c/EC-06): subscriber `order.placed` → atomic tăng usage_count + ghi VoucherUsageLog.

**Cần SCHEDULED JOB:** SRS không yêu cầu job nào. Đề xuất (chờ duyệt): archive partition suggestion_event; reconcile usage_count Redis↔DB; auto-deactivate voucher quá valid_to.

**Cần LINK MODULE:** `suggestion_rule_item ↔ product` (SRS chỉ định); cân nhắc thêm link `cart ↔ voucher_config` thay vì lưu trực tiếp trên cart để giữ nguyên tắc "no direct DB coupling".

## 12.3 Trình tự triển khai khuyến nghị trong Medusa

1. Định nghĩa 2 module + migration (Mikro-ORM models theo §5) → đăng ký vào `medusa-config`.
2. Link Module definitions trước khi viết service (tránh refactor quan hệ về sau).
3. Viết **service thuần** cho stacking engine (input: items + promos + voucher + cap config; output: breakdown discount) — thuần hàm, không I/O → unit test toàn bộ fixture SRS trước khi đụng workflow.
4. Bọc service vào workflow step; wire subscriber cuối cùng.
5. API routes mỏng: chỉ gọi workflow + map error → HTTP status (404/409/422/429).

## 12.4 Chiến lược test theo checklist SRS §10

- **22 test bắt buộc** (10 SUGG + 12 VOUCH) là definition-of-done; ánh xạ 1-1 vào CI.
- Unit (10 test): stacking engine, filter, CR rules — chạy trên service thuần, không cần DB.
- Integration (9 test): workflow + subscriber + Redis thật (testcontainers).
- E2E (1 test T-SUGG-06): one-tap add flow trên storefront.
- Bổ sung ngoài checklist: property-based test cho cap (với mọi tổ hợp promo%/voucher%: tổng giảm ≤ 50% và total ≥ 1 VND); test concurrency EC-04 (chạy song song có kiểm soát); test làm tròn integer.

---

# PHỤ LỤC — TRUY VẾT REQUIREMENT ↔ TEST ↔ PHASE

| Requirement | Test | Phase | Ghi chú |
|---|---|---|---|
| SUGG-001 | T-SUGG-01, 02 | 5 | Tier 1 + backfill Tier 2 |
| SUGG-002 | T-SUGG-03, 04, 05 | 5 | 4 filter |
| SUGG-003 | T-SUGG-06 (E2E) | 5–6 | + EC-07 (409) |
| SUGG-004 | T-SUGG-07, 08 | 6 | CR-01→04 |
| SUGG-005 | T-SUGG-09 | 6 | Invalidate ngay |
| SUGG-006 | T-SUGG-10 | 7 | Should Have |
| VOUCH-001 | T-VOUCH-01 | 2 | |
| VOUCH-002 | T-VOUCH-02→06 | 2 | V1–V8 fail-fast |
| VOUCH-003 | T-VOUCH-07, 08, 09 | 3 | ⭐ + EC-01/03 |
| VOUCH-004 | T-VOUCH-10 | 2 | Không tăng usage |
| VOUCH-005 | T-VOUCH-11 | 4 | + EC-02 |
| EC-04 | (bổ sung) | 4 | Concurrency |
| EC-10 | T-VOUCH-12 | 4 | Rate limit |

---

*Tài liệu phân tích lập bởi vai trò Solution Architect / BA / Tech Lead / PM, bám sát 100% nội dung SRS v1.0. Mọi điểm SRS không đặc tả đã được đánh dấu ❌ hoặc đưa vào danh sách clarify (mục 11.3) thay vì tự giả định.*
