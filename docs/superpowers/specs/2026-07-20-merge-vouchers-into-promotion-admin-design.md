# Merge Vouchers admin UI into the Promotion pages (Option B)

**Date:** 2026-07-20
**Branch context:** `feat/voucher-credit-line-carrier`
**Author:** Cealus (VoucherEngine track)
**Status:** Approved design — pending implementation plan

## Goal

Remove the standalone VoucherEngine admin surface (`/app/vouchers` route + "Vouchers"
sidebar item) and manage vouchers entirely from the native Medusa **Promotion** pages.
This continues the Decision H/I direction ("thin layer over native Promotion"): the
voucher-only fields already live on the Promotion detail page via the "Voucher settings"
widget; this change folds the remaining voucher-only admin surface (the filtered list +
per-voucher analytics) into the same Promotion pages, so the admin has a single place to
manage promotions and vouchers.

## Scope

**Admin UI only** (`apps/backend/src/admin/`). No changes to:

- API routes (`GET/POST/PUT/DELETE /admin/vouchers*`, `GET /admin/vouchers/:id/analytics`) — kept as-is.
- Workflows, steps, services, migrations, seed.
- Backend tests (`voucher-admin.spec.ts` list read-through 23/23 unaffected because the
  `GET /admin/vouchers` endpoint stays).

## Framework constraint (verified)

Medusa admin only allows **widget injection** into predefined zones + full custom routes.
The native Promotions **list** page is a core route: you cannot add columns or per-row
action buttons to its table. Available promotion zones (verified against the installed
`@medusajs/dashboard`): `promotion.details.before/after`, `promotion.details.side.before/after`,
`promotion.list.before/after`. Therefore the voucher list cannot be merged into the native
promotion table; the accepted trade-off (Option B) is to drop the filtered voucher list
entirely and surface analytics on the promotion detail page instead.

## Design

### 1. Delete the standalone Vouchers route

Delete `src/admin/routes/vouchers/page.tsx`. Its `defineRouteConfig({ label: "Vouchers", ... })`
export is what registers both the `/app/vouchers` route and the "Vouchers" sidebar entry
under Extensions — removing the file removes both.

The page's "create" CTA was already only a redirect to `/promotions/create` (voucher creation
happens through the native Promotion wizard + the settings widget), so no create/edit
capability is lost.

### 2. Analytics → inline widget on Promotion detail

New widget `src/admin/widgets/voucher-analytics.tsx`, zone **`promotion.details.after`**
(full-width block below the main promotion content).

- Eligibility gate identical to the settings widget: only `data.type === "standard" &&
data.is_automatic !== true` triggers a fetch.
- Reuse `useVoucherByPromotion(data.id)` to resolve whether this promotion is a voucher and
  get its id.
- **Not a voucher → render `null`** (no visible block, no analytics fetch).
- Is a voucher → render an inline stat grid using `useVoucherAnalytics(voucher.id)`:
  Total uses, Total discount given, Avg. order value, Capped count, Conversion rate
  (the same five metrics the drawer showed).
- Loading / error states rendered inline (Text muted / Text error), mirroring the drawer.

### 3. Dead-code cleanup

- Delete `src/admin/components/voucher-analytics-drawer.tsx` — superseded by the inline widget.
- Remove the `useVouchers` (list) hook from `src/admin/lib/api.ts` — its only consumer was
  the deleted page. Keep `useVoucherAnalytics` and `useVoucherByPromotion` (still used by the
  analytics + settings widgets).
- Remove any now-unused imports/types that only served the list page (e.g. list-specific
  formatting helpers if not reused).

### 4. Unchanged

- `src/admin/widgets/voucher-settings.tsx` (zone `promotion.details.side.after`) — kept as-is.
- All backend API/workflow/test code.

## Resulting UX

- Sidebar no longer shows "Vouchers" under Extensions.
- Opening a Promotion that is a voucher: "Voucher settings" in the right column (enable/edit/
  disable + cap/min-order/per-user/scope/stacking), and a "Voucher analytics" block below the
  main content.
- Opening a normal (non-voucher) Promotion: neither voucher block renders meaningfully (settings
  widget shows the "not usable as voucher" hint for non-eligible types; analytics renders nothing).
- Trade-off accepted: no single filtered "all vouchers" overview list.

## Testing / verification

- No backend test changes.
- `pnpm build` (or `medusa build`) — admin bundle compiles with 0 errors after the deletions
  and the new widget.
- `npx tsc --noEmit` — no new type errors beyond the 2 known pre-existing ones.
- Manual admin smoke test:
  1. Sidebar has no "Vouchers" item.
  2. Open a voucher-enabled promotion (e.g. `TESTATTACH20`) → "Voucher analytics" block shows
     stats; "Voucher settings" still works.
  3. Open a non-voucher promotion (e.g. `DEMO-CAP-CONFLICT-40`) → no analytics block.
  4. Navigating directly to `/app/vouchers` 404s / is gone.

## Out of scope (explicitly not doing)

- Adding a filtered voucher list widget at `promotion.list.after` (rejected: two tables on one
  page, visually redundant — Option C).
- Any backend endpoint removal (the `GET /admin/vouchers` list endpoint stays even though the
  frontend list is gone, to keep tests green and avoid backend churn).
