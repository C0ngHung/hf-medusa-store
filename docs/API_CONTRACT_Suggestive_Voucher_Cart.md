# API CONTRACT — SuggestiveSelling × VoucherEngine × Cart

## Badminton E-Commerce (RallyGear) · MedusaJS v2

**Vai trò biên soạn:** Senior Backend Architect (MedusaJS)
**Phiên bản:** 2.0 · **Ngày:** 2026-07-13
**Nguồn:** SRS v1.0 (§3–§9) · Tài liệu phân tích SRS · Solution Flow · TECHNICAL_SOLUTION_DESIGN

> Tài liệu này **chốt hợp đồng API** giữa 3 module (SuggestiveSelling, VoucherEngine, Cart) để đội dev implement thống nhất mà không phải quay lại tranh luận. Đây là **đặc tả đích** (target spec): mô tả API, dữ liệu, và các khối kiến trúc Medusa mà hệ thống phải cung cấp — không theo dõi tiến độ.

---

## 0. NỀN TẢNG CHUNG

### 0.1 Trách nhiệm & ranh giới module

| Module                | Loại                                   | Sở hữu                                                                                                                                    | KHÔNG được làm                                                                                                           |
| --------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **SuggestiveSelling** | Custom module                          | Rule 3 tier, 4 cart-rule (CR-01..CR-04), filter cá nhân, event analytics, category-complement, **attribution ghi vào line-item metadata** | Không tính discount; không ghi giá; không đụng DB Cart/Promotion                                                         |
| **VoucherEngine**     | Custom module (extends Promotion)      | Validate V1–V8, StackingEngine (pure), global cap, usage log, DiscountCapConfig                                                           | Không đọc SuggestiveSelling để tính giá (xem [§7.1](#71-hai-module-custom-không-gọi-nhau)); không tự phát `cart.updated` |
| **Cart**              | Built-in (mở rộng qua hook/subscriber) | Nguồn sự thật về giá (INT-03), line items, phát `cart.updated`, optimistic lock                                                           | —                                                                                                                        |

**Nguyên tắc bất biến (SRS):** giao tiếp cross-module chỉ qua **Link Module + Event** (không FK trực tiếp); mọi tính toán tiền **server-side** (SEC-01); tiền là **integer VND** (INT-01); cart **recalculate-from-scratch** mỗi thay đổi (INT-03).

### 0.2 Ánh xạ primitive MedusaJS

```
API Route (mỏng: validate → gọi workflow/service → map error)
   │
   ├─ Workflow (compensatable)         Service (pure/logic)             Event Subscriber
   │   ├ createSuggestionRule           ├ SuggestiveSellingService        ├ cart.updated (async):
   │   ├ addSuggestedItem               │   (auto-CRUD + evaluator)        │    → invalidate cart suggestion cache
   │   ├ applyVoucher                   ├ VoucherValidationService        │    → (không chạm voucher — KN-02)
   │   └ revalidateVoucherOnCartChange  └ StackingEngine (pure fn)        └ order.placed (async):
   │                                                                           → usage_count++ (atomic) + UsageLog
   └─ Link Module: suggestion_rule↔product, suggestion_rule_item→product,      → copy attribution → order line
                   cart↔voucher_config
```

> **Refinement quan trọng ([§7.2](#72-tách-revalidate-voucher-sync-khỏi-refresh-suggestion-async)):** revalidate voucher chạy **đồng bộ trong request mutation cart**, KHÔNG chạy qua async subscriber → tránh (a) client thấy total cũ, (b) đệ quy `cart.updated`. Subscriber `cart.updated` chỉ lo việc **được phép async**: invalidate cache gợi ý.

### 0.3 Quyết định kiến trúc (đã chốt)

Các điểm SRS bỏ ngỏ — chốt để contract đầy đủ, một chiều, không mơ hồ.

| #   | Vấn đề (SRS bỏ ngỏ)              | Quyết định                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Làm tròn integer khi chia %      | **floor** (làm tròn xuống) ở mọi nơi qua 1 util chung `roundMoney()`. An toàn cho cap, có lợi shop.                                                                                                                                                                                                                                                                                                |
| D2  | Cap 50% tính trên gì             | `max_discount_percentage × subtotal_gốc_hàng_hoá` — **không gồm shipping/tax**.                                                                                                                                                                                                                                                                                                                    |
| D3  | V5 `min_order_value` so với      | **subtotal gốc** (trước item-promo) — dễ giải thích cho khách.                                                                                                                                                                                                                                                                                                                                     |
| D4  | CR-02 dải giá item nudge         | `remaining ≤ price ≤ remaining × 2`, sort sales-rank. (Hằng số code: `CR02_PRICE_BAND_MULT = 2`.)                                                                                                                                                                                                                                                                                                  |
| D5  | "within 15% of threshold"        | `threshold × 0.85 ≤ subtotal < threshold`. (Hằng số code: `CR02_THRESHOLD_PCT = 0.15`.) `threshold` lấy động theo **D12**, không hard-code.                                                                                                                                                                                                                                                        |
| D6  | Nơi lưu dismissal                | **Server-side** (cache set, key `suggest:dismiss:{scope}:{context}`), TTL 24h; scope = `cus:{customer}` hoặc `sess:{session}`.                                                                                                                                                                                                                                                                     |
| D7  | Suggestions sync hay async       | **GET đồng bộ & authoritative** (miss cache thì tính ngay). `cart.updated` chỉ **invalidate** cache.                                                                                                                                                                                                                                                                                               |
| D8  | Idempotency add gợi ý            | Header `Idempotency-Key` + khoá logic `(cart, product, rule, key)`.                                                                                                                                                                                                                                                                                                                                |
| D9  | Assigned store cho guest         | Phase 1: suy từ `region`/`countryCode` → default stock location. Không có query `store_id` riêng ở Phase 1.                                                                                                                                                                                                                                                                                        |
| D10 | usage_limit race (EC-06 gap)     | Re-validate V3 **atomic tại `order.placed`** (bịt lỗ hổng doanh thu).                                                                                                                                                                                                                                                                                                                              |
| D11 | Redis optional (repo convention) | Cache degrade in-memory OK (helper no-op nếu không có Cache module); **usage_count + rate-limit** khi không Redis → fallback DB atomic `UPDATE...WHERE`.                                                                                                                                                                                                                                           |
| D12 | Nguồn ngưỡng freeship (CR-02)    | **Đọc động từ shipping-option price rule** (`item_total` → phí ship = 0), qua `resolveFreeShippingThreshold()` trong cart engine — nguồn sự thật DUY NHẤT dùng chung với storefront `ShippingPriceNudge`. Seed gắn rule sẵn (`initial-data-seed`). Fallback hằng số `FREE_SHIPPING_THRESHOLD = 7.000.000₫` chỉ khi chưa cấu hình rule. Popup nudge chỉ hiện khi `subtotal ≥ 85%` ngưỡng (khớp D5). |

### 0.4 Quy ước format response (chuẩn chung toàn hệ thống)

**Thành công** — giữ đúng convention Medusa (SDK storefront/admin phụ thuộc), KHÔNG bọc `{success,data}` (xem [§7.8](#78-không-bọc-successdata-cho-success)):

| Kiểu              | Shape                                                          |
| ----------------- | -------------------------------------------------------------- |
| List              | `{ "<resource_số_nhiều>": [...], "count", "limit", "offset" }` |
| Single            | `{ "<resource_số_ít>": { ... } }`                              |
| Soft delete       | `{ "id", "object": "<resource>", "deleted": true }`            |
| Action (mutation) | Object phẳng, **luôn có `updated_cart_total`** nếu chạm giỏ    |

Quy ước dữ liệu bắt buộc mọi endpoint:

- **Tiền:** integer VND (`price: 150000` = 150.000₫). `discount_value`: `2000` = 20.00%.
- **Thời gian:** ISO-8601 UTC (`"2026-07-10T09:00:00Z"`).
- **Bool cờ nghiệp vụ** phơi ra rõ: `discount_capped`, `requires_variant_selection`, `is_idempotent_replay`, `in_stock`.

**Lỗi** — envelope chuẩn hoá (chi tiết [§4](#4-error-response-standard)):

```json
{
  "type": "invalid_data",
  "code": "VOUCHER_EXPIRED",
  "message": "Voucher SUMMER expired at 2026-06-30T23:59:59Z",
  "customer_message": "Mã giảm giá đã hết hạn rồi. Bạn xem mã khác trong “Ví voucher” nhé!",
  "details": { "expired_at": "2026-06-30T23:59:59Z" },
  "request_id": "req_01J..."
}
```

---

## 1. API CONTRACT

Ký hiệu quyền: **[C]** customer/guest (scope theo session — SEC-04) · **[A]** admin (auth + role — SEC-04).

### 1.1 SuggestiveSelling — Store

#### `GET /store/products/:id/suggestions` **[C]**

Gợi ý product-level ("Complete Your Setup"). Lazy, ngoài LCP. Cache kết quả **thô** theo product (`suggest:product:v3:{id}`, TTL 5′); filter cá nhân theo khách (in-cart / dismissed / đã mua) chạy **runtime** (D6/D7).

|         |                                                                                        |
| ------- | -------------------------------------------------------------------------------------- |
| Query   | `cart_id?` (lọc item đã có trong giỏ), `limit?` (default 5, max 5 — `PRODUCT_LIMIT`)   |
| Headers | `x-session-id` (scope dismissal/analytics). Customer suy từ auth context nếu đăng nhập |
| 200     | ↓                                                                                      |

```json
{
  "suggestions": [
    {
      "product_id": "prod_1",
      "handle": "bg65-string",
      "variant_id": "var_1",
      "name": "BG65 String",
      "image_url": "https://…",
      "price": 150000,
      "discount_price": 105000,
      "in_stock": true,
      "requires_variant_selection": false,
      "status": "published",
      "category_names": ["Strings"],
      "brand": "Yonex",
      "tier": "manual",
      "rule_id": "srule_1",
      "label": "Best Match",
      "display_order": 1
    }
  ],
  "count": 4
}
```

- `tier`: `manual` (Tier 1) hoặc `category` (Tier 2 backfill). `behavioral` (Tier 3) dành cho Phase 2.
- `discount_price`: `null` nếu không có item-promotion.
- **Rỗng → 200 với `suggestions: []`, `count: 0`** (frontend ẨN section — không lỗi, EC-05/A1).
- Lỗi/timeout nội bộ → **vẫn trả 200 rỗng** (BR-10/INT-03), log server. Không bao giờ 5xx ra khách.

#### `GET /store/carts/:id/suggestions` **[C]**

Gợi ý cart-level ("You Might Also Need"). Route theo chuẩn Medusa `carts/:id` (xem [§7.7](#77-chuẩn-hoá-route-theo-medusa)). Cache `suggest:cart:v{version}:{id}` TTL 5′; **version-counter** `suggest:cart-rules:version` (bump khi admin đổi cart rule); invalidate **ngay** khi `cart.updated`.

|         |                                                        |
| ------- | ------------------------------------------------------ |
| Query   | `limit?` (default 3, max 3 — `CART_LIMIT`)             |
| Headers | `x-session-id` (scope dismissal). Customer từ auth ctx |
| 200     | ↓                                                      |

```json
{
  "suggestions": [
    {
      "product_id": "prod_9",
      "handle": "mavis-350",
      "variant_id": "var_9",
      "name": "Yonex Mavis 350",
      "image_url": "https://…",
      "price": 350000,
      "discount_price": null,
      "in_stock": true,
      "requires_variant_selection": false,
      "status": "published",
      "category_names": ["Shuttlecocks"],
      "brand": "Yonex",
      "tier": "cart",
      "rule_id": "crule_2",
      "rule_code": "CR-02",
      "badge_text": "Add more for FREE shipping!"
    }
  ],
  "count": 3,
  "threshold_info": {
    "target": 7000000,
    "current": 6700000,
    "remaining": 300000
  }
}
```

- `rule_code` ∈ `CR-01 | CR-02 | CR-03 | CR-04`; ≤3 gợi ý unique across rules, đánh giá theo thứ tự CR-01→CR-04, **rule fire trước giữ badge** khi trùng product.
- `threshold_info` chỉ khác `null` khi **CR-02 fire**; ngược lại `null`. `target` = **ngưỡng freeship đọc động từ shipping-option price rule đã cấu hình** (rule `item_total` khiến phí ship = 0 — OI-04, xem [§0.3 D12](#03-quyết-định-kiến-trúc-đã-chốt)). Hằng số `FREE_SHIPPING_THRESHOLD = 7.000.000₫` chỉ là **fallback** khi chưa cấu hình rule (DB mới / query lỗi).
- Empty/lỗi → `suggestions: []`, `count: 0`, `threshold_info: null`, HTTP 200.

#### `POST /store/suggestion-events` **[C]**

Batch tracking (SUGG-006). Fire-and-forget, **202 Accepted** (không chặn render/interaction). Batch tối đa **10** event (thừa bị cắt).

```json
// Request  (enum + id, KHÔNG free-text — SEC-04)
{
  "events": [
    {
      "action": "impression",
      "source_context": "product_view",
      "rule_id": "srule_1",
      "source_product_id": "prod_1",
      "suggested_product_id": "prod_2",
      "session_id": "sess_x",
      "tier": "manual",
      "slot": 1,
      "occurred_at": "2026-07-10T09:00:00Z"
    }
  ]
}
```

```json
// 202
{ "accepted": 1, "rejected": 0 }
```

- Bắt buộc mỗi event: `action` ∈ `{impression,tap,add_to_cart,dismiss}`, `source_context` ∈ `{product_view,cart}`, `suggested_product_id`. `customer_id` suy từ auth context (không nhận từ body); `session_id` lấy body hoặc header `x-session-id`.
- Payload sai schema → **loại từng event** (không fail cả batch), phản ánh vào `rejected`, vẫn 202.
- Rate limit 60 req/phút/session → 429 `SUGGESTION_EVENT_RATE_LIMITED` (client buffer, không hiện lỗi — EC-12).

#### `POST /store/carts/:id/suggested-items` **[C]**

One-tap add có attribution (SUGG-003). Bọc `addSuggestedItemWorkflow`: validate attribution (SEC-01) → resolve variant → **re-check stock authoritative** (bypass cache) → idempotency (D8) → add line item + ghi attribution metadata → emit `add_to_cart` → invalidate cart cache.

```json
// Request  (Header: Idempotency-Key: <client-uuid>)
{
  "variant_id": "var_1",
  "product_id": "prod_1",
  "quantity": 1,
  "slot": 1,
  "attribution": {
    "rule_id": "srule_1",
    "source_context": "product_view",
    "source_product_id": "prod_9"
  }
}
```

```json
// 200
{
  "line_item": {
    "id": "li_1",
    "variant_id": "var_1",
    "quantity": 1,
    "metadata": {
      "suggestion_rule_id": "srule_1",
      "source_context": "product_view",
      "source_product_id": "prod_9",
      "tier": "manual",
      "idempotency_key": "b1f…"
    }
  },
  "updated_cart_total": 4650000,
  "is_idempotent_replay": false
}
```

- `variant_id` ưu tiên; nếu chỉ có `product_id`: resolve default/duy nhất variant. Nhiều variant không default & thiếu `variant_id` → **422 `SUGGESTION_VARIANT_SELECTION_REQUIRED`** + `details.variants[]` (mở bottom sheet). Đóng sheet = no-op, KHÔNG dismiss.
- Sản phẩm/variant chưa published → **422 `SUGGESTION_PRODUCT_INACTIVE`**.
- Attribution giả / rule không tồn tại/không active → **422 `SUGGESTION_INVALID_ATTRIBUTION`**, KHÔNG add gì (SEC-01).
- Hết hàng lúc thực thi → **409 `SUGGESTION_STOCK_CONFLICT`** (EC-07) → frontend refresh section.
- Replay cùng `Idempotency-Key` → **200**, trả line item cũ, `is_idempotent_replay: true` (EC-03).
- `updated_cart_total` = `cart.total ?? cart.item_total`.

> **Undo (SF-04):** dùng native `DELETE /store/carts/:id/line-items/:line_id`. Attribution nằm ở metadata nên **tự huỷ theo line item**. Cửa sổ 3s là client-side; "not now ≠ never" → **không** ghi dismissal.

#### `POST /store/carts/:id/dismissals` **[C]**

Ghi dismissal server-side (D6) + phát event `dismiss` (best-effort). Bọc `dismissSuggestionWorkflow`.

```json
// Request
{
  "source_context": "product_view",
  "suggested_product_id": "prod_2",
  "rule_id": "srule_1",
  "source_product_id": "prod_9",
  "tier": "manual",
  "slot": 2
}
```

```json
// 200
{ "dismissed": true }
```

- Header `x-session-id`; scope = `cus:{customer}` (nếu đăng nhập) hoặc `sess:{session}`.
- `source_context` phải ∈ `{product_view,cart}` và `suggested_product_id` bắt buộc, else **422 `VALIDATION_ERROR`**.

### 1.2 SuggestiveSelling — Admin

| Method | Endpoint                          | Mô tả                                                                    | Response                                                |
| ------ | --------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------- |
| GET    | `/admin/suggestion-rules`         | List/filter `type,tier,is_active`; phân trang `limit`(50)/`offset`(0)    | `{ suggestion_rules: [...], count, limit, offset }`     |
| POST   | `/admin/suggestion-rules`         | Tạo rule (zod validate) → **201**. Enforce unique `(type,tier,priority)` | `{ suggestion_rule }`                                   |
| GET    | `/admin/suggestion-rules/:id`     | Chi tiết + `items`,`conditions`,`source_products`                        | `{ suggestion_rule }`                                   |
| PUT    | `/admin/suggestion-rules/:id`     | Cập nhật; items/conditions **replace**; invalidate cache liên quan       | `{ suggestion_rule }`                                   |
| DELETE | `/admin/suggestion-rules/:id`     | Soft delete + cascade children + invalidate cache                        | `{ id, object: "suggestion_rule", deleted: true }`      |
| GET    | `/admin/category-complements`     | List/filter `source_category_id,is_active`; `limit`/`offset`             | `{ category_complements: [...], count, limit, offset }` |
| POST   | `/admin/category-complements`     | Tạo map Tier-2/CR-01 → **201**. Duplicate pair → 409                     | `{ category_complement }`                               |
| PUT    | `/admin/category-complements/:id` | Cập nhật (display_order, is_active…)                                     | `{ category_complement }`                               |
| DELETE | `/admin/category-complements/:id` | Xoá cứng map                                                             | `{ id, object: "category_complement", deleted: true }`  |

Mỗi `suggestion_rule` trả kèm `items[]`, `conditions[]`, và (bổ sung runtime từ Link Module) `source_products: [{id,title}]` + `source_product_ids: string[]`.

**Request body `POST/PUT /admin/suggestion-rules` (zod):**

```jsonc
{
  "name": "Astrox 99 setup",
  "type": "product", // product | cart
  "tier": "manual", // manual | category | behavioral (default manual)
  "priority": 0, // int; unique theo (type,tier,priority)
  "is_active": true,
  "valid_from": null, // ISO-8601 | null
  "valid_to": null,

  // CHỈ cho type=product:
  "source_product_ids": ["prod_9"], // sản phẩm nguồn (link tới product)
  "items": [
    {
      "suggested_product_id": "prod_1",
      "display_order": 1,
      "custom_label": "Best Match",
    },
  ],

  // CHỈ cho type=cart (≥1 condition, KHÔNG có source_product_ids/items):
  "conditions": [
    {
      "condition_type": "category_missing",
      "condition_params": { "source_category_ids": ["cat_racket"] },
    },
    {
      "condition_type": "threshold_near",
      "condition_params": {
        "percentage": 0.15,
        "badge_text": "Add more for FREE shipping!",
      },
    },
    {
      "condition_type": "brand_match",
      "condition_params": { "accessory_category_ids": ["cat_grip"] },
    },
    {
      "condition_type": "consumable_upsell",
      "condition_params": {
        "consumable_category_ids": ["cat_string"],
        "max_quantity": 1,
      },
    },
  ],
}
```

**Ranh giới rule (enforce ở validator):** rule `product` KHÔNG được có `conditions`; rule `cart` KHÔNG được có `source_product_ids`/`items` và **phải** có ≥1 `condition`. Trùng `(type,tier,priority)` → **409 `RULE_PRIORITY_CONFLICT`** (`details.conflicting_rule_id`), nothing written.

### 1.3 VoucherEngine — Store

#### `POST /store/carts/:id/voucher` **[C]**

Áp voucher. Workflow `applyVoucher` (rate-limit → normalize → lookup → V1..V8 fail-fast → calc → per-voucher cap → **global cap** → attach). p95 < 400ms.

```json
// Request  { "code": "SHUTTLE20" }        (query optional: ?replace=true)
```

```json
// 200
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
    "expires_at": "2026-12-31T23:59:59Z"
  }
}
```

```json
// 200 — bị cap (EC-01/03)
{
  "success": true,
  "discount_amount": 490000,
  "discount_capped": true,
  "cap_explanation": "Giảm giá đã được điều chỉnh từ 568.000₫ xuống 490.000₫ theo chính sách giảm tối đa 50%.",
  "updated_cart_total": 2350000,
  "voucher_details": {
    "code": "MEGA20",
    "type": "percentage",
    "value": 2000,
    "expires_at": "…"
  }
}
```

- V1 lookup fail → **404 `VOUCHER_NOT_FOUND`**. V2–V8 fail → **422** (mã lỗi riêng từng V, xem [§5](#5-error-code-catalog)).
- Đang có voucher khác → **409 `VOUCHER_REPLACE_REQUIRED`** (`details.current_code`) → frontend confirm → gọi lại với `?replace=true`.
- 5 lần fail/15′ → **429 `VOUCHER_RATE_LIMITED`** (`details.retry_after_seconds`), cooldown 30′ (EC-10/SEC-02).

#### `DELETE /store/carts/:id/voucher` **[C]**

Gỡ voucher. Đảo discount, **KHÔNG tăng usage** (VOUCH-004).

```json
// 200
{
  "success": true,
  "updated_cart_total": 4650000,
  "message": "Đã gỡ mã giảm giá."
}
```

- Cart không có voucher → **200 no-op idempotent** (`success: true`, total giữ nguyên).

#### `GET /store/customers/me/vouchers` **[C]**

"My Vouchers" (voucher CRM gán). Guest → `{ "vouchers": [] }`.

```json
{
  "vouchers": [
    {
      "code": "SHUTTLE20",
      "description": "Giảm 20% vợt…",
      "discount_type": "percentage",
      "discount_value": 2000,
      "valid_to": "2026-12-31T23:59:59Z",
      "min_order": 200000,
      "applicable_categories": ["Shuttlecocks"]
    }
  ]
}
```

### 1.4 VoucherEngine — Admin

| Method | Endpoint                        | Mô tả                                                                                 | Response                                                                               |
| ------ | ------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| POST   | `/admin/vouchers`               | Tạo; code tự sinh ≥6 alnum uppercase; duplicate → 409 `VOUCHER_CODE_DUPLICATE`        | `{ voucher }`                                                                          |
| GET    | `/admin/vouchers`               | List/filter/phân trang                                                                | `{ vouchers: [...], count, limit, offset }`                                            |
| GET    | `/admin/vouchers/:id`           | Chi tiết                                                                              | `{ voucher }`                                                                          |
| PUT    | `/admin/vouchers/:id`           | Sửa/deactivate                                                                        | `{ voucher }`                                                                          |
| DELETE | `/admin/vouchers/:id`           | Soft delete                                                                           | `{ id, object: "voucher", deleted: true }`                                             |
| GET    | `/admin/vouchers/:id/analytics` | Hiệu quả voucher                                                                      | `{ total_uses, total_discount_given, avg_order_value, capped_count, conversion_rate }` |
| GET    | `/admin/discount-cap-config`    | Singleton cap toàn cục                                                                | `{ discount_cap_config }`                                                              |
| PUT    | `/admin/discount-cap-config`    | Cập nhật `max_discount_percentage` (0..10000); ghi `updated_by`, audit; invalid → 422 | `{ discount_cap_config }`                                                              |

### 1.5 Cart — không thêm endpoint public

Dùng native `POST/DELETE /store/carts/:id/line-items[/:line_id]`. Voucher & suggestion **móc vào vòng đời cart qua workflow/subscriber**, không thay route Cart.

---

## 2. KIẾN TRÚC MEDUSA (Modules · Models · Workflows · Subscribers · Links · Middlewares · Cache)

> Phần này ánh xạ từng khối chức năng vào building-block của MedusaJS v2 để API route giữ đúng vai trò "mỏng".

### 2.1 Modules & service

| Module            | Hằng số đăng ký                                   | Service                                                                                                                                                                           |
| ----------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SuggestiveSelling | `SUGGESTIVE_SELLING_MODULE = 'suggestiveSelling'` | `SuggestiveSellingService extends MedusaService({ SuggestionRule, SuggestionRuleItem, CartSuggestionCondition, SuggestionEvent, CategoryComplementMapping, ProductBulkMapping })` |
| VoucherEngine     | `VOUCHER_MODULE = 'voucher'` (extends Promotion)  | `VoucherService extends MedusaService({ VoucherConfig, VoucherUsageLog, DiscountCapConfig })`                                                                                     |

Đăng ký trong `apps/backend/medusa-config.ts` qua `{ resolve: './src/modules/<name>' }`.

**Custom methods (SuggestiveSellingService), ngoài CRUD auto-generate:**

- `listActiveCartRules(at)` — cart rule active trong time-window, kèm `conditions`+`items`, sort priority asc.
- `listComplements(sourceCategoryId)` — category-complement active, order `display_order`.
- `findPriorityConflicts(type, tier, priority, excludeId?)` — hỗ trợ 409 `RULE_PRIORITY_CONFLICT`.
- `recordEvents(events[])` — batch insert analytics (best-effort, nuốt lỗi).

**Custom methods (VoucherService):**

- `validate(code, cart, customer)` — chuỗi V1..V8 fail-fast.
- `calcDiscount(...)` / `enforceGlobalCap(...)` — pure, dùng chung với StackingEngine.
- `incrementUsageAtomic(voucherId)` — Redis INCR hoặc DB `UPDATE...WHERE usage_count<usage_limit` (D11).

### 2.2 Data models

**SuggestiveSelling** (`model.define('snake_case', …)`; cross-module id là `text()` wired qua Link, không FK):

| Model                         | Field chính                                                                                                                                                                                                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `suggestion_rule`             | `name text`, `type enum(product\|cart)`, `tier enum(manual\|category\|behavioral)`, `priority int=0`, `is_active bool=true`, `valid_from/valid_to dateTime?`; hasMany `items`,`conditions`; index `(type,is_active,priority)`                                                   |
| `suggestion_rule_item`        | `suggested_product_id text`, `display_order int=0`, `custom_label text?`; belongsTo `rule`                                                                                                                                                                                      |
| `cart_suggestion_condition`   | `condition_type enum(category_missing\|threshold_near\|brand_match\|consumable_upsell)`, `condition_params json?`; belongsTo `rule`                                                                                                                                             |
| `category_complement_mapping` | `source_category_id text`, `complement_category_id text`, `display_order int=0`, `is_active bool=true`; index `(source_category_id,is_active)`                                                                                                                                  |
| `product_bulk_mapping`        | `source_product_id text`, `bulk_product_id text`, `pack_size int=2`, `priority int=0`, `is_active bool=true`; index `(source_product_id,is_active,priority)`                                                                                                                    |
| `suggestion_event`            | `rule_id text?`, `source_context enum(product_view\|cart)`, `source_product_id text?`, `suggested_product_id text`, `customer_id text?`, `session_id text?`, `action enum(impression\|tap\|add_to_cart\|dismiss)`, `tier text?`, `slot int?`; index `(created_at)`, append-only |

**VoucherEngine** (extends Promotion — SRS §5.2):

| Model                 | Field chính                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `voucher_config`      | `code text UNIQUE (uppercase)`, `discount_type enum(percentage\|fixed_amount)`, `discount_value int`, `min_order_value int?`, `max_discount_amount int?`, `applicable_category_ids text[]?`, `applicable_product_ids text[]?`, `stackable_with_promotions bool=true`, `per_user_limit int=1`, `usage_limit int?`, `usage_count int=0`, `user_segment_conditions json?`, `valid_from/valid_to`, `is_active bool` |
| `voucher_usage_log`   | `voucher_id text`, `customer_id text`, `order_id text`, `discount_applied int`, `was_capped bool`, `original_discount int`, `applied_at dateTime` — immutable (INT-04)                                                                                                                                                                                                                                          |
| `discount_cap_config` | `max_discount_percentage int` (5000 = 50.00%), `is_active bool`, `updated_by text`, `updated_at` — singleton                                                                                                                                                                                                                                                                                                    |

### 2.3 Workflows & steps

Route chỉ gọi workflow; mỗi step có compensation.

**SuggestiveSelling**

| Workflow (id)                                                 | Input                                                                                                  | Steps                                                                                                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createSuggestionRuleWorkflow` (`create-suggestion-rule`)     | `CreateSuggestionRuleBody`                                                                             | `createSuggestionRuleStep` (check priority-conflict, tạo items/conditions, replace source-product links, invalidate cache, bump cart-rule version) |
| `updateSuggestionRuleWorkflow` (`update-suggestion-rule`)     | `UpdateSuggestionRuleBody & { id }`                                                                    | `updateSuggestionRuleStep` (replace items/conditions, re-link, invalidate, bump version)                                                           |
| `deleteSuggestionRuleWorkflow` (`delete-suggestion-rule`)     | `{ id }`                                                                                               | `deleteSuggestionRuleStep` (soft delete + cascade, invalidate) → `{ id, object, deleted }`                                                         |
| `createCategoryComplementWorkflow` / `update…` / `delete…`    | `{ source_category_id, complement_category_id, display_order?, is_active? }` (+`id` cho update/delete) | assert unique (source≠complement, pair, display_order) → mutate → `invalidateCategorySuggestions`                                                  |
| `createSuggestionEventsWorkflow` (`create-suggestion-events`) | `{ events[], best_effort? }`                                                                           | `createSuggestionEventsStep` → `{ events, accepted }`; compensation xoá event                                                                      |
| `dismissSuggestionWorkflow` (`dismiss-suggestion`)            | `{ scope, context, product_id, event }`                                                                | `addSuggestionDismissalStep` + `createSuggestionEventsStep(best_effort)` → `{ dismissed: true }`                                                   |
| `addSuggestedItemWorkflow` (`add-suggested-item`)             | `{ cart_id, variant_id, quantity, metadata, event }`                                                   | core `addToCartWorkflow.runAsStep` + `createSuggestionEventsStep(best_effort)` + `invalidateCartSuggestionsStep`                                   |

**VoucherEngine**

| Workflow                        | Steps (compensatable)                                                                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `applyVoucherWorkflow`          | rate-limit → normalize → lookup → V1..V8 → `calcDiscount` (pure) → per-voucher cap → `enforceGlobalCap` (pure) → attachToCart (compensation: gỡ promotion + revert total) |
| `removeVoucherWorkflow`         | detach voucher → cart recalc (INT-03); không tăng usage                                                                                                                   |
| `revalidateVoucherOnCartChange` | re-run V1..V8 → nhánh 3a recalc-stacking (giữ) / 3b removeVoucher + reason → notify (fire-and-forget). Chạy **đồng bộ** trong request mutation (KN-02)                    |

### 2.4 Subscribers

| Subscriber                       | Event          | Hành vi                                                                                           |
| -------------------------------- | -------------- | ------------------------------------------------------------------------------------------------- |
| `cart-updated-suggestions`       | `cart.updated` | `invalidateCartSuggestions(cartId)`. Failure-isolated (log warn, không throw). KHÔNG chạm voucher |
| `order-placed-voucher` (Voucher) | `order.placed` | re-validate V3 atomic (D10) → `usage_count++` + `VoucherUsageLog` (immutable)                     |
| `order-placed-attribution`       | `order.placed` | copy line-item metadata `{rule,context,tier}` → order line (analytics)                            |

> Revalidate-voucher KHÔNG đặt trong subscriber `cart.updated` (tránh race + đệ quy). Xem [§3.3](#33-cartupdated-fan-out-sugg-005--vouch-005--chống-đệ-quy--staleness).

### 2.5 Links (Module Link, không FK)

| Link                                                  | Kiểu                                         | Bảng pivot                |
| ----------------------------------------------------- | -------------------------------------------- | ------------------------- |
| `suggestion_rule ↔ product`                           | managed many-to-many (isList, deleteCascade) | `suggestion_rule_product` |
| `suggestion_rule_item.suggested_product_id → product` | read-only (trên field sẵn có)                | — (không pivot)           |
| `cart ↔ voucher_config`                               | managed (attach voucher active vào cart)     | link table                |

### 2.6 Middlewares & error handler

- `apps/backend/src/api/middlewares.ts` export `defineMiddlewares({ errorHandler, routes: [...] })`.
- `errorHandler` chuẩn hoá mọi lỗi về envelope `{ type, code, message, customer_message, details?, request_id }`; log khi status ≥ 500.
- `BusinessError extends Error` (`lib/errors.ts`) mang `code`, `type`, `httpStatus`, `customerMessage`, `details?`. Bảng `TYPE_TO_STATUS`: `invalid_data→422`, `not_found→404`, `conflict→409`, `rate_limited→429`, `unauthorized→401`, `not_allowed→403`, `server_error→500`. Native `MedusaError` được map tương ứng (INVALID_DATA→422, DUPLICATE_ERROR→409…).
- `validateAndTransformBody` bindings: `POST /admin/suggestion-rules` → `CreateSuggestionRuleSchema`; `PUT /admin/suggestion-rules/:id` → `UpdateSuggestionRuleSchema`. Các route validate thủ công/qua workflow (category-complements, suggestion-events batch, dismissals, suggested-items).

### 2.7 Cache (Redis optional — D11)

| Key                                 | TTL       | Invalidation                                                                                            |
| ----------------------------------- | --------- | ------------------------------------------------------------------------------------------------------- |
| `suggest:product:v3:{productId}`    | 300s (5′) | Khi admin sửa/xoá rule liên quan; category-complement đổi                                               |
| `suggest:cart:v{version}:{cartId}`  | 300s (5′) | **Ngay** khi `cart.updated`; bump `suggest:cart-rules:version` khi đổi cart rule (invalidate hàng loạt) |
| `suggest:dismiss:{scope}:{context}` | 24h       | Merge guest→customer khi login                                                                          |
| Voucher validation result           | 30s       | —                                                                                                       |
| Usage counter / rate-limit          | —         | Atomic INCR (INT-02, EC-10); fallback DB atomic khi thiếu Redis                                         |

Tất cả helper cache **no-op** nếu `Modules.CACHE` không resolve được → degrade sạch, không vỡ luồng.

---

## 3. SEQUENCE FLOW (ai gọi ai · khi nào · luồng)

### 3.1 Ma trận tương tác

| Từ → Đến                                                 | Cơ chế                                            | Thời điểm                    | Đồng bộ?                                                                          |
| -------------------------------------------------------- | ------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------- |
| Storefront → SuggestiveSelling                           | GET suggestions                                   | mở product / render cart     | sync                                                                              |
| Storefront → Cart (native) + SuggestiveSelling (wrapper) | POST suggested-items                              | tap Add                      | sync                                                                              |
| Storefront → VoucherEngine                               | POST/DELETE voucher                               | checkout                     | sync                                                                              |
| Cart → SuggestiveSelling                                 | event `cart.updated`                              | mọi mutation                 | **async** (chỉ invalidate cache)                                                  |
| Cart → VoucherEngine                                     | **workflow đồng bộ trong request mutation**       | mutation khi cart có voucher | **sync** ([§7.2](#72-tách-revalidate-voucher-sync-khỏi-refresh-suggestion-async)) |
| Order → VoucherEngine                                    | event `order.placed`                              | đặt hàng thành công          | async                                                                             |
| Order → SuggestiveSelling                                | event `order.placed`                              | đặt hàng thành công          | async (copy attribution)                                                          |
| VoucherEngine → Promotion/Pricing                        | Query (read)                                      | trong StackingEngine         | sync                                                                              |
| VoucherEngine → SuggestiveSelling                        | **KHÔNG** (đọc attribution từ cart line metadata) | —                            | — ([§7.1](#71-hai-module-custom-không-gọi-nhau))                                  |

### 3.2 Apply voucher (VOUCH-001/002/003) ⭐

```
Storefront ──POST /store/carts/:id/voucher {code}──► API Route
  Route → applyVoucher workflow:
    1 rate-limit (Redis/DB) ── vượt ─► 429 VOUCHER_RATE_LIMITED
    2 normalize (UPPER, trim) → lookup ── miss ─► 404 VOUCHER_NOT_FOUND
    3 V1..V8 fail-fast ── fail ─► 422 <mã V> (+i18n)  [đọc Cart items, Customer, UsageLog]
    4 StackingEngine (PURE, no I/O):
        (1) item-promo trên giá gốc  [input từ Promotion/Pricing]
        (2) voucher trên post-promo, chỉ eligible items
        (3) cap max_discount_amount
        (4) global cap 50% × subtotal_gốc ── vượt ─► cắt CHỈ voucher, discount_capped=true
        (5) sàn total ≥ 1 VND (EC-03) + warning log
    5 attach voucher = Promotion code lên cart → Cart recalculate (INT-03)
       [compensation: gỡ promotion + revert]
  ◄── 200 {discount_amount, discount_capped, cap_explanation, updated_cart_total, voucher_details}
```

**Fixture số học chuẩn (SRS §VOUCH-003, dùng làm test):**

- _Happy:_ Vợt 4.500.000 (promo 20% → −900.000) + Cước 200.000 (no promo), voucher SAVE10 10% → post-promo 3.800.000 → voucher 380.000; tổng giảm 27,2% < 50% → **trả 3.420.000₫**.
- _Cap:_ Vợt 4.500.000 (promo 40% → −1.800.000) + Cước 200.000 (promo 30% → −60.000), voucher MEGA20 20% → voucher thô 568.000; tổng 51,6% > 50% → trần 2.350.000 → voucher cắt còn 490.000 → **trả 2.350.000₫**, `discount_capped=true`.

### 3.3 cart.updated fan-out (SUGG-005 + VOUCH-005) — chống đệ quy & staleness

```
Cart mutation (add/remove/qty)  ──trong CÙNG request──►
  ├─ [SYNC] nếu cart có voucher: revalidateVoucherOnCartChange
  │     V1..V8 lại ─ pass ─► recalc stacking (giữ)         ─ fail ─► gỡ voucher + revert + reason
  │     → total trả về client ĐÃ đúng (không chờ async)
  │     → KHÔNG emit cart.updated lần 2 (recalc qua cart totals, không phát domain event)
  │
  └─ [ASYNC] emit cart.updated ─► subscriber SuggestiveSelling:
        • invalidate cache cart:{id}:suggestions (ngay)
        • lazy tính lại tới GET kế (D7)
        • KHÔNG chạm voucher
```

> Vì sao tách: nếu revalidate voucher chạy async trên `cart.updated`, client GET total ngay sau mutation sẽ thấy **discount cũ** (race), và revalidate ghi total dễ phát `cart.updated` lần 2 → **vòng lặp**. Đặt voucher-revalidate **đồng bộ** trong request mutation giải quyết cả hai (INT-03/INT-04, EC-04).

### 3.4 One-tap add suggested item (SUGG-003 / EC-02/03/07)

```
tap Add ─► POST /store/carts/:id/suggested-items (Idempotency-Key)
  addSuggestedItemWorkflow:
    1 validate attribution vs rule active ─ fail ─► 422 SUGGESTION_INVALID_ATTRIBUTION
    2 resolve variant ─ nhiều variant no default ─► 422 SUGGESTION_VARIANT_SELECTION_REQUIRED
                       ─ product chưa published ─► 422 SUGGESTION_PRODUCT_INACTIVE
    3 authoritative stock (bypass cache) ─ hết ─► 409 SUGGESTION_STOCK_CONFLICT
    4 idempotency (cart,product,rule,key) ─ trùng ─► 200 line item cũ (is_idempotent_replay=true)
    5 add line item + attribution metadata  [compensation: remove line item]
    6 emit add_to_cart (best-effort) + invalidate cart cache
  ◄── 200 {line_item, updated_cart_total, is_idempotent_replay}
  → cart.updated (§3.3)
```

### 3.5 Order placed (SF-09 + bịt EC-06 gap)

```
order.placed ─► [VoucherEngine] re-validate V3 atomic (D10) ─ fail ─► block ưu đãi + báo
                 → usage_count++ (Redis INCR / DB UPDATE...WHERE) → ghi VoucherUsageLog (immutable)
             ─► [SuggestiveSelling] copy line metadata {rule,context,tier} → order line (analytics)
```

---

## 4. ERROR RESPONSE STANDARD

### 4.1 Envelope

```json
{
  "type": "invalid_data | not_found | conflict | rate_limited | unauthorized | not_allowed | server_error",
  "code": "MACHINE_ERROR_CODE",
  "message": "Internal English message — cho logs/devs, có thể chứa id/số kỹ thuật",
  "customer_message": "Thông báo tiếng Việt, ngắn, thân thiện, KHÔNG lộ kỹ thuật",
  "details": { "field": "…" },
  "request_id": "req_…"
}
```

- `code` = SCREAMING_SNAKE, ổn định, FE map hành vi theo `code` (không parse message).
- `message` (EN) chỉ để log/quan sát; `customer_message` (VI) là thứ hiển thị.
- `details` optional — dữ liệu để FE render (vd `remaining`, `variants`, `retry_after_seconds`).

### 4.2 Bảng map status (Medusa v2)

| type           | HTTP    | Dùng cho                                                             |
| -------------- | ------- | -------------------------------------------------------------------- |
| `invalid_data` | **422** | V2–V8, attribution, variant-required (business validation)           |
| `not_found`    | 404     | lookup voucher, cart, line item                                      |
| `conflict`     | 409     | replace voucher, stock conflict, priority/duplicate, optimistic lock |
| `rate_limited` | 429     | brute-force voucher, event spam                                      |
| `unauthorized` | 401     | thiếu auth                                                           |
| `not_allowed`  | 403     | không đủ role (admin)                                                |
| `server_error` | 500     | lỗi hệ thống (suggestion **không** trả 500 — degrade rỗng, BR-10)    |

### 4.3 Nguyên tắc "degrade, không vỡ trang" (BR-10/INT-03)

Suggestion evaluation/enrich/track lỗi → **KHÔNG** trả lỗi HTTP; trả **200 rỗng** (ẩn section). Chỉ 2 lỗi khách được thấy ở luồng gợi ý: `SUGGESTION_STOCK_CONFLICT` (409) và variant-required (422). Voucher & Cart trả lỗi rõ ràng.

---

## 5. ERROR CODE CATALOG

> `V*` = validation VOUCH-002. Tất cả `customer_message` xem đầy đủ ở [§6](#6-customer-messages-tiếng-việt).

### 5.1 Voucher (apply/remove)

| Code                             | HTTP | type         | Internal message (EN)                              | Details                     | Xử lý                                            |
| -------------------------------- | ---- | ------------ | -------------------------------------------------- | --------------------------- | ------------------------------------------------ |
| `VOUCHER_NOT_FOUND`              | 404  | not_found    | `Voucher code {code} not found`                    | —                           | V1. Message KHÔNG xác nhận tồn tại (chống dò mã) |
| `VOUCHER_INACTIVE`               | 422  | invalid_data | `Voucher {code} is_active=false`                   | —                           | V1. Gộp message với NOT_FOUND (an ninh)          |
| `VOUCHER_NOT_YET_VALID`          | 422  | invalid_data | `now < valid_from {date}`                          | `valid_from`                | V2                                               |
| `VOUCHER_EXPIRED`                | 422  | invalid_data | `now > valid_to {date}`                            | `expired_at`                | V2                                               |
| `VOUCHER_USAGE_LIMIT_REACHED`    | 422  | invalid_data | `usage_count>=usage_limit`                         | —                           | V3                                               |
| `VOUCHER_PER_USER_LIMIT_REACHED` | 422  | invalid_data | `per-user {count}/{limit}`                         | `count,limit`               | V4                                               |
| `VOUCHER_MIN_ORDER_NOT_MET`      | 422  | invalid_data | `subtotal {x} < min {y}`                           | `remaining,min_order_value` | V5 (D3)                                          |
| `VOUCHER_NO_ELIGIBLE_ITEMS`      | 422  | invalid_data | `no item in scope {cats}`                          | `applicable_categories`     | V6                                               |
| `VOUCHER_SEGMENT_NOT_ELIGIBLE`   | 422  | invalid_data | `segment mismatch`                                 | —                           | V7                                               |
| `VOUCHER_STACKING_CONFLICT`      | 422  | invalid_data | `stackable_with_promotions=false & cart has promo` | —                           | V8                                               |
| `VOUCHER_REPLACE_REQUIRED`       | 409  | conflict     | `cart already has voucher {cur}`                   | `current_code`              | Confirm → retry `?replace=true`                  |
| `VOUCHER_RATE_LIMITED`           | 429  | rate_limited | `5 fails/15min`                                    | `retry_after_seconds`       | EC-10/SEC-02; log IP+customer                    |
| `DISCOUNT_CAPPED`                | —    | —            | _(không phải lỗi)_ flag trong 200                  | `original,capped`           | Banner giải thích                                |

### 5.2 SuggestiveSelling

| Code                                    | HTTP | type         | Internal message                   | Details      | Xử lý                                     |
| --------------------------------------- | ---- | ------------ | ---------------------------------- | ------------ | ----------------------------------------- |
| `SUGGESTION_STOCK_CONFLICT`             | 409  | conflict     | `variant {v} out of stock at exec` | `product_id` | EC-07 → refresh section                   |
| `SUGGESTION_VARIANT_SELECTION_REQUIRED` | 422  | invalid_data | `multi-variant no default`         | `variants[]` | Mở bottom sheet                           |
| `SUGGESTION_INVALID_ATTRIBUTION`        | 422  | invalid_data | `rule {id} not active/unknown`     | —            | SEC-01 → không add gì                     |
| `SUGGESTION_PRODUCT_INACTIVE`           | 422  | invalid_data | `product/variant not published`    | —            | Refresh section                           |
| `SUGGESTION_EVENT_RATE_LIMITED`         | 429  | rate_limited | `>60 req/min/session`              | —            | EC-12 → client buffer, **không hiện lỗi** |

### 5.3 Cart

| Code                  | HTTP | type      | Internal message                     | Details      | Xử lý                               |
| --------------------- | ---- | --------- | ------------------------------------ | ------------ | ----------------------------------- |
| `CART_NOT_FOUND`      | 404  | not_found | `cart {id} not found`                | —            |                                     |
| `LINE_ITEM_NOT_FOUND` | 404  | not_found | `line {id} not found`                | —            | Undo/remove                         |
| `CART_CONFLICT`       | 409  | conflict  | `optimistic lock / version mismatch` | —            | EC-04 → client refetch & retry      |
| `INSUFFICIENT_STOCK`  | 409  | conflict  | `native inventory`                   | `variant_id` |                                     |
| `UNDO_WINDOW_EXPIRED` | 409  | conflict  | `undo after 3s / qty changed`        | —            | EC-11 → ẩn Undo, dùng cart controls |

### 5.4 Admin

| Code                              | HTTP    | type                     | Internal message                 | Details                                     | Xử lý                  |
| --------------------------------- | ------- | ------------------------ | -------------------------------- | ------------------------------------------- | ---------------------- |
| `RULE_PRIORITY_CONFLICT`          | 409     | conflict                 | `(type,tier,priority) duplicate` | `conflicting_rule_id,conflicting_rule_name` | SF-07; nothing written |
| `COMPLEMENT_PAIR_DUPLICATE`       | 409     | conflict                 | `(source,complement) exists`     | —                                           |                        |
| `CATEGORY_DISPLAY_ORDER_CONFLICT` | 409     | conflict                 | `display_order duplicate`        | `display_order`                             |                        |
| `VOUCHER_CODE_DUPLICATE`          | 409     | conflict                 | `code exists`                    | —                                           |                        |
| `CAP_CONFIG_INVALID`              | 422     | invalid_data             | `pct out of 0..10000`            | —                                           |                        |
| `VALIDATION_ERROR`                | 422     | invalid_data             | zod issues / body sai            | `issues[]`                                  | Body sai               |
| `UNAUTHORIZED` / `FORBIDDEN`      | 401/403 | unauthorized/not_allowed | auth/role                        | —                                           | SEC-04                 |

### 5.5 Chung

| Code             | HTTP | Xử lý                                                             |
| ---------------- | ---- | ----------------------------------------------------------------- |
| `INTERNAL_ERROR` | 500  | Message generic; suggestion path KHÔNG rơi vào đây (degrade rỗng) |
| `RATE_LIMITED`   | 429  | Generic                                                           |

---

## 6. CUSTOMER MESSAGES (TIẾNG VIỆT)

> Ngắn, thân thiện, không lộ kỹ thuật/không xác nhận tồn tại mã. Placeholder `{…}` fill server-side, tiền format `1.234.567₫`.

### 6.1 Voucher

| Code                                     | Customer message (VI)                                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `VOUCHER_NOT_FOUND` / `VOUCHER_INACTIVE` | **Mã giảm giá không đúng. Bạn kiểm tra lại giúp nhé!** _(gộp để không lộ mã tồn tại hay không)_   |
| `VOUCHER_NOT_YET_VALID`                  | Mã này chưa tới ngày sử dụng. Bạn quay lại sau nhé!                                               |
| `VOUCHER_EXPIRED`                        | Mã giảm giá đã hết hạn rồi. Bạn xem thêm mã trong “Ví voucher” nhé!                               |
| `VOUCHER_USAGE_LIMIT_REACHED`            | Mã này đã hết lượt sử dụng. Bạn thử mã khác nhé!                                                  |
| `VOUCHER_PER_USER_LIMIT_REACHED`         | Bạn đã dùng hết lượt cho mã này rồi.                                                              |
| `VOUCHER_MIN_ORDER_NOT_MET`              | Mua thêm **{remaining}** nữa để dùng được mã này nhé!                                             |
| `VOUCHER_NO_ELIGIBLE_ITEMS`              | Mã này chỉ áp dụng cho **{categories}**. Giỏ hàng chưa có sản phẩm phù hợp.                       |
| `VOUCHER_SEGMENT_NOT_ELIGIBLE`           | Mã này không áp dụng cho tài khoản của bạn.                                                       |
| `VOUCHER_STACKING_CONFLICT`              | Mã này không dùng chung với ưu đãi hiện có. Bạn gỡ ưu đãi kia trước nhé!                          |
| `VOUCHER_REPLACE_REQUIRED`               | Bạn đang dùng mã **{current_code}**. Thay bằng mã mới chứ?                                        |
| `VOUCHER_RATE_LIMITED`                   | Bạn thử hơi nhiều lần rồi. Vui lòng thử lại sau **{minutes} phút** nhé!                           |
| remove OK                                | Đã gỡ mã giảm giá.                                                                                |
| `DISCOUNT_CAPPED` (flag)                 | Giảm giá đã được điều chỉnh từ **{original}** xuống **{capped}** theo chính sách giảm tối đa 50%. |
| auto-removed (min)                       | Đã gỡ mã **{code}** — giỏ hàng không còn đạt mức tối thiểu **{amount}**.                          |
| auto-removed (no items)                  | Đã gỡ mã **{code}** — giỏ hàng không còn sản phẩm phù hợp.                                        |

### 6.2 Suggestion

| Code                                    | Customer message (VI)                                                |
| --------------------------------------- | -------------------------------------------------------------------- |
| `SUGGESTION_STOCK_CONFLICT`             | **{product}** vừa hết hàng. Chúng tôi đã cập nhật lại gợi ý cho bạn. |
| `SUGGESTION_VARIANT_SELECTION_REQUIRED` | _(không phải lỗi hiển thị — mở bảng chọn phân loại)_                 |
| `SUGGESTION_INVALID_ATTRIBUTION`        | Không thêm được sản phẩm này. Bạn tải lại trang giúp nhé!            |
| `SUGGESTION_PRODUCT_INACTIVE`           | Sản phẩm này hiện không còn bán.                                     |
| add OK toast                            | Đã thêm **{product}** vào giỏ · **Hoàn tác**                         |

### 6.3 Cart

| Code                  | Customer message (VI)                                                 |
| --------------------- | --------------------------------------------------------------------- |
| `CART_NOT_FOUND`      | Không tìm thấy giỏ hàng. Bạn tải lại trang nhé!                       |
| `INSUFFICIENT_STOCK`  | Sản phẩm không đủ hàng cho số lượng bạn chọn.                         |
| `CART_CONFLICT`       | Giỏ hàng vừa thay đổi. Chúng tôi đã cập nhật lại cho bạn.             |
| `UNDO_WINDOW_EXPIRED` | Đã hết thời gian hoàn tác. Bạn có thể chỉnh trực tiếp trong giỏ hàng. |
| `INTERNAL_ERROR`      | Có lỗi xảy ra, bạn thử lại sau ít phút nhé!                           |

### 6.4 Admin

Admin xem **`message` (EN)** kỹ thuật là đủ; nếu cần VI: "Trùng độ ưu tiên (type/tier/priority)", "Mã voucher đã tồn tại", "Cặp category đã tồn tại", "Trùng thứ tự hiển thị", "Bạn không có quyền thực hiện."

---

## 7. NGUYÊN TẮC & LÝ DO THIẾT KẾ

<a id="71-hai-module-custom-không-gọi-nhau"></a>**7.1 · Hai module custom KHÔNG gọi nhau.** Item-level promotion sống ở **Promotion/Pricing**, không ở SuggestiveSelling. StackingEngine chỉ đọc Promotion/Pricing; thông tin "đây là item gợi ý" (attribution) nằm ở **cart line metadata** và chỉ dùng cho **analytics**, không cho tính giá. Kết quả: 2 module custom không phụ thuộc nhau → giảm coupling, test độc lập.

<a id="72-tách-revalidate-voucher-sync-khỏi-refresh-suggestion-async"></a>**7.2 · Tách revalidate-voucher (SYNC) khỏi refresh-suggestion (ASYNC).** `revalidateVoucherOnCartChange` chạy **đồng bộ trong request mutation cart** (hook/workflow) để response trả về đã đúng total; subscriber `cart.updated` chỉ invalidate cache gợi ý. Nếu buộc phải async: cần cờ `metadata._skip_revalidate` + dedupe theo event id để tránh race + đệ quy.

<a id="73"></a>**7.3 · Voucher = Promotion code, tái dùng recalculation native.** `VoucherConfig extends Promotion` → **attach voucher như một promotion code lên cart** và để Cart module tự recalc (INT-03). Lớp custom chỉ thêm: gate V1–V8 + **global-cap trimming** (thứ Promotion built-in không có). Tránh viết lại toàn bộ tính tiền → giảm sai số.

<a id="74"></a>**7.4 · Rounding & cap dùng 1 util chung.** `roundMoney()` (floor, D1) + `enforceGlobalCap()` là **pure function dùng chung**, có property-based test (`∀ promo%/voucher%: tổng giảm ≤ 50% ∧ total ≥ 1₫`). Đây là nơi dễ sai "từng đồng" nhất (VOUCH-003).

<a id="75"></a>**7.5 · Admin rule enforce unique `(type,tier,priority)`.** `POST/PUT /admin/suggestion-rules` check trùng → **409 `RULE_PRIORITY_CONFLICT`** (SF-07), nothing written. Cache invalidation phải wire tới Cache module thật (không no-op ở prod) để không phục vụ gợi ý stale.

<a id="76"></a>**7.6 · Redis optional → định nghĩa degrade cho usage/rate-limit.** Cache gợi ý degrade in-memory OK. Nhưng **usage_count (INT-02) & rate-limit (EC-10)** mất tính đúng nếu in-memory + multi-instance → prod **bắt buộc Redis**, hoặc fallback DB atomic `UPDATE voucher_config SET usage_count=usage_count+1 WHERE id=? AND usage_count<usage_limit`. Ghi vào runbook.

<a id="77-chuẩn-hoá-route-theo-medusa"></a>**7.7 · Chuẩn hoá route theo Medusa.** Dùng `/store/carts/:id/…` (cart id do client giữ) thay vì `/store/cart/…` (cart ngầm định) để tương thích JS SDK.

<a id="78-không-bọc-successdata-cho-success"></a>**7.8 · Không bọc `{success,data}` cho success.** Storefront JS SDK & admin dashboard kỳ vọng response **resource-keyed** của Medusa (`{ suggestion_rules: [] }`). Chuẩn hoá mạnh phần **LỖI** (envelope §4) + quy ước tiền/thời gian/cờ (§0.4); success theo Medusa.

<a id="79"></a>**7.9 · Attribution = line-item metadata (không bảng riêng).** Ghi `{suggestion_rule_id, source_context, source_product_id, tier}` vào `metadata` của cart line → (a) huỷ theo line khi xoá/undo (không orphan, INT-05), (b) copy sang order line lúc `order.placed`. Không cần bảng attribution riêng.

<a id="710"></a>**7.10 · Re-validate V3 tại `order.placed` (bịt EC-06 gap).** usage_count chỉ tăng lúc đặt hàng nhưng V3/V4 check lúc apply → nhiều khách apply hợp lệ rồi cùng đặt có thể vượt `usage_limit`. Thêm bước atomic re-check tại `order.placed` (D10).

<a id="711"></a>**7.11 · Batch events + `202`.** `POST /store/suggestion-events` batch ≤10, trả 202, loại từng event lỗi thay vì fail cả batch (SEC-04, EC-12).

---

_— Hết. Contract này là đặc tả đích; mọi thay đổi phải cập nhật lại tài liệu trước khi implement._
