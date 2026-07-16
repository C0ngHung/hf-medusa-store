# DEMO SCENARIOS — HF BADMINTON STORE

File tổng hợp **các kịch bản demo**. Mỗi mục = 1 case cần trình diễn: mục tiêu → SRS trace → dữ liệu → các bước → kết quả kỳ vọng.

> **Trạng thái file:**
>
> - **PHẦN A — Suggestive Selling** đã cover đầy đủ SRS §3 (SUGG-001…006) + edge case liên quan (EC-05, EC-07, EC-09) + toàn bộ acceptance test T-SUGG-01…10.
> - **PHẦN B — Voucher Engine** đã bổ sung kế hoạch demo/test theo SRS §4, §8, §9: apply/remove/replace, V1→V8 fail-fast, stacking/cap 50%, auto-invalidation, rate-limit, usage log, admin create/analytics và luồng tích hợp với Suggestive Selling.

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
xóa sạch((product + cart + dismiss) ): docker exec hf_medusa_redis sh -c "redis-cli --scan --pattern 'medusa:suggest:*' | xargs -r redis-cli del"

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

# PHẦN B — VOUCHER ENGINE

Phần này là kế hoạch demo/test thủ công cho Voucher Engine, bám theo SRS §4 Voucher, §8 Edge Cases, §9 NFR và API contract. Các scenario dùng chung catalog/cart từ PHẦN A để chứng minh luồng tích hợp: **gợi ý sản phẩm → add vào cart → áp voucher → tính stacking/cap → cart đổi thì revalidate**.

## B0. Cheat-sheet: endpoint + dữ liệu seed Voucher

### Endpoint Voucher Engine

| Trace | Method | Path | Request chính | Response chính |
| ----- | ------ | ---- | -------------- | --------------- |
| VOUCH-001/002/003 | POST | `/store/carts/{cartId}/voucher` | `{ "code": "SAVE10" }`, query optional `?replace=true` | `{ success, discount_amount, discount_capped, cap_explanation, updated_cart_total, voucher_details }` |
| VOUCH-004 | DELETE | `/store/carts/{cartId}/voucher` | body rỗng | `{ success, updated_cart_total, message }` |
| VOUCH-001 | GET | `/store/customers/me/vouchers` | customer auth nếu có | `{ vouchers: [...] }` |
| Admin | POST | `/admin/vouchers` | VoucherConfig fields | `{ voucher }` |
| Admin analytics | GET | `/admin/vouchers/{id}/analytics` | voucher id | `{ total_uses, total_discount_given, avg_order_value, capped_count, conversion_rate }` |

### Dữ liệu seed Voucher

Chạy seed nếu DB chưa có voucher:

```bash
cd hf-medusa-store/apps/backend
npx medusa exec ./src/scripts/seed-voucher-engine.ts
```

Seed hiện có:

| Code | Ý nghĩa | Kỳ vọng chính |
| ---- | ------- | ------------- |
| `SAVE10` | 10% toàn giỏ, không scope, không min order | Happy path apply/remove/replace |
| `MEGA20` | 20% toàn giỏ | Dùng cho cap 50% khi cart có promotion đủ lớn |
| `SHUTTLE20` | 20% cho category Shuttlecocks, min order 200.000₫ | V5 min order, V6 eligible category, auto-remove |
| `RACKET2M` | Promotion Medusa thường, fixed 2.000.000₫ | Test coexistence promotion + voucher; không phải VoucherConfig |

> Lưu ý: Voucher Engine quản lý `VoucherConfig`; Promotion module vẫn quản lý promotion thường. Storefront chỉ có **một ô nhập mã giảm giá**, nhận cả voucher code và promotion code.

### Helper dựng cart

1. Resolve variant từ handle như PHẦN A.
2. Tạo cart theo region VND.
3. Add item:

```http
POST /store/carts/{cartId}/line-items
{ "variant_id": "<variantId>", "quantity": 1 }
```

Các sản phẩm dùng nhiều trong phần B:

| Handle | Giá | Vai trò |
| ------ | --- | ------- |
| `yonex-as50` | 980.000 | Shuttlecock đủ điều kiện `SHUTTLE20` |
| `yonex-mavis-2000` | 420.000 | Shuttlecock đủ điều kiện `SHUTTLE20` |
| `yonex-mavis-350` | 350.000 | Shuttlecock đủ điều kiện `SHUTTLE20` |
| `yonex-astrox-99-pro` | 4.500.000 | Racket không thuộc scope Shuttlecocks |
| `yonex-bg65` | 120.000 | String, dùng để test cart không đủ scope Shuttlecocks |

---

## B1. Apply voucher hợp lệ — nhập mã thủ công

**SRS:** VOUCH-001, VOUCH-002 · **Acceptance:** T-VOUCH-01
**Mục tiêu:** khách nhập voucher hợp lệ, backend validate fail-fast V1→V8, cart total cập nhật ngay, UI hiển thị voucher đang active.

**Dữ liệu:** cart có `yonex-as50` ×1 = 980.000₫. Voucher `SAVE10`.

**Các bước:**

1. Mở storefront `http://localhost:8008/cart`.
2. Add `yonex-as50` vào cart.
3. Nhập `SAVE10` vào ô discount/promotion hiện có.
4. Click Apply.

**Kết quả kỳ vọng:**

- Request store: `POST /store/carts/{cartId}/voucher { "code": "SAVE10" }`.
- Response `success: true`, `discount_capped: false`.
- Discount voucher = `floor(980.000 × 10%) = 98.000₫`.
- Cart total giảm từ 980.000₫ xuống 882.000₫.
- UI chỉ có **một** discount input; không có VoucherPanel riêng.
- UI hiển thị success message tiếng Việt và row voucher `SAVE10`.
- `cart.metadata.voucher` có snapshot voucher active.

---

## B2. My Vouchers / Available vouchers — chọn voucher từ danh sách

**SRS:** VOUCH-001
**Mục tiêu:** khách có thể chọn voucher khả dụng thay vì nhập tay, nếu backend trả danh sách "My Vouchers".

**Dữ liệu:** khách đăng nhập; DB có voucher active (`SAVE10`, `SHUTTLE20`).

**Các bước:**

1. Login customer demo.
2. Mở cart/checkout.
3. Click "Available vouchers" trong discount module.
4. Chọn `SAVE10` hoặc `SHUTTLE20`.

**Kết quả kỳ vọng:**

- Storefront gọi `GET /store/customers/me/vouchers`.
- Nếu có voucher: modal/list hiển thị code, giá trị, điều kiện.
- Chọn voucher sẽ gọi cùng flow apply như B1.
- Nếu guest hoặc backend trả rỗng: UI hiển thị empty state, không crash.

---

## B3. Validation fail-fast V1 — mã không tồn tại

**SRS:** VOUCH-002 V1, i18n · **Acceptance:** T-VOUCH-02
**Mục tiêu:** mã không tồn tại trả lỗi đầu tiên, UI hiển thị message dễ hiểu, không chạy tiếp validation sau.

**Dữ liệu:** cart bất kỳ có item. Code `NOTAREAL123`.

**Các bước:**

1. Nhập `NOTAREAL123`.
2. Click Apply.

**Kết quả kỳ vọng:**

- Voucher Engine trả `VOUCHER_NOT_FOUND`.
- Storefront fallback sang generic Promotion.
- Vì code cũng không phải promotion, UI hiển thị một lỗi cuối bằng tiếng Việt: mã giảm giá không đúng / kiểm tra lại.
- Không hiển thị raw technical error.
- Không làm thay đổi total/cart metadata.

---

## B4. Validation V5 — chưa đạt min order

**SRS:** VOUCH-002 V5 · **Acceptance:** T-VOUCH-05
**Mục tiêu:** voucher active nhưng cart không đạt `min_order_value` thì fail-fast tại V5 và trả message đúng.

**Dữ liệu:** cart có `yonex-bg65` ×1 = 120.000₫. Voucher `SHUTTLE20` min order 200.000₫.

**Các bước:**

1. Add `yonex-bg65` vào cart.
2. Nhập `SHUTTLE20`.
3. Click Apply.

**Kết quả kỳ vọng:**

- Response 422 với code tương ứng min order.
- UI render `customer_message` từ backend, ưu tiên tiếng Việt.
- Không attach voucher, không có ephemeral promotion, total giữ nguyên.

---

## B5. Validation V6 — cart không có item đủ điều kiện

**SRS:** VOUCH-002 V6 · **Acceptance:** T-VOUCH-06
**Mục tiêu:** voucher scoped theo Shuttlecocks không áp dụng cho cart chỉ có racket/string.

**Dữ liệu:** cart có `yonex-astrox-99-pro` ×1 = 4.500.000₫. Voucher `SHUTTLE20`.

**Các bước:**

1. Add `yonex-astrox-99-pro`.
2. Nhập `SHUTTLE20`.
3. Click Apply.

**Kết quả kỳ vọng:**

- V5 pass vì subtotal > 200.000₫.
- V6 fail vì không có item thuộc Shuttlecocks.
- UI hiển thị `customer_message`; không còn placeholder thô như `{categories}`.
- Total không đổi.

---

## B6. Voucher scoped item — chỉ giảm item đủ điều kiện

**SRS:** VOUCH-001, VOUCH-002 V6, VOUCH-003 Rule 4 · **Acceptance:** T-VOUCH-01/T-VOUCH-06
**Mục tiêu:** `SHUTTLE20` chỉ tính trên item thuộc Shuttlecocks, không giảm toàn bộ cart.

**Dữ liệu:** cart = `yonex-mavis-350` ×1 (350.000₫, eligible) + `yonex-astrox-99-pro` ×1 (4.500.000₫, not eligible). Voucher `SHUTTLE20`.

**Các bước:**

1. Add hai item trên vào cart.
2. Nhập `SHUTTLE20`.
3. Click Apply.

**Kết quả kỳ vọng:**

- Eligible subtotal = 350.000₫.
- Voucher discount = `floor(350.000 × 20%) = 70.000₫`.
- Total từ 4.850.000₫ xuống 4.780.000₫.
- UI hiển thị voucher row `SHUTTLE20`; không giảm phần racket.

---

## B7. Chỉ một voucher active — replace confirmation

**SRS:** VOUCH-001, VOUCH-003 Rule 3 · **Acceptance:** T-VOUCH-01
**Mục tiêu:** cart chỉ có một Voucher Engine voucher. Áp voucher thứ hai phải hỏi xác nhận replace.

**Dữ liệu:** cart có `yonex-as50` ×1. Voucher `SAVE10`, `MEGA20`.

**Các bước:**

1. Apply `SAVE10` thành công.
2. Nhập `MEGA20`.
3. Click Apply.
4. Modal replace xuất hiện.
5. Click Cancel.
6. Lặp lại bước 2–4, lần này click Replace.

**Kết quả kỳ vọng:**

- Bước 2 trả 409 `VOUCHER_REPLACE_REQUIRED`, có `details.current_code = "SAVE10"`.
- Modal hiển thị message từ backend.
- Cancel: `SAVE10` vẫn active.
- Replace: Storefront gọi `POST /store/carts/{cartId}/voucher?replace=true`.
- Nếu `MEGA20` hợp lệ: `SAVE10` biến mất, `MEGA20` active, total cập nhật.
- Nếu replace fail vì validation khác: voucher cũ không bị mất và UI hiển thị lỗi.

---

## B8. Remove voucher — không tăng usage_count

**SRS:** VOUCH-004, EC-06 · **Acceptance:** T-VOUCH-10
**Mục tiêu:** gỡ voucher đảo discount, không tăng usage count; apply→remove→apply lại vẫn được.

**Dữ liệu:** cart có `yonex-as50` ×1. Voucher `SAVE10`.

**Các bước:**

1. Apply `SAVE10`.
2. Ghi nhận total sau discount.
3. Click remove/trash trên voucher row.
4. Apply lại `SAVE10`.

**Kết quả kỳ vọng:**

- DELETE `/store/carts/{cartId}/voucher` trả `success: true`.
- Total quay về trước voucher.
- UI hiển thị "Đã gỡ mã giảm giá."
- Apply lại trong cùng session vẫn được, vì usage chỉ tăng khi order placed.

---

## B9. Generic Promotion coexistence — promotion thường không bị voucher UI phá

**SRS:** VOUCH-003 Rule 1/2/3, Storefront unified input
**Mục tiêu:** cùng một input áp được cả promotion thường và Voucher Engine voucher; ephemeral promotion nội bộ không lộ ra UI.

**Dữ liệu:** cart có `yonex-astrox-99-pro` ×1. Promotion thường `RACKET2M`; voucher `SAVE10`.

**Các bước:**

1. Nhập `RACKET2M` vào discount input.
2. Apply thành công như promotion thường.
3. Nhập `SAVE10`.
4. Apply voucher.
5. Remove promotion thường.
6. Remove voucher.

**Kết quả kỳ vọng:**

- `RACKET2M` không phải VoucherConfig nên Voucher Engine `VOUCHER_NOT_FOUND`, sau đó fallback Promotion apply thành công.
- UI không hiện lỗi voucher trước khi promotion fallback thành công.
- Promotion thường và voucher hiển thị thành hai dòng logic riêng.
- Ephemeral voucher promotion code dạng nội bộ không xuất hiện cho khách.
- Remove promotion thường không làm mất voucher; remove voucher không làm mất promotion thường.
- Không bị rate-limit chỉ vì dùng promotion thường hợp lệ.

---

## B10. Stacking happy path — item promotion trước, voucher sau

**SRS:** VOUCH-003 Rule 1–6 · **Acceptance:** T-VOUCH-07
**Mục tiêu:** chứng minh thứ tự tính discount: item-level promotion trước, voucher sau, chưa chạm global cap.

**Dữ liệu chuẩn SRS:** racket 4.500.000₫ có item promo 20% (giảm 900.000₫) + item gợi ý/cước 200.000₫ không promo; voucher `SAVE10`.

**Các bước:**

1. Dựng cart theo fixture trên, hoặc dùng test data tương đương.
2. Apply `SAVE10`.
3. Đối chiếu breakdown.

**Kết quả kỳ vọng:**

- Original subtotal = 4.700.000₫.
- Item promotion = 900.000₫.
- Post-promotion subtotal = 3.800.000₫.
- Voucher = 380.000₫.
- Final total = **3.420.000₫**.
- `discount_capped = false`.

> Nếu seed hiện tại chưa có item-level promotion 20% đúng fixture, scenario này cần chạy bằng test fixture/backend integration thay vì UI thủ công.

---

## B11. Global cap exceeded — chỉ cắt voucher

**SRS:** VOUCH-003 Rule 6, EC-01 · **Acceptance:** T-VOUCH-08
**Mục tiêu:** khi tổng discount vượt 50%, hệ thống chỉ cắt phần voucher, không cắt item promotion.

**Dữ liệu chuẩn SRS:** racket 4.500.000₫ promo 40% (giảm 1.800.000₫) + item gợi ý/cước 200.000₫ promo 30% (giảm 60.000₫); voucher `MEGA20`.

**Các bước:**

1. Dựng cart theo fixture trên, hoặc dùng seed/promotion tương đương.
2. Apply `MEGA20`.
3. Kiểm tra response/UI cap explanation.

**Kết quả kỳ vọng:**

- Original subtotal = 4.700.000₫.
- Item promotion total = 1.860.000₫.
- Raw voucher = 568.000₫.
- Cap 50% = 2.350.000₫.
- Voucher bị cắt còn **490.000₫**.
- Final total = **2.350.000₫**.
- `discount_capped = true`.
- UI hiển thị giải thích cap bằng tiếng Việt.

> Nếu chưa có seed item-promotion percentage đúng fixture, dùng unit/integration test làm bằng chứng và đánh dấu UI live test cần bổ sung seed.

---

## B12. EC-03 — không bao giờ âm hoặc về 0

**SRS:** EC-03, VOUCH-003 Rule 6 · **Acceptance:** T-VOUCH-09
**Mục tiêu:** voucher 50% + item promo 50% không làm cart total âm/0; global cap giữ final total > 0.

**Dữ liệu:** cart fixture có tổng discount tiềm năng 100%.

**Các bước:**

1. Dựng fixture bằng backend test hoặc seed riêng.
2. Apply voucher có discount lớn.
3. Kiểm tra final total.

**Kết quả kỳ vọng:**

- Tổng discount không vượt global cap 50%.
- Final total luôn > 0, tối thiểu 1₫ theo SRS.
- Hệ thống log warning nếu chạm sàn.

---

## B13. Auto-invalidation — cart đổi làm voucher không còn hợp lệ

**SRS:** VOUCH-005, EC-02 · **Acceptance:** T-VOUCH-11
**Mục tiêu:** khi cart thay đổi khiến voucher fail V5/V6, voucher tự bị gỡ và khách nhận notification.

**Dữ liệu:** cart có `yonex-mavis-2000` ×1 = 420.000₫. Voucher `SHUTTLE20`.

**Các bước:**

1. Apply `SHUTTLE20` thành công.
2. Xóa line item `yonex-mavis-2000`.
3. Reload hoặc quan sát cart sau mutation.

**Kết quả kỳ vọng:**

- Sau khi xóa item, cart không còn eligible item và subtotal không còn đạt điều kiện.
- Workflow revalidate chạy, voucher bị auto-remove.
- `cart.metadata.voucher` rỗng.
- Total không còn discount voucher.
- UI hiển thị notice lý do tự gỡ nếu backend trả `voucher_notice`/metadata tương ứng.

---

## B14. EC-10 — brute-force rate limit

**SRS:** EC-10, SEC-02 · **Acceptance:** T-VOUCH-12
**Mục tiêu:** thử nhiều mã voucher sai bị chặn 429, có message rõ ràng và không ảnh hưởng promotion hợp lệ.

**Dữ liệu:** cart bất kỳ có item; Redis đang chạy. Code sai: `NOPE01`, `NOPE02`, ...

**Các bước:**

1. Đảm bảo Redis sạch nếu test lại local:

```bash
docker exec -it hf_medusa_redis redis-cli FLUSHALL
```

2. Nhập lần lượt 5 mã voucher sai.
3. Nhập mã sai lần thứ 6.
4. Sau đó thử promotion thường hợp lệ `RACKET2M` ở cart mới/sau cooldown.

**Kết quả kỳ vọng:**

- Sau 5 failed voucher attempts trong 15 phút, request tiếp theo trả 429 `VOUCHER_RATE_LIMITED`.
- Response có `customer_message` tiếng Việt hoặc message cooldown rõ ràng.
- UI hiển thị lỗi rate-limit, không silent fail.
- Backend log được IP + customer_id nếu có.
- Promotion thường hợp lệ không nên làm khách bị block sai bởi voucher rate-limit.

---

## B15. Order placed — usage_count và VoucherUsageLog

**SRS:** EC-06, INT-02, INT-04 · **Acceptance:** bổ sung cho VOUCH-004/EC-06
**Mục tiêu:** usage chỉ tăng khi order đặt thành công, ghi log immutable và idempotent.

**Dữ liệu:** cart có `SAVE10` active; customer login.

**Các bước:**

1. Apply `SAVE10`.
2. Complete checkout/order.
3. Kiểm tra DB hoặc admin analytics.
4. Gọi/quan sát lại event order placed nếu có retry.

**Kết quả kỳ vọng:**

- `usage_count` tăng đúng 1 lần.
- Có đúng 1 row trong `voucher_usage_log` cho `(voucher_id, order_id)`.
- Retry/idempotent không làm tăng usage lần hai.
- Analytics của voucher phản ánh `total_uses`, `total_discount_given`, `capped_count`.

---

## B16. Admin — tạo voucher và xem analytics

**SRS:** Admin Voucher API, analytics · **Acceptance:** voucher analytics
**Mục tiêu:** admin tạo VoucherConfig, khách apply được voucher đó, admin xem analytics.

**Dữ liệu:** admin đăng nhập tại `http://localhost:9009/app`; hoặc gọi API admin trực tiếp.

**Các bước:**

1. Mở Admin → Vouchers.
2. Click Create voucher.
3. Tạo voucher mới, ví dụ:
   - code để trống hoặc `DEMO10`
   - discount_type `percentage`
   - discount_value `1000`
   - active = true
   - valid_from/valid_to hợp lệ
4. Lưu voucher.
5. Dùng code vừa tạo apply ở Storefront.
6. Sau khi có order/usage, click Analyze trên row voucher hoặc gọi `GET /admin/vouchers/{id}/analytics`.

**Kết quả kỳ vọng:**

- Admin tạo thành công; nếu code để trống, backend sinh code uppercase alphanumeric ≥6 ký tự.
- Voucher mới xuất hiện trong bảng Voucher Management với `is_active`.
- Storefront apply được voucher qua cùng discount input.
- Analytics trả đúng shape:

```json
{
  "total_uses": 0,
  "total_discount_given": 0,
  "avg_order_value": 0,
  "capped_count": 0,
  "conversion_rate": 0
}
```

Giá trị tăng sau khi có order sử dụng voucher.

---

## B17. Security — client không được gửi số tiền/tổng giảm

**SRS:** SEC-01, INT-03
**Mục tiêu:** mọi tính toán discount server-side; client không thể tự gửi `discount_amount`, `final_total`, `customer_id`.

**Dữ liệu:** cart bất kỳ; voucher `SAVE10`.

**Các bước:**

1. Gọi API bằng Postman/curl với body cố tình chèn field cấm:

```json
{
  "code": "SAVE10",
  "discount_amount": 999999999,
  "final_voucher_discount": 999999999,
  "customer_id": "fake"
}
```

2. Quan sát response.

**Kết quả kỳ vọng:**

- API reject request do schema strict, hoặc bỏ qua mọi field không thuộc contract theo implementation đã chốt.
- Không có cart total nào lấy từ client.
- Nếu request hợp lệ chỉ với `{ "code": "SAVE10" }`, mọi amount trong response được tính từ backend/cart authoritative.

---

## B18. Luồng tích hợp Suggestive Selling → Voucher Engine

**SRS:** VOUCH-003, VOUCH-005, EC-02, EC-08; giao thoa với SUGG-003/SUGG-005
**Mục tiêu:** chứng minh hai feature phối hợp qua cart: item gợi ý được add vào cart, voucher tính trên cart mới; khi item gợi ý bị xóa, voucher revalidate.

**Dữ liệu:** product detail racket có gợi ý phụ kiện/cầu; voucher scoped như `SHUTTLE20` hoặc voucher theo category tương ứng.

**Các bước:**

1. Từ product detail, dùng flow Suggestive Selling để add item gợi ý đủ điều kiện voucher.
2. Mở cart.
3. Apply voucher scoped.
4. Xóa item gợi ý vừa add.

**Kết quả kỳ vọng:**

- Sau khi add item gợi ý, cart suggestions invalidated như PHẦN A.
- Voucher apply tính trên cart mới.
- Nếu item gợi ý là eligible item duy nhất, xóa nó sẽ auto-remove voucher.
- Không có trạng thái cart lệch giữa suggestion cache và voucher metadata.

---

## Ma trận coverage — Voucher

| SRS / EC | Nội dung | Scenario | Acceptance |
| -------- | -------- | -------- | ---------- |
| VOUCH-001 | Nhập/chọn voucher, apply tại checkout, tổng cập nhật | B1, B2, B6 | T-VOUCH-01 |
| VOUCH-002 V1 | Code không tồn tại/không active, fail-fast + i18n | B3 | T-VOUCH-02 |
| VOUCH-002 V5 | Min order | B4 | T-VOUCH-05 |
| VOUCH-002 V6 | Eligible product/category scope | B5, B6 | T-VOUCH-06 |
| VOUCH-003 Rule 1–2 | Item promotion trước, voucher sau | B9, B10 | T-VOUCH-07 |
| VOUCH-003 Rule 3 | Chỉ 1 voucher active, replace confirm | B7 | T-VOUCH-01 |
| VOUCH-003 Rule 4 | Voucher % chỉ trên eligible post-promo items | B6 | T-VOUCH-06 |
| VOUCH-003 Rule 5 | Per-voucher max discount | B11 | T-VOUCH-08 |
| VOUCH-003 Rule 6 | Global cap 50%, chỉ cắt voucher | B11, B12 | T-VOUCH-08/09 |
| VOUCH-004 | Remove voucher, không tăng usage | B8 | T-VOUCH-10 |
| VOUCH-005 | Cart change auto-invalidate | B13, B18 | T-VOUCH-11 |
| EC-01 | Item promo + voucher tiến sát/vượt cap | B11 | T-VOUCH-08 |
| EC-02 | Xóa hết eligible items → auto-remove | B13, B18 | T-VOUCH-11 |
| EC-03 | Không âm/0, sàn > 0 | B12 | T-VOUCH-09 |
| EC-04 | Apply voucher vs remove eligible item đồng thời | Cần bổ sung test concurrency/API | bổ sung |
| EC-06 | Apply→remove→apply lại, usage chỉ tăng khi order | B8, B15 | T-VOUCH-10 |
| EC-08 | Cascading discount khi thêm item gợi ý kích hoạt promo mới | B18 + seed tier promo riêng | Should |
| EC-10 | Brute-force voucher rate-limit | B14 | T-VOUCH-12 |
| SEC-01 | Không tin amount từ client | B17 | security |
| INT-02/INT-04 | Atomic usage + append-only log | B15 | integrity |
| Admin voucher | Tạo voucher và analytics | B16 | admin acceptance |

## Ghi chú còn cần fixture/seed riêng

- B10/B11/B12 cần fixture item-level promotion đúng số học SRS nếu muốn demo bằng UI 100%. Hiện seed `RACKET2M` là promotion fixed để test coexistence an toàn; fixture percentage mạnh có thể bị guard stacking percentage từ implementation hiện tại.
- EC-04 concurrency nên chạy bằng integration/API test có kiểm soát thay vì thao tác tay trong browser.
- EC-08 cần seed tier promotion "Spend 5M get extra 5%" nếu muốn chứng minh cascading discount đầy đủ.
