# Postman — HF Medusa Suggestive Selling

API-only testing (SRS không yêu cầu UI). Import file collection vào Postman để test API.

## Files

- `HF-Medusa-Suggestive-Selling.postman_collection.json` — **Admin** CRUD `suggestion-rules` (kèm biến + test script tự lưu token/ruleId).
- `HF-Medusa-Suggestive-Selling-Store.postman_collection.json` — **Store (Day 3–4 · Sơn)**: product/cart suggestions + analytics events + cache-invalidation flow (kèm test script assert contract).

---

## Store collection (Day 3–4)

Phủ đúng phần việc Day-3 (lọc/ranking + cart rules CR-01..CR-04) và Day-4 (cache-aside, dismissal D6, `cart.updated` invalidation, analytics events) — expose qua 3 Store API:

| Method | Path                              | Task             | Ghi chú                                                |
| ------ | --------------------------------- | ---------------- | ------------------------------------------------------ |
| GET    | `/store/products/:id/suggestions` | 2.5.1 (2.3.x)    | product-level; query `cart_id?`, `limit?` (≤5)         |
| GET    | `/store/carts/:id/suggestions`    | 2.5.2 (2.4.x)    | cart-level CR-01..04; `limit?` (≤3) + `threshold_info` |
| POST   | `/store/suggestion-events`        | 2.5.3 (2.6.8–12) | batch analytics → **202** `{accepted, rejected}`       |

**Header bắt buộc:** `x-publishable-api-key` (mọi route `/store`). `x-session-id` scope dismissal + analytics (D6/SEC-04). Customer suy từ bearer auth context (không nhận từ body).

### Cách dùng

1. **Import** cả 2 file vào Postman.
2. Mở collection **Store** → tab **Variables**, chỉnh nếu cần (mặc định đã điền id thật từ seed hiện tại):
   | Biến | Mặc định | Ghi chú |
   |---|---|---|
   | `baseUrl` | `http://localhost:9009` | cổng backend (`.env` PORT=9009) |
   | `publishableKey` | `pk_160f5ac2…` | Default Publishable API Key (seed) — có thể tự refresh qua `Setup › Get publishable key` |
   | `sessionId` | `sess_postman_demo` | scope dismissal/analytics |
   | `regionId` | `reg_…` (Vietnam/VND) | tạo cart |
   | `productId` | `prod_…` (apacs-astrox-77) | source product cho product-level |
   | `racketVariantId` / `gripVariantId` | `variant_…` | add vào cart để fire cart rules + `cart.updated` |
   | `suggestedProductId` | `prod_…` (apacs-bg66-ultimax) | product trong analytics event |
   | `token`, `cartId` | _(trống)_ | tự điền bởi test script |
3. **Chạy theo thứ tự** (folder `Setup` trước):
   - `Setup › Login` → lưu `{{token}}` · `Get publishable key` (tùy chọn) → refresh `{{publishableKey}}` · `Create cart` → lưu `{{cartId}}` · `Add racket to cart` (fire CR rules + `cart.updated`).
   - Rồi chạy các folder `2.5.1` / `2.5.2` / `2.5.3` / `cart.updated → invalidation`.
   - Hoặc dùng **Collection Runner** chạy cả collection một lượt (Setup đứng đầu nên thứ tự tự đúng).

### ⚠️ Về dữ liệu (degrade BR-10)

Gợi ý tuân thủ **degrade contract**: catalog/rule không khớp → **HTTP 200 với list rỗng**, KHÔNG phải lỗi. Test vì vậy assert **shape** (`suggestions` là array, `count` khớp, `threshold_info` null/object), **không** assert non-empty.

- **Cart-level** thường có data ngay (vd thêm vợt → CR-01 gợi "Bags" complement).
- **Product-level** cần `suggestion_rule` + `suggestion_rule_source` trỏ tới product **đang tồn tại** trong catalog. DB dev dùng chung có thể lệch (rule seed trỏ tới catalog cũ) → trả rỗng. Reseed để có data: `cd hf-medusa-store && pnpm backend:seed`.

### Evidence (smoke đã chạy trên `:9009`)

```
GET  /store/products/{apacs-astrox-77}/suggestions   → 200 {suggestions:[],count:0}        (degrade — rule/catalog lệch)
GET  /store/products/prod_does_not_exist/suggestions → 200 {suggestions:[],count:0}        (BR-10, không 5xx)
POST /store/carts + line-items {racket}              → 200
GET  /store/carts/{id}/suggestions                   → 200 3× CR-01 (Bags), rule_id:null, threshold_info:null
POST /store/suggestion-events {impression}           → 202 {accepted:1, rejected:0}
POST /store/suggestion-events {1 valid + 3 invalid}  → 202 {accepted:1, rejected:3}        (reject per-event)
POST /store/suggestion-events {4 actions}            → 202 {accepted:4, rejected:0}
POST /store/suggestion-events {12 valid}             → 202 {accepted:10, rejected:0}        (MAX_BATCH truncate)
```

---

## Admin collection

Test các Admin API `suggestion-rules`.

### Cách dùng

1. **Import** `HF-Medusa-Suggestive-Selling.postman_collection.json`.
2. Chỉnh **collection variables** nếu cần:
   | Biến | Mặc định | Ghi chú |
   |---|---|---|
   | `baseUrl` | `http://localhost:9009` | cổng backend |
   | `adminEmail` / `adminPassword` | `postman@test.com` / `Supersecret123` | admin test |
   | `sourceProductId` / `suggestedProductId` | `prod_…` | source/suggested product |
   | `token`, `ruleId` | _(trống)_ | tự điền bởi test script |
3. **Chạy theo thứ tự**: `Auth › Login` → `Create rule` → `List` / `Get by id` / `Update` / `Delete`.

## Tạo admin test (nếu chưa có)

```bash
cd hf-medusa-store/apps/backend
npx medusa user -e postman@test.com -p Supersecret123
```

## Lấy id thật (nếu seed khác)

```bash
# products
docker exec hf_medusa_postgres psql -U hfmedusa -d hfmedusa -t \
  -c "SELECT handle, id FROM product WHERE deleted_at IS NULL ORDER BY handle;"
# publishable key (giá trị token cho header x-publishable-api-key)
docker exec hf_medusa_postgres psql -U hfmedusa -d hfmedusa -t \
  -c "SELECT token FROM api_key WHERE type='publishable' AND deleted_at IS NULL;"
# region
docker exec hf_medusa_postgres psql -U hfmedusa -d hfmedusa -t \
  -c "SELECT id, name, currency_code FROM region WHERE deleted_at IS NULL;"
```

## Endpoints trong 2 collection

| Method | Path                              | Collection | TT              |
| ------ | --------------------------------- | ---------- | --------------- |
| POST   | `/auth/user/emailpass`            | cả 2       | ✅              |
| POST   | `/admin/suggestion-rules`         | Admin      | ✅              |
| GET    | `/admin/suggestion-rules`         | Admin      | ✅              |
| GET    | `/admin/suggestion-rules/:id`     | Admin      | ✅              |
| PUT    | `/admin/suggestion-rules/:id`     | Admin      | ✅              |
| DELETE | `/admin/suggestion-rules/:id`     | Admin      | ✅ (soft)       |
| GET    | `/admin/api-keys`                 | Store      | ✅ (lấy pubkey) |
| POST   | `/store/carts` (+ `/line-items`)  | Store      | ✅ (setup)      |
| GET    | `/store/products/:id/suggestions` | Store      | ✅ (2.5.1)      |
| GET    | `/store/carts/:id/suggestions`    | Store      | ✅ (2.5.2)      |
| POST   | `/store/suggestion-events`        | Store      | ✅ (2.5.3)      |
