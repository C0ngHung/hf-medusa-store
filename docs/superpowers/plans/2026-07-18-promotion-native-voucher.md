# Promotion-native Voucher — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép tạo voucher bằng wizard Promotion gốc + widget "Voucher settings", với config chung đọc thẳng từ Promotion/Campaign (hết drift), giữ nguyên credit-line carrier, và kế thừa estimated_savings từ nhánh đồng nghiệp.

**Architecture:** Voucher vẫn là bảng `voucher_config` chỉ chứa field voucher-only + `promotion_id`/`campaign_id`. Runtime "hydrate" các field chung (%, code, status, ngày, usage_limit) từ Promotion đã link vào chính object config trước khi map sang `VoucherSnapshot` — nhờ đó toàn bộ validators/mapper/máy tính tiền không đổi. Discount vẫn đi qua `cart.credit_lines` (Decision H).

**Tech Stack:** Medusa 2.16, TypeScript, Mikro-ORM, `query.graph` (Link), zod, Jest (medusaIntegrationTestRunner), React admin widget (@medusajs/ui), Next.js storefront.

## Global Constraints

- Tiền là số nguyên VND (1 = 1 VND); làm tròn `Math.floor`; không dùng float. (INT-01)
- `discount_value` phần trăm lưu **basis points** trong logic nội bộ (2000 = 20%); Promotion lưu **percent** (20). Quy đổi: `bps = promotion.application_method.value × 100`. (spec §2)
- Credit-line carrier + `verifyCartTotalsStep` shrink-guard KHÔNG được đổi/xóa. (Decision H)
- Thứ tự giảm giá cố định item → voucher → cap 50%; chỉ giảm voucher khi vượt cap. (VOUCH-003)
- Backing/voucher promotion KHÔNG bao giờ attach vào cart.
- Tất cả pnpm/turbo chạy từ INNER `hf-medusa-store/`. Test qua `pnpm test:unit` / `test:integration:http` / `test:integration:modules` (không gọi jest trực tiếp). Không commit khi chưa được lệnh (repo convention) — các bước "Commit" bên dưới là mốc TDD; hỏi Cealus trước khi chạy `git commit`.
- Backend src root (viết tắt `@be`): `hf-medusa-store/apps/backend/src`. Storefront src root (`@sf`): `hf-medusa-store/apps/storefront/src`.

---

## File Structure

**Tạo mới:**

- `@be/workflows/voucher-engine/lib/hydrate-voucher-from-promotion.ts` — pure fn overlay Promotion→config.
- `@be/api/middlewares/block-voucher-promotion.ts` — guardrail middleware cho route native.
- `@be/api/admin/vouchers/[id]/route.ts` — PUT (sửa field voucher-only) + DELETE (soft-delete).
- `@be/admin/widgets/voucher-settings.tsx` — widget bật/sửa voucher trên trang Promotion detail.
- Test files tương ứng (xem từng task).

**Sửa:**

- `@be/workflows/voucher-engine/admin/lib/build-backing-promotion.ts` — thêm `metadata.voucher_engine`.
- `@be/workflows/voucher-engine/steps/lookup-voucher.ts` — hydrate từ promotion.
- `@be/workflows/voucher-engine/admin/steps/create-voucher.ts` + `admin/create-voucher.ts` — hỗ trợ mode attach (dùng `promotion_id` có sẵn, không tạo promotion mới).
- `@be/api/admin/vouchers/validators.ts` + `route.ts` — schema mode attach.
- `@be/api/admin/vouchers/route.ts` (GET) — enrich field chung từ promotion cho list.
- `@be/api/store/customers/me/vouchers/route.ts` — hydrate + `estimated_savings` + sort.
- `@be/api/middlewares.ts` — đăng ký guardrail.
- `@be/admin/routes/vouchers/page.tsx` — list read-through + đổi nút Create thành CTA.
- `@sf/modules/checkout/components/discount-code/available-vouchers-modal.tsx` + `@sf/modules/voucher/types.ts` — hiển thị estimated_savings.

---

## PHASE 1 — Backend: đọc-từ-Promotion (nền tảng, gate bằng regression suite)

### Task 1: Gắn cờ `metadata.voucher_engine` lên backing promotion

**Files:**

- Modify: `@be/workflows/voucher-engine/admin/lib/build-backing-promotion.ts`
- Test: `@be/workflows/voucher-engine/admin/lib/__tests__/build-backing-promotion.unit.spec.ts` (đã tồn tại — thêm case)

**Interfaces:**

- Produces: backing promotion DTO có thêm `metadata: { voucher_engine: true, voucher_code: code }`. Guardrail (Task 4) và list-hydrate (Task 7) dựa vào cờ này.

- [ ] **Step 1: Thêm test khẳng định metadata**

Trong file test hiện có, thêm:

```ts
it("stamps voucher_engine metadata for guardrail + identification", () => {
  const [promo] = buildBackingPromotion(baseInput, "SAVE10");
  expect(promo.metadata).toEqual({
    voucher_engine: true,
    voucher_code: "SAVE10",
  });
});
```

- [ ] **Step 2: Chạy test — kỳ vọng FAIL**

Run (từ `apps/backend/`): `pnpm test:unit -- build-backing-promotion`
Expected: FAIL — `promo.metadata` là `undefined`.

- [ ] **Step 3: Thêm metadata vào DTO**

Trong `build-backing-promotion.ts`, thêm field vào object `promotion` (ngay sau `is_automatic: false,`):

```ts
    metadata: { voucher_engine: true, voucher_code: code },
```

- [ ] **Step 4: Chạy test — kỳ vọng PASS**

Run: `pnpm test:unit -- build-backing-promotion`
Expected: PASS (10 cũ + 1 mới).

- [ ] **Step 5: Commit** (hỏi Cealus trước)

```bash
git add "apps/backend/src/workflows/voucher-engine/admin/lib/build-backing-promotion.ts" "apps/backend/src/workflows/voucher-engine/admin/lib/__tests__/build-backing-promotion.unit.spec.ts"
git commit -m "feat(voucher): stamp voucher_engine metadata on backing promotion"
```

---

### Task 2: Hydrate field chung từ Promotion tại lookup (seam cốt lõi)

**Files:**

- Create: `@be/workflows/voucher-engine/lib/hydrate-voucher-from-promotion.ts`
- Create: `@be/workflows/voucher-engine/lib/__tests__/hydrate-voucher-from-promotion.unit.spec.ts`
- Modify: `@be/workflows/voucher-engine/steps/lookup-voucher.ts`

**Interfaces:**

- Consumes: `PersistedVoucherConfig` (`lib/mappers.ts:22-39`), Promotion + Campaign đọc qua `query.graph` trên field-link `voucher_config.promotion_id → promotion.id`.
- Produces: `hydrateVoucherFromPromotion(config, promotion): PersistedVoucherConfig` — trả về config đã overlay các field chung. Vì trả về ĐÚNG shape `PersistedVoucherConfig`, mọi consumer sau (mapper `toVoucherSnapshot`, `resolveAndCalculateVoucherDiscount`) không đổi.

- [ ] **Step 1: Viết test pure fn**

`hydrate-voucher-from-promotion.unit.spec.ts`:

```ts
import { hydrateVoucherFromPromotion } from "../hydrate-voucher-from-promotion";

const baseConfig: any = {
  id: "vc_1",
  code: "OLD",
  discount_type: "percentage",
  discount_value: 1000,
  is_active: false,
  valid_from: new Date("2000-01-01"),
  valid_to: new Date("2000-01-02"),
  usage_limit: null,
  usage_count: 3,
  per_user_limit: 1,
  min_order_value: 200000,
  max_discount_amount: 500000,
  applicable_product_ids: ["p1"],
  applicable_category_ids: null,
  stackable_with_promotions: true,
  user_segment_conditions: null,
  promotion_id: "promo_1",
};

const promo: any = {
  code: "SAVE25",
  status: "active",
  application_method: { type: "percentage", value: 25 },
  limit: 100,
  campaign: {
    starts_at: new Date("2026-01-01"),
    ends_at: new Date("2026-12-31"),
  },
};

it("overlays code, discount, status, window, limit from promotion (percent→bps)", () => {
  const r = hydrateVoucherFromPromotion(baseConfig, promo);
  expect(r.code).toBe("SAVE25");
  expect(r.discount_type).toBe("percentage");
  expect(r.discount_value).toBe(2500); // 25 percent → 2500 bps
  expect(r.is_active).toBe(true); // from promotion.status
  expect(r.valid_from).toEqual(new Date("2026-01-01"));
  expect(r.valid_to).toEqual(new Date("2026-12-31"));
  expect(r.usage_limit).toBe(100);
});

it("keeps voucher-only fields from config untouched", () => {
  const r = hydrateVoucherFromPromotion(baseConfig, promo);
  expect(r.max_discount_amount).toBe(500000);
  expect(r.min_order_value).toBe(200000);
  expect(r.per_user_limit).toBe(1);
  expect(r.usage_count).toBe(3); // counter stays config-owned
  expect(r.applicable_product_ids).toEqual(["p1"]);
});

it("fixed_amount: value passes through without ×100", () => {
  const r = hydrateVoucherFromPromotion(baseConfig, {
    ...promo,
    application_method: { type: "fixed", value: 50000 },
  });
  expect(r.discount_type).toBe("fixed_amount");
  expect(r.discount_value).toBe(50000);
});

it("no promotion → returns config unchanged (defensive)", () => {
  const r = hydrateVoucherFromPromotion(baseConfig, null);
  expect(r).toBe(baseConfig);
});
```

- [ ] **Step 2: Chạy test — kỳ vọng FAIL**

Run: `pnpm test:unit -- hydrate-voucher-from-promotion`
Expected: FAIL — module chưa tồn tại.

- [ ] **Step 3: Viết pure fn**

`hydrate-voucher-from-promotion.ts`:

```ts
import type { PersistedVoucherConfig } from "./mappers";

const BPS_PER_PERCENT = 100;

/** Promotion/Campaign đã đọc qua Link (chỉ các field cần overlay). */
export interface LinkedPromotionView {
  code: string;
  status: string;
  limit?: number | null;
  application_method?: { type?: string | null; value?: number | null } | null;
  campaign?: {
    starts_at?: Date | string | null;
    ends_at?: Date | string | null;
  } | null;
}

/**
 * Decision I: các field CHUNG (code, discount type/value, status, window, global
 * usage limit) là nguồn-sự-thật ở Promotion/Campaign. Overlay chúng vào bản config
 * để downstream (mapper/validators/calc) dùng nguyên trạng. Field voucher-only
 * (cap, min order, per-user, scope, usage_count) giữ từ config.
 */
export function hydrateVoucherFromPromotion(
  config: PersistedVoucherConfig,
  promotion: LinkedPromotionView | null,
): PersistedVoucherConfig {
  if (!promotion) return config;

  const am = promotion.application_method ?? {};
  const isPercentage = am.type === "percentage";
  const value = am.value ?? 0;

  return {
    ...config,
    code: promotion.code ?? config.code,
    discount_type: isPercentage ? "percentage" : "fixed_amount",
    discount_value: isPercentage ? value * BPS_PER_PERCENT : value,
    is_active: promotion.status === "active",
    valid_from: promotion.campaign?.starts_at
      ? new Date(promotion.campaign.starts_at)
      : config.valid_from,
    valid_to: promotion.campaign?.ends_at
      ? new Date(promotion.campaign.ends_at)
      : config.valid_to,
    usage_limit: promotion.limit ?? config.usage_limit,
  };
}
```

- [ ] **Step 4: Chạy test — kỳ vọng PASS**

Run: `pnpm test:unit -- hydrate-voucher-from-promotion`
Expected: PASS (4/4).

- [ ] **Step 5: Nối hydrate vào lookup-voucher step**

Trong `@be/workflows/voucher-engine/steps/lookup-voucher.ts`, sau khi có `voucher` (từ cache hoặc `findByCode`) và TRƯỚC khi tính `user_usage_count`/`global_cap_bps`, thêm đọc promotion qua `query.graph` rồi merge. Thêm import ở đầu file:

```ts
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { hydrateVoucherFromPromotion } from "../lib/hydrate-voucher-from-promotion";
```

Ngay sau block gán `voucher` (sau đoạn set-cache), chèn:

```ts
if (voucher?.promotion_id) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: [promo] = [] } = await query.graph({
    entity: "promotion",
    filters: { id: voucher.promotion_id },
    fields: [
      "id",
      "code",
      "status",
      "limit",
      "application_method.type",
      "application_method.value",
      "campaign.starts_at",
      "campaign.ends_at",
    ],
  });
  voucher = hydrateVoucherFromPromotion(voucher, promo ?? null);
}
```

> Ghi chú: promotion được đọc FRESH mỗi lần lookup (không cache) → sửa % promotion phản ánh ngay (test đinh Task 5b). Cache chỉ giữ bản config row như cũ.

- [ ] **Step 6: Regression — TOÀN BỘ suite voucher phải xanh nguyên**

Run (từ `apps/backend/`, mỗi suite HTTP chạy RIÊNG — xem [[integration-test-runinband-isolation]]):

```bash
pnpm test:integration:http -- apply-remove-voucher
pnpm test:integration:http -- voucher-engine-resolve-workflow
pnpm test:integration:http -- revalidate-voucher-workflow
pnpm test:integration:http -- record-voucher-usage-workflow
pnpm test:integration:modules -- voucher-engine
```

Expected: apply-remove 7/7 (gồm Rule-11 40%+20% → item giữ 132.000/voucher cap), resolve 6/6, revalidate 7/7, record-usage 3/3, service 14/14. **Nếu bất kỳ suite nào đỏ → dừng, không đi tiếp.**

- [ ] **Step 7: Commit** (hỏi Cealus trước)

```bash
git add "apps/backend/src/workflows/voucher-engine/lib/hydrate-voucher-from-promotion.ts" "apps/backend/src/workflows/voucher-engine/lib/__tests__/hydrate-voucher-from-promotion.unit.spec.ts" "apps/backend/src/workflows/voucher-engine/steps/lookup-voucher.ts"
git commit -m "feat(voucher): hydrate shared config fields from linked promotion at lookup"
```

---

## PHASE 2 — Guardrail: chặn attach voucher-promotion qua route native

### Task 3: Middleware chặn code voucher trên `/store/carts/:id/promotions`

**Files:**

- Create: `@be/api/middlewares/block-voucher-promotion.ts`
- Modify: `@be/api/middlewares.ts`
- Test: `@be/integration-tests/http/block-voucher-promotion.spec.ts`

**Interfaces:**

- Consumes: cờ `metadata.voucher_engine` (Task 1) trên promotion; body native `{ promo_codes: string[] }`.
- Produces: 400 khi promo_codes chứa code thuộc promotion voucher-engine.

- [ ] **Step 1: Viết HTTP test**

`block-voucher-promotion.spec.ts` (dùng `medusaIntegrationTestRunner`; provision 1 voucher qua workflow rồi thử attach code đó vào cart qua route native):

```ts
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
// ... khởi tạo cart + tạo voucher "GUARD10" qua createVoucherWorkflow (per-user_limit=1, active, in-window)

it("rejects a voucher code sent to the native cart-promotions route", async () => {
  const res = await api
    .post(
      `/store/carts/${cart.id}/promotions`,
      { promo_codes: ["GUARD10"] },
      { headers: { "x-publishable-api-key": pak } },
    )
    .catch((e) => e.response);
  expect(res.status).toBe(400);
  expect(res.data.message).toMatch(/voucher/i);
});

it("still allows a normal (non-voucher) promotion code", async () => {
  const res = await api.post(
    `/store/carts/${cart.id}/promotions`,
    { promo_codes: ["RACKET2M"] },
    { headers: { "x-publishable-api-key": pak } },
  );
  expect(res.status).toBe(200);
});
```

- [ ] **Step 2: Chạy — kỳ vọng FAIL**

Run: `pnpm test:integration:http -- block-voucher-promotion`
Expected: FAIL — voucher code hiện được attach (200) thay vì 400.

- [ ] **Step 3: Viết middleware**

`block-voucher-promotion.ts`:

```ts
import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

/**
 * Guardrail (spec §5): voucher là promotion code thật. Khách có thể gửi code đó
 * vào route native POST /store/carts/:id/promotions → Medusa attach thẳng, né
 * V1–V8/cap/rate-limit và tái hiện bug Rule 11. Chặn: code thuộc promotion có
 * metadata.voucher_engine=true → 400, buộc dùng ô voucher (POST .../voucher).
 */
export async function blockVoucherPromotionMiddleware(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction,
) {
  const codes: string[] = Array.isArray((req.body as any)?.promo_codes)
    ? (req.body as any).promo_codes
    : [];
  if (codes.length === 0) return next();

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data: promos = [] } = await query.graph({
    entity: "promotion",
    filters: { code: codes },
    fields: ["code", "metadata"],
  });
  const offending = promos.find(
    (p: any) => p?.metadata?.voucher_engine === true,
  );
  if (offending) {
    return res.status(400).json({
      code: "VOUCHER_CODE_NOT_A_PROMOTION",
      message: "Mã này là voucher — vui lòng nhập ở ô mã voucher.",
    });
  }
  return next();
}
```

- [ ] **Step 4: Đăng ký middleware**

Trong `@be/api/middlewares.ts`: thêm import và một route entry:

```ts
import { blockVoucherPromotionMiddleware } from "./middlewares/block-voucher-promotion";
```

Thêm vào mảng `routes`:

```ts
    {
      matcher: "/store/carts/:id/promotions",
      method: "POST",
      middlewares: [blockVoucherPromotionMiddleware],
    },
```

- [ ] **Step 5: Chạy — kỳ vọng PASS**

Run: `pnpm test:integration:http -- block-voucher-promotion`
Expected: PASS (2/2).

- [ ] **Step 6: Commit** (hỏi Cealus trước)

```bash
git add "apps/backend/src/api/middlewares/block-voucher-promotion.ts" "apps/backend/src/api/middlewares.ts" "apps/backend/integration-tests/http/block-voucher-promotion.spec.ts"
git commit -m "feat(voucher): guardrail blocking voucher codes on native cart-promotions route"
```

---

## PHASE 3 — API: mode attach + PUT + list/store enrich

### Task 4: `POST /admin/vouchers` mode attach (promotion có sẵn)

**Files:**

- Modify: `@be/api/admin/vouchers/validators.ts` (thêm `AttachVoucherSchema`)
- Modify: `@be/api/admin/vouchers/route.ts` (nhánh theo body)
- Modify: `@be/workflows/voucher-engine/admin/create-voucher.ts` + `admin/steps/create-voucher.ts`
- Modify: `@be/api/middlewares.ts` (validate schema mới)
- Test: `@be/integration-tests/http/voucher-admin.spec.ts` (thêm case)

**Interfaces:**

- Consumes: `promotion_id` (từ widget). Workflow bỏ qua bước tạo promotion khi đã có `promotion_id`.
- Produces: voucher_config gắn vào promotion đó; đọc `application_method`/`campaign` để suy `discount_type`/`discount_value`/`valid_from`/`valid_to` lưu snapshot ban đầu vào cột deprecated (chỉ để không NULL — runtime vẫn read-through).

- [ ] **Step 1: Test HTTP mode attach**

Trong `voucher-admin.spec.ts` thêm: tạo 1 promotion percentage qua `createPromotionsWorkflow` (hoặc admin API), rồi:

```ts
it("attaches a voucher to an existing promotion (widget flow)", async () => {
  const res = await api.post(
    "/admin/vouchers",
    {
      promotion_id: promo.id,
      max_discount_amount: 500000,
      min_order_value: 200000,
      per_user_limit: 2,
    },
    adminHeaders,
  );
  expect(res.status).toBe(201);
  expect(res.data.voucher.promotion_id).toBe(promo.id);
  expect(res.data.voucher.max_discount_amount).toBe(500000);
});
```

- [ ] **Step 2: Chạy — kỳ vọng FAIL** (`pnpm test:integration:http -- voucher-admin`; schema từ chối body thiếu `discount_type`/`discount_value`).

- [ ] **Step 3: Thêm `AttachVoucherSchema` + union**

Trong `validators.ts`, thêm:

```ts
export const AttachVoucherSchema = z.object({
  promotion_id: z.string().min(1),
  min_order_value: z.number().int().nonnegative().nullish(),
  max_discount_amount: z.number().int().nonnegative().nullish(),
  applicable_product_ids: z.array(z.string().min(1)).nullish(),
  applicable_category_ids: z.array(z.string().min(1)).nullish(),
  stackable_with_promotions: z.boolean().default(true),
  per_user_limit: z.number().int().positive().default(1),
  user_segment_conditions: z.record(z.string(), z.any()).nullish(),
});
export const CreateOrAttachVoucherSchema = z.union([
  AttachVoucherSchema,
  CreateVoucherSchema,
]);
export type CreateOrAttachVoucherBody = z.infer<
  typeof CreateOrAttachVoucherSchema
>;
```

Cập nhật `middlewares.ts`: `/admin/vouchers` POST dùng `validateAndTransformBody(CreateOrAttachVoucherSchema)`.

- [ ] **Step 4: Workflow bỏ qua tạo promotion khi có `promotion_id`**

Trong `admin/create-voucher.ts`: bọc bước `createPromotionsWorkflow` bằng `when({ input }, ({ input }) => !input.promotion_id)`; khi có `promotion_id`, đọc `application_method`/`campaign` của promotion đó (qua `query.graph` trong 1 step nhỏ mới `resolvePromotionSnapshotStep`) để điền `discount_type`/`discount_value`/`valid_from`/`valid_to`/`code` cho `createVoucherStep`. Khi tạo mới (mode cũ) giữ y nguyên. `createVoucherStep` không đổi (đã nhận `promotion_id`/`campaign_id`).

> Chi tiết step `resolvePromotionSnapshotStep`: input `{ promotion_id }`, `query.graph` promotion fields `["code","application_method.type","application_method.value","campaign.id","campaign.starts_at","campaign.ends_at","metadata"]`; nếu `metadata.voucher_engine` CHƯA set thì set qua `updatePromotionsWorkflow` (đảm bảo guardrail áp cho cả promotion tạo tay); trả `{ code, campaign_id, discount_type, discount_value(bps), valid_from, valid_to }`.

- [ ] **Step 5: Chạy — kỳ vọng PASS** (`pnpm test:integration:http -- voucher-admin`, gồm case cũ 12/12 + case attach).

- [ ] **Step 6: Commit** (hỏi Cealus trước) — message `feat(voucher): admin create-voucher attach mode for existing promotion`.

---

### Task 5: `PUT /admin/vouchers/:id` (sửa field voucher-only)

**Files:**

- Create: `@be/api/admin/vouchers/[id]/route.ts` (PUT + DELETE)
- Modify: `@be/api/admin/vouchers/validators.ts` (`UpdateVoucherSchema`)
- Modify: `@be/api/middlewares.ts`
- Test: `@be/integration-tests/http/voucher-admin.spec.ts` (thêm case)

- [ ] **Step 1: Test** — PUT đổi `max_discount_amount` → 200 + giá trị mới; DELETE → voucher soft-deleted (GET list không còn).
- [ ] **Step 2: Chạy — FAIL** (route chưa có).
- [ ] **Step 3: Viết `UpdateVoucherSchema`** = `AttachVoucherSchema.partial().omit({ promotion_id: true })` (chỉ field voucher-only).
- [ ] **Step 4: Viết route:**

```ts
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { VOUCHER_ENGINE_MODULE } from "../../../../modules/voucher-engine";

export const PUT = async (req: MedusaRequest, res: MedusaResponse) => {
  const ve: any = req.scope.resolve(VOUCHER_ENGINE_MODULE);
  const voucher = await ve.updateVoucherConfigs({
    id: req.params.id,
    ...req.validatedBody,
  });
  res.json({ voucher });
};

export const DELETE = async (req: MedusaRequest, res: MedusaResponse) => {
  const ve: any = req.scope.resolve(VOUCHER_ENGINE_MODULE);
  await ve.deleteVoucherConfigs(req.params.id);
  res.json({ id: req.params.id, deleted: true });
};
```

Đăng ký `middlewares.ts`: `/admin/vouchers/:id` PUT → `validateAndTransformBody(UpdateVoucherSchema)`.

- [ ] **Step 5: Chạy — PASS.**
- [ ] **Step 6: Commit** (hỏi trước) — `feat(voucher): admin PUT/DELETE voucher (voucher-only fields)`.

---

### Task 6: Enrich list admin + store `estimated_savings` + sort

**Files:**

- Modify: `@be/api/admin/vouchers/route.ts` (GET — enrich Code/%/window từ promotion cho hiển thị list)
- Modify: `@be/api/store/customers/me/vouchers/route.ts` (hydrate + estimated_savings + sort)
- Test: `@be/integration-tests/http/voucher-store-vouchers.spec.ts` (mới) + case list admin trong `voucher-admin.spec.ts`

**Interfaces:**

- Consumes: `hydrateVoucherFromPromotion` (Task 2), `calculateVoucherDiscount`/`resolveEligibleItems`/`calculateOriginalSubtotal`/`LineValue` (`modules/voucher-engine/lib/calculate-discount.ts`).
- Produces: mỗi voucher store DTO thêm `estimated_savings?: number`; list sort eligible-trước/tiết-kiệm-giảm-dần.

- [ ] **Step 1: Test store route** — với `?cart_id=` (giỏ có sản phẩm), mỗi voucher có `estimated_savings` là số nguyên; voucher không đủ min-order xếp sau; số tiết kiệm không vượt trần 50%.
- [ ] **Step 2: Chạy — FAIL.**
- [ ] **Step 3: Sửa store route** — dựng `LineValue[]` từ cart (item_promotion_discount = 0, is_eligible false), với mỗi voucher: `resolveEligibleItems(lines, {product_ids, category_ids})` → `calculateVoucherDiscount({ lines, discount_type, discount_value, max_discount_amount, global_cap_bps: await ve.getActiveCap() })` → gán `estimated_savings = final_voucher_discount`; sort `(a,b) => a.eligible!==b.eligible ? (a.eligible?-1:1) : (b.estimated_savings??0)-(a.estimated_savings??0)`. Field `discount_type`/`discount_value`/`valid_to` mỗi voucher lấy qua `hydrateVoucherFromPromotion` (đọc promotion theo `promotion_id`; batch `query.graph` cho tất cả `promotion_id`). (Đây là phần adapt của port từ nhánh đồng nghiệp.)
- [ ] **Step 4: Sửa GET list admin** — batch đọc promotion cho các `promotion_id`, overlay `code`/`discount_type`/`discount_value`/`valid_from`/`valid_to` để cột list hiển thị đúng nguồn.
- [ ] **Step 5: Chạy — PASS** (store route mới + admin list case).
- [ ] **Step 6: Commit** (hỏi trước) — `feat(voucher): read-through list + estimated_savings & smart sort (ported)`.

---

## PHASE 4 — Admin UI

### Task 7: Widget "Voucher settings" trên trang Promotion detail

**Files:**

- Create: `@be/admin/widgets/voucher-settings.tsx`
- Test: thủ công (UI) — có bước verify live bên dưới.

**Interfaces:**

- Consumes: `GET /admin/vouchers?promotion_id=` (thêm filter — mở rộng GET list để lọc theo promotion_id), `POST /admin/vouchers` (mode attach, Task 4), `PUT /admin/vouchers/:id` (Task 5).
- Produces: nút "Enable as voucher" + form field voucher-only + trạng thái đã-là-voucher.

- [ ] **Step 1: Mở rộng GET `/admin/vouchers` nhận `?promotion_id=`** (lọc `listAndCountVoucherConfigs({ promotion_id })`). Test HTTP nhanh 1 case.
- [ ] **Step 2: Viết widget** theo pattern admin route hiện có (`routes/vouchers/page.tsx`, `components/create-voucher-modal.tsx` để tham chiếu `@medusajs/ui` + `defineWidgetConfig`). Cấu hình:

```tsx
import { defineWidgetConfig } from "@medusajs/admin-sdk";
// zone: "promotion.details.side.after"
```

Logic hiển thị: đọc promotion detail từ `data` widget props (`DetailWidgetProps<AdminPromotion>`); nếu type không hợp lệ (buyget/free-shipping/is_automatic) → thông báo không hỗ trợ; nếu chưa có voucher (GET theo promotion_id rỗng) → form + nút Enable (POST attach); nếu đã có → form sửa (PUT) + usage + Analytics + Disable (DELETE). Field: max_discount_amount, min_order_value, per_user_limit, stackable_with_promotions, applicable_product/category (multi-select tái dùng `components/*-multi-select.tsx`). Banner cảnh báo "không attach vào cart".

- [ ] **Step 3: Verify live** — restart backend, mở promotion detail (VD SAVE10) → widget hiển thị; tạo promotion mới bằng wizard gốc → Enable as voucher → điền cap → Save → kiểm tra DB `voucher_config` có row + promotion `metadata.voucher_engine=true`.
- [ ] **Step 4: Commit** (hỏi trước) — `feat(admin): voucher-settings widget on promotion detail`.

---

### Task 8: Trang Vouchers — list read-through + bỏ form tạo

**Files:**

- Modify: `@be/admin/routes/vouchers/page.tsx`
- Remove-from-flow: `@be/admin/components/create-voucher-modal.tsx` (xóa file sau khi widget chạy ổn)

- [ ] **Step 1:** Cột Code/Discount/Validity đọc từ field đã enrich (Task 6 Step 4); dòng bấm được → điều hướng `"/app/promotions/" + v.promotion_id`.
- [ ] **Step 2:** Nút "Create voucher" → đổi thành callout/CTA: "Tạo voucher từ Promotions › Create rồi bật ở tab Voucher settings", link sang `/app/promotions/create`. Gỡ import + render `CreateVoucherModal`.
- [ ] **Step 3:** Xóa `components/create-voucher-modal.tsx`.
- [ ] **Step 4: Verify live** — trang Vouchers hiển thị list đúng, click sang promotion, không còn modal tạo.
- [ ] **Step 5: Commit** (hỏi trước) — `feat(admin): vouchers list read-through + create CTA`.

---

## PHASE 5 — Storefront + SPEC

### Task 9: Modal storefront hiển thị estimated_savings

**Files:**

- Modify: `@sf/modules/voucher/types.ts` (thêm `estimated_savings?: number` vào `AvailableVoucher`)
- Modify: `@sf/modules/checkout/components/discount-code/available-vouchers-modal.tsx`

- [ ] **Step 1:** Thêm field type. `lib/data/voucher.ts` `fetchAvailableVouchers` đã gọi `?cart_id=` — response giờ có `estimated_savings` (Task 6).
- [ ] **Step 2:** Trong modal, mỗi voucher hiện "Tiết kiệm ~{format(estimated_savings)}₫" khi `estimated_savings != null && > 0`; danh sách render theo thứ tự server trả (đã sort). Theo pattern format tiền hiện có của component.
- [ ] **Step 3: Verify live** — login `conghung@gmail.com`/`supersecret`, thêm hàng, mở modal → thấy số tiết kiệm + thứ tự eligible-trước.
- [ ] **Step 4: Commit** (hỏi trước) — `feat(storefront): show estimated voucher savings in available-vouchers modal`.

---

### Task 10: SPEC Decision I (governance)

**Files:**

- Modify: `.claude/specs/voucher-engine/SPEC.md`

- [ ] **Step 1:** Chạy subagent `voucher-spec-advisor` với đề bài: ghi **Decision I** — re-scope Decision C (Promotion từ "canonical/reference, advisory" → **nguồn-sự-thật cho field chung**, đọc read-through tại runtime; voucher_config giữ field voucher-only + cột chung deprecated không xóa); bổ sung guardrail (§5); khẳng định Decision H (credit-line) KHÔNG đổi; ghi mode attach `POST /admin/vouchers` + `PUT /admin/vouchers/:id`.
- [ ] **Step 2:** Đọc lại SPEC, đảm bảo không mâu thuẫn Decision H.
- [ ] **Step 3: Commit** (hỏi trước) — `docs(voucher): SPEC Decision I — promotion as source of truth for shared fields`.

---

### Task 11: Regression tổng + cập nhật progress

**Files:**

- Modify: `.claude/progress/voucher-engine-progress.md`

- [ ] **Step 1: Chạy lại toàn bộ** (mỗi HTTP suite riêng): `apply-remove-voucher`, `voucher-engine-resolve-workflow`, `revalidate-voucher-workflow`, `record-voucher-usage-workflow`, `voucher-admin`, `block-voucher-promotion`, `voucher-store-vouchers`; `pnpm test:integration:modules -- voucher-engine`; `pnpm test:unit`. Ghi lại số pass.
- [ ] **Step 2: Verify E2E trên UI** — kịch bản Rule 11 (BG65 3pack + MEGA20) apply THÀNH CÔNG trên nhánh mình (item giữ 132.000, voucher cap 33.000, total 165.000) — đối chứng với 400 của nhánh đồng nghiệp.
- [ ] **Step 3: Cập nhật progress doc** với trạng thái Decision I + kết quả test.
- [ ] **Step 4: Commit** (hỏi trước) — `docs(voucher): log Decision I implementation + verification`.

---

## Self-Review (đã chạy)

- **Spec coverage:** §1 kiến trúc→Task 2; §2 data model/bps→Task 2; §3 widget→Task 7; §4 API/trang→Task 4/5/6/8; §5 guardrail→Task 3; §6 port→Task 6/9; §7 test→từng task + Task 11; §8 Decision I→Task 10. Đủ.
- **Placeholder scan:** không có TBD; code pure fn + middleware + route viết đủ; UI task nêu rõ pattern + API + zone (không bịa full component vì phải theo file hiện có).
- **Type consistency:** `hydrateVoucherFromPromotion(config, promotion)` dùng nhất quán ở Task 2/6; `CreateOrAttachVoucherSchema` union nhất quán Task 4; method service `updateVoucherConfigs`/`deleteVoucherConfigs`/`listAndCountVoucherConfigs` đúng tên generated.
- **Rủi ro then chốt:** Task 2 là seam nền tảng — gate bắt buộc regression xanh (Step 6) trước khi sang Phase 2+.
