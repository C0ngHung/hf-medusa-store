# Project Tasks

# 👤 Hùng

## Ngày 1

- [x] **1.2.1** — Tạo cấu trúc thư mục .claude
- [x] **1.2.2** — Tạo rules cho coding, testing, security, Medusa
- [x] **1.2.3** — Tạo workflow vibe coding bằng Claude Code
- [x] **1.2.4** — Tạo convention cho branch, PR, evidence
- [x] **1.2.5** — Chốt ownership file để giảm conflict khi 4 người cùng code
- [x] **1.3.5** — Chốt Redis usage: suggestion cache, voucher validation cache, failed-attempt counter

> **Deliverable:** Claude workflow, rules và ownership convention hoàn thành.

## Ngày 2

- [x] **3.1.1** — Code custom module VoucherEngine
- [x] **3.1.2** — Code VoucherConfig model
- [x] **3.1.3** — Code VoucherUsageLog model
- [x] **3.1.4** — Code DiscountCapConfig model
- [x] **3.1.5** — Code voucher scope theo product/category
- [x] **3.1.6** — Code migration cho VoucherEngine tables
- [x] **3.1.7** — Code module service cho voucher config
- [x] **3.1.8** — Code module service cho usage/audit log
- [x] **3.1.9** — Register VoucherEngine module vào Medusa project
- [x] **3.1.10** — Seed voucher/demo data phục vụ test

> **Deliverable:** VoucherEngine foundation, migration và services sẵn sàng.

## Ngày 3

- [x] **3.2.1** — Code normalize voucher code: trim, uppercase, case-insensitive lookup
- [x] **3.2.2** — Code voucher code format: alphanumeric, minimum 6 characters
- [x] **3.2.3** — Code lookup VoucherConfig by code
- [x] **3.2.4** — Code validation V1: voucher tồn tại và active
- [x] **3.2.5** — Code validation V2: current date nằm trong valid_from và valid_to
- [x] **3.2.6** — Code validation V3: global usage_count < usage_limit
- [x] **3.2.7** — Code validation V4: per-user usage count < per_user_limit
- [x] **3.2.8** — Code validation V5: cart subtotal >= min_order_value
- [x] **3.2.9** — Code validation V6: cart có item thuộc applicable products/categories
- [x] **3.2.10** — Code validation V7: customer segment condition nếu có source được approve
- [x] **3.2.11** — Code validation V8: stacking conflict
- [x] **3.2.12** — Code fail-fast validation theo thứ tự V1 → V8
- [x] **3.2.13** — Code error-code và message tiếng Việt tương ứng V1 → V8

> **Deliverable:** Voucher validation V1-V8 đáp ứng VOUCH-002.

## Ngày 4

- [ ] **3.4.11** — Code Admin API POST /admin/vouchers
- [ ] **3.4.12** — Code Admin API GET /admin/vouchers/:id/analytics
- [ ] **3.4.13** — Validate input cho Voucher APIs
- [ ] **3.7.1** — Code voucher validation cache TTL 30 giây
- [ ] **3.7.2** — Code cache scope an toàn, tránh stale cart-dependent validation
- [ ] **3.7.3** — Code failed-attempt counter theo customer/session
- [ ] **3.7.4** — Code rule 5 failed attempts trong 15 phút
- [ ] **3.7.5** — Code 30-minute cooldown sau khi vượt failed attempts
- [ ] **3.7.6** — Code Redis coordination cho atomic checks nếu được chọn trong SPEC
- [ ] **3.7.7** — Code Redis fallback behavior khi Redis unavailable
- [ ] **3.7.8** — Log failed attempts phục vụ monitoring/demo evidence

> **Deliverable:** Voucher admin APIs, Redis/rate-limit và usage foundation hoàn thành.

## Ngày 5

- [ ] **3.5.2** — Code revalidate voucher khi item added
- [ ] **3.5.3** — Code revalidate voucher khi item removed
- [ ] **3.5.4** — Code revalidate voucher khi quantity updated
- [ ] **3.5.5** — Code revalidate voucher khi suggested product added
- [ ] **3.5.6** — Code revalidate voucher khi suggested product removed
- [ ] **3.5.9** — Code notification reason: cart không còn đạt minimum amount
- [ ] **3.5.10** — Code notification reason: không còn eligible items trong cart
- [ ] **3.5.11** — Code cart total recalculation sau auto-remove
- [ ] **3.5.12** — Đảm bảo voucher luôn tính bằng latest cart state, không dùng stale cart data
- [ ] **3.6.2** — Code verify order chứa applied voucher
- [ ] **3.6.3** — Code verify voucher discount đã nằm trong final order total
- [ ] **3.6.6** — Code chống over-redemption khi nhiều order đồng thời
- [ ] **3.6.11** — Đảm bảo apply voucher vào cart chưa làm tăng usage_count

> **Deliverable:** Voucher revalidation, usage recording và anti-overredemption sẵn sàng.

## Ngày 6

- [ ] **5.2.1** — Test T-VOUCH-01: voucher hợp lệ → discount hiển thị, total update
- [ ] **5.2.2** — Test T-VOUCH-02: invalid code → error message đúng
- [ ] **5.2.3** — Test T-VOUCH-03: expired voucher → expiry error có date
- [ ] **5.2.4** — Test T-VOUCH-04: per-user limit exceeded → usage count error
- [ ] **5.2.12** — Test T-VOUCH-12: 5 failed attempts → rate-limited
- [ ] **5.3.2** — Test voucher code format: uppercase, alphanumeric, minimum 6 characters
- [ ] **5.3.5** — Test VoucherUsageLog append-only/immutable
- [ ] **5.3.6** — Test atomic usage_count hoặc ghi rõ evidence cho selected strategy
- [ ] **5.3.8** — Test Redis cooldown behavior
- [ ] **5.4.2** — Fix bug sau VoucherEngine tests
- [ ] **5.4.7** — Tổng hợp evidence theo VOUCH requirements

> **Deliverable:** Evidence cho voucher validation, usage, audit và rate-limit.

## Ngày 7

- [ ] **5.5.1** — Chuẩn bị demo script
- [ ] **5.5.6** — Hoàn thiện team assignment và timeline 7 ngày
- [ ] **5.5.7** — Hoàn thiện risk/conflict management
- [ ] **5.5.8** — Hoàn thiện success metrics
- [ ] **5.5.9** — Hoàn thiện lessons learned

> **Deliverable:** Final mentor report, timeline, risk/conflict và success metrics.

# 👤 Linh

## Ngày 1

- [x] **1.1.1** — Khởi tạo MedusaJS v2 backend
- [x] **1.1.2** — Thiết lập Git repository
- [x] **1.1.3** — Cấu hình biến môi trường _(tạo `.env` từ template cho checkout này)_
- [x] **1.1.4** — Cấu hình PostgreSQL _(docker `hf_medusa_postgres` :5433, đã migrate)_
- [x] **1.1.5** — Cấu hình Redis _(docker `hf_medusa_redis` :6380)_
- [x] **1.1.6** — Kiểm tra backend chạy local _(/health 200)_
- [x] **1.1.7** — Gắn catalog/demo data đã có vào môi trường dev _(21 products đã seed)_

> **Deliverable:** Repository và môi trường dev chạy ổn định. ✅ _(hạ tầng dùng chung; xem TRACKING về DB dev riêng)_

## Ngày 2

- [x] **2.1.1** — Code custom module SuggestiveSelling _(có sẵn từ `feat/init-medusa`)_
- [x] **2.1.2** — Code SuggestionRule model
- [x] **2.1.3** — Code SuggestionRuleItem model
- [x] **2.1.4** — Code CartSuggestionCondition model
- [x] **2.1.6** — Code migration cho SuggestiveSelling tables
- [x] **2.1.7** — Code module service cho suggestion rules và suggestion events
- [x] **2.1.8** — Register SuggestiveSelling module vào Medusa project
- [x] **2.1.9** — Seed suggestion rules phục vụ demo

> **Deliverable:** SuggestiveSelling foundation, migration và service sẵn sàng. ✅

### 🔧 Điều chỉnh model (nhánh `feat/suggestive-selling-evaluator`)

- [x] **2.1.M1** — Pivot `SuggestionRuleSource` (1 rule → N source product); bỏ `source_product_id` trên `SuggestionRule`
- [x] **2.1.M2** — `ProductBulkMapping` cho CR-04 (single → bulk, `unit_multiplier`) + 2 read-only link _(báo Sơn: logic CR-04 = 2.4.6)_
- [x] **2.1.M3** — Admin API `suggestion-rules` nhận `source_product_ids[]` (validators/POST/PUT/GET) + seed qua pivot & bulk mapping
- [x] **2.1.M4** — `db:generate` → `Migration20260713072737.ts` + typecheck sạch
- [x] **2.1.M5** — `db:migrate` + reseed trên `hfmedusa` (reset schema module + chạy lại migration nhánh) → 5 rules / 5 sources / 12 items / 6 complements / 1 bulk ✅

## Ngày 3

- [x] **2.2.2** — Code Tier 1 Manual Curation theo admin-configured product-to-product links
- [x] **2.2.3** — Code display_order để sắp xếp manual suggestions
- [x] **2.2.4** — Code Tier 2 Category Complement backfill khi manual suggestion < 3
- [x] **2.2.5** — Code category complement mapping: rackets → strings/grips/bags _(seed)_
- [x] **2.2.6** — Code category complement mapping: shoes → socks/insoles _(seed)_
- [x] **2.2.7** — Code category complement mapping: shuttlecocks → tubes/bulk _(seed)_
- [x] **2.2.10** — Code max result 3-5 products cho product-level suggestions

> **Deliverable:** Product-level suggestion logic đáp ứng SUGG-001. ✅ _(workflow evaluate-product-suggestions + unit test T-SUGG-01/02)_
> ⚠️ Tier-2 top-seller đang stub newest-first → nhánh riêng `feat/suggestive-selling-topseller-ranking` (phương án B+C).

## Ngày 4

- [x] **2.5.4** — Code Admin API POST /admin/suggestion-rules _(route→workflow, smoke-tested)_
- [x] **2.5.5** — Code Admin API PUT /admin/suggestion-rules/:id
- [x] **2.5.6** — Code Admin API DELETE /admin/suggestion-rules/:id bằng soft delete
- [x] **2.5.7** — Validate input cho suggestion APIs _(zod validators)_
- [~] **2.5.8** — Chuẩn hóa empty/fallback response khi không có suggestion
  - 📝 **Quyết định tạm (2026-07-13):** khi không có suggestion → **trả `[]`** (workflow đã tự trả rỗng). Phần chuẩn hóa _vỏ response_ `{suggestions: []}` + degrade-to-empty (BR-10) nằm ở **store route của Sơn (2.5.1)** → **BÀN LẠI SAU** khi có route đó.
- [ ] **2.5.9** — Chuẩn hóa error response và message tiếng Việt _(cần `middlewares.ts` — file chung, coordinate cả team, Part C)_

> **Deliverable:** Admin APIs cho rule management. 🟡 CRUD+validate ✅; 2.5.8 chốt tạm (bàn sau), 2.5.9 chờ chuẩn error i18n chung.

### Category Complement Map — Admin CRUD

> ⚠️ **NGOÀI SRS.pdf** — verified 2026-07-14 khi đọc trực tiếp `SRS_SuggestiveSelling_Voucher_v1.0.pdf`:
> SRS **không** có entity `CategoryComplementMapping` (§5.1 Data Model chỉ liệt kê `SuggestionRule`,
> `SuggestionRuleItem`, `CartSuggestionCondition`, `SuggestionEvent`) và **không** có endpoint
> `/admin/category-complements` (§6.1 chỉ có CRUD `/admin/suggestion-rules`). SUGG-001 (trang 5) chỉ
> mô tả Tier-2 mapping bằng **prose giá trị cố định** (rackets→strings/grips/bags…).
> → Việc model-hoá thành bảng + CRUD là **quyết định thiết kế G3 của team** (xem [SPEC.md:73](SPEC.md#L73),
> [API_CONTRACT §6](API_CONTRACT_Suggestive_Voucher_Cart.md#L297-L300)), **không phải yêu cầu bắt buộc từ SRS**.
>
> ✅ Đã có sẵn (qua 2.2.4–2.2.7): model `category_complement_mapping`, migration, và seed 3 map. Phần **thiếu** là Admin CRUD API để quản lý map thay vì chỉ sửa qua seed script.

- [ ] **2.5.10** — Code Admin API `GET /admin/category-complements` — list/filter `source_category_id`, `is_active`; phân trang `limit`(50)/`offset`(0) _(ngoài SRS — G3)_
- [ ] **2.5.11** — Code Admin API `POST /admin/category-complements` — tạo map (source→complement category, `display_order`); **duplicate pair → 409** _(ngoài SRS — G3)_
- [ ] **2.5.12** — Code Admin API `PUT /admin/category-complements/:id` — cập nhật `display_order`, `is_active` _(ngoài SRS — G3)_
- [ ] **2.5.13** — Code Admin API `DELETE /admin/category-complements/:id` — xoá cứng map _(ngoài SRS — G3)_
- [ ] **2.5.14** — Zod validators + invalidate cache gợi ý khi map đổi (bump `suggest:cart-rules:version`, xoá `suggest:product:v3:*`) _(ngoài SRS — G3)_

> **Deliverable:** Quản lý Category Complement Map qua Admin API (thay cho seed-only). 🔴 Chưa bắt đầu.
> **Ghi chú ưu tiên:** vì ngoài SRS.pdf và Tier-2 đã chạy được bằng seed → **không phải blocker cho acceptance**; xếp sau các task Must-Have của SRS.

## Ngày 5

- [ ] **2.3.7** — Code one-tap add default variant vào cart với quantity 1
- [ ] **2.3.9** — Code Added state trong 3 giây sau khi add suggestion
- [ ] **2.3.10** — Code toast message xác nhận add-to-cart
- [ ] **2.3.11** — Code Undo action trong 3 giây sau khi one-tap add
- [ ] **4.1.1** — Kết nối cart với SuggestiveSelling result
- [ ] **4.1.4** — Gắn suggested products vào cart/demo response
- [ ] **4.3.1** — Demo flow product detail → product-level suggestions
- [ ] **4.3.2** — Demo flow one-tap add suggested product to cart

> **Deliverable:** One-tap add và suggestion demo flow tích hợp với cart.

## Ngày 6

- [ ] **5.1.1** — Test T-SUGG-01: product có 3 manual suggestions → hiển thị đúng thứ tự
- [ ] **5.1.2** — Test T-SUGG-02: product có 1 manual suggestion → backfill category complement
- [ ] **5.1.3** — Test T-SUGG-03: suggested product đã có trong cart → bị loại
- [ ] **5.1.4** — Test T-SUGG-04: suggested product hết hàng → bị loại
- [ ] **5.1.5** — Test T-SUGG-05: suggestion dismissed → không hiện lại trong session
- [ ] **5.4.1** — Fix bug sau SuggestiveSelling tests
- [ ] **5.4.6** — Tổng hợp evidence theo SUGG requirements

> **Deliverable:** Evidence cho product-level suggestion, filtering và admin rule behavior.

## Ngày 7

- [ ] **5.5.2** — Chuẩn bị demo flow SuggestiveSelling
- [ ] **5.5.5** — Hoàn thiện WBS diagram
- [ ] **5.5.9** — Hoàn thiện lessons learned

> **Deliverable:** Demo evidence phần SuggestiveSelling foundation và WBS diagram.

# 👤 Sơn

## Ngày 1

- [x] **1.3.1** — Hoàn thiện Solution Define cho Suggestive Selling
- [x] **1.3.3** — Chốt API contract giữa SuggestiveSelling, VoucherEngine và Cart
- [x] **1.3.4** — Chốt error response và customer message tiếng Việt
- [x] **1.3.7** — Tạo/review SPEC.md cho 2 module trước khi implement

> **Deliverable:** Solution Define/SPEC phần SuggestiveSelling sẵn sàng.

## Ngày 2

- [x] **2.1.5** — Code SuggestionEvent model
- [x] **2.2.1** — Code evaluateSuggestions workflow cho product detail page
- [x] **2.2.8** — Code data model support Tier 3 Behavioral, nhưng không implement logic Phase 2
- [x] **2.2.9** — Code response gồm image, name, price, discount_price, label, display_order
- [x] **2.3.8** — Code compact variant-selector response khi product có nhiều variants nhưng không có default

> **Deliverable:** Runtime contracts, event model và response format sẵn sàng.

## Ngày 3

- [x] **2.3.1** — Code filter sản phẩm đã có trong cart
- [x] **2.3.2** — Code filter sản phẩm hết hàng theo stock availability
- [x] **2.3.3** — Code filter suggestion bị dismiss trong current session
- [x] **2.3.4** — Code filter sản phẩm đã mua trong 30 ngày gần nhất nếu có purchase-history source
- [x] **2.3.5** — Code ranking theo tier priority và display_order
- [x] **2.3.6** — Code limit kết quả: product-level tối đa 5, cart-level tối đa 3
- [x] **2.4.1** — Code cart-level evaluator cho section “You Might Also Need”
- [x] **2.4.2** — Code CR-01: cart có category X nhưng thiếu complementary category Y
- [x] **2.4.3** — Code CR-02: cart total gần promotional/free-shipping threshold trong 15%
- [x] **2.4.5** — Code CR-03: cart cùng brand thì suggest same-brand accessories
- [x] **2.4.6** — Code CR-04: cart có consumable quantity 1 thì suggest bulk/multipack
- [x] **2.4.7** — Code priority order CR-01 → CR-04
- [x] **2.4.8** — Code top 3 unique suggestions across fired rules
- [x] **2.4.9** — Code hide entire section nếu 0 suggestions
- [x] **2.4.10** — Code threshold_info response: target, current, remaining

> **Deliverable:** Filtering/ranking và cart-level suggestion logic đáp ứng SRS.

## Ngày 4

- [ ] **2.5.1** — Code Store API GET /store/products/:id/suggestions
- [ ] **2.5.2** — Code Store API GET /store/cart/suggestions
- [ ] **2.5.3** — Code Store API POST /store/suggestions/:id/events
- [ ] **2.6.1** — Code subscriber cho cart.updated
- [ ] **2.6.2** — Code re-evaluate suggestions khi item added/removed/quantity updated
- [ ] **2.6.3** — Code Redis key product:{product_id}:suggestions
- [ ] **2.6.4** — Code Redis key cart:{cart_id}:suggestions
- [ ] **2.6.5** — Code Redis TTL 5 phút cho suggestion results
- [ ] **2.6.6** — Code cache invalidation ngay khi cart change
- [ ] **2.6.8** — Code SuggestionEvent impression
- [ ] **2.6.9** — Code SuggestionEvent tap
- [ ] **2.6.10** — Code SuggestionEvent add_to_cart
- [ ] **2.6.11** — Code SuggestionEvent dismiss
- [ ] **2.6.12** — Code event payload đầy đủ: rule_id, source_context, source_product_id/cart, suggested_product_id, customer_id, session_id, timestamp, action

> **Deliverable:** Store APIs, cache và analytics events hoàn thành.

## Ngày 5

- [ ] **2.4.4** — Code badge_text “Add for FREE shipping!” cho CR-02
- [ ] **2.6.7** — Code stock availability cache cho suggested products nếu cần
- [ ] **2.7.4** — Đảm bảo cold miss fallback sang DB query và cache write
- [ ] **2.7.5** — Đảm bảo frontend/demo có thể hiển thị skeleton loader khi cart-level suggestion async
- [ ] **4.1.7** — Recalculate cart total sau add/remove suggested item
- [ ] **4.3.3** — Demo flow cart page → cart-level suggestions

> **Deliverable:** Cart-level suggestion refresh, cache và demo cart flow hoàn chỉnh.

## Ngày 6

- [ ] **5.1.6** — Test T-SUGG-06: one-tap add → item vào cart, toast hiển thị
- [ ] **5.1.7** — Test T-SUGG-07: cart có racket, không có string → CR-01 suggest strings
- [ ] **5.1.8** — Test T-SUGG-08: cart gần free shipping threshold → badge hiển thị
- [ ] **5.1.9** — Test T-SUGG-09: cart change → suggestions refresh, old cache invalidated
- [ ] **5.1.10** — Test T-SUGG-10: events impression/tap/add/dismiss được tracking
- [ ] **5.3.7** — Test Redis cache invalidation
- [ ] **5.4.1** — Fix bug sau SuggestiveSelling tests
- [ ] **5.4.6** — Tổng hợp evidence theo SUGG requirements

> **Deliverable:** Evidence cho cart-level suggestion, one-tap add, cache và analytics.

## Ngày 7

- [ ] **5.5.2** — Chuẩn bị demo flow SuggestiveSelling
- [ ] **5.5.4** — Chuẩn bị demo checkout end-to-end
- [ ] **5.5.9** — Hoàn thiện lessons learned

> **Deliverable:** Demo evidence phần product/cart suggestion, one-tap add và analytics.

# 👤 Thức

## Ngày 1

- [ ] **1.3.2** — Hoàn thiện Solution Define cho VoucherEngine
- [ ] **1.3.3** — Chốt API contract giữa SuggestiveSelling, VoucherEngine và Cart
- [ ] **1.3.4** — Chốt error response và customer message tiếng Việt
- [ ] **1.3.6** — Chốt strategy cho cart state, voucher state và cart recalculation
- [ ] **1.3.7** — Tạo/review SPEC.md cho 2 module trước khi implement

> **Deliverable:** Solution Define/SPEC phần VoucherEngine sẵn sàng.

## Ngày 2

- [ ] **3.3.1** — Code integer-only monetary calculation, không dùng floating point
- [ ] **3.3.2** — Code original cart subtotal calculation
- [ ] **3.3.14** — Code final cart total recalculation từ authoritative cart data
- [ ] **3.8.3** — Đảm bảo discount calculation server-side only
- [ ] **3.8.4** — Đảm bảo cart total là pricing truth duy nhất

> **Deliverable:** Discount runtime foundation và monetary rules sẵn sàng.

## Ngày 3

- [ ] **3.3.3** — Code item-level promotions apply first
- [ ] **3.3.4** — Code post-promotion subtotal calculation
- [ ] **3.3.5** — Code eligible item resolution cho scoped voucher
- [ ] **3.3.6** — Code percentage voucher trên eligible post-promotion items
- [ ] **3.3.7** — Code fixed-amount voucher calculation
- [ ] **3.3.8** — Code max_discount_amount cap cho voucher
- [ ] **3.3.9** — Code combined discount = item promotions + voucher
- [ ] **3.3.10** — Code global max_discount_percentage cap, default 50%
- [ ] **3.3.11** — Code giảm voucher discount khi combined discount vượt cap
- [ ] **3.3.12** — Code discount_capped: true
- [ ] **3.3.13** — Code cap_explanation

> **Deliverable:** Discount calculator, stacking và global cap đáp ứng VOUCH-003.

## Ngày 4

- [ ] **3.4.1** — Code Store API POST /store/cart/voucher
- [ ] **3.4.2** — Code Store API DELETE /store/cart/voucher
- [ ] **3.4.3** — Code Store API GET /store/customer/vouchers
- [ ] **3.4.4** — Code apply voucher từ manual code entry
- [ ] **3.4.5** — Code apply voucher từ selected voucher trong My Vouchers
- [ ] **3.4.6** — Code one-active-voucher rule
- [ ] **3.4.7** — Code replace current voucher confirmation contract
- [ ] **3.4.8** — Code replace flow: voucher cũ chỉ bị thay sau khi voucher mới pass validation/calculation
- [ ] **3.4.9** — Code voucher tag response: {code} — Save {amount}
- [ ] **3.4.10** — Code remove voucher flow và message tiếng Việt
- [ ] **3.4.14** — Chuẩn hóa response: success, discount_amount, discount_capped, cap_explanation, updated_cart_total, voucher_details
- [ ] **3.5.1** — Code subscriber/hook cho cart change sau khi voucher applied
- [ ] **3.5.7** — Code auto-remove voucher khi cart dưới min_order_value
- [ ] **3.5.8** — Code auto-remove voucher khi không còn eligible items
- [ ] **3.6.1** — Code order-success usage recording workflow
- [ ] **3.6.4** — Code idempotency check theo voucher + order
- [ ] **3.6.5** — Code atomic usage_count increment
- [ ] **3.6.7** — Code tạo VoucherUsageLog append-only/immutable

> **Deliverable:** Voucher Store APIs, revalidation và usage workflow hoàn thành.

## Ngày 5

- [ ] **4.1.2** — Kết nối cart với VoucherEngine result
- [ ] **4.1.3** — Gắn active voucher state vào cart response
- [ ] **4.1.5** — Recalculate cart total sau apply voucher
- [ ] **4.1.6** — Recalculate cart total sau remove voucher
- [ ] **4.1.8** — Đảm bảo cart state consistency sau cart update
- [ ] **4.2.1** — Đảm bảo suggested items có item-level promotion vẫn được tính promotion trước voucher
- [ ] **4.2.2** — Đảm bảo voucher tính sau item-level promotions
- [ ] **4.2.3** — Đảm bảo percentage voucher chỉ tính trên eligible post-promotion items
- [ ] **4.2.4** — Đảm bảo total discount không vượt global cap
- [ ] **4.2.5** — Đảm bảo voucher discount bị giảm khi vượt cap, item promotion không bị giảm
- [ ] **4.2.6** — Đảm bảo suggested item + voucher không tạo negative total
- [ ] **4.2.7** — Trả về explanation khi voucher bị cap
- [ ] **4.3.4** — Demo flow apply voucher
- [ ] **4.3.5** — Demo flow remove voucher
- [ ] **4.3.6** — Demo flow cart change auto-invalidates voucher
- [ ] **4.3.7** — Demo flow checkout/order success triggers usage log
- [ ] **4.3.8** — Verify final order và VoucherUsageLog

> **Deliverable:** Checkout integration, discount conflict và final order usage log hoàn chỉnh.

## Ngày 6

- [ ] **5.2.5** — Test T-VOUCH-05: cart below min_order → hiển thị amount needed
- [ ] **5.2.6** — Test T-VOUCH-06: no eligible items → category error
- [ ] **5.2.7** — Test T-VOUCH-07: item promo 20% + voucher 10% → under cap
- [ ] **5.2.8** — Test T-VOUCH-08: item promo 40% + voucher 20% → voucher reduced by cap
- [ ] **5.2.9** — Test T-VOUCH-09: suggested item promo + voucher → cap prevent negative total
- [ ] **5.2.10** — Test T-VOUCH-10: remove voucher → total reverted, no usage increment
- [ ] **5.2.11** — Test T-VOUCH-11: remove eligible item → voucher auto-removed
- [ ] **5.3.1** — Test server-side-only discount calculation
- [ ] **5.3.3** — Test integer-only monetary calculation
- [ ] **5.3.4** — Test cart total recalculated from scratch
- [ ] **5.4.2** — Fix bug sau VoucherEngine tests
- [ ] **5.4.3** — Fix bug sau checkout integration tests
- [ ] **5.4.8** — Tổng hợp evidence theo edge cases và non-functional requirements

> **Deliverable:** Evidence cho discount cap, revalidation và E2E checkout scenarios.

## Ngày 7

- [ ] **5.5.3** — Chuẩn bị demo flow VoucherEngine
- [ ] **5.5.4** — Chuẩn bị demo checkout end-to-end
- [ ] **5.5.9** — Hoàn thiện lessons learned

> **Deliverable:** Demo evidence phần voucher apply/remove/revalidation/usage và E2E checkout.
