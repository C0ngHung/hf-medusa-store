# DEMO SCENARIOS — HF BADMINTON STORE

File tổng hợp **các kịch bản demo**. Mỗi mục = 1 case cần trình diễn: mục tiêu → SRS trace → dữ liệu → các bước → kết quả kỳ vọng.

> **Trạng thái file:**
>
> - **PHẦN A — Suggestive Selling** đã cover đầy đủ SRS §3 (SUGG-001…006) + edge case liên quan (EC-05, EC-07, EC-09) + toàn bộ acceptance test T-SUGG-01…10.
> - **PHẦN B — Voucher** để trống, người làm VoucherEngine bổ sung sau (nối tiếp vào các cart đã dựng ở PHẦN A — hai feature chỉ giao nhau ở cart nên ghép luồng được).

> **Chuẩn bị chung:** backend chạy (`pnpm backend:dev` → http://localhost:9009), DB đã `db:migrate`
> (bước này **tự chain toàn bộ seed** — catalog → suggestive → voucher → customers → orders →
> job top-seller, xem [ONBOARDING.md](./ONBOARDING.md)). Store endpoint cần header
> `x-publishable-api-key` (lấy key ở Admin → Settings → Publishable API Keys, hoặc bảng `api_key`).

## Tài khoản demo (dev-only, KHÔNG phải secret)

| Email                | Mật khẩu      | Tên       | Đã mua trong 30 ngày (seed-orders)                                                           |
| -------------------- | ------------- | --------- | -------------------------------------------------------------------------------------------- |
| `conghung@gmail.com` | `supersecret` | Cong Hung | `yonex-bg65` ×3, `yonex-pro-bag-92026` ×2, `yonex-ac102-towel-grip` ×1                       |
| `ngocthuc@gmail.com` | `supersecret` | Ngoc Thuc | `yonex-bg65` ×2, `yonex-pro-bag-92026` ×2, `victor-vbs-63` ×1                                |
| `congson@gmail.com`  | `supersecret` | Cong Son  | `yonex-bg65` ×1, `yonex-ac102-towel-grip` ×2, `victor-br9111-bag` ×1, `yonex-socks-19120` ×2 |

Login lấy token (dùng cho filter "đã mua 30 ngày" SUGG-002d và các luồng theo khách):

```
POST http://localhost:9009/auth/customer/emailpass   { "email": "...", "password": "supersecret" }
→ { "token": "<JWT>" }
```

Rồi gọi store endpoint kèm 2 header: `Authorization: Bearer <JWT>` + `x-publishable-api-key: <pak>`.
Guest (không login) thì bỏ `Authorization`.

---

## A0. Cheat-sheet: endpoint + dữ liệu seed

### Endpoint Suggestive Selling (store)

| Trace | Method | Path                                | Query / Body chính                                                                                                                 | Response chính                                            |
| ----- | ------ | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 2.5.1 | GET    | `/store/products/{id}/suggestions`  | `?cart_id=…&limit=…` (limit clamp 1–5)                                                                                             | `{ suggestions[], count }`                                |
| 2.5.2 | GET    | `/store/carts/{id}/suggestions`     | `?limit=…` (clamp 1–3)                                                                                                             | `{ suggestions[], count, threshold_info }`                |
| 2.5.3 | POST   | `/store/carts/{id}/suggested-items` | `{ product_id, variant_id?, quantity, slot?, attribution:{rule_id,source_context,source_product_id} }`                             | `{ line_item, updated_cart_total, is_idempotent_replay }` |
| 2.6.x | POST   | `/store/suggestion-events`          | `{ events:[{action, source_context, suggested_product_id, rule_id?, source_product_id?, session_id?, tier?, slot?}] }` (≤10/batch) | `202 { accepted, rejected }`                              |

Header tuỳ chọn: `x-session-id` (scope dismiss + analytics khi guest), `Authorization: Bearer` (khách đăng nhập), `Idempotency-Key` (chống replay one-tap add).

Field trong 1 `suggestion` (product-level): `product_id, handle, variant_id, name, image_url, price, discount_price, in_stock, requires_variant_selection, status, category_names[], brand, tier ("manual"|"category"|"behavioral"), rule_id, label, display_order (1-based)`.
Cart-level thêm: `tier` luôn `"cart"`, `rule_id` luôn `null`, `rule_code ("CR-01".."CR-04")`, `badge_text` (chỉ CR-02).

### Sản phẩm & giá (VND) — trích catalog seed (đủ 39 sản phẩm / 9 category)

- **Brand** suy ra từ tiền tố handle: `yonex-`→Yonex · `victor-`→Victor · `lining-`→Li-Ning.
- **Consumable** (được **miễn** filter "đã mua 30 ngày", SUGG-002d): `Strings, Grips, Socks, Shuttlecocks, Tubes`.
- **Durable** (mua trong 30 ngày → **bị loại** khỏi gợi ý cho khách đăng nhập): `Rackets, Shoes, Bags, Insoles`.

**Rackets** — durable (6)

| Handle                    | Tên                      | Giá       |
| ------------------------- | ------------------------ | --------- |
| `yonex-astrox-99-pro`     | Yonex Astrox 99 Pro      | 4.500.000 |
| `yonex-astrox-88d-pro`    | Yonex Astrox 88D Pro     | 4.300.000 |
| `yonex-nanoflare-800`     | Yonex Nanoflare 800      | 4.100.000 |
| `victor-thruster-ryuga-2` | Victor Thruster Ryuga II | 3.800.000 |
| `victor-auraspeed-90k`    | Victor Auraspeed 90K     | 3.600.000 |
| `lining-axforce-80`       | Li-Ning Axforce 80       | 3.200.000 |

**Shoes** — durable, **nhiều variant (size 40–43)** → luồng bottom-sheet SUGG-003 (3)

| Handle          | Tên                      | Giá       |
| --------------- | ------------------------ | --------- |
| `yonex-pc-65z3` | Yonex Power Cushion 65Z3 | 2.200.000 |
| `victor-a970`   | Victor A970              | 1.900.000 |
| `lining-ranger` | Li-Ning Ranger           | 1.600.000 |

**Strings** — consumable (5)

| Handle              | Tên              | Giá     |
| ------------------- | ---------------- | ------- |
| `yonex-aerobite`    | Yonex Aerobite   | 190.000 |
| `yonex-bg80-power`  | Yonex BG80 Power | 150.000 |
| `victor-vbs-63`     | Victor VBS-63    | 140.000 |
| `lining-no1-string` | Li-Ning No.1     | 130.000 |
| `yonex-bg65`        | Yonex BG65       | 120.000 |

**Grips** — consumable (4)

| Handle                   | Tên                    | Giá     |
| ------------------------ | ---------------------- | ------- |
| `yonex-super-grap-ac104` | Yonex Super Grap AC104 | 110.000 |
| `yonex-ac105-grip`       | Yonex AC105 Grip       | 100.000 |
| `yonex-ac102-towel-grip` | Yonex AC102 Towel Grip | 90.000  |
| `victor-gr262-grip`      | Victor GR262           | 70.000  |

**Bags** — durable (3)

| Handle                | Tên                        | Giá       |
| --------------------- | -------------------------- | --------- |
| `yonex-pro-bag-92026` | Yonex Pro Racket Bag 92026 | 1.800.000 |
| `victor-br9213-bag`   | Victor BR9213              | 1.200.000 |
| `victor-br9111-bag`   | Victor BR9111 Bag          | 1.100.000 |

**Socks** — consumable (2)

| Handle               | Tên                     | Giá     |
| -------------------- | ----------------------- | ------- |
| `yonex-socks-19120`  | Yonex Sport Socks 19120 | 120.000 |
| `victor-sk155-socks` | Victor SK155            | 90.000  |

**Insoles** — durable (1)

| Handle            | Tên                        | Giá     |
| ----------------- | -------------------------- | ------- |
| `yonex-pc-insole` | Yonex Power Cushion Insole | 350.000 |

**Shuttlecocks** (cầu rời) — consumable (5)

| Handle             | Tên                | Giá     |
| ------------------ | ------------------ | ------- |
| `yonex-as50`       | Yonex Aerosensa 50 | 980.000 |
| `yonex-as30`       | Yonex Aerosensa 30 | 850.000 |
| `lining-a62`       | Li-Ning A+62       | 620.000 |
| `yonex-mavis-2000` | Yonex Mavis 2000   | 420.000 |
| `yonex-mavis-350`  | Yonex Mavis 350    | 350.000 |

**Tubes** — consumable; mỗi `-1tube` là **nguồn CR-04**, map sang combo `-3tube` (bulk target, đơn giá/ống tốt hơn) (5 cặp = 10 sản phẩm)

| Nguồn (1 ống)            | Giá     | Bulk (Combo 3 ống)       | Giá       |
| ------------------------ | ------- | ------------------------ | --------- |
| `yonex-as50-1tube`       | 980.000 | `yonex-as50-3tube`       | 2.760.000 |
| `yonex-as30-1tube`       | 850.000 | `yonex-as30-3tube`       | 2.400.000 |
| `lining-a62-1tube`       | 620.000 | `lining-a62-3tube`       | 1.740.000 |
| `yonex-mavis-2000-1tube` | 420.000 | `yonex-mavis-2000-3tube` | 1.180.000 |
| `yonex-mavis-350-1tube`  | 350.000 | `yonex-mavis-350-3tube`  | 990.000   |

### Tier-1 manual rules (nguồn → [suggested] display_order, label)

- `yonex-astrox-99-pro` → `yonex-bg65`(0, **"Best Match"**), `yonex-pro-bag-92026`(1), `yonex-ac102-towel-grip`(2) — **đủ 3, không backfill**
- `lining-axforce-80` → `lining-no1-string`(0), `victor-gr262-grip`(1) — **chỉ 2 → backfill Tier-2**
- `victor-auraspeed-90k` → `victor-vbs-63`(0,"Best Match"), `victor-gr262-grip`(1), `victor-br9111-bag`(2)

### Tier-2 category-complement map

`Rackets → [Strings, Grips, Bags]` · `Shoes → [Socks, Insoles]` · `Shuttlecocks → [Tubes]`

### Top-seller (job `run-topseller-job` tính từ order thật)

`yonex-bg65`=6 · `yonex-pro-bag-92026`=4 · `yonex-ac102-towel-grip`=3 · `yonex-socks-19120`=2 · `victor-vbs-63`=1 · `victor-br9111-bag`=1
(Cold-start không order: `seed-category-top-sellers.ts` sinh snapshot giả xếp theo handle. `run-topseller-job` **ghi đè** — order là nguồn thắng.)

### Helper — resolve `product_id` / `variant_id` từ handle

Store cần id `prod_…` / `variant_…`, không nhận handle:

```
GET http://localhost:9009/store/products?handle=yonex-astrox-99-pro&fields=id,*variants
  header: x-publishable-api-key: <pak>
→ products[0].id            = productId
→ products[0].variants[0].id = variantId (sản phẩm 1 variant)
```

Tạo cart & thêm item (dựng state cho các cart scenario):

```
GET  /store/regions                                   → regionId (Vietnam / VND)
POST /store/carts               { "region_id": "<regionId>" }             → cartId
POST /store/carts/{cartId}/line-items  { "variant_id": "<variantId>", "quantity": 1 }
```

> Postman collection `HF-Medusa-Suggestive-Selling-Store` (thư mục `postman/`) đã có sẵn biến
> `baseUrl`, `publishableKey`, `productId`, `suggestedProductId`, `racketVariantId`, `gripVariantId`,
> `sessionId` — import vào chạy nhanh nhất.

---

# PHẦN A — SUGGESTIVE SELLING

---

## A1. Product-level Tier-1 manual — hiển thị đúng thứ tự

**SRS:** SUGG-001 Tier 1 · **Acceptance:** T-SUGG-01
**Mục tiêu:** sản phẩm có đủ ≥3 manual → chỉ trả manual, đúng `display_order`, không đụng Tier-2.

**Dữ liệu:** `yonex-astrox-99-pro` (3 manual). Gọi **guest** (không login, để tránh filter mua-30-ngày).

**Các bước:**

1. Resolve `productId` của `yonex-astrox-99-pro`.
2. `GET /store/products/{productId}/suggestions` (không `cart_id`).

**Kết quả kỳ vọng:** `count = 3`, tất cả `tier: "manual"`, `display_order` 1→3:

```
1. [manual] yonex-bg65             label: "Best Match"
2. [manual] yonex-pro-bag-92026    label: null
3. [manual] yonex-ac102-towel-grip label: null
```

Không có phần tử `tier: "category"`. `price` là giá "from" (variant rẻ nhất), `discount_price` = null nếu không có item-promo.

---

## A2. Product-level Tier-2 backfill + chuỗi nhân quả top-seller

**SRS:** SUGG-001 Tier 2 · **Acceptance:** T-SUGG-02
**Mục tiêu:** khi manual **< 3** → hệ thống lấp slot bằng **top-seller của các category bổ trợ**; và thứ tự top-seller **lấy từ đơn hàng thật**: `order` → job `compute-category-top-sellers` → bảng `category_top_seller` → evaluator xếp hạng.

**Dữ liệu:** `lining-axforce-80` (chỉ 2 Tier-1 manual: `lining-no1-string`, `victor-gr262-grip`). Complement của Rackets = Strings, Grips, Bags.

**Các bước:**

1. `GET /store/products/{lining-axforce-80 id}/suggestions`.
2. Kết quả kỳ vọng: **2 `manual` trước, rồi các `category` lấp cho tới 5 slot**, nhóm `category` xếp theo `sales_count`:

```
1. [manual]   lining-no1-string
2. [manual]   victor-gr262-grip
3. [category] yonex-bg65              (String, bán 6)
4. [category] yonex-pro-bag-92026     (Bag, bán 4)
5. [category] yonex-ac102-towel-grip  (Grip, bán 3)
```

> Số lượng & thứ tự nhóm `category` phụ thuộc snapshot `category_top_seller`. Chạy
> `npx medusa exec ./src/scripts/run-topseller-job.ts` để có đúng ranking-từ-order như trên.

**Đối chứng (không backfill):** `yonex-astrox-99-pro` (đủ 3 manual) → chỉ 3 `manual`, không có `category` (chính là A1).

### Chứng minh nhân quả (đổi top-seller → đổi thứ tự)

```bash
# đẩy yonex-pro-bag-92026 lên top nhóm Bags rồi rebuild snapshot
docker exec hf_medusa_postgres psql -U hfmedusa -d hfmedusa -c \
  "update category_top_seller set sales_count=999 where product_id=(select id from product where handle='yonex-pro-bag-92026');"
```

> ⚠️ **Cache 5 phút.** Gợi ý cache ở Redis. Sau khi đổi snapshot phải flush mới thấy ngay:
>
> ```bash
> docker exec hf_medusa_redis sh -c "redis-cli --scan --pattern '*suggest:product*' | xargs -r redis-cli del"
> ```
>
> Key: `suggest:product:v3:{productId}` (TTL 300s) cho nhánh không có `cart_id`.

### Demo cron thật

Tạm đổi `schedule` trong `src/jobs/compute-category-top-sellers.ts` thành `"*/2 * * * *"` (2 phút),
thêm/sửa order → chờ 2 phút → snapshot tự cập nhật. **Trả lại `"0 */6 * * *"` sau demo.**

---

## A3. Filter (a) — sản phẩm đã có trong giỏ bị loại + backfill lấp slot

**SRS:** SUGG-002 (a) · **Acceptance:** T-SUGG-03
**Mục tiêu:** gợi ý trùng item đang trong giỏ → ẩn, và slot trống được **Tier-2 lấp lại** (không hụt số lượng).

**Dữ liệu:** nguồn `yonex-astrox-99-pro`; giỏ đã có `yonex-bg65` (chính là manual #1).

**Các bước:**

1. Tạo cart, add `yonex-bg65` (variant) vào giỏ → `cartId`.
2. `GET /store/products/{astrox id}/suggestions?cart_id={cartId}`.

**Kết quả kỳ vọng:** `yonex-bg65` **không xuất hiện**; 2 manual còn lại giữ nguyên, slot trống được lấp bằng `category` (String/Grip/Bag top-seller khác):

```
1. [manual]   yonex-pro-bag-92026
2. [manual]   yonex-ac102-towel-grip
3. [category] lining-no1-string  (hoặc top-seller String kế tiếp)
…
```

Không truyền `cart_id` → `yonex-bg65` lại xuất hiện (đối chứng). Lý do loại nội bộ: `reason: "in_cart"`.

---

## A4. Filter (b) — sản phẩm hết hàng bị loại

**SRS:** SUGG-002 (b) · **Acceptance:** T-SUGG-04
**Mục tiêu:** gợi ý hết hàng tại kho → ẩn; slot được backfill.

**Dữ liệu:** cho 1 manual của `yonex-astrox-99-pro` (vd `yonex-pro-bag-92026`) về stock 0.

`in_stock` = có ≥1 variant mua được: `manage_inventory=false` (không quản kho) **hoặc** `allow_backorder=true` **hoặc** `Σ(stocked − reserved) > 0`.

**Các bước:**

1. Admin/DB: đưa tồn kho `yonex-pro-bag-92026` về 0 (stocked=0, hoặc reserved=stocked).
2. Flush cache product (lệnh ở A2).
3. `GET /store/products/{astrox id}/suggestions`.

**Kết quả kỳ vọng:** `yonex-pro-bag-92026` biến mất, slot được lấp bằng `category` khác. `reason: "out_of_stock"`.
(Có thể test nhanh bằng unit: `pnpm test:unit` → `pipeline.unit.spec.ts` "drops an out-of-stock product".)

---

## A5. Filter (c) — dismiss trong session không hiện lại

**SRS:** SUGG-002 (c) · **Acceptance:** T-SUGG-05
**Mục tiêu:** khách bấm X/swipe 1 gợi ý → phiên đó không thấy lại. Dismiss được lưu qua event `dismiss`, scope theo `x-session-id` (guest) hoặc `customer_id` (đã login).

**Các bước (giữ nguyên 1 `x-session-id` cho cả 3 request):**

1. `GET /store/products/{astrox id}/suggestions` — thấy `yonex-ac102-towel-grip`.
2. `POST /store/suggestion-events` header `x-session-id: sess_demo_a5`:
   ```json
   {
     "events": [
       {
         "action": "dismiss",
         "source_context": "product_view",
         "source_product_id": "<astrox id>",
         "suggested_product_id": "<ac102 id>"
       }
     ]
   }
   ```
   → `202 { accepted: 1, rejected: 0 }`.
3. `GET /store/products/{astrox id}/suggestions` header `x-session-id: sess_demo_a5`.

**Kết quả kỳ vọng:** `yonex-ac102-towel-grip` **không còn**, slot backfill. Gọi bằng `x-session-id` khác → nó xuất hiện lại (dismiss theo phiên). `reason: "dismissed"`.

> ⚠️ Dismiss lưu ở Redis (`suggest:dismiss:{scope}:{context}`, TTL 24h). **Không có Redis** → dismiss không bền, filter này sẽ không giữ giữa các request (degrade an toàn — không lỗi).

---

## A6. Filter (d) — đã mua trong 30 ngày (kèm ngoại lệ consumable)

**SRS:** SUGG-002 (d)
**Mục tiêu:** khách **đã đăng nhập** không bị gợi lại **durable** đã mua trong 30 ngày; nhưng **consumable** (cước/cầu/quấn cán…) vẫn được gợi (vì mua lại thường xuyên). Guest thì không áp filter này.

**Dữ liệu:** login `conghung@gmail.com` — đã mua `yonex-bg65` (String, consumable), `yonex-pro-bag-92026` (Bag, durable), `yonex-ac102-towel-grip` (Grip, consumable). Nguồn xem: `yonex-astrox-99-pro` (manual = đúng 3 sản phẩm này).

**Các bước:**

1. Login conghung → JWT.
2. `GET /store/products/{astrox id}/suggestions` kèm `Authorization: Bearer <JWT>`.

**Kết quả kỳ vọng:**

- `yonex-pro-bag-92026` (durable, đã mua) → **bị loại** (`reason: "recent_purchase"`).
- `yonex-bg65`, `yonex-ac102-towel-grip` (consumable, đã mua) → **vẫn hiện**.
- Còn 2 manual → **backfill 1 category** lấp cho đủ.

**Đối chứng:** gọi **guest** (bỏ `Authorization`) → cả 3 manual hiện đủ, không backfill. (Filter mua-30-ngày chỉ áp cho khách đăng nhập — guest luôn rỗng, BR-08.)

---

## A7. One-tap Add — variant đơn (happy path)

**SRS:** SUGG-003 · **Acceptance:** T-SUGG-06
**Mục tiêu:** bấm "Add to Cart" trên card gợi ý → thêm variant mặc định (qty 1) vào giỏ, trả tổng giỏ mới + ghi attribution.

**Các bước:**

1. Tạo cart `cartId`. Resolve `productId`/`variantId` của `yonex-bg65` (1 variant).
2. `POST /store/carts/{cartId}/suggested-items` với body:
   ```json
   {
     "product_id": "<bg65 productId>",
     "variant_id": "<bg65 variantId>",
     "quantity": 1,
     "slot": 0,
     "attribution": {
       "rule_id": null,
       "source_context": "product_view",
       "source_product_id": "<astrox id>"
     }
   }
   ```

**Kết quả kỳ vọng:** `200` với

```json
{ "line_item": { "id": "…", "variant_id": "<bg65 variantId>", "quantity": 1, "metadata": {…} },
  "updated_cart_total": <đã cộng 120.000>, "is_idempotent_replay": false }
```

`customer_id`/`session_id` **không** đọc từ body — chỉ từ auth context + header (SEC-04). Event `add_to_cart` được ghi kèm.

---

## A8. One-tap Add — nhiều variant → cần chọn (bottom sheet)

**SRS:** SUGG-003 (variant selector)
**Mục tiêu:** sản phẩm nhiều variant, không default → card báo cần chọn variant thay vì add ngay.

**Dữ liệu:** `yonex-pc-65z3` (giày, nhiều size 40–43). Nguồn gợi ý giày: `yonex-pc-65z3` là manual của… (dùng bất kỳ luồng có giày; hoặc cart-level). Đơn giản nhất: kiểm field trên suggestion.

**Các bước:**

1. Lấy 1 suggestion trỏ tới `yonex-pc-65z3` (vd cart-level CR, hoặc GET product của nguồn có giày).
2. Quan sát field: `requires_variant_selection: true`, `variant_id: null`.
3. `POST /store/carts/{cartId}/suggested-items` **thiếu** `variant_id`:
   ```json
   {
     "product_id": "<65z3 productId>",
     "quantity": 1,
     "attribution": {
       "source_context": "product_view",
       "source_product_id": null,
       "rule_id": null
     }
   }
   ```

**Kết quả kỳ vọng:** khi `requires_variant_selection = true`, FE mở **bottom sheet chọn size** thay vì add thẳng. Gọi lại có `variant_id` của 1 size cụ thể → add thành công như A7.
(Logic thuần: `pnpm test:unit` → `resolveVariant`: 1 variant→auto, nhiều variant→`requires_variant_selection:true`, 0 variant→null.)

---

## A9. One-tap Add — hết hàng giữa render và tap → 409

**SRS:** SUGG-003 + **EC-07**
**Mục tiêu:** stock được **re-check tại thời điểm add** (không tin cache); nếu vừa hết → `409` và FE refresh gợi ý.

**Các bước:**

1. Render gợi ý có `yonex-bg65` (đang còn hàng).
2. Trước khi add, đưa tồn `yonex-bg65` về 0 (admin/DB).
3. `POST /store/carts/{cartId}/suggested-items` với `yonex-bg65`.

**Kết quả kỳ vọng:** `409`

```json
{
  "code": "SUGGESTION_STOCK_CONFLICT",
  "message": "Sản phẩm vừa hết hàng. Gợi ý đã được cập nhật."
}
```

FE bắt 409 → gọi lại endpoint suggestions để làm mới section.

---

## A10. One-tap Add — Idempotency-Key chống double-add

**SRS:** SUGG-003 (an toàn thao tác)
**Mục tiêu:** replay cùng request (double-tap / retry mạng) không cộng 2 lần.

**Các bước:**

1. `POST /store/carts/{cartId}/suggested-items` (như A7) kèm header `Idempotency-Key: itk-demo-a10`.
2. Gọi **lại y hệt** cùng `Idempotency-Key`.

**Kết quả kỳ vọng:** lần 2 trả `is_idempotent_replay: true`, `updated_cart_total` **không đổi**, giỏ vẫn qty 1 (không thành 2). Bỏ header thì server tự sinh UUID mỗi lần (không dedupe).

---

## A11. Cart CR-01 — thiếu category bổ trợ

**SRS:** SUGG-004 CR-01 · **Acceptance:** T-SUGG-07
**Mục tiêu:** giỏ có category X (Rackets/Shoes/Shuttlecocks) nhưng thiếu category bổ trợ Y → gợi ý top-seller của Y.

**Dữ liệu:** cart chỉ có `yonex-astrox-99-pro` (Rackets). Thiếu Strings/Grips/Bags.

**Các bước:**

1. Tạo cart, add `yonex-astrox-99-pro`.
2. `GET /store/carts/{cartId}/suggestions`.

**Kết quả kỳ vọng:** ≥1 gợi ý `rule_code: "CR-01"`, là top-seller của category còn thiếu — vd `yonex-bg65` (String, bán 6). Mỗi item `tier: "cart"`, `rule_id: null`. Sản phẩm đã trong giỏ bị loại; các rule sau không lặp lại sản phẩm rule trước đã chọn.

---

## A12. Cart CR-02 — nudge free-shipping (ví dụ chuẩn SRS)

**SRS:** SUGG-004 CR-02 · **Acceptance:** T-SUGG-08
**Mục tiêu:** tổng giỏ nằm trong **15% dưới ngưỡng free-ship 7.000.000₫** → gợi ý item **vừa đủ đẩy qua ngưỡng**, kèm badge + `threshold_info`.

CR-02 fire khi `7.000.000 × 0.85 ≤ subtotal < 7.000.000`, tức **5.950.000 ≤ subtotal < 7.000.000**. Item gợi ý nằm dải giá `[remaining, remaining×2]`.

**Dữ liệu (đúng AC trong SRS §3.2):** cart = `yonex-astrox-99-pro` (4.500.000) + `yonex-pc-65z3` (2.200.000) = **6.700.000** (trong dải) → `remaining = 300.000`, dải giá item gợi ý `[300.000, 600.000]`.

**Các bước:**

1. Tạo cart, add cả 2 sản phẩm.
2. `GET /store/carts/{cartId}/suggestions`.

**Kết quả kỳ vọng:**

- `threshold_info: { target: 7000000, current: 6700000, remaining: 300000 }` (non-null vì CR-02 fire & còn ≥1 gợi ý).
- Có gợi ý `rule_code: "CR-02"`, `badge_text: "Mua thêm để được MIỄN PHÍ vận chuyển!"`, giá trong `[300.000, 600.000]` (vd `yonex-pc-insole` 350.000 / `yonex-mavis-350` 350.000).
- Đồng thời **CR-01 cũng fire** (có racket, thiếu cước) → thứ tự ưu tiên CR-01 (priority 10) trước CR-02 (20). Top-3 unique:
  ```
  (1) [CR-01] cước top-seller (vd yonex-bg65)
  (2) [CR-02] item 300–600K + badge free-ship
  (3) [CR-01/CR-03] kết quả kế tiếp
  ```

> Ngưỡng free-ship lấy live từ shipping-option (`item_total gte 7.000.000` → phí 0), fallback hằng `FREE_SHIPPING_THRESHOLD = 7.000.000`.
> Biên fire (unit `cart-rules.unit.spec.ts`): 5.950.000 & 6.999.999 → fire; 7.000.000 & 5.949.999 → không.

---

## A13. Cart CR-03 — cùng brand → phụ kiện cùng brand

**SRS:** SUGG-004 CR-03
**Mục tiêu:** giỏ **chỉ 1 brand duy nhất** → gợi ý phụ kiện cùng brand đó.

**Dữ liệu:** cart toàn Victor, tránh trigger CR-01/CR-02 để CR-03 nổi bật: `victor-vbs-63` (String, 140.000) + `victor-gr262-grip` (Grip, 70.000). Không có Racket/Shoe/Shuttlecock (CR-01 không fire), subtotal 210.000 (xa ngưỡng, CR-02 không fire), 1 brand = Victor.

**Các bước:**

1. Tạo cart, add 2 item Victor trên.
2. `GET /store/carts/{cartId}/suggestions`.

**Kết quả kỳ vọng:** gợi ý `rule_code: "CR-03"`, toàn phụ kiện **Victor** từ các category [Strings, Grips, Bags, Socks, Insoles, Tubes] (vd `victor-br9111-bag`, `victor-sk155-socks`), loại item đã có trong giỏ.

**Đối chứng:** thêm 1 item Yonex (vd `yonex-bg65`) → giỏ 2 brand → **CR-03 không fire** (unit: "fires only when exactly one distinct brand").

---

## A14. Cart CR-04 — consumable qty 1 → gợi ý bulk/multipack

**SRS:** SUGG-004 CR-04
**Mục tiêu:** giỏ có consumable **quantity ≤ 1** → gợi ý combo bulk cùng loại (đơn giá tốt hơn).

**Dữ liệu:** cart có `yonex-mavis-350-1tube` (350.000, qty 1). Bulk map: `yonex-mavis-350-1tube` → `yonex-mavis-350-3tube` (990.000 = 330.000/ống, rẻ hơn 350.000/ống).

**Các bước:**

1. Tạo cart, add `yonex-mavis-350-1tube` qty 1.
2. `GET /store/carts/{cartId}/suggestions`.

**Kết quả kỳ vọng:** gợi ý `rule_code: "CR-04"` = `yonex-mavis-350-3tube`. Nếu tăng qty lên 2 → CR-04 **không fire** (`quantity > max_quantity=1`).

---

## A15. Cart assembly — ưu tiên, dedupe, top-3, ẩn section rỗng

**SRS:** SUGG-004 (quy tắc lắp ráp)
**Mục tiêu:** nhiều rule fire → gộp theo priority CR-01→CR-04, **dedupe theo product (giữ rule_code của rule fire trước, BR-04)**, cắt **top-3**; 0 gợi ý → response rỗng (FE ẩn hẳn section).

**Các bước:**

1. Cart A12 (racket + giày Yonex) → CR-01 + CR-02 (+ CR-03 vì cùng Yonex) cùng fire.
2. `GET /store/carts/{cartId}/suggestions?limit=3`.

**Kết quả kỳ vọng:** đúng **≤3** phần tử, không trùng product; nếu 1 product khớp nhiều rule thì `rule_code` = rule ưu tiên cao hơn (CR-01 trước CR-02). `limit=2` → cắt còn 2 (clamp 1–3).

**Ẩn section rỗng:** cart không kích hoạt rule nào (vd chỉ 1 `yonex-pc-insole` — Insole không nằm trong source category CR-01, 1 brand nhưng…). Cách chắc chắn: cart rỗng hoặc cart-id không tồn tại →
`GET /store/carts/cart_khong_ton_tai/suggestions` → `200 { suggestions: [], count: 0, threshold_info: null }` (degrade BR-10, FE ẩn section).

---

## A16. Refresh khi giỏ đổi + invalidate cache ngay

**SRS:** SUGG-005 · **Acceptance:** T-SUGG-09
**Mục tiêu:** mỗi thay đổi giỏ (add/remove/qty) phát `cart.updated` → subscriber **invalidate cache gợi ý ngay** (không đợi TTL) → lần gọi sau tính lại trên state mới.

**Các bước (flow 3 request):**

1. `GET /store/carts/{cartId}/suggestions` — **warm cache**.
2. `POST /store/carts/{cartId}/line-items` add thêm 1 grip (`yonex-ac102-towel-grip`) → phát `cart.updated`.
3. `GET /store/carts/{cartId}/suggestions` — **tính lại**: grip vừa thêm không còn được gợi (đã trong giỏ), CR-01/CR-03 đổi theo.

**Kết quả kỳ vọng:** kết quả bước 3 khác bước 1, phản ánh giỏ mới. Subscriber `cart-updated-suggestions` xoá key `suggest:cart:v{version}:{cartId}`.

**Quan sát cache (tuỳ chọn):**

```bash
docker exec hf_medusa_redis redis-cli --scan --pattern '*suggest:cart*'
```

Sau bước 2 key của cart đó bị xoá; bước 3 tạo lại.

---

## A17. EC-05 — item vừa thêm từ product page không bị re-suggest ở cart

**SRS:** EC-05
**Mục tiêu:** thêm 1 gợi ý từ trang product → sang cart, section cart **không** gợi lại chính item đó.

**Các bước:**

1. Cart có `yonex-astrox-99-pro`. Ở product page, one-tap add gợi ý `yonex-bg65` (A7) → `bg65` vào giỏ (phát `cart.updated`).
2. `GET /store/carts/{cartId}/suggestions`.

**Kết quả kỳ vọng:** `yonex-bg65` **không** nằm trong gợi ý cart (đã trong giỏ → filter `in_cart` ở bước filterCandidates; cache đã invalidate bởi `cart.updated`). CR-01 chuyển sang gợi cước/grip/bag **khác**.

---

## A18. Analytics events — track impression/tap/add/dismiss

**SRS:** SUGG-006 · **Acceptance:** T-SUGG-10
**Mục tiêu:** mọi tương tác gợi ý được ghi; batch ≤10; lỗi từng event không làm hỏng cả batch; `dismiss` có side-effect (ghi dismissal set).

**Các bước:**

1. Batch 4 action:
   ```json
   {
     "events": [
       {
         "action": "impression",
         "source_context": "product_view",
         "source_product_id": "<astrox id>",
         "suggested_product_id": "<bg65 id>",
         "rule_id": "srule_demo",
         "tier": "manual",
         "slot": 1
       },
       {
         "action": "tap",
         "source_context": "product_view",
         "source_product_id": "<astrox id>",
         "suggested_product_id": "<bg65 id>",
         "slot": 1
       },
       {
         "action": "add_to_cart",
         "source_context": "cart",
         "suggested_product_id": "<bg65 id>",
         "rule_id": null,
         "tier": "cart",
         "slot": 0
       },
       {
         "action": "dismiss",
         "source_context": "product_view",
         "source_product_id": "<astrox id>",
         "suggested_product_id": "<ac102 id>"
       }
     ]
   }
   ```
   → `202 { accepted: 4, rejected: 0 }`.
2. **Per-event rejection:** trộn 1 event hợp lệ + 3 event sai (thiếu `suggested_product_id`, `action: "not_a_real_action"`, `source_context` sai) → `202 { accepted: 1, rejected: 3 }` (batch không fail).
3. **Batch > 10:** gửi 12 event → chỉ **10** đầu được nhận (truncate).
4. `customer_id` **không** đọc từ body — chỉ auth context (SEC-04). Event `dismiss` đồng thời ghi dismissal set (chứng minh bằng A5).

**Kết quả kỳ vọng:** như trên. Đối chiếu bảng `suggestion_event` (admin: "List Suggestion Events") thấy row tương ứng với đủ trường `source_context, source_product_id, suggested_product_id, customer_id, session_id, action, created_at`.

---

## A19. EC-09 — admin deactivate rule khi cache còn sống

**SRS:** EC-09 (Should)
**Mục tiêu:** deactivate 1 suggestion rule trong lúc khách còn cache → chấp nhận stale tối đa 5 phút (eventual consistency), thêm-vào-giỏ vẫn chạy, không lỗi.

**Các bước:**

1. `GET /store/products/{astrox id}/suggestions` → warm cache (thấy `yonex-bg65`).
2. Admin `DELETE /admin/suggestion-rules/{ruleId}` (soft delete `is_active=false`) cho rule astrox.
3. Ngay sau đó `GET` lại (cache còn) → **vẫn có thể thấy** gợi ý cũ (stale ≤5 phút).
4. One-tap add sản phẩm đó → **vẫn thành công** (product còn tồn tại, chỉ rule bị tắt) → không lỗi cho khách.
5. Sau khi cache hết hạn / flush → gợi ý biến mất.

**Kết quả kỳ vọng:** không có lỗi phía khách; hành vi hội tụ sau ≤5 phút (hoặc flush `suggest:product:v3:*`).

---

## A20. Degrade & clamp — không bao giờ vỡ FE

**SRS:** BR-10 (degrade), SUGG-005 (limit clamp), Redis optional
**Mục tiêu:** input bất thường vẫn trả `200` cấu trúc chuẩn để FE không vỡ.

| Case                    | Request                                         | Kết quả kỳ vọng                                             |
| ----------------------- | ----------------------------------------------- | ----------------------------------------------------------- |
| Product không tồn tại   | `GET /store/products/prod_khong_co/suggestions` | `200 { suggestions: [], count: 0 }`                         |
| Cart không tồn tại/rỗng | `GET /store/carts/cart_khong_co/suggestions`    | `200 { suggestions: [], count: 0, threshold_info: null }`   |
| limit vượt trần         | `…/products/{id}/suggestions?limit=99`          | clamp về 5                                                  |
| limit vượt trần (cart)  | `…/carts/{id}/suggestions?limit=99`             | clamp về 3                                                  |
| limit rác               | `?limit=abc`                                    | dùng mặc định (5 / 3)                                       |
| Không có Redis          | tắt `REDIS_URL`, gọi mọi endpoint trên          | vẫn chạy: cache/dismiss no-op, dismiss không bền, không lỗi |

---

## Ma trận coverage — Suggestive Selling

| SRS             | Nội dung                                      | Scenario | Acceptance / EC |
| --------------- | --------------------------------------------- | -------- | --------------- |
| SUGG-001 Tier 1 | Manual, đúng display_order                    | A1       | T-SUGG-01       |
| SUGG-001 Tier 2 | Backfill category + top-seller                | A2       | T-SUGG-02       |
| SUGG-002 (a)    | Loại item đã trong giỏ                        | A3       | T-SUGG-03       |
| SUGG-002 (b)    | Loại item hết hàng                            | A4       | T-SUGG-04       |
| SUGG-002 (c)    | Loại item đã dismiss trong session            | A5       | T-SUGG-05       |
| SUGG-002 (d)    | Loại durable đã mua 30 ngày (consumable miễn) | A6       | —               |
| SUGG-003        | One-tap add (variant đơn)                     | A7       | T-SUGG-06       |
| SUGG-003        | Nhiều variant → bottom sheet                  | A8       | —               |
| SUGG-003        | Re-check stock → 409                          | A9       | EC-07           |
| SUGG-003        | Idempotency chống double-add                  | A10      | —               |
| SUGG-004 CR-01  | Thiếu category bổ trợ                         | A11      | T-SUGG-07       |
| SUGG-004 CR-02  | Nudge free-shipping + badge + threshold_info  | A12      | T-SUGG-08       |
| SUGG-004 CR-03  | Cùng brand → phụ kiện cùng brand              | A13      | —               |
| SUGG-004 CR-04  | Consumable qty 1 → bulk                       | A14      | —               |
| SUGG-004        | Priority / dedupe / top-3 / ẩn rỗng           | A15      | —               |
| SUGG-005        | Refresh + invalidate cache ngay               | A16      | T-SUGG-09       |
| EC-05           | Item vừa thêm không re-suggest                | A17      | EC-05           |
| SUGG-006        | Analytics events                              | A18      | T-SUGG-10       |
| EC-09           | Deactivate rule + stale cache                 | A19      | EC-09           |
| BR-10           | Degrade / clamp / no-Redis                    | A20      | —               |

---

# PHẦN B — VOUCHER (chờ VoucherEngine bổ sung)

> **Phần này để trống cho người làm VoucherEngine.** Suggestive Selling (PHẦN A) đã hoàn chỉnh; voucher nối tiếp xuống dưới.

**Cách ghép luồng (gợi ý):** tái dùng các cart đã dựng ở PHẦN A làm state đầu vào cho voucher, để hai feature thành **luồng hoàn chỉnh**:

```
gợi ý (A1–A2) → one-tap add (A7–A10) → áp voucher → stacking item-promo + voucher + cap 50% → auto-invalidate khi đổi giỏ (nối A16/A17)
```

**Cần cover (SRS §4 Voucher + §8 Edge Cases):**

| Nhóm       | Requirement                                           | Acceptance test  |
| ---------- | ----------------------------------------------------- | ---------------- |
| Apply      | VOUCH-001 (apply code / My Vouchers), VOUCH-002 V1–V8 | T-VOUCH-01…06    |
| Stacking   | VOUCH-003 (item-promo → voucher → cap 50%)            | T-VOUCH-07/08/09 |
| Remove     | VOUCH-004 (gỡ voucher, không tăng usage_count)        | T-VOUCH-10       |
| Revalidate | VOUCH-005 (auto-invalidate khi cart đổi)              | T-VOUCH-11       |
| Edge cases | EC-01, EC-02, EC-03, EC-04, EC-06, EC-08, EC-10       | T-VOUCH-12       |

**Quy ước tiếp nối:** đánh số `## B1, B2, …`; giữ nguyên khung của PHẦN A (Mục tiêu → SRS trace → Dữ liệu → Các bước → Kết quả kỳ vọng); bổ sung 1 bảng "Ma trận coverage — Voucher" ở cuối như PHẦN A.

<!-- ↓↓↓ VoucherEngine: thêm scenario B1, B2, … từ đây ↓↓↓ -->
