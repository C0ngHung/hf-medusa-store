# SPEC.md — Developer Specification

## SuggestiveSelling + VoucherEngine · MedusaJS v2 (RallyGear)

**Cấp độ:** Developer-level (dẫn xuất từ Solution Flow v0.2 + SRS v1.0 + API Contract v1.0).
**Phiên bản:** 1.0 · **Ngày:** 2026-07-10 · **Vai trò:** Senior Backend Architect.
**Trạng thái:** Draft để dev implement. Mọi `⚠️` là quyết định team đã chốt, cần khách confirm nhưng **không chặn code**.

### Tài liệu nguồn & quan hệ

| Doc                                             | Vai trò với SPEC này                                                                                           |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `SRS_SuggestiveSelling_Voucher_v1.0.pdf`        | Source of truth requirement (SUGG-00x, VOUCH-00x, EC-0x, T-\*, §5 data, §7 workflow, §9 NFR)                   |
| `# Project: RallyGear …md` (Solution Flow v0.2) | Flow nghiệp vụ SF-01…10, business rule BR-01…10                                                                |
| `API_CONTRACT_Suggestive_Voucher_Cart.md`       | **Hợp đồng API + error + quyết định D1–D11 + cải tiến KN-01…11** — SPEC này KHÔNG lặp lại JSON, chỉ tham chiếu |
| `apps/backend/src/modules/suggestive-selling/*` | Code **đã có** — Part A build tiếp lên đây                                                                     |

> Ký hiệu: **[có]** đã tồn tại trong source · **[mới]** cần tạo · SRS-id ghi kèm để traceability (comment code phải cite theo convention `project-conventions.md`).

---

## MỤC LỤC

- [Part A — SuggestiveSelling](#part-a--suggestiveselling-module)
- [Part B — VoucherEngine](#part-b--voucherengine-module)
- [Part C — Cross-cutting (Cart integration, error, money)](#part-c--cross-cutting)
- [Part D — Traceability & Build order](#part-d--traceability--build-order)

---

# PART A — SuggestiveSelling module

## A.0 Trạng thái & layout file

```
src/modules/suggestive-selling/
├── index.ts                         [có] SUGGESTIVE_SELLING_MODULE = 'suggestiveSelling'
├── service.ts                       [có] MedusaService(5 models) — thêm evaluator methods (A.3)
├── models/                          [có] 5 models (A.1)
├── migrations/                      [có] 2 migration + snapshot
├── evaluator.ts                     [mới] EvaluationEngine (A.4) — pure-ish, inject deps
└── constants.ts                     [mới] enums, TTL, CONSUMABLE_CATEGORIES

src/api/store/
├── products/[id]/suggestions/route.ts        [mới] A.10
├── carts/[id]/suggestions/route.ts           [mới] A.10
├── carts/[id]/suggested-items/route.ts       [mới] A.10 (POST)
├── carts/[id]/dismissals/route.ts            [mới] A.10 (POST)
└── suggestion-events/route.ts                [mới] A.10 (POST batch)

src/api/admin/
├── suggestion-rules/…                        [có] + priority-conflict (KN-05)
├── category-complements/…                    [mới] CRUD map
└── suggestion-rules/preview/route.ts         [mới, Should] dry-run

src/workflows/
├── evaluate-suggestions.ts                   [mới] A.7
└── add-suggested-item-to-cart.ts             [mới] A.7

src/subscribers/
├── cart-updated-suggestions.ts               [mới] A.8
└── order-placed-attribution.ts               [mới] A.8

src/links/                                    [có] rule_item→product, rule.source_product→product
```

## A.1 Data models 
| Model                     | Bảng                          | Field chính                                                                                                                                                                                              | Ghi chú SRS                                                                                                                                                              |
| ------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SuggestionRule            | `suggestion_rule`             | `id, name, type(product\|cart), tier(manual\|category\|behavioral), source_product_id(text,null), priority(int,def0), is_active(bool,def true), valid_from/to(datetime,null)`; hasMany items, conditions | §5.1 + `source_product_id` (ngoài SRS, cần cho Tier-1). Index `(type,is_active,priority)`, `(source_product_id,is_active)`. cascade delete children                      |
| SuggestionRuleItem        | `suggestion_rule_item`        | `id, suggested_product_id(text), display_order(int), custom_label(text,null), rule(belongsTo)`                                                                                                           | §5.1. `suggested_product_id` **KHÔNG FK** — nối Product qua Link                                                                                                         |
| CartSuggestionCondition   | `cart_suggestion_condition`   | `id, condition_type(enum 4), condition_params(json,null), rule(belongsTo)`                                                                                                                               | §5.1. params là data → đổi tuning không cần migration                                                                                                                    |
| CategoryComplementMapping | `category_complement_mapping` | `id, source_category_id(text), complement_category_id(text), display_order(int), is_active(bool)`                                                                                                        | Tier-2/CR-01. Ngoài §5 (SRS chỉ mô tả prose) — decision **G3** đã model thành bảng. Index `(source_category_id,is_active)`                                               |
| SuggestionEvent           | `suggestion_event`            | `id, rule_id(text,null), source_context(enum), source_product_id(text,null), suggested_product_id(text), customer_id(text,null), session_id(text,null), action(enum 4), created_at`                      | §5.1/SUGG-006. Append-only, không FK (analytics không fail theo integrity). Index `(created_at)`. **Cần thêm** `tier(text,null)`, `slot(int,null)` cho reporting (SF-08) |

**Migration mới cần chạy:** thêm `tier`, `slot` vào `suggestion_event` → `npx medusa db:generate suggestiveSelling && npx medusa db:migrate`.

## A.2 Constants (`constants.ts`)

```ts
export const SUGGESTION_CACHE_TTL = 300; // 5 min (BR-06)
export const STOCK_SNAPSHOT_TTL = 60; // advisory (BR-06)
export const PRODUCT_LIMIT = 5,
  CART_LIMIT = 3; // BR-01
export const TIER1_MIN_SURVIVORS = 3; // Tier-2 backfill trigger (BR-01)
// BR-02(d): consumable = miễn loại-30-ngày. ⚠️ confirm danh sách (OI-03/D-A1)
export const CONSUMABLE_CATEGORIES = [
  "Strings",
  "Shuttlecocks",
  "Grips",
  "Socks",
  "Tubes",
];
export const CR02_PRICE_BAND_MULT = 2; // D4: remaining ≤ price ≤ remaining×2
export const CR02_THRESHOLD_PCT = 0.15; // D5
```

## A.3 Service — method bổ sung (`service.ts`)

`MedusaService` đã auto-CRUD 5 model. Thêm helper query (thin, gọi từ evaluator):

```ts
listActiveProductRules(sourceProductId, at=now): SuggestionRule[]     // type=product, active, in-window, order tier,priority
listActiveCartRules(at=now): SuggestionRule[]                          // type=cart, active, in-window, order priority
listComplements(sourceCategoryId): CategoryComplementMapping[]         // active, order display_order
recordEvents(events: SuggestionEventInput[]): void                     // batch insert, no-throw
```

Logic evaluation KHÔNG nằm trong service (giữ service = data-access); đặt ở `evaluator.ts`.

## A.4 EvaluationEngine — pipeline 7 stage (SF-01/SF-02, SRS §7.1)

Pure-ish class, inject `{ query, cache, stockService, orderService, dismissalStore }`. **Deterministic** theo input (bắt buộc để dry-run tin cậy).

```
evaluateProduct(productId, ctx):                        // ctx = {store, session, customer, cart}
  1 resolveContext   → load product(+category,brand), cart items, dismissal set, purchase-history(30d)
  2 loadRules        → service.listActiveProductRules(productId)   [experiment bucketing: Phase-1 = hash(session)%split, skip losing]
  3 candidates:
        Tier1 = rule.items order display_order (custom_label giữ)
        if survivorsAfterFilter(Tier1) < 3:
           Tier2 = topSellers(complementCategories(product.category), 30d) đủ để lấp tới 3
        Tier3 = SKIP (Phase 1, luôn skip guest)
  4 filter           → BR-02 (A.5). backfill: cùng tier trước, rồi tier thấp hơn. ghi provenance (dry-run)
  5 rank&limit       → tier → (display_order|sales_rank); dedupe by product; upsell slot BR-05 (≤1, last); cap 5
  6 enrich           → price, discount_price, default variant, requires_variant_selection, in_stock
  7 cache            → set product:{id}:store:{store} (KẾT QUẢ THÔ trước filter cá nhân) TTL 5' ; return đã-filter
```

**Cache vs filter cá nhân (KN mâu thuẫn SRS):** cache **kết quả thô trước bước 4**; filter theo khách (cart/history/dismissal) chạy **runtime mỗi request** (D6/D7). ⇒ 1 cache key phục vụ mọi khách, vẫn cá nhân hoá.

```
evaluateCart(cartId, ctx):
  1 resolveContext → cart lines(+cat,brand,qty), post-item-promo subtotal, dismissal, customer
  2 loadRules      → listActiveCartRules()
  3 evaluate CR-01…CR-04 fixed order (A.6) → mỗi rule ra candidate list + provenance (+badge CR-02)
  4 merge&dedupe   → union theo rule-priority; first rule wins badge (BR-04)
  5 filter         → BR-02 (giống product)
  6 rank/limit 3, enrich, + threshold_info nếu CR-02 fired
  7 cache cart:{id}:suggestions TTL 5' + embed rules_version (BR-06 lazy-miss)
```

## A.5 Bộ lọc BR-02 (SUGG-002) — 6 điều kiện, dùng chung 2 context

Loại candidate nếu **bất kỳ**:
| | Điều kiện | Chi tiết |
|---|---|---|
| a | Đã trong cart (mọi variant) | match theo product_id |
| b | Hết hàng tại assigned store (mọi variant) | còn ≥1 variant mua được → giữ; per-variant xử lý ở selector |
| c | Đã dismiss trong session **theo context** | key `(source_context × product)` — D6, server-side |
| d | Đã mua ≤30 ngày — **chỉ durable** | consumable (`CONSUMABLE_CATEGORIES`) miễn; **guest: skip** (BR-08) |
| e | Trùng source product | chỉ product context |
| f | Inactive/unpublished/ngoài sales-window | |

> Backfill sau loại: cùng tier → tier thấp hơn. Provenance (`in_cart|out_of_stock|dismissed|recent_purchase|self|inactive`) chỉ giữ cho dry-run (SF-07c), bỏ khi serve thường.

## A.6 Cart rules CR-01…CR-04 (SUGG-004, thứ tự cố định BR-03)

| Rule  | Fire khi                                                                                | Candidate                                      | Order            | Badge                                                          |
| ----- | --------------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------- | -------------------------------------------------------------- |
| CR-01 | cart có category X, có map X→Y, cart **thiếu** Y                                        | top-seller Y (30d)                             | sales-rank       | —                                                              |
| CR-02 | `threshold×0.85 ≤ subtotal < threshold` (post-item-promo, voucher **loại trừ** C-04/D5) | product `remaining ≤ price ≤ remaining×2` (D4) | sales-rank       | "Mua thêm để được MIỄN PHÍ vận chuyển!" hoặc label promo admin |
| CR-03 | mọi item **cùng 1 brand**                                                               | phụ kiện cùng brand                            | sales-rank       | —                                                              |
| CR-04 | có consumable **qty=1**                                                                 | bundle/multipack cùng loại, đơn giá tốt hơn    | 1 candidate/line | —                                                              |

`threshold_info = {target, current(=post-promo subtotal), remaining=target−current}`. **Ngưỡng đọc từ Promotion subsystem, KHÔNG lưu trong rule** (C-04/OI-04). ⚠️ nguồn "top-seller 30d" (OI/§11.3-12) — Phase-1 fallback: `Order` module aggregate, thiếu data → newest-first.

## A.7 Workflows

### `evaluateSuggestions` (SRS §7.1) — 7 read step + 1 cache write

Step 1–6 read-only (compensation: —); step 7 `cacheResults` (compensation: **delete cache key**). Wrap `EvaluationEngine`. Trigger: API GET (D7 — sync, không phải subscriber).

### `addSuggestedItemToCart` [mới] (SF-03, EC-02/03/07)

| #   | Step                                                                                        | Compensation         |
| --- | ------------------------------------------------------------------------------------------- | -------------------- |
| 1   | validate product/variant active+published                                                   | —                    |
| 2   | validate attribution: rule active/**recently-active** (grace EC-04); forged → dừng (SEC-01) | —                    |
| 3   | **authoritative stock** tại assigned store (bypass cache 60s)                               | —                    |
| 4   | idempotency `(cart,product,rule,Idempotency-Key)` → trùng: trả line cũ                      | —                    |
| 5   | add line item + `metadata{suggestion_rule_id,source_context,source_product_id,tier}`        | **remove line item** |
| 6   | emit `add_to_cart` event (fire-and-forget)                                                  | —                    |

Lỗi map: 2→422 `SUGGESTION_INVALID_ATTRIBUTION`, 3→409 `SUGGESTION_STOCK_CONFLICT`, thiếu variant→422 `SUGGESTION_VARIANT_SELECTION_REQUIRED` (details.variants[]).

## A.8 Subscribers

- **`cart.updated` → cart-updated-suggestions.ts [mới]:** DEL `cart:{id}:suggestions` **ngay** (SUGG-005), optional warm; KHÔNG chạm voucher (KN-02). Idempotent, failure-isolated.
- **`order.placed` → order-placed-attribution.ts [mới]:** với mỗi order line có `metadata.suggestion_rule_id` → **copy** `{rule,context,tier}` sang order line/analytics (SF-09/SUGG-302). Fire-and-forget.

## A.9 Cache (BR-06)

| Key                                        | TTL          | Invalidation                                                                                |
| ------------------------------------------ | ------------ | ------------------------------------------------------------------------------------------- |
| `product:{id}:store:{s}:suggestions` (thô) | 5'           | per-key khi rule đổi (source product); stock-out event                                      |
| `cart:{id}:suggestions`                    | 5'           | **sync DEL** on cart.updated; + version-counter lazy-miss (cart-rule/complement đổi → bump) |
| `dismiss:{scope}` (set)                    | session ≤24h | merge guest→customer khi login                                                              |

> `helpers.invalidateSuggestionCache` **hiện là no-op** — phải wire Redis thật trước go-live (KN-05). Redis optional (D11) → thiếu Redis dùng in-memory cache module (dev only).

## A.10 API routes → **xem `API_CONTRACT` §1.1/§1.2** (không lặp JSON ở đây)

GET product/cart suggestions · POST suggested-items · POST dismissals · POST suggestion-events (202 batch) · admin rules CRUD [có] + category-complements [mới] + preview [mới].

## A.11 Analytics events (SUGG-006/SF-08)

4 action `impression|tap|add_to_cart|dismiss`; `add_to_cart` **phát server-side** (step 6, chống forge). Batch ≤10, enum+id (SEC-04, no free-text). Payload += `tier, slot`. append-only, partition theo `created_at` (khuyến nghị SRS).

## A.12 Test mapping (SRS §10.1)

| Test            | Kịch bản                                  | Nơi                          |
| --------------- | ----------------------------------------- | ---------------------------- |
| T-SUGG-01       | 3 manual → hiện đủ theo order             | evaluator unit + integration |
| T-SUGG-02       | 1 manual → backfill Tier-2                | evaluator unit               |
| T-SUGG-03/04/05 | filter in-cart / out-of-stock / dismissed | filter unit                  |
| T-SUGG-06       | one-tap add → cart + toast                | E2E (Playwright)             |
| T-SUGG-07/08    | CR-01 / CR-02 badge                       | evaluator unit               |
| T-SUGG-09       | cart change → cache invalidate + refresh  | integration + Redis          |
| T-SUGG-10       | 4 event tracked                           | integration                  |

---

# PART B — VoucherEngine module

## B.0 Trạng thái & layout 

```
src/modules/voucher-engine/
├── index.ts                    VOUCHER_ENGINE_MODULE = 'voucherEngine'
├── service.ts                  MedusaService(3 models) + validation orchestration
├── models/ voucher-config.ts · voucher-usage-log.ts · discount-cap-config.ts
├── stacking-engine.ts          PURE function (B.5) — no I/O, unit-test-first
├── validators.ts               V1..V8 (B.4)
└── constants.ts                DEFAULT_CAP_PCT=5000, RATE_LIMIT={5, 15min, 30min}
src/api/store/ carts/[id]/voucher/route.ts (POST,DELETE) · customers/me/vouchers/route.ts (GET)
src/api/admin/ vouchers/… (CRUD+analytics) · discount-cap-config/route.ts (GET,PUT)
src/workflows/ apply-voucher.ts · revalidate-voucher-on-cart-change.ts
src/subscribers/ order-placed-voucher.ts (usage++ + UsageLog)
src/links/ cart-voucher-config.ts   (cart ↔ voucher_config, tránh coupling — KN-09)
```

Đăng ký module vào `medusa-config.ts` (`{ resolve: './src/modules/voucher-engine' }`).

## B.1 Data models (SRS §5.2)

**`voucher_config`** — `id, code(text,unique,index,UPPERCASE), discount_type(enum percentage|fixed_amount), discount_value(int; 2000=20.00%|50000=50k₫), min_order_value(int,null), max_discount_amount(int,null), applicable_category_ids(array|json,null), applicable_product_ids(array|json,null), stackable_with_promotions(bool,def true), per_user_limit(int,def1), usage_limit(int,null), usage_count(int,def0), user_segment_conditions(json,null), valid_from(datetime), valid_to(datetime), is_active(bool), created_at, updated_at`. Index unique `(code)`.

**`voucher_usage_log`** — `id, voucher_id(text), customer_id(text), order_id(text), discount_applied(int), was_capped(bool), original_discount(int), applied_at(datetime)`. **Append-only/immutable** (INT-04). Index `(voucher_id, customer_id)` cho V4.

**`discount_cap_config`** — `id, max_discount_percentage(int; 5000=50%), is_active(bool), updated_at, updated_by(text)`. Singleton (1 active).

> **⚠️ Quyết định D-B1 (extends Promotion):** Medusa v2 không cho DML "extends" cross-module. Chọn: `voucher_config` là model **độc lập**; item-level promotion vẫn do **Promotion built-in** (auto) sở hữu; voucher discount do **StackingEngine tính rồi ghi lên cart như 1 cart-level adjustment** (compensable). Link `cart↔voucher_config` để biết voucher active mà không coupling DB. → "extends" của SRS hiểu ở mức quan hệ/report, không phải kế thừa tính toán. Cần khách confirm. Ưu điểm: kiểm soát được **global-cap trimming** (thứ Promotion không làm được) và giữ INT-03 (cart recalc authoritative).

## B.2 Service

`VoucherEngineService extends MedusaService({VoucherConfig, VoucherUsageLog, DiscountCapConfig})` + methods:

```ts
lookupByCode(code): VoucherConfig|null           // normalize UPPER+trim
countUserUsage(voucherId, customerId): number    // từ usage_log (V4)
incrementUsageAtomic(voucherId): boolean          // Redis INCR / DB UPDATE...WHERE usage_count<usage_limit (D11/INT-02)
getActiveCap(): number                            // DiscountCapConfig, fallback DEFAULT_CAP_PCT
```

## B.3–B.4 Validation chain V1…V8 (VOUCH-002, fail-fast, i18n)

Chạy tuần tự, fail đầu tiên → throw `BusinessError` tương ứng (Part C). Rẻ→đắt để đạt <400ms:
| V | Check | Fail → code |
|---|---|---|
| V1 | tồn tại & is_active | `VOUCHER_NOT_FOUND`(404) / `VOUCHER_INACTIVE`(422) |
| V2 | now ∈ [valid_from, valid_to] | `VOUCHER_NOT_YET_VALID` / `VOUCHER_EXPIRED` (422) |
| V3 | usage_count < usage_limit | `VOUCHER_USAGE_LIMIT_REACHED`(422) |
| V4 | user_usage < per_user_limit | `VOUCHER_PER_USER_LIMIT_REACHED`(422) |
| V5 | **subtotal gốc** ≥ min_order_value (D3) | `VOUCHER_MIN_ORDER_NOT_MET`(422, details.remaining) |
| V6 | cart có ≥1 item khớp scope | `VOUCHER_NO_ELIGIBLE_ITEMS`(422) |
| V7 | segment conditions (jsonb) | `VOUCHER_SEGMENT_NOT_ELIGIBLE`(422) |
| V8 | stacking: nếu `stackable_with_promotions=false` & cart có item-promo | `VOUCHER_STACKING_CONFLICT`(422) |

## B.5 StackingEngine (VOUCH-003) — **PURE function, không I/O**

```
input : { items:[{original, item_promo_discount, category, is_eligible}], voucher:{type,value,max_discount_amount},
          cap_pct, currency:'VND' }
output: { item_promo_total, voucher_discount, total_discount, discount_capped, original_discount,
          final_total, cap_explanation? }

algo:
  originalSubtotal = Σ item.original                                  # cap base = hàng hoá gốc (D2, không ship)
  itemPromoTotal   = Σ item.item_promo_discount                      # Rule1: KHÔNG bao giờ cắt
  postPromo        = originalSubtotal − itemPromoTotal
  eligiblePost     = Σ (post-promo giá của item.is_eligible)         # Rule4: chỉ eligible; unscoped ⇒ all eligible
  rawVoucher = type=='percentage' ? floor(eligiblePost * value/10000) : min(value, eligiblePost)   # D1 floor
  voucher    = voucher_max ? min(rawVoucher, voucher_max) : rawVoucher                              # Rule5
  capAmount  = floor(originalSubtotal * cap_pct/10000)               # Rule6
  if itemPromoTotal + voucher > capAmount:
       voucher = max(0, capAmount − itemPromoTotal)                  # CHỈ cắt voucher
       discount_capped = true
  total    = itemPromoTotal + voucher
  final    = max(1, originalSubtotal − total)                        # EC-03 sàn 1₫ + warning log nếu chạm
```

**Unit fixtures bắt buộc (từ SRS, đúng đến từng đồng):**

- Happy: vợt 4.5M(promo900k)+cước200k, SAVE10 10% → voucher 380k, total 3.420.000 (T-VOUCH-07).
- Cap: vợt 4.5M(promo1.8M)+cước200k(promo60k), MEGA20 20% → raw 568k, cap 2.35M → voucher **490k**, final **2.350.000**, `discount_capped=true` (T-VOUCH-08).
- EC-03: voucher50%+item50% → final ≥ 1₫, warning (T-VOUCH-09).

## B.6 Workflows

### `applyVoucher` (SRS §7.2) — 9 step

`rate-limit → normalizeCode → lookup(404) → V1..V8 → calcVoucher(max cap) → enforceGlobalCap → attachToCart`.
Compensation thật chỉ ở **attachToCart** (gỡ voucher adjustment + revert totals); step validate read-only. Attach = ghi cart-level discount + link `cart↔voucher_config` → Cart recalc (INT-03).

### `revalidateVoucherOnCartChange` (SRS §7.3) — chạy **SYNC trong request mutation** (KN-02)

`checkVoucherExists → re-run V1..V8 → (pass) recalc stacking giữ voucher | (fail) removeVoucher+revert+reason → notify`. **KHÔNG** phát lại `cart.updated` (chống đệ quy). Reason (VOUCH-005): min_order / no-eligible-items.

## B.7 Subscriber `order.placed` (bịt EC-06 gap — D10)

`re-validate V3 atomic → pass: incrementUsageAtomic + ghi UsageLog{discount_applied,was_capped,original_discount} | fail: block ưu đãi + báo`. INT-02 atomic.

## B.8 Rate limit (EC-10/SEC-02)

Redis counter theo `customer_id` **và** `IP` (guest rotation): 5 fail/15′ → 429 `VOUCHER_RATE_LIMITED` cooldown 30′, log IP+customer. Không Redis → DB counter (D11).

## B.9 API → **xem `API_CONTRACT` §1.3/§1.4**.

## B.10 Test mapping (SRS §10.2)

| Test           | Kịch bản                                        | Nơi                      |
| -------------- | ----------------------------------------------- | ------------------------ |
| T-VOUCH-01     | apply hợp lệ → discount + total                 | integration              |
| T-VOUCH-02..06 | V1/V2/V4/V5/V6 error message                    | validators unit          |
| T-VOUCH-07     | stacking happy 3.420.000                        | StackingEngine unit      |
| T-VOUCH-08     | cap exceeded → 490k / 2.350.000                 | StackingEngine unit      |
| T-VOUCH-09     | 50%+50% → sàn > 0                               | StackingEngine unit      |
| T-VOUCH-10     | remove → revert, usage KHÔNG tăng               | integration              |
| T-VOUCH-11     | remove eligible → auto-remove                   | integration + subscriber |
| T-VOUCH-12     | 5 fail → 429                                    | integration              |
| (bổ sung)      | EC-04 concurrency, property-based cap, rounding | integration/unit         |

---

# PART C — Cross-cutting

## C.1 Error handling (API_CONTRACT §3)

- `src/api/middlewares.ts` → `defineMiddlewares({ errorHandler })` chuẩn hoá envelope `{type,code,message,customer_message,details,request_id}`.
- `BusinessError extends MedusaError` mang `code, customer_message, details, httpStatus`. Map **422** (validation), **429** (rate), **409** (conflict) — override default Medusa (invalid_data→400).
- **Degrade rule (BR-10):** mọi lỗi trong evaluate/enrich/track suggestion → trả **200 rỗng**, KHÔNG 5xx.

## C.2 Money util (INT-01/D1)

`roundMoney(x)=Math.floor(x)`; mọi phép % qua util chung. Property test: `∀ promo%,voucher%: total_discount ≤ cap ∧ final ≥ 1`.

## C.3 Cart integration & anti-recursion

- Voucher revalidate **đồng bộ** trong request mutation cart (hook/workflow), KHÔNG async subscriber (KN-02).
- Attribution = **cart line metadata** (KN-09), copy → order line ở `order.placed`. Không orphan (INT-05).
- 2 module custom **không gọi nhau**; StackingEngine đọc Promotion/Pricing, không đọc SuggestiveSelling (KN-01).

## C.4 Security (SEC-01…05)

Mọi tính tiền server-side; store API scope theo session/customer; admin API auth+role (route namespace `/admin` + guard); event enum+id only; voucher code ≥6 alnum uppercase; message không lộ tồn tại mã (gộp NOT_FOUND/INACTIVE).

---

# PART D — Traceability & Build order

## D.1 Ma trận SRS → SF → SPEC → Test

| SRS req        | Solution Flow  | SPEC                  | Test                    |
| -------------- | -------------- | --------------------- | ----------------------- |
| SUGG-001       | SF-01/BR-01    | A.4, A.6              | T-SUGG-01,02            |
| SUGG-002       | SF-01/BR-02    | A.5                   | T-SUGG-03,04,05         |
| SUGG-003       | SF-03/04       | A.7 addSuggestedItem  | T-SUGG-06, EC-07        |
| SUGG-004       | SF-02/BR-03,04 | A.4 evaluateCart, A.6 | T-SUGG-07,08            |
| SUGG-005       | SF-06          | A.8, A.9              | T-SUGG-09               |
| SUGG-006       | SF-08          | A.11                  | T-SUGG-10               |
| VOUCH-001      | —              | B.6 applyVoucher      | T-VOUCH-01              |
| VOUCH-002      | —              | B.3/B.4               | T-VOUCH-02..06          |
| VOUCH-003 ⭐   | —              | B.5 StackingEngine    | T-VOUCH-07,08,09        |
| VOUCH-004      | —              | B.9 DELETE voucher    | T-VOUCH-10              |
| VOUCH-005      | SF-06          | B.6 revalidate        | T-VOUCH-11, EC-02       |
| EC-03/04/06/07 | —              | B.5/C.3/A.7/B.7       | T-VOUCH-09,12 + bổ sung |

## D.2 Thứ tự build khuyến nghị (theo dependency)

1. **Part C nền tảng:** errorHandler + BusinessError + roundMoney + constants.
2. **VoucherEngine (độc lập, testable thuần):** models+migration → StackingEngine (pure, fixtures SRS xanh) → V1..V8 → applyVoucher/remove → admin CRUD + cap-config → revalidate + rate-limit + order.placed.
3. **SuggestiveSelling (đã có nền):** evaluator (product) → filter BR-02 → cache thật (KN-05) → add-suggested-item (409/idempotency) → cart rules CR-01..04 → subscribers → events + preview.
4. **Tích hợp chéo:** cart.updated (sync voucher / async suggestion), attribution→order, EC matrix E2E.

## D.3 Cần khách confirm trước khi khoá (không chặn dev)

D1 rounding · D2 cap-base-no-ship · D3 V5-subtotal-gốc · D4 CR02-band×2 · D9 assigned-store-guest · D-B1 "extends Promotion" · OI-03 consumable list · OI-04 threshold source · OI-06 upsell featured flag.

_— Hết SPEC v1.0. Sau khi khách confirm D.3, khoá bản 1.1 và sinh `plan.md`/task tickets._
