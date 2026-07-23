# API Documentation (as-built) — SuggestiveSelling + VoucherEngine

**Ngày viết:** 2026-07-22 · **Vai trò:** Technical Writer (Phase 6) · **Phạm vi:** toàn bộ REST API
custom của project — 2 module `voucher-engine` và `suggestive-selling` (Medusa core API không nằm
trong phạm vi này).

Tài liệu cặp đôi với [`TECHNICAL_SPEC.md`](./TECHNICAL_SPEC.md) (kiến trúc, luồng nghiệp vụ, NFR).
Đọc file này để biết endpoint/request/response cụ thể; đọc file kia để hiểu logic đằng sau chúng.

## Vị trí của tài liệu này

Đây là tài liệu **as-built duy nhất còn được duy trì** cho API 2 module — mô tả đúng những gì code
đang làm tại thời điểm viết. `docs/API_CONTRACT_Suggestive_Voucher_Cart.md` (v2.0, 2026-07-13) là
tài liệu cũ, viết trước đợt rebuild Promotion-first — không dùng để tra cứu (xem
[`TECHNICAL_SPEC.md`](./TECHNICAL_SPEC.md) §12 cho danh sách đầy đủ tài liệu lịch sử).

---

## 1. Tổng quan

- **Mục đích:** áp/gỡ voucher + cap giảm giá toàn cục (`voucher-engine`); gợi ý sản phẩm bổ trợ +
  one-tap add + analytics (`suggestive-selling`).
- **Phạm vi sử dụng:** storefront Next.js (`apps/storefront`), admin dashboard (Medusa Admin,
  `apps/backend/src/admin`), và QA/manual test.
- **Base URL:** `http://localhost:9009` (dev, theo `docker-compose.yml`/`.env` — port 9009).
  **Không có staging/production base URL nào được cấu hình hoặc tài liệu hoá trong repo này** —
  không suy đoán, đây là N/A thật, không phải thiếu sót của tài liệu.
- **Authentication method:** KHÔNG dùng OAuth2/API-Key riêng tự viết. Dùng nguyên cơ chế Medusa
  core (framework mặc định, không phải logic của 2 module này):
  - Store API: header `x-publishable-api-key` bắt buộc trên mọi route (sales-channel scoping);
    customer JWT/session (từ `POST /auth/customer/emailpass`, Medusa core) OPTIONAL — nhiều route
    (gợi ý, voucher) hoạt động cho cả guest lẫn customer đã đăng nhập, khác nhau ở mức cá nhân hoá.
  - Admin API: session cookie sau khi admin login (`POST /auth/user/emailpass`, Medusa core) — bắt
    buộc trên mọi route `/admin/*`.
  - Chi tiết luồng lấy/refresh/revoke token là trách nhiệm của Medusa core framework, KHÔNG phải
    logic tự viết trong 2 module này — xem §7 để biết vì sao mục "Authentication Flow" không đi sâu
    hơn.
- **API versioning:** KHÔNG có (không có `/v1/` trong path, không có version header). Toàn bộ route
  nằm phẳng dưới `/store/*` hoặc `/admin/*`. Nếu breaking change xảy ra, hiện chưa có chiến lược
  versioning nào được thiết kế — ghi nhận đây là gap, không phải đã có sẵn.

---

## 2. Quy ước chung

- **Format:** JSON, `Content-Type: application/json` cho mọi request có body.
- **Naming convention:** **snake_case** cho toàn bộ field JSON (khớp field DB/Medusa framework
  convention) — không phải camelCase.
- **Response envelope:** **KHÔNG có 1 envelope chung** kiểu `{ data, meta, error }` cho toàn API.
  Mỗi route trả object phẳng theo domain riêng (`{ voucher }`, `{ suggestions, count }`,...). Lỗi
  cũng KHÔNG thống nhất giữa 2 module — đây là inconsistency thật, ghi nhận tại §4:
  - VoucherEngine: `{ type, code, message, customer_message, details?, request_id? }`.
  - SuggestiveSelling (one-tap add): `{ code, message, details? }` — không có `type`/`request_id`.
- **HTTP status + business error code:** xem bảng riêng từng module ở §3.
- **Pagination:** **offset-based**, chỉ tồn tại ở 2 route admin
  (`GET /admin/suggestion-rules`, `GET /admin/suggestion-events`) — query `limit`/`offset`, response
  trả kèm `count` + echo lại `limit`/`offset`. Mọi route khác KHÔNG phân trang (danh sách vốn nhỏ,
  giới hạn cứng qua constant — `PRODUCT_LIMIT=5`, `CART_LIMIT=3`).
- **Rate limiting:** chỉ có **1 chỗ thật sự implement** — `POST /store/carts/:id/voucher` (5 lần
  fail / 15 phút / khách+IP → cooldown 30 phút, Redis-backed, SEC-02/EC-10). `POST
/store/suggestion-events` có comment trong code nói rõ "Per-session rate limiting (EC-12, 60
  req/min) is out of scope for this route" — tức là **đã thiết kế nhưng CHƯA implement**, không
  phải đã có sẵn.

---

## 3. Chi tiết từng Endpoint

### 3.1 VoucherEngine — Store API

#### `POST /store/carts/:id/voucher`

- **Header parameters:** `x-publishable-api-key` (bắt buộc).
- **Path parameters:** `id` (cart id, bắt buộc).
- **Query parameters:** `replace` (`"true"`/`"false"`, optional) — xác nhận thay voucher đang active.
- **Request body:**

  | Field  | Type   | Required | Validation                                 |
  | ------ | ------ | -------- | ------------------------------------------ |
  | `code` | string | có       | ≥ 6 ký tự, alphanumeric (`^[A-Za-z0-9]+$`) |

  `.strict()` — mọi field khác (giá, id, `discount_amount`,...) bị từ chối thẳng (SEC-01).

- **Response 200 (thành công):** `{ success: true, discount_amount, discount_capped,
cap_explanation?, updated_cart_total, ... }` — đọc thẳng từ Cart đã recompute, route không tự
  tính (INT-03).
- **Error responses:** xem bảng mã lỗi VoucherEngine ở §3.3. Riêng `VOUCHER_NOT_FOUND` còn kích
  hoạt bộ đếm rate-limit (brute-force guard).
- **Side effects:** ghi `LineItemAdjustment` vào cart (không phải Promotion); KHÔNG tăng
  `usage_count` (chỉ tăng ở `order.placed`).

#### `DELETE /store/carts/:id/voucher`

- **Header parameters:** `x-publishable-api-key`.
- **Path parameters:** `id` (cart id).
- **Request body:** không có (`{}` strict).
- **Response 200:** cart đã revert — không có voucher active → vẫn `200` (idempotent no-op).
- **Error responses:** cùng envelope §3.3 (hiếm khi xảy ra — remove hầu như luôn thành công).
- **Side effects:** KHÔNG đụng `usage_count`/`voucher_usage_log` (Rule 12/13).

#### `GET /store/vouchers`

- **Header parameters:** `x-publishable-api-key`. KHÔNG cần customer auth (guest truy cập được).
- **Query parameters:** `cart_id` (optional) — khi có, response thêm
  `eligible`/`ineligible_reason`/`estimated_savings` theo cart cụ thể.
- **Response 200:** `{ vouchers: [...], cap_status }`.
- **Error responses:** không có case lỗi nghiệp vụ riêng (route read-only, không workflow).

#### `GET /store/customers/me/vouchers`

- **Header parameters:** `x-publishable-api-key` + customer session (bắt buộc bởi core Medusa
  route middleware — guest luôn bị 401 trước khi vào tới code này, xem
  `lib/list-available-vouchers.ts` docstring).
- **Query parameters:** `cart_id` (optional) — cùng hành vi với `GET /store/vouchers` (thêm
  `eligible`/`ineligible_reason`/`estimated_savings` theo cart cụ thể).
- **Response 200:** giống `GET /store/vouchers`, cộng thêm voucher gated theo Customer Group.

### 3.2 VoucherEngine — Admin API

**Header parameters (áp dụng cho MỌI endpoint trong §3.2, không lặp lại từng cái):** admin session
cookie (bắt buộc, `/admin/*`, framework mặc định).

**Error handling (áp dụng cho MỌI endpoint trong §3.2 — phát hiện khi kiểm tra lại):** đã đọc trực
tiếp source (`route.ts`) của toàn bộ 7 route admin (`/admin/vouchers`,
`/admin/promotions/:id/voucher-config`, `/admin/vouchers/:id/analytics`,
`/admin/discount-cap-config`) — **không route nào có `try/catch` hay gọi `toErrorEnvelope`**. Khác
với Store API, lỗi ở đây đi qua **error middleware mặc định của Medusa** (zod validation fail →
`400`, `service.retrieve*`/`listAndCount*` not-found → `404`), hình dạng response KHÔNG PHẢI
envelope `{type, code, message, customer_message, ...}` đã mô tả ở §3.3 — đó chỉ áp dụng cho Store
route có xử lý riêng. Không suy đoán ra shape response lỗi cụ thể của middleware mặc định vì chưa
đọc source Medusa core trong phiên này.

#### `POST /admin/vouchers`

- **Request body:** `CreateVoucherSchema` — `code?` (≥6 ký tự alphanumeric, auto-gen nếu bỏ trống),
  `discount_type` (`percentage`|`fixed_amount`), `discount_value` (int ≥1), `min_order_value?`,
  `max_discount_amount?`, `applicable_product_ids?`, `applicable_category_ids?`, `per_user_limit`
  (default 1), `usage_limit?`, `user_segment_conditions?`, `valid_from`, `valid_to` (phải sau
  `valid_from`), `is_active` (default true).
- **Response 201:** voucher vừa tạo, phẳng (không bọc `{ voucher }`).
- **Error responses:** `400` nếu body không hợp lệ (zod) — Medusa error middleware mặc định (xem
  ghi chú đầu §3.2, không phải envelope §3.3).

#### `POST /admin/promotions/:promotion_id/voucher-config`

- **Path parameters:** `promotion_id`.
- **Request body:** `AttachVoucherConfigSchema` (scope/min-order/max-discount/limits/window — xem
  `api/admin/promotions/[promotion_id]/voucher-config/validators.ts`).
- **Response 201:** `{ voucher }`. Idempotent — tạo mới hoặc reactivate VoucherConfig đã liên kết.

#### `DELETE /admin/promotions/:promotion_id/voucher-config`

- **Path parameters:** `promotion_id`.
- **Response 200:** `{ voucher }` với `is_active:false`. No-op nếu đã disable hoặc chưa từng enable.

#### `GET /admin/promotions/:promotion_id/voucher-config`

- **Path parameters:** `promotion_id`.
- **Response 200:** `{ voucher: null }` nếu chưa Enable (KHÔNG phải lỗi 404); ngược lại `{ voucher }`
  đã overlay native fields từ Promotion (usage_limit, code, discount...).

#### `GET /admin/vouchers/:id/analytics`

- **Path parameters:** `id` (voucher id).
- **Response 200:** `{ total_uses, total_discount_given, avg_order_value, capped_count,
conversion_rate }` — trả flat.

#### `GET /admin/discount-cap-config`

- **Response 200:** `{ discount_cap_config: { id, max_discount_percentage, is_active, updated_at,
updated_by } }` — `id: null` khi chưa có row (trả default `DEFAULT_CAP_PCT`, không phải 404).

#### `POST /admin/discount-cap-config`

- **Request body:** `{ max_discount_percentage: int, 0 ≤ x ≤ 10000 }` (basis-points).
- **Response 200:** `{ discount_cap_config }` — upsert 1 row active duy nhất.
- **Error responses:** `400` nếu ngoài khoảng 0–10000, không phải số nguyên, hoặc thiếu field —
  Medusa error middleware mặc định (xem ghi chú đầu §3.2, không phải envelope §3.3).

### 3.3 VoucherEngine — Bảng mã lỗi

Envelope: `{ type, code, message (EN, log-only), customer_message (VI), details?, request_id? }`.

| Code                             | HTTP | Ý nghĩa                                                                                                                                                 |
| -------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VOUCHER_NOT_FOUND`              | 404  | Không tồn tại mã (V1).                                                                                                                                  |
| `VOUCHER_INACTIVE`               | 422  | Voucher bị Disable (V1) — dùng chung customer message với NOT_FOUND (anti-enumeration).                                                                 |
| `VOUCHER_NOT_YET_VALID`          | 422  | Chưa tới `valid_from` (V2).                                                                                                                             |
| `VOUCHER_EXPIRED`                | 422  | Quá `valid_to` (V2).                                                                                                                                    |
| `VOUCHER_USAGE_LIMIT_REACHED`    | 422  | Hết lượt dùng toàn cục (V3).                                                                                                                            |
| `VOUCHER_PER_USER_LIMIT_REACHED` | 422  | Khách đã dùng hết lượt cá nhân (V4).                                                                                                                    |
| `VOUCHER_MIN_ORDER_NOT_MET`      | 422  | Chưa đạt `min_order_value` (V5).                                                                                                                        |
| `VOUCHER_NO_ELIGIBLE_ITEMS`      | 422  | Không có item nào thuộc scope voucher (V6).                                                                                                             |
| `VOUCHER_SEGMENT_NOT_ELIGIBLE`   | 422  | Khách không thuộc Customer Group được gate (V7).                                                                                                        |
| `VOUCHER_STACKING_CONFLICT`      | 422  | **DEAD** — không còn code path nào throw.                                                                                                               |
| `VOUCHER_REPLACE_REQUIRED`       | 409  | Cart đã có voucher khác active, chưa xác nhận `?replace=true`.                                                                                          |
| `VOUCHER_CALCULATION_FAILED`     | 400  | `verify-cart-totals` phát hiện sai lệch — safe-fail, cart giữ nguyên.                                                                                   |
| `VOUCHER_STACKING_UNSUPPORTED`   | 400  | **DEAD** — chỉ tồn tại ở carrier cũ.                                                                                                                    |
| `VOUCHER_CART_CHANGED`           | 409  | Xung đột concurrency (EC-04).                                                                                                                           |
| `VOUCHER_AUTO_REMOVED`           | 200  | Voucher tự động gỡ khi revalidate thất bại (thông báo, không phải lỗi apply).                                                                           |
| `VOUCHER_CAP_EXHAUSTED`          | 422  | **Rất mới, chưa commit tại thời điểm viết** — item/automatic promotion một mình đã ăn hết cap. Chi tiết: [`TECHNICAL_SPEC.md`](./TECHNICAL_SPEC.md) §9. |

### 3.4 SuggestiveSelling — Store API

#### `GET /store/products/:id/suggestions`

- **Header parameters:** `x-publishable-api-key`; `x-session-id` (optional — scope dismissal/analytics
  cho guest chưa đăng nhập).
- **Path parameters:** `id` (product id).
- **Query parameters:** `cart_id?` (lọc trong-giỏ), `limit?` (mặc định/tối đa `PRODUCT_LIMIT=5`).
- **Response 200:** `{ suggestions: [...], count }`.
- **Error responses:** KHÔNG có — **degrade contract (BR-10)**: mọi lỗi nội bộ trả `200 { suggestions:
[], count: 0 }`, không bao giờ trả 5xx (để FE tự ẩn section thay vì crash).

#### `GET /store/carts/:id/suggestions`

- **Header parameters:** `x-publishable-api-key`; `x-session-id` (optional).
- **Path parameters:** `id` (cart id).
- **Query parameters:** `limit?` (mặc định/tối đa `CART_LIMIT=3`).
- **Response 200:** `{ suggestions: [...], count, threshold_info }` — `threshold_info` non-null chỉ
  khi CR-02 (nudge freeship) fire và có ≥1 suggestion.
- **Error responses:** cùng degrade contract — `200 { suggestions: [], count: 0, threshold_info:
null }`.

#### `POST /store/carts/:id/suggested-items`

- **Header parameters:** `x-publishable-api-key`; `x-session-id` (optional);
  `Idempotency-Key` (optional — server tự sinh UUID nếu bỏ trống, dedupe replay EC-03).
- **Path parameters:** `id` (cart id).
- **Request body:**

  | Field                           | Type         | Required          | Validation                   |
  | ------------------------------- | ------------ | ----------------- | ---------------------------- |
  | `product_id`                    | string       | có                | ≥1 ký tự                     |
  | `variant_id`                    | string       | không             | ≥1 ký tự                     |
  | `quantity`                      | int          | không (default 1) | 1–99                         |
  | `slot`                          | int          | không             | ≥0                           |
  | `attribution.rule_id`           | string\|null | không             |                              |
  | `attribution.source_context`    | enum         | **có**            | `"product_view"` \| `"cart"` |
  | `attribution.source_product_id` | string\|null | không             |                              |

- **Response 200:** kết quả `addSuggestedItemWorkflow` (line item đã thêm vào cart).
- **Error responses:**

  | Code                                    | HTTP | Ý nghĩa                                             |
  | --------------------------------------- | ---- | --------------------------------------------------- |
  | `INVALID_REQUEST`                       | 400  | Body không khớp zod schema.                         |
  | `SUGGESTION_INVALID_ATTRIBUTION`        | 422  | Attribution giả mạo/rule không còn active (SEC-01). |
  | `SUGGESTION_VARIANT_SELECTION_REQUIRED` | 422  | Nhiều variant, chưa chọn — FE mở bottom sheet.      |
  | `SUGGESTION_PRODUCT_INACTIVE`           | 422  | Sản phẩm/variant không published.                   |
  | `SUGGESTION_STOCK_CONFLICT`             | 409  | Hết hàng giữa lúc render và lúc tap Add (EC-07).    |
  | `SUGGESTION_ADD_FAILED`                 | 500  | Lỗi không xác định khác.                            |

  Envelope: `{ code, message, details? }` — **khác** envelope VoucherEngine (không có `type`/`request_id`).

- **Side effects:** thêm line item vào cart + ghi attribution vào line-item metadata; re-check tồn
  kho tại execution time (không tin stock đã hiển thị lúc render).

#### `POST /store/suggestion-events`

- **Header parameters:** `x-publishable-api-key`; `x-session-id` (optional, fallback khi event
  không tự mang `session_id`).
- **Request body:** `{ events: Array<{ action, source_context, suggested_product_id, rule_id?,
source_product_id?, session_id?, tier?, slot? }> }`. `action` ∈
  `{impression, tap, add_to_cart, dismiss}`; `source_context` ∈ `{product_view, cart}`. Batch bị
  cắt tại `MAX_BATCH=10`; mỗi event lỗi bị loại RIÊNG (không fail cả batch).
- **Response 202 (LUÔN 202, kể cả khi có lỗi nội bộ):** `{ accepted: number, rejected: number }`.
  Fire-and-forget — không bao giờ block render/interaction.
- **Error responses:** không có — best-effort, swallow lỗi, luôn trả 202.
- **Side effects:** ghi `SuggestionEvent` (append-only); nếu `action:"dismiss"`, ghi thêm vào
  dismissal cache (Redis/in-memory) để không gợi ý lại trong session.

### 3.5 SuggestiveSelling — Admin API

**Header parameters (áp dụng cho MỌI endpoint trong §3.5):** admin session cookie (bắt buộc,
`/admin/*`).

**Error handling (áp dụng cho MỌI endpoint trong §3.5):** cùng tình trạng như §3.2 — không route
nào có xử lý lỗi riêng. `GET/PUT/DELETE /admin/suggestion-rules/:id` gọi thẳng
`service.retrieveSuggestionRule`/tương đương (`MedusaService`-generated), nếu `id` không tồn tại
sẽ throw `MedusaError` not-found (`404`) đi qua error middleware mặc định của Medusa — không phải
envelope custom nào.

#### `GET /admin/suggestion-rules`

- **Query parameters:** `type?` (`product`|`cart`), `is_active?` (`"true"`/`"false"`), `limit?`
  (default 50), `offset?` (default 0).
- **Response 200:** `{ suggestion_rules, count, limit, offset }`.

#### `POST /admin/suggestion-rules`

- **Request body:** `CreateSuggestionRuleSchema` — `name`, `type` (`product`|`cart`), `tier`
  (`manual`|`category`|`behavioral`, default `manual`), `source_product_ids[]` (default `[]`),
  `priority` (default 0), `is_active` (default true), `valid_from?`, `valid_to?`,
  `items[]` (`{ suggested_product_id, display_order, custom_label? }`),
  `conditions[]` (`{ condition_type, condition_params? }`, `condition_type` ∈
  `category_missing|threshold_near|brand_match|consumable_upsell`).
- **Response 201:** `{ suggestion_rule }` (kèm `items`/`conditions`/`sources` vừa tạo).

#### `GET /admin/suggestion-rules/:id`

- **Path parameters:** `id`.
- **Response 200:** `{ suggestion_rule }` đầy đủ children.
- **Error responses:** `404` nếu `id` không tồn tại (xem ghi chú đầu §3.5).

#### `PUT /admin/suggestion-rules/:id`

- **Path parameters:** `id`.
- **Request body:** `UpdateSuggestionRuleSchema` (mọi field optional; `items`/`conditions` nếu gửi
  sẽ THAY THẾ toàn bộ, không merge).
- **Response 200:** `{ suggestion_rule }`.
- **Error responses:** `404` nếu `id` không tồn tại; `400` nếu body không hợp lệ (xem ghi chú đầu §3.5).

#### `DELETE /admin/suggestion-rules/:id`

- **Path parameters:** `id`.
- **Response 200:** `{ id, object: "suggestion_rule", deleted: true }` — soft delete, cascade xoá
  `items`/`conditions`/`sources`.
- **Error responses:** `404` nếu `id` không tồn tại (xem ghi chú đầu §3.5).

#### `GET /admin/suggestion-events`

- **Query parameters:** `source_context?`, `action?`, `tier?`, `suggested_product_id?`,
  `source_product_id?`, `limit?` (default 100), `offset?` (default 0).
- **Response 200:** `{ suggestion_events, count, limit, offset }` — read-only (bảng append-only,
  chỉ ghi được từ store route).

---

## 4. Data Models / Schemas

### VoucherEngine

- **`VoucherConfig`** (`modules/voucher-engine/models/voucher-config.ts`) — 1-1 với 1 Medusa
  `Promotion` canonical qua `promotion_id`. Field còn thuộc sở hữu: scope (V6), `min_order_value`,
  `max_discount_amount`, `per_user_limit`, `user_segment_conditions` (V7), `valid_from`/`valid_to`,
  `usage_limit`, `usage_count`, `is_active`.
- **`VoucherUsageLog`** (`modules/voucher-engine/models/voucher-usage-log.ts`) — append-only,
  snapshot toàn bộ pipeline tính discount tại `order.placed`. Unique `(voucher_id, order_id)`.
- **`DiscountCapConfig`** (`modules/voucher-engine/models/discount-cap-config.ts`) — singleton,
  `max_discount_percentage` (bps).
- **Error envelope:** `{ type, code, message, customer_message, details?, request_id? }`.

### SuggestiveSelling

- **`SuggestionRule`** (`models/suggestion-rule.ts`) — `type` (`product`|`cart`), `tier`
  (`manual`|`category`|`behavioral`), có 3 quan hệ `hasMany`: `items` (`SuggestionRuleItem`),
  `conditions` (`CartSuggestionCondition`), `sources` (`SuggestionRuleSource`, pivot cho Tier-1
  product-level rule).
- **`CartSuggestionCondition`** (`models/cart-suggestion-condition.ts`) — `condition_type` +
  `condition_params` (JSON, mở rộng không cần migration).
- **`SuggestionEvent`** (`models/suggestion-event.ts`) — append-only, `rule_id`/`*_id` là plain text
  (không FK) để ghi analytics không bao giờ fail vì integrity; `tier`/`slot` nullable.
- **Error type:** `SuggestedItemError` (`workflows/suggestive-selling/lib/suggested-item-errors.ts`)
  — `{ code, http_status, customer_message, details? }`, envelope response `{ code, message,
details? }` (khác VoucherEngine, xem §2).

---

## 5. Authentication Flow

Cả 2 module **không tự viết logic auth** — dùng nguyên cơ chế Medusa core:

- **Store (customer, optional):** `POST /auth/customer/emailpass` (Medusa core) → JWT, dùng làm
  `Authorization: Bearer` hoặc cookie session cho các request sau. Refresh/revoke là hành vi chuẩn
  của Medusa Auth Module — không có logic override nào trong `voucher-engine`/`suggestive-selling`.
- **Admin:** `POST /auth/user/emailpass` (Medusa core) → session cookie, bắt buộc cho mọi
  `/admin/*`.
- **Publishable API key:** không phải "auth" theo nghĩa nhận diện người dùng — là key theo
  sales-channel, bắt buộc trên mọi Store API call (kể cả guest).

Không có tài liệu chi tiết hơn về luồng token trong 2 module này vì đó là trách nhiệm của Medusa
framework, không phải code custom — xem Medusa core docs nếu cần đi sâu hơn (ngoài phạm vi tài
liệu này).

---

## 6. Webhooks

**Không có** — đã rà `src/api/**` + `src/workflows/**` (grep "webhook", không có kết quả nào). Cả
2 module không phát outbound webhook event nào ra hệ thống ngoài. Analytics (`suggestion_event`) và
audit log (`voucher_usage_log`) là bảng nội bộ, không phải webhook.

---

## 7. Phụ lục

- **OpenAPI/Swagger:** tự sinh tại `http://localhost:9009/docs` (tab **Custom API**) — xem
  `docs/team/API_DOCS.md`.
- **Postman collection:** không tồn tại trong repo tại thời điểm viết — không bịa ra.
- **Changelog (API-relevant, gần đây):**
  - 2026-07-22 (Phase 5): `DEFAULT_CAP_PCT` 50%→40% — không đổi shape request/response, chỉ đổi
    giá trị số mặc định trả về trong `cap_explanation`/`GET /admin/discount-cap-config`.
  - 2026-07-22 (chưa commit): thêm error code `VOUCHER_CAP_EXHAUSTED` + field
    `cap_status.cap_exhausted_by_promotion` trên `GET /store/vouchers`.
  - 2026-07-21: `GET /admin/vouchers` (list) đã bị xoá (route rời không còn dùng); response
    `POST /admin/vouchers` và `GET /admin/vouchers/:id/analytics` đổi sang trả flat (bỏ wrapper).
  - 2026-07-21: thêm `GET /store/vouchers` (route mới, cho guest truy cập ngoài
    `/store/customers/me/*`).
- Xem thêm: [`TECHNICAL_SPEC.md`](./TECHNICAL_SPEC.md), `docs/qa-test-cases/README.md`,
  `.claude/plans/c-requirements-m-i-d-i-keen-dahl.md` (bối cảnh 5 phase trước tài liệu này).
