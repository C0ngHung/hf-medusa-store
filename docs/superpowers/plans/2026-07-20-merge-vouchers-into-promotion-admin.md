# Merge Vouchers admin UI into Promotion pages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the standalone `/app/vouchers` admin route + sidebar item and surface voucher analytics inline on the native Medusa Promotion detail page instead, so all voucher management lives inside the Promotion pages.

**Architecture:** Add a new read-only admin widget (`voucher-analytics.tsx`, zone `promotion.details.after`) that reuses the existing `useVoucherByPromotion` + `useVoucherAnalytics` hooks and renders nothing for non-voucher promotions. Then delete the now-redundant standalone route, its Drawer component, and the list-only data hook.

**Tech Stack:** Medusa 2.16 admin dashboard (React 18, `@medusajs/admin-sdk` widget/route registration, `@tanstack/react-query`, `@medusajs/ui`). TypeScript, pnpm workspace.

## Global Constraints

- Admin-UI-only change. Do NOT touch `src/api/admin/vouchers/**`, workflows, steps, migrations, or seed — the `GET/POST/PUT/DELETE /admin/vouchers*` endpoints stay exactly as-is (per spec `docs/superpowers/specs/2026-07-20-merge-vouchers-into-promotion-admin-design.md`).
- No backend test files change. `voucher-admin.spec.ts` (23/23) must stay green untouched.
- This repo has no admin-component test harness (no `*.spec.tsx` under `src/admin/`) — verification for every task is (a) `npx tsc --noEmit` clean, (b) `pnpm --filter @dtc/backend build` clean, (c) a manual browser smoke-test step described exactly in the task.
- Money/percentage formatting in the new widget must byte-for-byte match what the old Drawer rendered (raw numbers, no new `Intl.NumberFormat` calls) — this is a relocation, not a redesign; do not add scope.
- **Do not run `git commit` until explicitly told to** — Cealus decided (2026-07-20) to batch the spec doc + this implementation into one combined commit at the end, not commit per-task. The final step of Task 2 stages everything but the actual `git commit` command must only run after the user confirms in the session.
- Backend dev server (`medusa develop`, port 9009) may already be running in the background from an earlier session — widgets/routes hot-reload via the admin dev server; no restart needed to see changes, just refresh the browser tab.

## File Structure

- **Create:** `hf-medusa-store/apps/backend/src/admin/widgets/voucher-analytics.tsx` — new inline analytics widget on the Promotion detail page.
- **Delete:** `hf-medusa-store/apps/backend/src/admin/routes/vouchers/page.tsx` — standalone list route (its `defineRouteConfig` is what registers the `/app/vouchers` route + "Vouchers" sidebar entry).
- **Delete:** `hf-medusa-store/apps/backend/src/admin/components/voucher-analytics-drawer.tsx` — superseded by the new inline widget.
- **Modify:** `hf-medusa-store/apps/backend/src/admin/lib/api.ts` — remove the `useVouchers` (list) hook; keep `VOUCHERS_KEY`, `useVoucherAnalytics`, `useVoucherByPromotion`, and the attach/update/delete mutations untouched.
- **Modify:** `hf-medusa-store/apps/backend/src/admin/lib/types.ts` — fix the now-stale JSDoc comment on `VoucherConfig.promotion_id` (it references "the admin Vouchers list", which no longer exists).

---

### Task 1: Add the inline "Voucher analytics" widget on the Promotion detail page

**Files:**

- Create: `hf-medusa-store/apps/backend/src/admin/widgets/voucher-analytics.tsx`
- Read (no changes, just confirming the interfaces this task consumes): `hf-medusa-store/apps/backend/src/admin/lib/api.ts:245-254` (`useVoucherAnalytics`), `hf-medusa-store/apps/backend/src/admin/lib/api.ts:281-290` (`useVoucherByPromotion`), `hf-medusa-store/apps/backend/src/admin/lib/types.ts:114-144` (`VoucherConfig`, `VoucherAnalytics`)

**Interfaces:**

- Consumes: `useVoucherByPromotion(promotionId?: string) => { data?: { vouchers: VoucherConfig[]; count: number } }` and `useVoucherAnalytics(id: string) => { data?: { analytics: VoucherAnalytics }, isLoading: boolean, isError: boolean, error: unknown }` (both already exist in `lib/api.ts`, unchanged). `VoucherAnalytics` shape: `{ total_uses: number; total_discount_given: number; avg_order_value: number; capped_count: number; conversion_rate: number }`.
- Produces: the widget module itself (default export + `config`) — no other task consumes exports from this file; Task 2 only needs to know this widget exists so the Drawer/route can be safely deleted.

- [ ] **Step 1: Write the widget component**

Create `hf-medusa-store/apps/backend/src/admin/widgets/voucher-analytics.tsx`:

```tsx
import { defineWidgetConfig } from "@medusajs/admin-sdk";
import type {
  AdminPromotion,
  DetailWidgetProps,
} from "@medusajs/framework/types";
import { Container, Heading, Text } from "@medusajs/ui";
import { useVoucherAnalytics, useVoucherByPromotion } from "../lib/api";

const AnalyticsStat = ({ label, value }: { label: string; value: number }) => (
  <div className="flex flex-col gap-y-1">
    <Text size="small" leading="compact" className="text-ui-fg-subtle">
      {label}
    </Text>
    <Text size="large" leading="compact" weight="plus">
      {value}
    </Text>
  </div>
);

/**
 * "Voucher analytics" widget on the native Promotion detail page (zone
 * `promotion.details.after`). Renders nothing for promotions that are not
 * VoucherEngine vouchers — same eligibility gate as `voucher-settings.tsx`
 * (SPEC Decision H/I: a voucher is always a customer-entered `standard`,
 * non-automatic promotion). Reuses the existing
 * `GET /admin/vouchers/:id/analytics` endpoint via `useVoucherAnalytics`;
 * this widget only relocates the display from a Drawer (Task 8, now
 * removed) to an inline block on the Promotion page itself.
 */
const VoucherAnalyticsWidget = ({
  data,
}: DetailWidgetProps<AdminPromotion>) => {
  const isEligible = data.type === "standard" && data.is_automatic !== true;

  const { data: voucherList } = useVoucherByPromotion(
    isEligible ? data.id : undefined,
  );
  const voucher = voucherList?.vouchers?.[0] ?? null;

  const analytics = useVoucherAnalytics(voucher?.id ?? "");

  if (!isEligible || !voucher) {
    return null;
  }

  return (
    <Container className="flex flex-col gap-y-4 p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">Voucher analytics</Heading>
      </div>

      <div className="border-ui-border-base border-t px-6 py-4">
        {analytics.isLoading && (
          <Text size="small" className="text-ui-fg-muted">
            Loading…
          </Text>
        )}
        {analytics.isError && (
          <Text size="small" className="text-ui-fg-error">
            {(analytics.error as any)?.message ??
              "Analytics unavailable for this voucher."}
          </Text>
        )}
        {analytics.data && (
          <div className="grid grid-cols-2 gap-4">
            <AnalyticsStat
              label="Total uses"
              value={analytics.data.analytics.total_uses}
            />
            <AnalyticsStat
              label="Total discount given"
              value={analytics.data.analytics.total_discount_given}
            />
            <AnalyticsStat
              label="Avg. order value"
              value={analytics.data.analytics.avg_order_value}
            />
            <AnalyticsStat
              label="Capped count"
              value={analytics.data.analytics.capped_count}
            />
            <AnalyticsStat
              label="Conversion rate"
              value={analytics.data.analytics.conversion_rate}
            />
          </div>
        )}
      </div>
    </Container>
  );
};

export const config = defineWidgetConfig({
  zone: "promotion.details.after",
});

export default VoucherAnalyticsWidget;
```

- [ ] **Step 2: Type-check**

Run from `hf-medusa-store/apps/backend`:

```bash
cd hf-medusa-store/apps/backend && npx tsc --noEmit
```

Expected: same 2 pre-existing errors only (`create-admin-user.ts` missing `jsonwebtoken` types, `admin/lib/sdk.ts` `import.meta`) — no new errors from `voucher-analytics.tsx`.

- [ ] **Step 3: Build the admin bundle**

Run from the repo's inner workspace root:

```bash
cd hf-medusa-store && pnpm --filter @dtc/backend build
```

Expected: exits 0, no errors mentioning `voucher-analytics.tsx`.

- [ ] **Step 4: Manual smoke test — analytics renders for a voucher, nothing for a non-voucher**

With the backend dev server running (`medusa develop`, port 9009 — check `http://localhost:9009/app/promotions` loads; if not running, start it per the `dev-backend` skill):

1. Open `http://localhost:9009/app/promotions`, click into a promotion that already has a voucher attached (e.g. `TESTATTACH20`, or `SAVE10`/`MEGA20`/`SHUTTLE20` from the seed).
2. Confirm a **"Voucher analytics"** block now appears below the main promotion content, showing 5 stats (Total uses, Total discount given, Avg. order value, Capped count, Conversion rate) — the same numbers the old "Analyze" button/drawer used to show on the `/app/vouchers` list.
3. Open a promotion that is NOT a voucher (e.g. `DEMO-CAP-CONFLICT-40`, the automatic one) — confirm NO "Voucher analytics" block renders anywhere on the page.
4. Confirm the existing "Voucher settings" widget (right column) still works unchanged on both pages (shows form for the voucher-enabled one, shows the "not usable as voucher" hint for others).

- [ ] **Step 5: Checkpoint (no commit yet)**

Per Global Constraints, do NOT run `git commit` here — this is intentionally batched with Task 2 into one combined commit at the end, per Cealus's explicit instruction. Leave the new file unstaged and move to Task 2.

---

### Task 2: Remove the standalone Vouchers route, Drawer, and list hook

**Files:**

- Delete: `hf-medusa-store/apps/backend/src/admin/routes/vouchers/page.tsx`
- Delete: `hf-medusa-store/apps/backend/src/admin/components/voucher-analytics-drawer.tsx`
- Modify: `hf-medusa-store/apps/backend/src/admin/lib/api.ts:227-244` (remove `useVouchers`, keep `VOUCHERS_KEY`)
- Modify: `hf-medusa-store/apps/backend/src/admin/lib/types.ts:132-135` (fix stale comment on `promotion_id`)

**Interfaces:**

- Consumes: Task 1's widget must already exist and render analytics correctly (verified in Task 1 Step 4) before this task removes the old Drawer/list — otherwise there is a window with no analytics UI at all.
- Produces: nothing further downstream — this is the last task in the plan.

- [ ] **Step 1: Confirm no other file references what's about to be deleted**

Run from the repo root:

```bash
grep -rn "useVouchers\b" hf-medusa-store/apps/backend/src/admin/
```

Expected output: only the two lines inside `routes/vouchers/page.tsx` (the import and the call) — no other consumers. If anything else shows up, stop and investigate before deleting.

```bash
grep -rln "VoucherAnalyticsDrawer" hf-medusa-store/apps/backend/src/admin/
```

Expected output: only `routes/vouchers/page.tsx` and `components/voucher-analytics-drawer.tsx` itself.

- [ ] **Step 2: Delete the standalone route file**

```bash
rm hf-medusa-store/apps/backend/src/admin/routes/vouchers/page.tsx
```

This is the file whose `defineRouteConfig({ label: "Vouchers", icon: ReceiptPercent })` export registers both the `/app/vouchers` URL and the "Vouchers" entry under the Extensions section of the sidebar. Deleting it removes both.

- [ ] **Step 3: Delete the now-orphaned Drawer component**

```bash
rm hf-medusa-store/apps/backend/src/admin/components/voucher-analytics-drawer.tsx
```

- [ ] **Step 4: Remove the `useVouchers` hook from `lib/api.ts`**

In `hf-medusa-store/apps/backend/src/admin/lib/api.ts`, replace:

```ts
/* ------------------------------------------------------------------ */
/* VoucherEngine — admin list + create + analytics (SRS §6.4)          */
/* Reads/writes ONLY the VoucherConfig table via /admin/vouchers* —    */
/* never the native Promotion list (SPEC Decision C/G).                */
/* ------------------------------------------------------------------ */

const VOUCHERS_KEY = ["vouchers"];

export const useVouchers = () =>
  useQuery({
    queryKey: VOUCHERS_KEY,
    queryFn: () =>
      sdk.client.fetch<{ vouchers: VoucherConfig[]; count: number }>(
        "/admin/vouchers",
        { query: { limit: 200 } },
      ),
  });

export const useVoucherAnalytics = (id: string) =>
```

with:

```ts
/* ------------------------------------------------------------------ */
/* VoucherEngine — analytics (SRS §6.4)                                 */
/* Reads ONLY the VoucherConfig table via /admin/vouchers* — never the  */
/* native Promotion list (SPEC Decision C/G). The list UI was removed   */
/* 2026-07-20 in favor of inline widgets on the Promotion detail page.  */
/* ------------------------------------------------------------------ */

const VOUCHERS_KEY = ["vouchers"];

export const useVoucherAnalytics = (id: string) =>
```

Keep every other export in the file (`useVoucherByPromotion`, `useAttachVoucher`, `useUpdateVoucherFields`, `useDeleteVoucher`, all the suggestion-rule/bulk-mapping/complement-mapping hooks above) exactly as they are.

- [ ] **Step 5: Fix the stale `promotion_id` comment in `lib/types.ts`**

In `hf-medusa-store/apps/backend/src/admin/lib/types.ts`, replace:

```ts
  /** Linked native Promotion id — used by the admin Vouchers list to
   * navigate a row to its Promotion detail page (Task 8). Internal FK,
   * already surfaced elsewhere (e.g. the `?promotion_id=` list filter). */
  promotion_id?: string | null;
```

with:

```ts
  /** Linked native Promotion id — used to filter `GET /admin/vouchers`
   * by promotion (see `useVoucherByPromotion`) and as the attach-mode
   * payload key. Internal FK; the Promotion is the source of truth for
   * shared fields (SPEC Decision I). */
  promotion_id?: string | null;
```

- [ ] **Step 6: Type-check**

```bash
cd hf-medusa-store/apps/backend && npx tsc --noEmit
```

Expected: same 2 pre-existing errors only, no new errors, and no "file not found" errors for the deleted files (confirms nothing else imports them).

- [ ] **Step 7: Build the admin bundle**

```bash
cd hf-medusa-store && pnpm --filter @dtc/backend build
```

Expected: exits 0.

- [ ] **Step 8: Manual smoke test — the standalone surface is gone**

With the backend dev server running:

1. Look at the left sidebar under "Extensions" — confirm there is **no "Vouchers" entry** anymore (only "Bulk mappings", "Suggestion rules", "Suggestion events", "Category complements", "Category top sellers", or whatever remains from SuggestiveSelling).
2. Navigate directly to `http://localhost:9009/app/vouchers` — confirm it no longer resolves to the old list page (Medusa admin's router falls back to its default not-found/redirect behavior since the route is no longer registered).
3. Re-open `TESTATTACH20`'s promotion detail page — confirm "Voucher settings" and "Voucher analytics" (from Task 1) still both work exactly as in Task 1 Step 4.

- [ ] **Step 9: Backend regression check (belt-and-suspenders — no backend code changed, but confirm nothing broke)**

```bash
cd hf-medusa-store/apps/backend && TEST_TYPE=http pnpm test:integration:http -- voucher-admin
```

Expected: `voucher-admin.spec.ts` still 23/23 (this task touched zero backend files, so this should be unaffected — run it anyway since the spec's "Scope" section promises it stays green).

- [ ] **Step 10: Stage everything and stop before committing**

```bash
git add hf-medusa-store/apps/backend/src/admin/widgets/voucher-analytics.tsx
git add hf-medusa-store/apps/backend/src/admin/routes/vouchers/page.tsx
git add hf-medusa-store/apps/backend/src/admin/components/voucher-analytics-drawer.tsx
git add hf-medusa-store/apps/backend/src/admin/lib/api.ts
git add hf-medusa-store/apps/backend/src/admin/lib/types.ts
git add docs/superpowers/specs/2026-07-20-merge-vouchers-into-promotion-admin-design.md
git add docs/superpowers/plans/2026-07-20-merge-vouchers-into-promotion-admin.md
git status
```

Expected `git status`: the new widget, the two deletions, the two modified `lib/` files, and the spec + plan docs all staged. **Do NOT run `git commit` yet** — present the staged diff to Cealus and wait for explicit go-ahead on the commit message before committing, per Global Constraints.

---

## Self-Review

**Spec coverage:** Spec §1 (delete route) → Task 2 Steps 2/8. Spec §2 (analytics widget) → Task 1. Spec §3 (dead-code cleanup: drawer + hook) → Task 2 Steps 3/4/5. Spec §4 (unchanged: settings widget, backend) → Global Constraints + verified in both tasks' smoke tests. Spec "Testing/verification" (build, tsc, 4-point manual smoke test) → covered across Task 1 Step 2-4 and Task 2 Step 6-9. Spec "Out of scope" items are simply not implemented (no task references `promotion.list.after` or backend endpoint removal). No gaps found.

**Placeholder scan:** No TBD/TODO; every step has literal code, exact commands, and exact expected output.

**Type consistency:** `useVoucherByPromotion` returns `{ vouchers: VoucherConfig[]; count: number }` (per `lib/api.ts:281-290`) — Task 1's widget destructures `voucherList?.vouchers?.[0]`, matching. `useVoucherAnalytics` returns `{ data?: { analytics: VoucherAnalytics } }` — Task 1 accesses `analytics.data.analytics.<field>`, matching the Drawer's original access pattern exactly. `VoucherAnalytics` field names (`total_uses`, `total_discount_given`, `avg_order_value`, `capped_count`, `conversion_rate`) match `lib/types.ts:138-144` verbatim.
