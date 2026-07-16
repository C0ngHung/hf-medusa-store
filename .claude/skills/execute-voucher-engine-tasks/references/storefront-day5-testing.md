# Storefront Day 5 Testing

Supplements `references/testing.md` (Phases 7–8) for scope that includes Thức's Day 5
storefront/checkout tasks. It does not replace backend unit/integration tests — a Day 5 task is
only `Done` when the applicable backend tests from `references/testing.md` still pass **and** the
manual UI verification below confirms the real browser flow.

## Purpose

- Verify the VoucherEngine storefront/checkout integration for Thức's Day 5 tasks.
- Use only after backend Day 2–4 (VoucherEngine service, routes, StackingEngine, rate limiting)
  is implemented — Day 5 tests the storefront wiring on top of that, not the backend logic itself.
- Ignore Hùng's admin-dashboard and rate-limit-cooldown tasks unless they directly block a
  selected Day 5 test (e.g. a rate-limit 429 interfering with the invalid-voucher test) — do not
  audit or implement them as part of this scope.

## Scope — Thức Day 5 task IDs

- `4.1.2` — Kết nối cart với VoucherEngine result
- `4.1.3` — Gắn active voucher state vào cart response
- `4.1.5` — Recalculate cart total sau apply voucher
- `4.1.6` — Recalculate cart total sau remove voucher
- `4.1.8` — Đảm bảo cart state consistency sau cart update
- `4.2.1`–`4.2.7` — Stacking order, cap enforcement, cap explanation (StackingEngine outcomes
  surfaced through the cart/checkout UI)
- `4.3.4`–`4.3.8` — Demo flows: apply voucher, remove voucher, cart-change auto-invalidation,
  checkout/order success usage log, final order + `VoucherUsageLog` verification

Only run this reference when the selected scope intersects this list. A scope of pure backend
Day 2–4 tasks does not need it.

## Required pre-checks

Before starting the manual test matrix, confirm:

- Backend dev server is running (`pnpm backend:dev`).
- Storefront dev server is running on port 8008 (`pnpm storefront:dev`).
- Seed data is available (a seeded customer, at least one active `VoucherConfig`, and products
  with item-level promotions where a test requires stacking).
- `retrieveCart()` (`src/lib/data/cart.ts`) fetches cart metadata — the voucher row is read from
  `cart.metadata.voucher`, not a separate endpoint; if metadata is missing from the retrieved
  cart, the UI tests below cannot pass regardless of backend correctness.
- The unified `DiscountCode` component (`src/modules/checkout/components/discount-code/index.tsx`)
  is the **only** visible promotion/voucher UI reachable from checkout — one input, one Apply
  button, one applied-codes list handling both generic promotion codes and VoucherEngine vouchers.
- No live usage of the legacy `VoucherPanel` (`src/modules/voucher/components/voucher-panel/`) —
  that module may still exist on disk as a leftover, but must not be imported or rendered from any
  route or template. `grep -rn "VoucherPanel" src --include=*.tsx --include=*.ts` (excluding its
  own folder) must return nothing.
- Voucher server actions (`src/lib/data/voucher.ts`) call the correct VoucherEngine endpoints:
  - `POST /store/carts/:id/voucher` (apply, with `?replace=true` for a swap)
  - `DELETE /store/carts/:id/voucher` (remove)
  - `GET /store/customers/me/vouchers` (available-vouchers list)

## Manual UI test matrix

Run each test in a real browser against the running backend + storefront. Do not accept a
typecheck/build pass as a substitute for actually driving the flow.

### A. One unified DiscountCode UI

- **Requirement:** there is exactly one promotion/voucher input on the checkout/cart page.
- **Steps:** open the cart/checkout page; inspect the discount section.
- **Expected result:** a single `data-testid="discount-code"` block with one input and one Apply
  button; no second voucher-specific input or panel anywhere on the page.
- **Mapped Day 5 task IDs:** `4.1.2`, `4.1.3`
- **Evidence to capture:** screenshot of the discount section; DOM query confirming only one
  `discount-input` element.

### B. Invalid voucher error

- **Requirement:** an unknown code produces the Vietnamese `customer_message`, not the English
  `message`, and does not fall back to a generic-promotion attempt.
- **Steps:** enter a code that matches no `VoucherConfig` and is not a valid generic promotion;
  submit.
- **Expected result:** `discount-error-message` shows the Vietnamese customer-facing message;
  cart total is unchanged.
- **Mapped Day 5 task IDs:** `4.1.2`
- **Evidence to capture:** screenshot of the error message; network response body for
  `POST /store/carts/:id/voucher`.

### C. Valid voucher apply

- **Requirement:** applying an active, eligible voucher updates cart total and shows the voucher
  row.
- **Steps:** enter a valid voucher code for the seeded cart; submit.
- **Expected result:** `voucher-applied-row` appears with the correct code/discount; cart total
  reflects the discount; `cart.metadata.voucher` is populated on the next `retrieveCart()`.
- **Mapped Day 5 task IDs:** `4.1.2`, `4.1.3`, `4.1.5`, `4.3.4`
- **Evidence to capture:** screenshot before/after; cart total values; `POST` response body
  (`discount_amount`, `voucher_details`).

### D. Remove voucher

- **Requirement:** removing an active voucher restores the pre-voucher total.
- **Steps:** with a voucher applied (test C), click remove on the voucher row.
- **Expected result:** voucher row disappears; cart total returns to the non-discounted amount;
  `DELETE /store/carts/:id/voucher` returns 200.
- **Mapped Day 5 task IDs:** `4.1.6`, `4.3.5`
- **Evidence to capture:** screenshot after removal; cart total before/after; `DELETE` response.

### E. Replace voucher

- **Requirement:** applying a second voucher while one is already active prompts a replace
  confirmation instead of silently stacking two vouchers.
- **Steps:** with voucher A applied, enter voucher B and submit.
- **Expected result:** `ReplaceConfirmModal` opens with the customer message; confirming calls
  apply with `?replace=true` and voucher B replaces voucher A; cancelling leaves voucher A intact.
- **Mapped Day 5 task IDs:** `4.1.2`, `4.1.3`, `4.1.8`
- **Evidence to capture:** screenshot of the confirm modal; cart state after confirm and after
  cancel.

### F. Generic promotion compatibility

- **Requirement:** Medusa's existing generic promotion codes still work unchanged through the
  same input.
- **Steps:** enter a valid generic promotion code (not a `VoucherConfig` row); submit.
- **Expected result:** code falls through to `applyPromotions` (the `VOUCHER_NOT_FOUND` path) and
  appears as a normal promotion row, not a voucher row.
- **Mapped Day 5 task IDs:** `4.1.2`
- **Evidence to capture:** screenshot of the applied generic-promotion row; confirm no
  `POST /store/carts/:id/voucher` success was involved (only the `404`/not-found attempt then
  `applyPromotions`).

### G. Generic promotion add/remove does not detach voucher

- **Requirement:** adding or removing a generic promotion code while a voucher is active must not
  drop the voucher, since `applyPromotions` is a full-array-replace call.
- **Steps:** apply a voucher (test C), then add a generic promotion code, then remove that generic
  code.
- **Expected result:** the voucher row and its discount persist unchanged through both the add and
  the remove; `cart.metadata.voucher.ephemeral_promotion_id` is preserved in every
  `applyPromotions` call's code array.
- **Mapped Day 5 task IDs:** `4.1.3`, `4.1.8`
- **Evidence to capture:** screenshot after add and after remove; cart total at each step.

### H. Available vouchers modal, including guest 401 graceful handling

- **Requirement:** the "available vouchers" modal lists applicable vouchers for a logged-in
  customer, and degrades gracefully (empty state, not an error) for a guest.
- **Steps:** (1) as a logged-in seeded customer, open the available-vouchers modal; (2) as a
  guest (no auth session), open the same modal.
- **Expected result:** (1) shows the customer's applicable vouchers with one-tap apply via the
  same `submitCode` path as the manual input; (2) shows the ordinary empty-list state ("No
  vouchers available right now."), not an error banner — `GET /store/customers/me/vouchers`
  returning `401` for a guest is caught by `fetchAvailableVouchers()` and resolved to `[]`.
- **Mapped Day 5 task IDs:** `4.1.2`
- **Evidence to capture:** screenshot of the modal for both a logged-in and a guest session;
  network response for the guest case showing `401` with no visible error to the user.

### I. Capped voucher explanation

- **Requirement:** when a voucher's discount is reduced by the global cap, the UI surfaces the
  `cap_explanation` text.
- **Steps:** apply a voucher whose combined discount (with any active item-level promotion)
  exceeds the cap.
- **Expected result:** `discount_capped` is `true` in the apply response; the cap explanation
  banner renders next to the voucher row immediately after apply.
- **Mapped Day 5 task IDs:** `4.2.4`, `4.2.5`, `4.2.7`
- **Evidence to capture:** screenshot of the cap explanation banner; apply response body
  (`discount_capped`, `cap_explanation`, final `discount_amount`).

### J. Cart change auto-invalidates voucher

- **Requirement:** a cart mutation that makes the active voucher ineligible (e.g. removing the
  qualifying item, dropping below minimum order value) revalidates/detaches the voucher without a
  page reload.
- **Steps:** with a voucher applied and eligibility resting on a specific item or subtotal, remove
  or reduce the qualifying line item.
- **Expected result:** on the next cart read, `cart.metadata.voucher` is cleared (or updated) and
  the checkout UI reflects the change — no stale voucher row/discount survives an eligibility
  change.
- **Mapped Day 5 task IDs:** `4.1.8`, `4.3.6`
- **Evidence to capture:** screenshot before/after the cart mutation; cart total and voucher row
  state after the mutation.

### K. Suggested item + item-level promotion + voucher stacking

- **Requirement:** a suggested item carrying an item-level promotion, plus an active voucher,
  stacks in the fixed order (item promotion → voucher → global cap) without producing a negative
  total.
- **Steps:** add a suggested item with an item-level promotion to the cart, then apply a voucher
  sized so combined discounts approach or exceed the cap.
- **Expected result:** cart total matches the StackingEngine's expected integer VND result for the
  scenario (no floats, `Math.floor` rounding); total never goes negative; item promotion amount is
  never reduced to accommodate the cap — only the voucher is.
- **Mapped Day 5 task IDs:** `4.2.1`, `4.2.2`, `4.2.3`, `4.2.6`
- **Evidence to capture:** screenshot of the final cart breakdown; the exact VND totals for item
  promotion, voucher discount, and cart total; cross-check against the StackingEngine fixture in
  `.claude/rules/testing.md` if the scenario matches one of the SRS fixtures.

### L. Checkout/order success creates VoucherUsageLog

- **Requirement:** placing an order with an active voucher increments `usage_count` and appends an
  immutable `voucher_usage_log` row — never on cart-apply, only on `order.placed`.
- **Steps:** complete checkout end-to-end (payment + order confirmation) with a voucher applied.
- **Expected result:** order confirmation page shows the voucher's discount on the final order;
  the backend's `voucher_usage_log` table has exactly one new row for this order/voucher pair;
  `usage_count` on the `VoucherConfig` incremented by exactly one.
- **Mapped Day 5 task IDs:** `4.3.7`, `4.3.8`
- **Evidence to capture:** screenshot of the order confirmation with discount applied; a DB query
  (or admin/API read) of the new `voucher_usage_log` row and the updated `usage_count`.

## Verification commands

Run these in addition to the manual matrix above — none of them substitute for actually driving
the browser flow, but they catch regressions the manual pass might not exercise every time:

- `npx tsc --noEmit -p tsconfig.json` from `apps/storefront/` (or the repo's storefront
  typecheck script) — confirms the voucher types/components still compile.
- A practical storefront build/lint pass: `pnpm --filter @dtc/storefront lint` and
  `pnpm --filter @dtc/storefront build` — catches dead imports, unused exports, and build-time
  errors in the checkout/voucher components.
- `grep -rn "VoucherPanel" apps/storefront/src --include=*.tsx --include=*.ts` (excluding
  `modules/voucher/components/voucher-panel/`) — must return nothing; a hit means a duplicate
  voucher UI has been wired in somewhere.
- `grep -rn "discount-input\|discount-code" apps/storefront/src/modules --include=*.tsx -l` —
  sanity check that only one component tree defines the discount input `data-testid`s.
- Backend tests only when the scope or a discovered blocker touches backend behavior (StackingEngine,
  the voucher routes, or the usage-log subscriber) — run the specific `references/testing.md`
  scripts (`pnpm test:unit`, `pnpm test:integration:http`, etc.) for the affected area; do not
  re-run the full backend suite for a storefront-only change unless something in the manual matrix
  surfaced a backend regression.

## Evidence report format

Report Day 5 results as a table, one row per test executed (not one row per task ID — a test
mapping to multiple task IDs still gets one row):

| Task ID(s)   | Scenario tested                 | Result    | Evidence                 | Blocker (if any) |
| ------------ | ------------------------------- | --------- | ------------------------ | ---------------- |
| 4.1.2, 4.1.3 | A — One unified DiscountCode UI | Pass/Fail | screenshot/log reference | —                |
| ...          | ...                             | ...       | ...                      | ...              |

- **Result** is `Pass`, `Fail`, or `Blocked` — never a checkbox with no run behind it.
- **Evidence** points to what was actually captured (screenshot path/description, response body,
  DB query result) — not "verified" with nothing to show.
- **Blocker** names the specific missing dependency (e.g. "no seeded voucher with min-order-value
  eligibility" or "Hùng's rate-limit task 429s before the invalid-voucher test can reach the
  eligibility check") and which task/owner it's waiting on — do not silently mark a task `Done`
  when a blocker prevented running its test.
