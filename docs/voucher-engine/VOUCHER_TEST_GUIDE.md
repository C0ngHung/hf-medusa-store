# VOUCHER ENGINE — HƯỚNG DẪN TEST TOÀN BỘ FLOW

> **Mục đích:** runbook để test **end-to-end** VoucherEngine (apply / remove / replace, chuỗi validate
> V1–V8, stacking + global cap 50%, auto-revalidation khi cart đổi, rate-limit, ghi usage khi đặt hàng,
> "My Vouchers", admin CRUD + analytics).
> **Nguồn:** khớp với **code thực tế** trong repo (không chỉ spec). Đối chiếu:
> `TECHNICAL_SOLUTION_DESIGN.md`, `SPEC.md`, `API_CONTRACT_Suggestive_Voucher_Cart.md`.
> Kịch bản demo dựng sẵn (bước-theo-bước) xem thêm ở `DEMO_SCENARIOS.md` (git root) — Phần B.
>
> **Ngày:** 2026-07-16. **Cập nhật 2026-07-20:** kiến trúc voucher đã pivot sang Option B / Decision H+I
> (credit-line carrier + Promotion-native config) — mục G1/G3/G4 ở §0 và §2.2/§J bên dưới đã lỗi thời so
> với bản 07-16, đã sửa lại đúng code hiện tại trong bản này.

---

## ⚠️ 0. KHÁC BIỆT GIỮA SPEC VÀ CODE (đọc trước khi test)

Có vài điểm code hiện tại **khác** so với spec/tài liệu — test phải kỳ vọng theo **code**, không theo spec:

| #   | Spec/tài liệu nói                       | Code thực tế                                                                                                                                                                                                          | Ảnh hưởng test                                                                                                                      |
| --- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| G1  | Rate-limit cooldown **30 phút**         | ✅ ĐÃ ĐÚNG — `COOLDOWN_S = envPositiveInt("VOUCHER_RL_COOLDOWN_SEC", 30*60)` (`constants.ts:40`) = 1800s mặc định                                                                                                     | 5 lần fail → khoá đúng **30 phút** (KHÔNG còn 60s như bản 07-16 cũ)                                                                 |
| G2  | Có `GET/PUT /admin/discount-cap-config` | **Không có route này.** Chỉ có model + `getActiveCap()`                                                                                                                                                               | Đổi cap 50% chỉ qua **seed/DB**, không qua API                                                                                      |
| G3  | Có `GET/PUT/DELETE /admin/vouchers/:id` | ✅ ĐÃ CÓ (Decision I) — `PUT`/`DELETE` sửa field voucher-only + soft-delete. `POST` có 2 mode: create (full body) và **attach** (`promotion_id` — gắn vào Promotion có sẵn qua widget "Voucher settings")             | Test được sửa/xoá/gắn voucher qua API, không chỉ tạo mới                                                                            |
| G4  | `cart ↔ voucher_config` qua Link Module | Không có `defineLink`. Voucher gắn vào cart qua **`cart.metadata.voucher`** (field `credit_line_id`) + 1 **`cart.credit_lines` entry** — **KHÔNG còn ephemeral Promotion `VEPH-`** (Decision H thay hẳn kiến trúc cũ) | Kiểm tra voucher đang áp = đọc `cart.metadata.voucher.credit_line_id` + `cart.credit_lines`, KHÔNG còn promotion `VEPH-` nào để tìm |
| G5  | V7 segment eligibility                  | **V7 là STUB, luôn PASS** (`validators.ts:134`)                                                                                                                                                                       | Không test được `VOUCHER_SEGMENT_NOT_ELIGIBLE` bằng data thường                                                                     |
| G6  | Cap-base = subtotal gốc (Rule 9)        | Đúng — cap tính trên `original_subtotal`, **chỉ cắt voucher**, không đụng item-promo                                                                                                                                  | Fixtures cap khớp SPEC                                                                                                              |
| G7  | _(mới)_ Voucher = 1 Promotion "Enable"  | Sau Decision I, **mọi voucher đều là 1 Promotion** (`metadata.voucher_engine=true`) — tạo qua `POST /admin/vouchers` (create) HOẶC attach Promotion có sẵn qua widget Admin UI                                        | Test qua Admin UI: vào `/app/promotions/:id`, không còn trang `/app/vouchers` riêng (xem §0.1)                                      |

> Các fixture "đúng đến từng đồng" (3.420.000₫ / 2.350.000₫ / EC-03) được đảm bảo ở **unit test**
> (`calculate-discount.unit.spec.ts`), vì tái tạo đúng promo item-level trên UI/API sống hơi khó.
> Test sống (live) tập trung xác minh **hành vi flow + cap + revalidation**, số tiền verify theo dữ liệu seed.

### 0.1 Admin UI — Vouchers đã gộp vào Promotion (cập nhật 2026-07-20)

Trang admin `/app/vouchers` (list riêng) **đã bị xoá**. Quản lý voucher giờ hoàn toàn qua trang Promotion:

- **Tạo voucher mới:** `Promotions → Create` (wizard native) → chọn method **"Promotion code"** (KHÔNG chọn
  "Automatic") → tạo xong → vào trang detail Promotion đó → widget **"Voucher settings"** → "Enable as voucher".
- **Sửa/xoá voucher:** cùng widget đó, trên trang detail Promotion.
- **Xem thống kê:** widget **"Voucher analytics"** (cùng trang, dưới phần chính) — thay cho nút "Analyze" cũ.
- **Guardrail:** Promotion loại `buyget`, `is_automatic=true`, hoặc `type="standard"` với method Automatic —
  **không** dùng làm voucher được (widget tự ẩn form, hiện "Loại promotion này không dùng làm voucher được").

---

## 1. CHUẨN BỊ MÔI TRƯỜNG

### 1.1 Layout repo (2 folder lồng nhau)

```
medusa/                         <- git root (docker-compose.yml, DEMO_SCENARIOS.md, bruno/)
└── hf-medusa-store/            <- pnpm workspace root — CHẠY pnpm/turbo Ở ĐÂY
    └── apps/backend/           <- @dtc/backend — chạy npx medusa exec / test scripts Ở ĐÂY
```

### 1.2 Bật hạ tầng (từ git root)

```bash
docker compose up -d          # Postgres :5433, Redis :6380  (KHÔNG dùng 5432/6379)
docker compose ps             # xác nhận hf_medusa_postgres + hf_medusa_redis "healthy"
```

> Nếu có container `medusa-postgres` lạ chiếm cổng → tắt nó trước (xem memory `env-docker-compose-stack`).

### 1.3 Migrate + seed dữ liệu (từ `hf-medusa-store/apps/backend/`)

```bash
cd hf-medusa-store/apps/backend
npx medusa db:migrate          # migrate + tự chain FULL: catalog → suggestive → voucher → voucher-cap-demo → customers → orders → top-sellers
```

**Cập nhật 2026-07-20:** `seed-voucher-cap-demo.ts` (tạo `DEMO-CAP-CONFLICT-40`) giờ nằm **trong chuỗi tự động**
của `db:migrate` (`migration-scripts/initial-data-seed.ts`) — không còn là bước tay/optional nữa. Nếu seed
voucher/promo **không** tự chạy (DB đã seed từ trước, guard bỏ qua), chạy tay (idempotent, theo thứ tự):

```bash
npx medusa exec ./src/scripts/seed-voucher-engine.ts         # SAVE10, MEGA20, SHUTTLE20, cap-config, RACKET2M
npx medusa exec ./src/scripts/seed-tier-promo.ts             # TIER5M5 (auto 5% khi cart ≥ 5.000.000₫)  — optional
npx medusa exec ./src/scripts/add-free-shipping-threshold.ts # freeship ≥ 7.000.000₫                     — optional
npx medusa exec ./src/scripts/seed-voucher-cap-demo.ts       # DEMO-CAP-CONFLICT-40 (scoped tới yonex-bg65)
```

> `seed-voucher-engine.ts` phải chạy **sau** catalog seed (để `SHUTTLE20` resolve được category "Shuttlecocks").

### 1.4 Chạy backend (từ inner `hf-medusa-store/`)

```bash
cd hf-medusa-store
pnpm backend:dev              # http://localhost:9009  (admin: /app)
```

### 1.5 Tài khoản & key

| Loại            | Giá trị                                          | Lấy ở đâu                                                                                        |
| --------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Admin (Bruno)   | `postman@test.com` / `Supersecret123`            | Nếu chưa có: `npx medusa user -e postman@test.com -p Supersecret123`                             |
| Customer demo   | `conghung@gmail.com` / `supersecret`             | Seed `seed-customers.ts` (xem DEMO_SCENARIOS §"Tài khoản demo")                                  |
| Publishable key | header `x-publishable-api-key` cho mọi store API | Admin → Settings → Publishable API Keys, hoặc bảng `api_key`, hoặc `./bruno/scripts/sync-env.sh` |

---

## 2. DỮ LIỆU SEED (bảng tra cứu)

### 2.1 Voucher (`voucher_config`) — seed bởi `seed-voucher-engine.ts`

| Code        | Loại       | Giá trị          | min_order   | scope category | Dùng để test             |
| ----------- | ---------- | ---------------- | ----------- | -------------- | ------------------------ |
| `SAVE10`    | percentage | `1000` = **10%** | —           | unscoped       | Happy path, revalidation |
| `MEGA20`    | percentage | `2000` = **20%** | —           | unscoped       | **Global cap 50%**       |
| `SHUTTLE20` | percentage | `2000` = **20%** | **200.000** | Shuttlecocks   | V5 min-order, V6 scope   |

Mặc định chung: `stackable_with_promotions=true`, `per_user_limit=1`, `usage_limit=null` (không giới hạn), `usage_count=0`, hiệu lực now → now+1 năm, `is_active=true`.

> **Quy ước tiền/%:** tiền = integer VND (`150000` = 150.000₫). `discount_value` khi percentage tính **basis-points**: `1000`=10%, `2000`=20%, `5000`=50%.

### 2.2 Promotion native (để test stacking) — cùng seed / seed riêng

| Code                   | Loại                             | Auto?     | Hiệu lực                      | Mục đích                                                                                                                                                                                                                                         |
| ---------------------- | -------------------------------- | --------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `RACKET2M`             | fixed −2.000.000₫ (items/across) | ❌ manual | seed như 1 Promotion thường   | Demo promo + voucher đồng thời + chạm cap. **Lưu ý:** trên DB dev đã qua live-verify (Task 7), code này CÓ THỂ đã được "Enable as voucher" qua widget — kiểm tra `GET /admin/vouchers?promotion_id=` trước khi coi nó là "chỉ Promotion thường"  |
| `DEMO-CAP-CONFLICT-40` | percentage 40% trên `yonex-bg65` | ✅ auto   | tự áp khi cart có sp đó       | **Cập nhật 07-20:** áp voucher lên **THÀNH CÔNG**, coexist đúng Rule 1+2, chỉ bị cap ở 50% (`discount_capped:true`) — **KHÔNG còn** trả `400 VOUCHER_STACKING_UNSUPPORTED` như bản 07-16 (Decision H credit-line carrier đã sửa bug Rule 11 gốc) |
| `TIER5M5`              | percentage 5% / order            | ✅ auto   | khi `item_total ≥ 5.000.000₫` | EC-08: cart vượt ngưỡng → tier áp → voucher recompute → cap re-check                                                                                                                                                                             |

### 2.3 Sản phẩm mốc

| Sản phẩm            | Handle                | Giá            | Ghi chú                                                                                                                                                                                   |
| ------------------- | --------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Yonex Astrox 99 Pro | `yonex-astrox-99-pro` | **4.500.000₫** | "vợt 4.5M" trong fixtures SRS                                                                                                                                                             |
| Yonex BG65          | `yonex-bg65`          | **120.000₫**   | dính auto-promo `DEMO-CAP-CONFLICT-40` (đổi từ `yonex-bg65-3pack` ngày 07-20 để portable trên mọi DB fresh — xem seed script comment). Cũng là gợi ý "Best Match" Tier-1 cho 2 vợt Astrox |

### 2.4 Global cap

`discount_cap_config`: `max_discount_percentage = 5000` bps (**50%**), `is_active=true`. Đổi cap → sửa DB/seed (không có API — G2).

---

## 3. ENDPOINT (khớp code) — cheat sheet

Base: `http://localhost:9009`. Store API **bắt buộc** header `x-publishable-api-key: <pak>`.

### 3.1 Store — Voucher

| Method   | Path                           | Body / Query                                            | Response chính                                                                                        |
| -------- | ------------------------------ | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `POST`   | `/store/carts/:id/voucher`     | `{ "code": "SAVE10" }` · query `?replace=true`          | `{ success, discount_amount, discount_capped, cap_explanation, updated_cart_total, voucher_details }` |
| `DELETE` | `/store/carts/:id/voucher`     | (no body)                                               | `{ success, updated_cart_total, message }` (no-op idempotent nếu chưa có voucher)                     |
| `GET`    | `/store/customers/me/vouchers` | query `?cart_id=` (thêm `eligible`/`ineligible_reason`) | `{ vouchers: [...] }` (guest → `[]`)                                                                  |

- Body apply: `code` **≥6 ký tự, `^[A-Za-z0-9]+$`, `.strict()`** (thừa key → 400). `cart_id` lấy từ `:id`, không nhận từ body (SEC-01 chống tamper).
- Chỉ `POST` bị **rate-limit** (middleware trước validate); `DELETE` không.

### 3.2 Admin — Voucher (cần `Authorization: Bearer <admin token>`)

| Method   | Path                            | Ghi chú                                                                                                                                                                                                                               |
| -------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST`   | `/admin/vouchers`               | 2 mode: **create** (full body, `code` optional auto-gen ≥6 alnum UPPER) hoặc **attach** (`promotion_id` — gắn voucher-only fields vào 1 Promotion có sẵn, chặn double-attach). Body sai → 400/422                                     |
| `GET`    | `/admin/vouchers`               | List `?limit`(≤200)`&offset`, hoặc `?promotion_id=` để tra voucher của 1 Promotion cụ thể. Read-through hydrate field chung (code/discount/validity) từ Promotion (Decision I)                                                        |
| `PUT`    | `/admin/vouchers/:id`           | **(Decision I, mới)** Sửa field voucher-only (`min_order_value`, `max_discount_amount`, scope, `stackable_with_promotions`, `per_user_limit`) — `.strict()`, không cho sửa `discount_type`/`discount_value`/`code` (đọc từ Promotion) |
| `DELETE` | `/admin/vouchers/:id`           | **(Decision I, mới)** Soft-delete — Promotion nền vẫn còn, chỉ voucher_config bị vô hiệu                                                                                                                                              |
| `GET`    | `/admin/vouchers/:id/analytics` | `{ analytics: { total_uses, total_discount_given, avg_order_value, capped_count, conversion_rate } }` (avg & conversion luôn 0 — chưa có nguồn)                                                                                       |

> **Không tồn tại** (G2): `GET/PUT /admin/discount-cap-config`. (G3 — `PUT/DELETE /admin/vouchers/:id` — ĐÃ CÓ từ Decision I, xem trên.)

### 3.3 Error envelope (chuẩn chung)

```json
{
  "type": "...",
  "code": "VOUCHER_...",
  "message": "EN cho log",
  "customer_message": "VI hiển thị khách",
  "details": {},
  "request_id": "req_..."
}
```

FE map hành vi theo **`code`**, không parse message.

---

## 4. TẠO CART ĐỂ TEST (store flow)

Cần 1 cart có line item trước khi apply voucher. Dùng native Medusa store API + publishable key.

```bash
PAK="pk_...."                      # publishable key
BASE="http://localhost:9009"
H=(-H "x-publishable-api-key: $PAK" -H "Content-Type: application/json")

# 1) Lấy region
curl -s "${H[@]}" "$BASE/store/regions" | jq '.regions[0].id'      # → REGION_ID

# 2) Lấy 1 variant (vd vợt 4.5M)
curl -s "${H[@]}" "$BASE/store/products?handle=yonex-astrox-99-pro&fields=*variants" \
  | jq '.products[0].variants[0].id'                               # → VARIANT_ID

# 3) Tạo cart
curl -s "${H[@]}" -X POST "$BASE/store/carts" \
  -d "{\"region_id\":\"$REGION_ID\"}" | jq '.cart.id'             # → CART_ID

# 4) Thêm line item
curl -s "${H[@]}" -X POST "$BASE/store/carts/$CART_ID/line-items" \
  -d "{\"variant_id\":\"$VARIANT_ID\",\"quantity\":1}" | jq '.cart.total'
```

> Đăng nhập customer (cho V4 per-user, "My Vouchers"): `POST /auth/customer/emailpass {email,password}` → `token`,
> rồi gửi kèm `Authorization: Bearer <token>`. Guest thì bỏ header này.

---

## 5. TEST THEO FLOW

Mỗi mục ghi: **mục tiêu → cách chạy → kỳ vọng → trace test**. Có thể chạy bằng curl, Bruno (§7), hoặc Admin UI.

### A. Admin tạo & liệt kê voucher — `T-VOUCH` (admin)

1. Login admin: `POST /auth/user/emailpass {email,password}` → `token`.
2. `POST /admin/vouchers` body hợp lệ (vd `{ "discount_type":"percentage","discount_value":1500,"usage_limit":100 }`) → **201**, `code` auto UPPER.
3. Case lỗi → **400/422**: `discount_value:0`; percentage `>10000`; `valid_from > valid_to` (window ngược); thiếu `discount_type`.
4. Không auth → **401**.
5. `GET /admin/vouchers?limit=50` → list, **không** lộ field promotion native.

### B. Apply voucher — happy path (T-VOUCH-01)

1. Tạo cart có vợt 4.5M (§4).
2. `POST /store/carts/$CART_ID/voucher {"code":"SAVE10"}`.
3. **Kỳ vọng 200:** `success:true`, `discount_amount` = 10% × subtotal eligible (floor), `discount_capped:false`, `updated_cart_total` = total − discount, `voucher_details.code:"SAVE10"`.
4. Xác minh `cart.metadata.voucher` được ghi (có `credit_line_id`) + `cart.credit_lines` có 1 entry tương ứng (G4 — KHÔNG còn promotion `VEPH-` nữa).

### C. Chuỗi validate V1–V8 (fail-fast) (T-VOUCH-02..06)

Áp từng voucher/điều kiện để bắn đúng lỗi (fail đầu tiên thắng, thứ tự format→V1→…→V8):

| V      | Cách tạo điều kiện                                                    | Code lỗi                                          | HTTP      |
| ------ | --------------------------------------------------------------------- | ------------------------------------------------- | --------- |
| format | code `<6` ký tự hoặc có ký tự lạ                                      | `VOUCHER_NOT_FOUND`                               | 404       |
| V1     | code không tồn tại / voucher `is_active=false`                        | `VOUCHER_NOT_FOUND` / `VOUCHER_INACTIVE`          | 404 / 422 |
| V2     | voucher `valid_from` tương lai / `valid_to` quá khứ                   | `VOUCHER_NOT_YET_VALID` / `VOUCHER_EXPIRED`       | 422       |
| V3     | voucher có `usage_limit` đã đạt `usage_count`                         | `VOUCHER_USAGE_LIMIT_REACHED`                     | 422       |
| V4     | customer đã dùng đủ `per_user_limit` (cần usage-log — đặt hàng trước) | `VOUCHER_PER_USER_LIMIT_REACHED`                  | 422       |
| V5     | `SHUTTLE20` (min 200.000) trên cart < 200.000₫                        | `VOUCHER_MIN_ORDER_NOT_MET` (`details.remaining`) | 422       |
| V6     | `SHUTTLE20` trên cart không có sp Shuttlecocks                        | `VOUCHER_NO_ELIGIBLE_ITEMS`                       | 422       |
| V7     | (STUB — luôn pass, **không test được**)                               | —                                                 | —         |
| V8     | voucher `stackable_with_promotions=false` + cart có item-promo        | `VOUCHER_STACKING_CONFLICT`                       | 422       |

> Mỗi lỗi có `customer_message` tiếng Việt. `VOUCHER_NOT_FOUND` & `VOUCHER_INACTIVE` **cùng** message (chống dò mã).

### D. Stacking + global cap 50% (T-VOUCH-07/08/09)

- **Live (khớp seed):** cart vợt 4.5M + áp `RACKET2M` (−2.000.000₫) rồi áp `MEGA20` (20%). Tổng giảm có thể chạm trần 50% × subtotal gốc → `discount_capped:true`, `cap_explanation` có chuỗi VI, voucher bị cắt (item-promo **không** bị đụng).
- **Fixtures "đúng từng đồng"** (verify ở unit test, xem §6):
  - Happy: vợt 4.5M(promo −900k) + cước 200k, `SAVE10` 10% → voucher 380k, **total 3.420.000₫**.
  - Cap: vợt 4.5M(promo −1.8M) + cước 200k(promo −60k), `MEGA20` 20% → raw 568k → cap → voucher **490k**, **total 2.350.000₫**, `discount_capped:true`.
  - EC-03: voucher 50% + item 50% → `final_total ≥ 1₫` (clamp), có warning.

### E. Remove voucher (T-VOUCH-10)

1. Cart đang có voucher (sau B). `DELETE /store/carts/$CART_ID/voucher`.
2. **Kỳ vọng:** `success:true`, `updated_cart_total` **revert** về trước khi áp, `message:"Đã gỡ mã giảm giá."`.
3. Xác minh **`usage_count` KHÔNG tăng** (chỉ tăng lúc `order.placed`), `cart.metadata.voucher` bị clear.
4. Gỡ khi cart chưa có voucher → **200 no-op** idempotent.

### F. Replace voucher (409 confirm)

1. Cart đang có `SAVE10`. `POST .../voucher {"code":"MEGA20"}` (không `?replace`).
2. **Kỳ vọng 409** `VOUCHER_REPLACE_REQUIRED`, `details.current_code:"SAVE10"`.
3. Gọi lại `POST .../voucher?replace=true {"code":"MEGA20"}` → **200**, voucher cũ bị gỡ, mới áp.

### G. Auto-revalidation khi cart đổi (VOUCH-005 · T-VOUCH-11)

Subscriber `cart.updated` → chạy `revalidateVoucherWorkflow` **đồng bộ trong request**:

1. Cart có `SHUTTLE20` (min 200.000). Bớt/xoá item cho subtotal < 200.000₫ → voucher **tự gỡ**, `cart.metadata.voucher_notice` = `VOUCHER_AUTO_REMOVED` (lý do min-order).
2. Xoá item Shuttlecocks cuối cùng → auto-gỡ (lý do no-eligible-items).
3. Đổi subtotal mà vẫn hợp lệ → voucher **giữ**, discount **recompute** lại.
4. Re-apply lại voucher → `voucher_notice` cũ bị clear.
5. Xác minh **không đệ quy** (`cart.updated` không phát lần 2) & lock `voucher:cart:{id}` chịu được concurrency (EC-04).

### H. Order placed → ghi usage + idempotency (T-VOUCH usage)

Subscriber `order.placed` → `recordVoucherUsageWorkflow`:

1. Đặt hàng từ cart có voucher snapshot → tạo **đúng 1** `voucher_usage_log` + `usage_count += 1` (atomic, `UPDATE ... WHERE usage_count < usage_limit`).
2. Re-process cùng order → **idempotent** (unique `(voucher_id, order_id)`), không double-count.
3. Order không có voucher metadata → no-op.
4. `GET /admin/vouchers/:id/analytics` → `total_uses`, `total_discount_given`, `capped_count` phản ánh usage-log.

### I. Rate-limit (SEC-02/EC-10 · T-VOUCH-12)

1. `POST .../voucher` với **code không tồn tại 5 lần** (mỗi lần đếm là 1 fail) trong 15 phút.
2. Lần thứ 6 → **429** `VOUCHER_RATE_LIMITED`, `details.retry_after_seconds`.
3. Cooldown đúng **30 phút** (G1 đã fix 07-20 — KHÔNG còn 60s như bản 07-16 cũ).
4. Apply **thành công** sẽ `resetFailedAttempts` (xoá bộ đếm). Keyed theo `customer_id + IP`. Redis absent → degrade in-memory.

### J. Item-promo + voucher coexist, cap 50% (T-VOUCH-07/08, cập nhật 07-20 — KHÔNG còn fail-closed 400)

> ⚠️ **Bản 07-16 cũ mô tả sai:** mục này từng nói áp voucher lên cart có auto-promo sẽ bị **400
> `VOUCHER_STACKING_UNSUPPORTED`** (fail-closed). Đó là hành vi của kiến trúc **ephemeral-Promotion carrier
> cũ** (đã bỏ). Từ Decision H (credit-line carrier), hành vi **THỰC TẾ VÀ ĐÚNG SPEC** là: item-promo và
> voucher **cùng tồn tại thành công**, đúng Rule 1+2, chỉ cap ở 50% nếu tổng vượt.

1. Seed `seed-voucher-cap-demo.ts` (giờ tự chạy trong `db:migrate`). Cart chứa `yonex-bg65` (auto dính
   `DEMO-CAP-CONFLICT-40` 40%, ví dụ giá 120.000₫ → item-promo giảm 48.000₫).
2. Áp bất kỳ voucher (`SAVE10`/`MEGA20`/`SHUTTLE20` nếu scope khớp) → **200 success** (KHÔNG phải 400).
3. `GET cart` sau đó: item-promo adjustment **giữ nguyên không đổi** (Rule 11 — credit line không đụng vào
   `computeActions`), voucher tính trên `post_promotion_subtotal`, tổng giảm capped ở 50% × `original_subtotal`
   nếu vượt → `discount_capped:true` + `cap_explanation` tiếng Việt.
4. Bằng chứng thật đã verify sống (2026-07-20, cart `yonex-bg65-3pack` giá 330.000₫): item-promo 40% =
   132.000₫ giữ nguyên; `MEGA20` 20% tính trên 198.000₫ post-promo = raw 39.600₫ → cap về 33.000₫ (`"Giảm
giá đã được điều chỉnh từ 39.600₫ xuống 33.000₫ theo chính sách giảm tối đa 50%."`); `cart.total` =
   165.000₫ = đúng 50% của 330.000₫ gốc.

### K. My Vouchers

1. Login customer → `GET /store/customers/me/vouchers` → list voucher đang active & trong hạn (`description`, `applicable_categories` đã format VI).
2. Kèm `?cart_id=$CART_ID` → mỗi voucher có `eligible` / `ineligible_reason` (chạy V5+V6 trên cart).
3. Guest (không token) → `{ "vouchers": [] }`, **không** 401.

---

## 6. TEST TỰ ĐỘNG (chạy trước khi tin luồng sống)

Từ `hf-medusa-store/apps/backend/` (không gọi jest trực tiếp — dùng script set `TEST_TYPE`):

```bash
pnpm test:unit                 # StackingEngine, money, validators — fixtures "đúng từng đồng"
pnpm test:integration:http     # apply/remove/replace, revalidate, record-usage, rate-limit, admin
pnpm test:integration:modules  # service (findByCode, getActiveCap, redeemVoucherAtomic), cache+ratelimit
```

Chạy 1 file: `pnpm test:integration:http -- integration-tests/http/apply-remove-voucher.spec.ts`

**Map test → flow:**

| File                                                               | Cover                                                                       |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `lib/__tests__/calculate-discount.unit.spec.ts`                    | Flow D — fixtures 380k / 490k(cap) / EC-03 clamp, ma trận `discount_capped` |
| `lib/__tests__/money.unit.spec.ts`                                 | INT-01: integer money, `bps` floor, không float                             |
| `integration-tests/http/apply-remove-voucher.spec.ts`              | Flow B/E/F, SEC-01 tamper, 404/409                                          |
| `integration-tests/http/revalidate-voucher-workflow.spec.ts`       | Flow G — auto-remove, recompute, lock EC-04, không tăng usage khi apply     |
| `integration-tests/http/record-voucher-usage-workflow.spec.ts`     | Flow H — 1 log/order, idempotent, no-op                                     |
| `integration-tests/http/voucher-rate-limit.spec.ts`                | Flow I — 429 sau 5 fail                                                     |
| `integration-tests/http/voucher-admin.spec.ts`                     | Flow A — create/list/analytics, auth                                        |
| `integration-tests/http/voucher-engine-resolve-workflow.spec.ts`   | Flow D — V6 scope, Rule 11, cap config custom                               |
| `integration-tests/http/block-voucher-promotion.spec.ts`           | §0.1 guardrail — code voucher gửi vào native `/carts/:id/promotions` → 422  |
| `integration-tests/http/voucher-store-vouchers.spec.ts`            | Flow K — My Vouchers `estimated_savings` + eligible-first sort              |
| `src/modules/voucher-engine/__tests__/service.integration.spec.ts` | redeemVoucherAtomic, V4, unique index                                       |

> ⚠️ Đừng gộp ≥2 suite `medusaIntegrationTestRunner` trong 1 process `--runInBand` — suite thứ 2 fail
> "Map.prototype.set incompatible receiver" (đã biết, không phải bug code — xem memory).

---

## 7. TEST BẰNG BRUNO (API client)

```bash
./bruno/scripts/sync-env.sh    # tạo bruno/.env (đọc PORT + publishable key từ Postgres container)
```

- Collection: `bruno/` — mở bằng Bruno app. Env `local` → `baseUrl = http://localhost:9009`.
- **Chạy `Auth/Login (admin emailpass)` trước** → lưu `{{token}}` cho các request admin.
- Folder `Voucher Engine (Admin)/`: create (percentage/scoped), các case 400/401, `Get analytics by id`.
- Store request cần thêm header `x-publishable-api-key: {{publishableKey}}`.
- (Có bản Postman cũ ở `postman/` — Bruno convert 1:1.)

---

## 8. CHECKLIST TRACE T-VOUCH-01..12

- [ ] **T-VOUCH-01** Apply hợp lệ → discount + total → Flow B
- [ ] **T-VOUCH-02..06** V1/V2/V4/V5/V6 message → Flow C
- [ ] **T-VOUCH-07** Stacking happy → 3.420.000₫ → Flow D (unit)
- [ ] **T-VOUCH-08** Cap → voucher 490k / total 2.350.000₫ → Flow D (unit)
- [ ] **T-VOUCH-09** 50%+50% → sàn > 0 → Flow D (unit)
- [ ] **T-VOUCH-10** Remove → revert, usage KHÔNG tăng → Flow E
- [ ] **T-VOUCH-11** Remove eligible item → auto-remove → Flow G
- [ ] **T-VOUCH-12** 5 fail → 429 → Flow I
- [ ] (bổ sung) Replace 409 → Flow F
- [ ] (bổ sung) Usage recording + idempotency → Flow H
- [ ] (bổ sung) Item-promo + voucher coexist, cap 50% (KHÔNG còn 400) → Flow J
- [ ] (bổ sung) My Vouchers + eligibility → Flow K
- [ ] (bổ sung) EC-04 concurrency lock → Flow G / service test

---

## 9. TROUBLESHOOTING

| Triệu chứng                                          | Nguyên nhân / xử lý                                                                                                              |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Store API 401 / "publishable key required"           | Thiếu header `x-publishable-api-key`. Lấy key qua `sync-env.sh` hoặc Admin Settings                                              |
| `SHUTTLE20` apply được cả cart không có Shuttlecocks | Seed voucher chạy **trước** catalog → scope rỗng (unscoped fallback). Re-seed đúng thứ tự                                        |
| Apply mãi 429                                        | Đang trong cooldown 30 phút (G1, đã fix 07-20). Chờ hết cooldown hoặc apply 1 code hợp lệ để reset (`resetFailedAttempts`)       |
| `discount_capped` không bật khi kỳ vọng bật          | Cap chỉ bật khi **global cap** ràng buộc (final < after-voucher-cap), không phải khi `max_discount_amount` của voucher ràng buộc |
| Muốn đổi cap 50%                                     | Không có API (G2) → sửa `discount_cap_config` trong DB hoặc seed lại                                                             |
| Integration test treo                                | Docker Postgres :5433 chưa lên, hoặc `.env.test` sai `DB_PORT`                                                                   |
| `usage_count` không tăng sau khi apply               | Đúng thiết kế — chỉ tăng ở `order.placed` (Flow H)                                                                               |
