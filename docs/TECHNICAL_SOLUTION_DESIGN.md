# TECHNICAL SOLUTION DESIGN
## Badminton E-Commerce Shop — Suggestive Selling + Voucher at Checkout
### Nền tảng: MedusaJS v2 | Timeline: 7 ngày | Team: 4 người (không phân biệt role)

**Phiên bản:** 1.0 | **Ngày:** 07/07/2026
**Nguồn:** SRS v1.0 + Tài liệu phân tích chuyên sâu SRS (Suggestive Selling + Voucher)

---

## 1. TỔNG QUAN GIẢI PHÁP

### 1.1 Bài toán
Xây dựng website e-commerce bán thiết bị cầu lông trên **MedusaJS v2** (tận dụng toàn bộ core commerce có sẵn: Product, Cart, Order, Customer, Promotion, Pricing, Inventory) và phát triển **2 custom feature** theo SRS:

1. **Suggestive Selling** — gợi ý bán kèm tại product detail ("Complete Your Setup") và cart ("You Might Also Need").
2. **Voucher at Checkout** — áp/gỡ voucher, chuỗi validate V1–V8, stacking với item-level promotion, global discount cap 50%.

### 1.2 Nguyên tắc kiến trúc (theo SRS §2.1, §12)
- **2 custom module độc lập:** `suggestive-selling` và `voucher-engine` (extends Promotion). Không coupling DB trực tiếp giữa module — giao tiếp qua **Link Module** + **event subscriber**.
- **Cart là nguồn sự thật về giá** (INT-03): mọi thay đổi → recalculate từ đầu, không incremental.
- **Mọi tính toán discount ở server** (SEC-01), frontend chỉ hiển thị.
- **Tiền là integer VND** (INT-01), không floating-point. Quy ước làm tròn: **floor** (làm tròn xuống, có lợi cho shop, ghi rõ trong code — điểm SRS chưa chốt, team tự quyết và ghi chú để confirm với khách).
- **Stacking engine = pure function** (input: items + promos + voucher + cap config → output: discount breakdown). Không I/O → unit test toàn bộ fixture SRS trước khi bọc workflow.

### 1.3 Sơ đồ kiến trúc tổng thể

```
┌────────────────────────── STOREFRONT (Next.js starter) ──────────────────────────┐
│  /products/[slug]              /cart                        /checkout            │
│  CompleteYourSetupSection      YouMightAlsoNeedSection      VoucherInput         │
│  SuggestionCard + Undo         ThresholdProgress            VoucherTag           │
│  VariantBottomSheet            VoucherRemovedToast          CapExplanationBanner │
└───────────┬──────────────────────────┬──────────────────────────┬───────────────┘
            │ REST Store API           │                          │
┌───────────▼──────────────────────────▼──────────────────────────▼───────────────┐
│                            MEDUSA v2 BACKEND                                     │
│                                                                                   │
│  API Routes (mỏng: gọi workflow, map error → 404/409/422/429)                    │
│  ├─ /store/products/:id/suggestions   /store/cart/suggestions                    │
│  ├─ /store/suggestions/:id/events     /store/cart/voucher (POST/DELETE)          │
│  ├─ /store/customer/vouchers                                                     │
│  └─ /admin/suggestion-rules (CRUD)    /admin/vouchers + /analytics               │
│      /admin/discount-cap-config (bổ sung theo gap §6.5)                          │
│                                                                                   │
│  Workflows                                                                        │
│  ├─ evaluateSuggestions      (7 step read + 1 cache write, compensation xóa key) │
│  ├─ applyVoucher             (9 step: normalize→lookup→V1..V8→calc→cap→attach)   │
│  └─ revalidateVoucherOnCartChange (rẽ nhánh giữ/gỡ, notify fire-and-forget)      │
│                                                                                   │
│  Subscribers                                                                      │
│  ├─ cart.updated  → invalidate suggestion cache + re-evaluate cart suggestions   │
│  │                → nếu cart có voucher: kick revalidateVoucherOnCartChange      │
│  │                  (cờ nội bộ chống đệ quy: revalidation không phát cart.updated)│
│  └─ order.placed  → atomic tăng usage_count + ghi VoucherUsageLog (bịt EC-06 gap)│
│                                                                                   │
│  Custom Modules                                                                   │
│  ├─ SuggestiveSelling: rules 3 tier, 4 filter, CR-01→04, event tracking          │
│  └─ VoucherEngine: V1–V8, StackingEngine (pure), DiscountCapConfig               │
│                                                                                   │
│  Link Module: suggestion_rule_item ↔ product                                     │
└──────┬───────────────────────────────┬───────────────────────────────────────────┘
       │                               │
┌──────▼──────┐                 ┌──────▼──────┐
│  PostgreSQL │                 │    Redis    │  cache suggestion (TTL 5m)
│  (Mikro-ORM │                 │             │  cache validate voucher (TTL 30s)
│  migrations)│                 │             │  usage counter atomic, rate limit  │
└─────────────┘                 └─────────────┘
```

---

## 2. DATA MODEL (theo SRS §5, giữ nguyên schema)

### 2.1 Module SuggestiveSelling
| Bảng | Trường chính |
|---|---|
| `suggestion_rule` | id, name, type(product\|cart), tier(manual\|category\|behavioral), priority, is_active, valid_from/to |
| `suggestion_rule_item` | id, rule_id FK, suggested_product_id (Link→Product), display_order, custom_label |
| `cart_suggestion_condition` | id, rule_id FK, condition_type(category_missing\|threshold_near\|brand_match\|consumable_upsell), condition_params jsonb |
| `suggestion_event` | id, rule_id, source_context, source_product_id, suggested_product_id, customer_id, session_id, action, created_at (append-only) |

### 2.2 Module VoucherEngine
| Bảng | Trường chính |
|---|---|
| `voucher_config` (extends Promotion) | code UNIQUE INDEXED uppercase, discount_type(percentage\|fixed_amount), discount_value int (2000 = 20.00%), min_order_value, max_discount_amount, applicable_category_ids[], applicable_product_ids[], stackable_with_promotions, per_user_limit, usage_limit, usage_count, user_segment_conditions jsonb, valid_from/to, is_active |
| `voucher_usage_log` | voucher_id, customer_id, order_id, discount_applied, was_capped, original_discount, applied_at (immutable, INT-04) |
| `discount_cap_config` | max_discount_percentage (5000 = 50.00%), is_active, updated_at, updated_by (singleton) |

**Index:** `voucher_config(code)` unique; `suggestion_rule(type, is_active, priority)`; `voucher_usage_log(voucher_id, customer_id)` cho V4.

**Category complement mapping** (Rackets→Strings/Grips/Bags; Shoes→Socks/Insoles; Shuttlecocks→Tubes): lưu dạng **bảng config seed** (không hardcode) — điểm SRS chưa chốt, team quyết định để chạy được trong 7 ngày, đánh dấu confirm sau.

---

## 3. LUỒNG NGHIỆP VỤ TRỌNG TÂM

### 3.1 Luồng Suggestion — Product Detail (SUGG-001/002/003)
```
GET /store/products/:id/suggestions?store_id=
 1. Check Redis "product:{id}:suggestions" (cache KẾT QUẢ THÔ trước filter)
 2. Miss → workflow evaluateSuggestions:
    resolve context → load active rules → Tier 1 manual (theo display_order)
    → nếu <3: backfill Tier 2 top-selling từ category complement
    → ghi cache thô TTL 5 phút
 3. Filter RUNTIME theo từng khách (giải quyết mâu thuẫn cache chung vs filter cá nhân —
    quyết định của team cho mục 11.3-1): loại nếu (a) đã trong cart, (b) hết hàng,
    (c) đã dismiss trong session (lưu CLIENT-SIDE, gửi kèm query — quyết định team),
    (d) đã mua trong 30 ngày (query Order module)
 4. Rank tier → display_order → limit 5 → enrich giá/discount_price → trả về
Frontend: render 3–5 card, ImpressionObserver bắn event impression;
tap Add → re-check stock (EC-07: 409 → toast + refresh section);
1 variant/default → vào giỏ + ✓Added 3s + Undo toast 3s; nhiều variant → bottom sheet.
```

### 3.2 Luồng Suggestion — Cart (SUGG-004/005)
```
cart.updated → invalidate "cart:{id}:suggestions" NGAY → re-evaluate:
  CR-01 category thiếu bổ trợ → top-selling category Y
  CR-02 |threshold − cart_total| ≤ threshold × 15% → item giá ≥ remaining, badge freeship
        (công thức team chốt cho mục 11.3-3/4: chọn item có giá trong
         [remaining, remaining × 2.5], ghi chú confirm với khách)
  CR-03 mọi item cùng brand → phụ kiện cùng brand
  CR-04 consumable qty=1 → bundle/multipack đơn giá tốt hơn
→ top 3 unique across rules; 0 kết quả → frontend ẨN section.
```

### 3.3 Luồng Voucher — Apply (VOUCH-001/002/003) ⭐
```
POST /store/cart/voucher {code}
 1. Rate-limit check (Redis, theo customer_id + IP): 5 fail/15 phút → 429 + cooldown 30 phút
    (hợp nhất EC-10 + SEC-02: ĐẾM trong 15 phút, PHẠT 30 phút — quyết định team cho 11.3-2)
 2. normalize (trim, UPPERCASE) → lookup (404 nếu không có)
 3. Validate V1→V8 FAIL-FAST, message i18n vi/en:
    V1 tồn tại+active | V2 hiệu lực thời gian | V3 usage_count < usage_limit
    V4 per_user (đếm voucher_usage_log) | V5 subtotal GỐC ≥ min_order_value
    (team chốt cho 11.3-8: dùng subtotal gốc — đơn giản, dễ giải thích cho khách)
    V6 scope category/product | V7 segment jsonb | V8 stacking conflict
 4. StackingEngine (pure function):
    (1) item-level promotions trên giá gốc (KHÔNG bao giờ bị cắt)
    (2) voucher trên post-promo subtotal, CHỈ trên eligible items (cả 2 nhánh scoped/unscoped)
    (3) cap riêng max_discount_amount
    (4) global cap: tổng mọi nguồn giảm ≤ 50% × subtotal GỐC (không gồm ship — 11.3-9)
        vượt → CHỈ cắt voucher, discount_capped=true + cap_explanation
    (5) sàn: total ≥ 1 VND (EC-03) + warning log
 5. Attach voucher vào cart (optimistic locking EC-04) → recalculate → response
    {success, discount_amount, discount_capped, cap_explanation, updated_cart_total, voucher_details}
Áp mã khi đang có voucher khác → 409 confirm "Replace current voucher {code}?"
```

### 3.4 Luồng Voucher — Auto-revalidation (VOUCH-005)
```
cart.updated (cart có voucher) → revalidateVoucherOnCartChange:
  chạy lại V1–V8 → pass: recalculate stacking (giữ voucher)
                 → fail: gỡ voucher + revert totals + notify
                   "Voucher {code} removed — {reason}" (3 case a/b/c)
  Cờ nội bộ: recalculation KHÔNG phát tiếp cart.updated (chống đệ quy).
```

### 3.5 Luồng Order Placed
```
order.placed subscriber → Redis INCR usage_count (atomic, INT-02) + sync DB
→ ghi voucher_usage_log {discount_applied, was_capped, original_discount}
→ (bổ sung ngoài SRS, bịt lỗ hổng 11.2): re-validate V3 ngay trước khi chốt;
  fail → chặn ưu đãi, báo khách.
```

---

## 4. API CONTRACT (11 endpoint SRS + 2 bổ sung)

| # | Method | Endpoint | Ghi chú |
|---|---|---|---|
| 1 | GET | `/store/products/:id/suggestions?store_id=` | Cache 5m, p95 <800ms |
| 2 | GET | `/store/cart/suggestions?limit=3` | threshold_info, p95 <600ms |
| 3 | POST | `/store/suggestions/:id/events` | 4 action, 201 |
| 4 | POST | `/admin/suggestion-rules` | auth+admin |
| 5 | PUT | `/admin/suggestion-rules/:id` | trigger cache invalidation |
| 6 | DELETE | `/admin/suggestion-rules/:id` | soft delete |
| 7 | POST | `/store/cart/voucher` | V1–V8, p95 <400ms |
| 8 | DELETE | `/store/cart/voucher` | usage KHÔNG tăng |
| 9 | GET | `/store/customer/vouchers` | "My Vouchers" |
| 10 | POST | `/admin/vouchers` | code tự sinh ≥6 alphanumeric |
| 11 | GET | `/admin/vouchers/:id/analytics` | 5 metric |
| 12* | GET/PUT | `/admin/discount-cap-config` | gap §6.5-1, bắt buộc để test cap |
| 13* | GET | `/admin/suggestion-rules` (list) | gap §6.5-3, cần cho vận hành |

Error map: 404 (V1/lookup), 409 (EC-07 hết hàng, replace confirm), 422 (V2–V8 kèm message i18n), 429 (rate limit).

---

## 5. SCOPE 7 NGÀY — QUYẾT ĐỊNH CẮT GIẢM

| Giữ (Must Have) | Cắt / Stretch |
|---|---|
| SUGG-001→005, VOUCH-001→005 | SUGG-006 analytics đầy đủ (chỉ ghi event, chưa dashboard) — stretch Ngày 7 |
| EC-01→07, EC-10 | EC-08 cascading tier promo (Should) — stretch |
| StackingEngine đúng fixture SRS từng đồng | EC-09 chỉ chấp nhận hành vi TTL mặc định, không test riêng |
| 20/22 acceptance test (trừ T-SUGG-10 nếu thiếu giờ) | Tier 3 behavioral (Phase 2 SRS — chỉ chừa cột `tier` trong schema) |
| Optimistic locking EC-04 mức cơ bản (version column) | Load test NFR đầy đủ → chỉ smoke-check p95 thủ công |
| i18n vi/en cho message V1–V8 | Admin UI (SRS đã nói API-only) |

**Các điểm mơ hồ SRS (mục 11.3):** không chờ clarify — team **tự chốt phương án ghi rõ trong mục 3 ở trên**, log vào `DECISIONS.md`, đánh dấu ⚠️ confirm với khách sau. Đây là cách duy nhất giữ tiến độ 7 ngày.

---

## 6. TESTING STRATEGY (theo SRS §10, §12.4)

| Tầng | Test | Công cụ |
|---|---|---|
| Unit (không DB) | StackingEngine (fixture 3.420.000₫ / 2.350.000₫ / voucher 490.000₫), V1–V8, 4 filter, CR-01→04, rounding | Jest/Vitest trên pure service |
| Integration | 3 workflow + 2 subscriber + Redis thật, EC-02/04/05/06/07/10 | medusa-test-utils + docker Redis |
| E2E | T-SUGG-06 one-tap add trên storefront | Playwright, 1 flow duy nhất |
| Property-based (stretch) | ∀ promo%/voucher%: tổng giảm ≤ 50% và total ≥ 1 VND | fast-check |

Definition of Done mỗi task = test tương ứng xanh trên CI.

---

## 7. RỦI RO 7 NGÀY & ĐỐI SÁCH

| Rủi ro | Đối sách |
|---|---|
| VOUCH-003 sai số học → sai tiền thật | Làm sớm nhất (Ngày 2–3), pure function, fixture SRS làm bài kiểm định, 2 người cùng review |
| Đệ quy cart.updated (revalidation → updated → revalidation) | Cờ nội bộ trong metadata event, integration test riêng Ngày 5 |
| Team chưa quen Medusa v2 primitives | Ngày 1 cả 4 người cùng dựng + walkthrough Module/Workflow/Subscriber/Link 2 giờ |
| Undo 3s sau khi cart.updated đã bắn | Chấp nhận: undo = remove item bình thường → tự trigger vòng recalculate mới (đơn giản nhất) |
| Điểm mơ hồ SRS ngốn thời gian tranh luận | Mọi quyết định ≤15 phút, ghi DECISIONS.md, đi tiếp |
| 1 người bị block | Standup 2 lần/ngày (sáng + 16h), task nhỏ ≤0.5 ngày, ai xong trước nhảy vào hỗ trợ track kia |
