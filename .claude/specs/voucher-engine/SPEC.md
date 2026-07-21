# VoucherEngine — Developer Implementation Specification

> **Status:** Planning artifact. **Do not implement until manually reviewed and approved.**
> **Feature:** Voucher at Checkout (`voucher-engine` module)
> **Platform:** MedusaJS **2.16.0** (verified — `apps/backend/package.json`)
> **Repository:** `hf-medusa-store` (pnpm + Turborepo monorepo; backend = `@dtc/backend`)
>
> **Source-of-truth inputs (all read):**
>
> - Solution Flow: `docs/voucher-engine/voucher-engine.solution-flow.completed.md` (V2, approved)
> - Diagrams: `docs/voucher-engine/diagrams/d01..d07`
> - SRS: `docs/SRS_SuggestiveSelling_Voucher_v1.0.md` (v1.0)
> - Project rules: `CLAUDE.md`, `.claude/rules/project-conventions.md`
> - Medusa backend patterns: `medusa-dev` plugin skill `building-with-medusa`
>
> **Legend used throughout this document:**
>
> - `[NEEDS_VERIFICATION]` — a MedusaJS API, event, payload, or integration mechanism that this spec references but that was **not** confirmed against installed source in this repo. Must be verified against `node_modules/@medusajs/*` or MedusaDocs MCP before the referenced code is written.
> - `BLOCKED: Pending Decision` — an unresolved decision that blocks implementation of the affected slice. Implementation of that slice must not start until the decision is signed off.
> - `[CONFLICT]` — the SRS or Solution Flow disagrees with the actual codebase / Medusa v2 capabilities. Recorded, not silently changed. See §18.
>
> **Verification method for this revision pass (2026-07-13):**
>
> - **Reachable and verified** — repository source under `apps/backend/src/**` and `apps/backend/package.json`, inspected with the built-in `Read` tool (exact paths). Every fact tagged _"verified (repo)"_ below cites the file read in this pass.
> - **Reachability of installed `@medusajs/*` (updated by pass 2 below).** `Grep`/`Glob` remain disabled and policy forbids Bash search, but the **two direct-dependency packages `@medusajs/medusa` and `@medusajs/framework` are top-level symlinks and their `dist/**`is readable by exact-path`Read`** — pass 2 used this to verify the cart/order/promotion mechanisms from shipped API route code. Only the **transitive** packages (`@medusajs/cart|order|promotion|core-flows|utils|types`) sit behind version-hashed `.pnpm/`paths that can't be located without`Glob`/`find`; facts that live only there remain `[NEEDS_VERIFICATION]`. See §19.2 for the exact package each residual item must be checked against.
> - Where a _strategy_ can be finalized from the approved Solution Flow + SRS without touching framework internals (concurrency approach, redemption atomicity approach, Redis policy, validation split, sync-vs-subscriber revalidation), this pass **resolves the decision** and isolates the remaining framework detail as a scoped `[NEEDS_VERIFICATION]` so the surrounding slice is no longer wholesale-blocked.
>
> **Verification pass 2 (2026-07-13) — installed Medusa source now partially reachable.** `Grep`/`Glob` are still disabled, but `node_modules` **is installed** and the two direct-dependency packages `@medusajs/medusa` and `@medusajs/framework` are top-level symlinks, so their compiled `dist/**` files are readable by exact-path `Read`. This unblocked the three cart/order/promotion gaps (§14.2, §10.7, §13) via the **shipped store/admin API route handlers and query-configs** inside `@medusajs/medusa/dist/api/**`, which are authoritative. Files inspected this pass (all under `apps/backend/node_modules/@medusajs/`):
>
> | File                                                   | What it verified                                                                                                                                                                                                                                                                                                                  |
> | :----------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
> | `medusa/package.json`, `framework/package.json`        | 2.16.0; core modules (`@medusajs/cart`, `order`, `promotion`, `core-flows`, `types`, `utils`) are **transitive** deps of `@medusajs/medusa` (present only behind pnpm peer-hashed `.pnpm/` dirs → **not enumerable without `Glob`/`find`**). `framework/utils` & `framework/types` re-export `@medusajs/utils`/`@medusajs/types`. |
> | `medusa/dist/api/store/carts/[id]/complete/route.js`   | Cart completion runs `completeCartWorkflowId`; returns an **order** via `query.graph({entity:"order", filters:{id: result.id}})` (⇒ `result.id` = order id); native completion concurrency guard `transaction.hasFinished()` → `MedusaError.CONFLICT`.                                                                            |
> | `medusa/dist/api/store/carts/[id]/promotions/route.js` | Discounts enter the cart via `updateCartPromotionsWorkflowId` + `PromotionActions.ADD/REMOVE/REPLACE` (`promo_codes`).                                                                                                                                                                                                            |
> | `medusa/dist/api/store/carts/[id]/line-items/route.js` | `addToCartWorkflowId`; cart mutations are workflows (revalidation trigger surface).                                                                                                                                                                                                                                               |
> | `medusa/dist/api/store/carts/query-config.js`          | Authoritative cart fields: computed totals + `promotions.*` + `items.adjustments.{amount,promotion_id,code}` + `items.product_id`/`items.product.categories.id` (§10.7).                                                                                                                                                          |
> | `medusa/dist/api/store/orders/query-config.js`         | Order carries same computed totals + `*items.adjustments` + `metadata` (⇒ cart adjustments propagate to order).                                                                                                                                                                                                                   |
> | `medusa/dist/api/admin/promotions/query-config.js`     | Promotion fields: `code, type, is_automatic, limit, used, status, application_method.{target_rules,buy_rules}, rules.{attribute,operator,values}, campaign.budget`.                                                                                                                                                               |
> | `medusa/dist/api/store/carts/helpers.js`               | `refetchCart` via REMOTE_QUERY entryPoint `"cart"`.                                                                                                                                                                                                                                                                               |
> | `medusa/package.json` deps                             | **`@medusajs/locking`, `@medusajs/locking-postgres`, `@medusajs/locking-redis`** present ⇒ first-class **Locking Module** (`Modules.LOCKING`) available for concurrency.                                                                                                                                                          |     | **`@medusajs/locking`, `@medusajs/locking-postgres`, `@medusajs/locking-redis`** present ⇒ first-class **Locking Module** (`Modules.LOCKING`) available for concurrency. |
>
> Still **not reachable** (in transitive `@medusajs/utils`/`@medusajs/core-flows`/cart-order-promotion module internals): the exact successful-order **event id string**, whether `completeCartWorkflow` exposes a **hook**, the `createPromotions`/`addPromotionsToCart` workflow **input signatures**, and the precise discount-inclusion **semantics** of `item_subtotal` vs `item_discount_total`. These are now narrowly scoped `[NEEDS_VERIFICATION]` (§19.2), not whole-slice blockers.

---

## Approved Decisions (2026-07-14)

The items below were pending or in conflict in earlier passes of this SPEC. They are **approved for this project and MVP timeline** and are no longer listed as unresolved conflicts — every section they touch has been updated below to match. See `.claude/progress/voucher-engine-progress.md` (2026-07-14 entries) for the evidence that motivated each decision.

- **Decision A — Error contract precedence.** The approved `docs/API_CONTRACT_Suggestive_Voucher_Cart.md` (error codes, HTTP statuses, Vietnamese customer messages, response envelope wording) is authoritative wherever it conflicts with this SPEC's own illustrative tables. §8 has been rewritten to match; the superseded illustrative table is removed. Production code (`workflows/voucher-engine/lib/errors.ts`) already follows the approved contract and needs no change for this decision.
- **Decision B — Voucher scope persistence.** `VoucherConfig.applicable_product_ids` / `applicable_category_ids`, stored as nullable JSON arrays directly on `VoucherConfig`, is the **approved MVP architecture** — not a stopgap awaiting sign-off. No `VoucherScope` model and no Link Module wiring for product/category scope. Both arrays empty or null = the voucher is unscoped; when scope exists, product/category matching uses **OR** semantics. `toVoucherScope` (`workflows/voucher-engine/lib/mappers.ts`) remains the migration seam if normalization is ever required later. §5.1, §5.4, §6, §7, §9.1, §10.7, §11.6/§11.7/§11.10, §16.2, §18 (CONFLICT-2), §19.1 (PD-13), §19.2 (#4), §20, §22 are updated below; CONFLICT-2/PD-13 are now **RESOLVED**, not open items.
- **Decision C — Canonical Promotion reference.** `VoucherConfig.promotion_id: text | null` is a required field referencing the canonical Medusa Promotion linked to the voucher for native Promotion/Campaign management, admin visibility, analytics cross-reference, and as a template for natively-expressible fields. It is populated by the Promotion-first `createVoucherWorkflow` and backfilled for existing vouchers. The canonical Promotion is **not attached to carts** and is **not mutated per cart**; apply/remove/revalidate use the ephemeral, cart-specific Promotion transport described in Decision G. Voucher lookup and apply flows must read the server-side persisted `promotion_id` only when they need the canonical Promotion/template; client input is never trusted for it. A migration/backfill and tests are required if the current model lacks this field or link. The read-only Link from `VoucherConfig.promotion_id` to the Promotion module (§6) is unaffected by Decision B, which concerns only product/category scope.
- **Decision D — VoucherUsageLog audit snapshot.** The full point-in-time audit schema already specified in §5.2 — including `currency_code`, `voucher_code`, `discount_type`, `discount_value`, `raw_voucher_discount`, `voucher_discount_after_voucher_cap`, `final_voucher_discount`, `cap_percentage_bps`, `original_subtotal`, `item_promotion_discount`, plus the pre-existing `voucher_id`/`customer_id`/`order_id`/`discount_applied`/`was_capped`/`original_discount`/`applied_at` — is confirmed as the **approved requirement**, including the unique `(voucher_id, order_id)` constraint. The currently shipped `voucher-usage-log.ts` model has only a subset of these fields and no unique constraint; extending it is required Day-4/5 work (migration + tests), not a redesign.
- **Decision E — Store voucher route shape (route param + query flag, not body).** The store apply/remove voucher routes are `POST /store/carts/:id/voucher` and `DELETE /store/carts/:id/voucher`. The **cart id is the route `:id` param** (read server-side as `req.params.id`), **not** a `cart_id` body field. Replacement of an already-active voucher is confirmed via the **query flag `?replace=true`** (validated by a separate `ApplyVoucherQuerySchema`), **not** a `confirm_replace` body field. This is governed by the approved contract **independently of Decision A**: the API contract §7.7 ("Chuẩn hoá route theo Medusa … dùng `/store/carts/:id/…`") and §1.3 explicitly specify routing/transport, which is a distinct authority scope from Decision A's error-codes/HTTP/messages/envelope scope. A 2026-07-14 session mistakenly reverted the route path back to `/store/cart/voucher` reasoning that "route paths aren't in Decision A's scope" — that reasoning missed that the contract separately governs routing via §7.7; this decision corrects it. **Evidence:** contract §1.3 (lines 358/404) + §7.7 (line 815); shipped `apps/backend/src/api/store/carts/[id]/voucher/validators.ts` (body `ApplyVoucherSchema { code }` `.strict()` with **no** `cart_id`; query `ApplyVoucherQuerySchema { replace }`; empty `RemoveVoucherSchema {}`) and its unit test explicitly rejecting `cart_id`/`confirm_replace` in the body; native Medusa `carts/[id]/promotions/route.js` reading `cart_id: req.params.id` (verified). Business logic (V1–V8 order, discount calc, global cap, replace-must-validate-new-before-removing-old) is unchanged — only transport (route path, cart-id source, replace mechanism) is reconciled. §4.1/§4.2, §8.1/§8.2, §8.4 (VOUCHER_REPLACE_REQUIRED row), §9.0, §11.1, §12, §14.1 ([NV#7] narrowed), §23.5 are updated below.

- **Decision F — "My Vouchers" store route path (`/store/customers/me/vouchers`, auth-optional).** The customer-facing voucher list route is `GET /store/customers/me/vouchers` (plural `customers`, with the `/me/` segment) — **not** the `GET /store/customer/vouchers` that a prior SPEC pass listed in §12. This is the same class of routing reconciliation as Decision E and is governed by the same authority: the approved contract explicitly specifies the path, independently of Decision A. The route is **auth-optional**: an authenticated customer gets their CRM-assigned vouchers; a **guest gets `200 { "vouchers": [] }`, not `401`**. The current customer id is read server-side from `req.auth_context?.actor_id` (never a client-supplied id). **Evidence:** contract `docs/API_CONTRACT_Suggestive_Voucher_Cart.md` line 419 (`GET /store/customers/me/vouchers **[C]**`) + line 421 ("Guest → `{ "vouchers": [] }`") and response shape lines 423–436 (verified); native Medusa ships the `/store/customers/me/*` convention — `dist/api/store/customers/me/{route.js,addresses}` exists and `customers/me/route.js` reads the customer id as `req.auth_context.actor_id` (verified). No production code exists yet for this route (`src/api/store/customer/` and `src/api/store/customers/` both absent — verified), so this is a clean rename with no shipped-code conflict. **Caveat for the implementer:** native `/store/customers/me/*` routes are authenticated (401 for guests); this route must instead be wired auth-optional so guests get `200 {vouchers:[]}` per the contract — do not copy the native `/me/` auth guard naively. §12 and the §7 file layout are updated below; see also §18 CONFLICT-7. This does not change VoucherEngine business logic — transport/routing only.

- **Decision G — Apply-time discount carrier = an ephemeral, cart-specific Promotion (not the shared `VoucherConfig.promotion_id`).** An earlier pass of §14.2-A (superseded here) assumed the discount could be applied by passing a caller-supplied override amount (`final_voucher_discount`) into `updateCartPromotionsWorkflow` while reusing the voucher's single shared backing Promotion. **Verified against installed 2.16.0 source this assumption is false, and the shared record cannot carry a cart-specific capped amount:**
  - `updateCartPromotionsWorkflow`'s input is `{ cart_id?, cart?, promo_codes?: string[], action?, force_refresh_payment_collection? }` — **no override-amount field** (`@medusajs/core-flows/.../cart/workflows/update-cart-promotions.d.ts`, verified).
  - The adjustment amount is always derived from the Promotion's own stored `application_method.value`: `const promotionValue = applicationMethod?.value ?? 0` (`@medusajs/promotion/dist/utils/compute-actions/line-items.js:37`, verified), fed to `calculateAdjustmentAmountFromPromotion` (`@medusajs/utils/dist/totals/promotion/index.js`, verified). There is no caller override anywhere in the chain, and the `setPromotionContext` hook only influences rule-matching context, not the amount (verified).
  - A per-voucher shared Promotion is used concurrently by every cart applying that code; mutating its `application_method.value` to one cart's capped amount would corrupt all other carts (violates SEC-01/INT-03/Rule-18). Ruled out.
  - **`cart.credit_lines` was evaluated and rejected as the carrier:** credit lines are payment/credit semantics, not voucher discounts; they do not feed `cart.discount_total`/`items.adjustments`, and the SRS does not require credit/payment behavior. VoucherEngine must not use credit lines.
  - **Selected mechanism (verified expressible):** at apply, VoucherEngine runs V1–V8 + §10 (incl. global cap) → `final_voucher_discount`, then **creates a fresh, ephemeral, cart-scoped Promotion** via `createPromotionsWorkflow` with `application_method: { type: "fixed", target_type: "items", allocation: "across", value: final_voucher_discount, currency_code: <cart currency>, target_rules?: <best-effort scope narrowing, see below> }`, `is_automatic: false`, and a unique cart-specific `code` (e.g. `__VE_<VOUCHER_CODE>_<CART_ID>_<nonce>`; include a nonce/timestamp so a failed-compensation orphan can't collide with a re-apply). Fixed+ACROSS distributes the value proportionally across the targeted items and **sums to exactly `value`** (`getPromotionValueForFixed`, `@medusajs/utils/dist/totals/promotion/index.js:12-19`, verified) — **the total equals `value` regardless of which discountable items it spreads over** (even with no `target_rules`, `getValidItemsForPromotion` returns all discountable items and the sum is still `value`). It is attached via `updateCartPromotionsWorkflow ADD [ephemeral code]`, so the discount lands in the authoritative `items.adjustments`/`discount_total` (§14.2-A(A) premise preserved). The ephemeral Promotion's `id`+`code` are recorded in `cart.metadata.voucher`; **that** is the adjustment identifier used by `verifyCartTotalsStep`, remove, and revalidate — **not** `VoucherConfig.promotion_id`.
  - **Rule 7 (voucher applies only to eligible items) is enforced in the §10 calculation basis, NOT relied on from `target_rules`.** `final_voucher_discount` is already computed only over the resolved eligible post-promotion subtotal, so the _amount_ is correct by construction; the ephemeral promotion is only the transport. `target_rules` MAY be set as best-effort per-line attribution narrowing, but Decision B's scope is **product_id OR category_id**, and it is **unverified** whether promotion `target_rules` (AND-combined attribute predicates) can express an OR-across-two-attributes or enumerate explicit line-item ids (NV#16). If they cannot, omit `target_rules` (or use only what is expressible) — the discount total is unaffected; only the per-item transport attribution may be broader than the eligible set, which does not change any authoritative total. **Never depend on `target_rules` for Rule-7 correctness.**
  - **`VoucherConfig.promotion_id` (Decision C) is retained but re-scoped to a canonical/reference role only.** The promotion it points at is provisioned by `createVoucherWorkflow` for admin visibility, analytics cross-reference, and as the template whose `code`/`type`/`value`/`currency` the ephemeral apply-time promotion is derived from. It is **never attached to a cart**, so its native `rules` (V5 min-order) / `limit` (V3 global) / `target_rules` (V6 scope) **do not enforce anything at apply** — VoucherEngine's V1–V8 pipeline is the sole enforcer. The field, migration, and read-only Link (Decision C, §6) are unchanged, so shipped Day-4 model work is not reworked.
  - **Redemption identity (verified channel).** Because the cart adjustment now carries the _ephemeral_ `promotion_id`/`code` (compute-actions sets `code: promotion.code`, verified), it can no longer be mapped back to `VoucherConfig` via `promotion_id`. Instead redemption reads the voucher from `order.metadata.voucher.voucher_id`, which is verified to propagate: `completeCartWorkflow` copies `metadata: cart.metadata` into the created order (`complete-cart.js:404`, verified). `CreatePromotionDTO` has **no** `metadata` field (verified), so storing identity on the ephemeral Promotion is not available — `order.metadata` is the channel. This **reverses** the earlier "no `cart.metadata` propagation dependency" stance of §14.2-A(B)/§13.3, which is acceptable now that the propagation is source-verified.
  - **Cleanup.** The ephemeral Promotion is deleted on remove (§11.2) and on revalidate-replace (§11.3, old ephemeral deleted before the new one is created). Post-order cleanup timing is an open sub-detail (§19 UQ) — deletion must occur only after redemption is recorded and must not disturb the order's copied `items.adjustments`.
  - Business logic is unchanged (V1–V8 order, §10 math, replace ordering, 50% cap) — only the transport/persistence of the already-computed number changes. **Evidence files (all installed `@medusajs/*` 2.16.0):** `core-flows/dist/cart/workflows/update-cart-promotions.{js,d.ts}`, `core-flows/dist/promotion/workflows/create-promotions.d.ts`, `core-flows/dist/cart/workflows/complete-cart.js`, `promotion/dist/utils/compute-actions/line-items.js`, `utils/dist/totals/promotion/index.js`, `utils/dist/totals/cart/index.js`, `types/dist/promotion/common/{promotion,application-method}.d.ts`. §14.2-A, §5.0/§5.1, §11.1 (step 9), §11.2, §11.3, §11.10, §13.3, §18 CONFLICT-1, §19 (NV#3 resolved, PD-01) are updated below to match.

- **Decision H — Corrected item-promotion interpretation (2026-07-17) — SUPERSEDED (2026-07-20).** In this project, SRS "item-level promotion" means the **Price List sale price from Medusa Pricing Module**, not a native Promotion Module line-item adjustment, unless a future requirement explicitly says otherwise. VoucherEngine reads cart `items.unit_price`, which Medusa 2.16 populates from `variant.calculated_price.calculated_amount`; `compare_at_unit_price` is only the pre-sale reference price. VoucherEngine must never mutate Price List data or derive its own sale price. Historical CONFLICT-8 findings about coexisting native percentage Promotions remain useful defensive context only; they are not a default SRS requirement and must not drive a credit-line/payment design.
  **SUPERSEDED (2026-07-20) — Decision H-2.** Per explicit business correction, "item-level promotion" (VOUCH-003) now means **a native automatic Promotion Module adjustment applied to cart items** (`is_automatic=true`), NOT the Price List sale price. Required order: (1) original cart subtotal, (2) native automatic item-level Promotions apply first, (3) their adjustment amounts are preserved/never reduced, (4) Voucher discount is calculated on the eligible post-promotion subtotal, (5) `max_discount_amount` applies, (6) the global `max_discount_percentage` cap applies, (7) if capped, only the Voucher discount is reduced — the automatic Promotion discount must never shrink or reverse. Price List pricing stays outside VOUCH-003's scope. **This reverses Decision H, and the reversal is a conscious, explicit one** — Decision H (this same section), CONFLICT-8/PD-15 below, and `rebuild-decisions.md`'s decision 4 all recorded the opposite interpretation on the same prior date (2026-07-17); see CONFLICT-8/PD-15 below for what this means for the ephemeral carrier, which is **not** fixed by this same change (see §18 CONFLICT-8 and the Known Implementation Gaps section for the still-open blocker).
- **Decision I — No credit-line/payment carrier.** `cart.credit_lines`, payment credit, customer credit, or any custom credit/payment mechanism is out of scope and must not be used for vouchers. Voucher savings appear through the applied voucher behavior and storefront/CRM-facing displays, not as a payment/credit feature. Tax-specific credit-line questions are therefore irrelevant for this VoucherEngine SRS.
- **Decision J — V7 segment validation is mandatory when configured.** `user_segment_conditions = null` means no segment restriction. If `user_segment_conditions` is present, VoucherEngine must evaluate the configured conditions against the approved Customer/CRM segment source and fail fast with `VOUCHER_SEGMENT_NOT_ELIGIBLE` when the customer does not qualify. V7 cannot be skipped when segment conditions are configured.
- **Decision K — Admin API/UI scope follows SRS §6.2.** SRS requires admin voucher **create** and **analytics**; a read-only list route is allowed to support transitional dashboards and any Promotion-context voucher list. Update/deactivate voucher routes are not required by the SRS and must not be added unless a later requirement explicitly approves them. The native Medusa **Promotions** area is the long-term primary Admin surface:
  - **Create:** Promotions exposes a custom "Create Voucher" action that opens `/promotions/create-voucher`, submits through the existing Promotion-first `POST /admin/vouchers`, and redirects to the canonical Promotion detail page (`/promotions/:promotion_id`) on success.
  - **Detail:** Promotion Detail contains a read-only VoucherConfig widget (UI-2A) and a Voucher analytics widget (UI-3). Native Promotion/Campaign-owned fields remain editable only through native Promotion/Campaign UI and must not become writable again in the VoucherConfig widget.
  - **Global config:** `DiscountCapConfig` remains a separate singleton admin API because SRS requires one active global cap record; its UI belongs on a global settings/admin surface, never inside one Promotion Detail widget.
  - **Discoverability:** voucher discovery must be resolved by either the native Promotion list or, if that is insufficient, a Promotion-context route such as `/promotions/vouchers` (not a separate long-term sidebar domain).
  - **Legacy:** the current standalone `/vouchers` page is transitional and may be removed only after the parity checklist in §20.2 is satisfied. Editing VoucherConfig-owned fields after creation is deferred until an update API and workflow are explicitly approved.

---

## Known Implementation Gaps & Correction Order (2026-07-20 review)

A SPEC-vs-code review on 2026-07-20 re-verified the codebase against the decisions above. The
design/scope decisions (A–K) all check out against shipped code. Three **implementation** gaps
were found — these are not SPEC changes or new design decisions; the required behavior was already
specified above (Decision J, Decision F, §14.1). The code has simply not caught up yet.

1. **Rate-limit cooldown mismatch — implementation fix, not a design change.** §14.1 already
   specifies a 1800s (30-minute) cooldown after 5 failed attempts within a 900s (15-minute) window.
   Current code: `COOLDOWN_S = 60` in `src/modules/voucher-engine/constants.ts` — 60 seconds, not 1800. The line already carries its own `// seconds => fix to 60*30 later` acknowledgment.
2. **V7 segment validation is a no-op stub — implementation gap.** Decision J / §9.4 require: null
   `user_segment_conditions` passes; configured conditions must be evaluated against the approved
   CRM/customer segment source and fail closed with `VOUCHER_SEGMENT_NOT_ELIGIBLE` otherwise.
   Current code: `v7Segment` in `src/workflows/voucher-engine/lib/validators.ts` unconditionally
   `return`s `PASS` regardless of whether conditions are configured.
3. **My Vouchers is not CRM/customer-assignment sourced — implementation gap.** Decision F / §12
   already require the current customer's list to reflect their CRM-assigned/eligible vouchers,
   with guests still getting `200 { vouchers: [] }`. Current code:
   `src/api/store/customers/me/vouchers/route.ts` lists **every** currently active/valid voucher
   (the same set discoverable by entering any code) for any authenticated customer — not a
   per-customer assignment. The route's own header comment documents this as an MVP scope note.
4. **V7 and My Vouchers share one unresolved dependency.** Both gaps above trace back to the same
   missing piece: no approved CRM/customer assignment or segment data source is wired into this
   codebase yet. This is one piece of work, not two. **Do not invent a new data model** (e.g. an ad
   hoc customer-segment or voucher-assignment table) for this unless it is explicitly approved —
   confirm the approved CRM/customer source first.

**Correction order:**

1. Fix `COOLDOWN_S` from `60` to `1800` (`src/modules/voucher-engine/constants.ts`).
2. Decide/wire the approved CRM/customer assignment or segment data source (gates items 3–4).
3. Implement V7 segment validation (`v7Segment`) against that source.
4. Filter My Vouchers (`GET /store/customers/me/vouchers`) from that same source.
5. _Later/deferred Admin UI migration:_ UI-1 Promotion-context create route/action; UI-2A read-only
   Promotion-detail VoucherConfig widget; UI-2C voucher discoverability/list-parity decision; UI-3
   Promotion-detail analytics widget; UI-4 global DiscountCapConfig surface; Backend-5A/5B
   ephemeral-visibility verification and cleanup; optional UI-5C warning/label fallback; UI-2B
   editable VoucherConfig widget only after an approved update API/workflow; UI-6 legacy `/vouchers`
   retirement only after parity (§20.1/§20.2).

**Unchanged by this review** (do not revisit without new business input): no credit lines,
payment credit, or customer credit (Decision I); the ephemeral per-cart Promotion transport
(Decision G) — **not** replaced by the 2026-07-20 Admin unified-model implementation;
`DiscountCapConfig` remains a singleton admin API updated in place (§11.9).

**Reopened by a LATER 2026-07-20 business correction (after this review):** item-level promotion no
longer means Price List sale price — see Decision H-2 above, which reverses Decision H. CONFLICT-8/
PD-15 are correspondingly REOPENED as an unresolved backend blocker, not historical/non-default
scope — see §18/§19.1. The Admin unified model (Enable-on-existing-Promotion flow,
`POST /admin/promotions/:promotion_id/voucher-config`) was approved and implemented the same day,
independently of the carrier fix — see the Admin unified-model section below for what changed and
what remains.

---

## Admin unified model — implemented 2026-07-20 (Decision K-2)

Supersedes Decision K's atomic-only admin flow with the approved unified model: Voucher is not a
separate long-term Admin domain. All creation starts from the native Promotion; Promotion Detail
gets a "VoucherEngine Settings" section with an "Enable Voucher" action for eligible, unlinked,
non-automatic Promotions.

- **Classification** (matches Medusa's own `is_automatic` semantics, no new field required):
  `is_automatic=true` -> Automatic Promotion, cannot enable VoucherEngine. `is_automatic=false`,
  unlinked -> eligible candidate. `is_automatic=false`, linked -> Voucher.
- **New workflow + API:** `attachVoucherConfigWorkflow`
  (`workflows/voucher-engine/admin/attach-voucher-config.ts`), backing
  `POST /admin/promotions/:promotion_id/voucher-config` (+ `GET`, same path, read-only lookup).
  Eligibility gate (`admin/steps/assert-promotion-voucher-eligible.ts`): rejects
  `is_automatic=true`, missing/empty code, `VEPH-*` codes, unsupported `application_method.
target_type` (only `items`/`order` allowed — `shipping_methods` rejected), an already-linked
  VoucherConfig, inactive Promotion status, and an expired linked Campaign. Lock-serialized
  (`acquireLockStep`/`releaseLockStep`, keyed per `promotion_id`) plus a DB-level partial unique
  index on `voucher_config.promotion_id` (`Migration20260720120000.ts`) as the actual concurrency
  guarantee — an application-level duplicate check alone cannot prevent a two-concurrent-request
  race.
- **Source-of-truth fix:** `lookupVoucherStep` (`steps/lookup-voucher.ts`) now re-resolves
  `code`/`discount_type`/`discount_value`/`is_active`/`valid_from`/`valid_to` from the linked
  canonical Promotion (+`application_method`+`campaign`) on every call — including cache hits — via
  `derivePromotionCacheFields` (`admin/lib/derive-voucher-config-cache-fields.ts`, the inverse
  mapping of `build-promotion-input.ts`'s `buildPromotionData`). `VoucherConfig`'s own columns for
  these fields are kept (not physically dropped — no approved column-removal migration exists) but
  are no longer trusted at runtime; only VoucherEngine-owned fields (`min_order_value`,
  `max_discount_amount`, scope, `stackable_with_promotions`, `per_user_limit`, `usage_limit`,
  `usage_count`, `user_segment_conditions`) remain VoucherConfig-authoritative. **Known residual
  limitation:** the initial find-by-code lookup still indexes on `VoucherConfig.code` as a synced
  cache column — renaming a linked Promotion's code via the native UI after Enable does not yet
  propagate to this lookup key (only the VALUES read once a row is found are Promotion-authoritative,
  not yet the lookup key itself). Product/category scope stays the sole responsibility of
  `VoucherConfig.applicable_product_ids`/`applicable_category_ids` — native `target_rules` are never
  written for voucher scope (`target_rules` combine with AND semantics only, verified in the
  Phase 1 scope spike, cannot express product-OR-category — see `rebuild-decisions.md`).
- **Widget:** `admin/widgets/promotion-detail-voucher-config-widget.tsx` (zone
  `promotion.details.side.before`) now renders three states — ineligible (reason shown, no toggle),
  eligible-unlinked (`Enable Voucher` opens `enable-voucher-form-modal.tsx`, VoucherEngine-owned
  fields only), and linked (existing read-only display, unchanged). No dashboard fork, no native
  route override.
- **Transitional compatibility:** the atomic `POST /admin/vouchers` + `createVoucherWorkflow` +
  `admin/routes/promotions/create-voucher/page.tsx` flow is kept unchanged as a fallback until the
  Enable flow reaches parity — not retired by this change.
- **Explicitly NOT in scope of this change:** the CONFLICT-8/PD-15 carrier ordering blocker (see
  above) — this Admin work does not touch `apply-voucher.ts`/`remove-voucher.ts`/
  `revalidate-voucher-on-cart-change.ts`/`verify-cart-totals.ts`.

---

## 0. Table of Contents

1. Scope & Goal
2. Non-Negotiable Rules (copied verbatim from Solution Flow §10)
3. Architecture & Conventions (verified from codebase)
4. Module Layout — files to create / modify
5. Data Models
6. Links (Link Module)
7. Service Layer
8. DTOs, Validators & Error Contract
9. Validation Pipeline (V1 → V8) — 3 contexts: apply / cart-change revalidation / redemption
10. Discount Resolution (calculation contract + worked examples)
11. Workflows & Steps (incl. §11.5 sync-vs-subscriber, §11.6 admin create, §11.9 discount-cap singleton, §11.10 step contracts)
12. API Routes
13. Subscribers & Events
14. Redis Usage, Rate Limiting, Idempotency, Concurrency
15. Migrations
16. Test Plan
17. SRS Traceability Matrix (+ §17.1 reverse test-ID map)
18. Conflicts (SRS/Solution Flow vs codebase)
19. Pending Decisions register (PD-01 … PD-14) + `[NEEDS_VERIFICATION]` index
20. Implementation Order
21. Verification Commands
22. Implementation Readiness (Ready / Ready-after-verification / Blocked) + §22.1 SRS Compliance Summary
23. Code-Level Implementation Blueprint — Focus Tasks (money, discount calc, cart-context, verify-totals, store route)

---

## 1. Scope & Goal

VoucherEngine lets a customer apply **exactly one** voucher at checkout and receive an accurate discount computed from voucher eligibility, item-level promotions, cart content, and a global discount cap. It owns voucher configuration, validation, discount decision, cap enforcement, redemption audit, and brute-force protection. It **reads** cart/promotion/pricing/product/customer state from core modules and **must not** own or redefine them (Solution Flow §4).

**In scope (this module):** code normalization; lookup; V1–V8 validation; apply / replace / remove; scope-by-product/category; min-order; global + per-user usage limits; segment check when configured; percentage & fixed-amount calculation; voucher max-discount; item-promotion + voucher stacking; global cap; cart-change revalidation; usage recording after successful order; audit logging; brute-force protection; admin config APIs. (Solution Flow §2.2)

**Out of scope:** payment, credit-line/customer-credit handling, loyalty-program implementation, CRM campaign-management UI, recommendation logic, multi-voucher stacking, voucher sharing, catalog management, promotion-engine redesign, and storefront UI implementation details. Segment-source UI/admin tooling is out of scope, but **reading an approved Customer/CRM segment source for V7 validation is in scope whenever `user_segment_conditions` is configured**. (Solution Flow §2.3; SRS §1.2 / §4.1 V7)

---

## 2. Non-Negotiable Rules

> Copied verbatim from Solution Flow **§10. Business Rules to Preserve**. Do not reinterpret. Each maps to sections of this spec.

1. A cart can have only one active voucher.
2. Voucher codes are case-insensitive.
3. Voucher validation follows V1 → V8 order.
4. Validation stops at the first failed rule.
5. Item-level promotions are calculated before voucher discount.
6. Percentage vouchers use eligible post-promotion value.
7. Voucher discount applies only to eligible items.
8. Voucher-specific maximum discount limits only voucher discount.
9. Global discount cap is based on original cart subtotal.
10. When global cap is exceeded, reduce only voucher discount.
11. Item-level promotion discount must never be reduced by VoucherEngine.
12. Voucher usage count does not increase when applied to cart.
13. Voucher usage count increases only after successful order placement.
14. Voucher usage log is created only after successful order placement.
15. Voucher usage log is append-only and immutable.
16. Cart changes require voucher revalidation.
17. Invalid voucher after cart change must be removed automatically.
18. Cart totals must be recalculated from source values, not incrementally patched.
19. Monetary values use integer arithmetic only.
20. Redis is not the source of truth for voucher or cart state.
21. Voucher brute-force attempts must be rate-limited.
22. Concurrent cart and voucher operations must not produce inconsistent cart state.

---

## 3. Architecture & Conventions (verified from codebase)

All facts below are **verified** against the repository unless marked otherwise.

| Concern             | Verified fact                                                                                                                                                                                                                        | Evidence                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Medusa version      | 2.16.0 across all `@medusajs/*` deps                                                                                                                                                                                                 | `apps/backend/package.json`                                                                    |
| Workspace root      | inner `hf-medusa-store/`; run all pnpm/turbo there                                                                                                                                                                                   | `CLAUDE.md`, `.claude/rules`                                                                   |
| Module scope        | packages are `@dtc/*`                                                                                                                                                                                                                | `.claude/rules`                                                                                |
| Module pattern      | `index.ts` exports `<NAME>_MODULE` const + `Module(...)`; `service.ts` extends `MedusaService({...models})`; one model per file under `models/`                                                                                      | `src/modules/suggestive-selling/*`                                                             |
| Module name string  | **camelCase** — dashes cause runtime errors                                                                                                                                                                                          | skill `type-module-name-camelcase`; existing `SUGGESTIVE_SELLING_MODULE = 'suggestiveSelling'` |
| Cross-module refs   | store id as `model.text()`, wire via **Link Module** `defineLink(... { readOnly: true })`; no DB FKs                                                                                                                                 | `src/links/suggestion-rule-item-product.ts`; `.claude/rules`                                   |
| Module registration | add `{ resolve: './src/modules/<name>' }` to `medusa-config.ts` `modules[]`                                                                                                                                                          | `medusa-config.ts`                                                                             |
| Redis               | **optional** — cache/event-bus/workflow-engine load only when `REDIS_URL` set; in-memory fallback otherwise                                                                                                                          | `medusa-config.ts`                                                                             |
| Mutations           | Voucher/cart/order mutations go through Workflows; routes do not call module services to mutate except the approved `DiscountCapConfig` singleton upsert (§11.9), whose SRS scope is a single active config record updated in place. | skill `arch-workflow-required`; approved Phase 3A exception                                    |
| HTTP methods        | skill mandates **GET / POST / DELETE only** (no PUT/PATCH). NB: existing `suggestion-rules/[id]` uses PUT — a repo divergence (see §18 [CONFLICT-4])                                                                                 | skill `arch-http-methods`; `src/api/admin/suggestion-rules/[id]/route.ts`                      |
| Validation          | `validateAndTransformBody(zodSchema)` in `api/middlewares.ts`; typed via `MedusaRequest<T>` and `req.validatedBody`                                                                                                                  | `src/api/middlewares.ts`, validators                                                           |
| Errors              | throw `MedusaError` with `MedusaError.Types.*` → auto HTTP mapping                                                                                                                                                                   | skill `reference/error-handling.md`                                                            |
| Cross-module reads  | `query.graph({ entity, fields, filters })`; `query.index()` when filtering by linked-module fields                                                                                                                                   | skill `data-query-*`                                                                           |
| Money               | prices stored as-is (NOT cents). VND has no minor unit → 1 = 1 VND; all integer arithmetic                                                                                                                                           | skill `data-price-format`; SRS INT-01                                                          |
| Tests               | Jest; `TEST_TYPE` selects suite. unit=`src/**/__tests__/**/*.unit.spec.ts`; module int=`src/modules/*/__tests__/**`; http int=`integration-tests/http/*.spec.ts`                                                                     | `jest.config.js`, `package.json`                                                               |
| Test setup file     | `jest.config.js` references `./integration-tests/setup.js` — **this file and the `integration-tests/` dir do NOT exist yet** and must be created for HTTP integration tests to run                                                   | `find` returned nothing; `jest.config.js` `setupFiles`                                         |
| Migrations          | generated (not hand-written) with the module's `db:generate`; migrations live in `src/modules/<name>/migrations/`                                                                                                                    | `src/modules/suggestive-selling/migrations/*`; skill `db-generate`                             |

---

## 4. Module Layout — files to create / modify

Folder name **`voucher-engine`** (kebab dir, per repo convention); module string **`voucherEngine`** (camelCase).

### 4.1 New files

```
apps/backend/src/modules/voucher-engine/
  index.ts                                  # export VOUCHER_ENGINE_MODULE='voucherEngine' + Module(...)
  service.ts                                # VoucherEngineService extends MedusaService({...})
  models/
    voucher-config.ts                       # VoucherConfig
    voucher-usage-log.ts                    # VoucherUsageLog (append-only)
    discount-cap-config.ts                  # DiscountCapConfig (singleton)
  migrations/                               # generated by db:generate (do NOT hand-write)

apps/backend/src/modules/voucher-engine/
  lib/
    money.ts                                # integer-only helpers (INT-01)
    calculate-discount.ts                   # pure discount-resolution fn (§10) — unit-testable, no I/O
    normalize-code.ts                       # trim + uppercase (Rule 2)
    errors.ts                               # VoucherError codes + customer_message catalogue, per the approved API contract (§8)
    rate-limit.ts                           # Redis rate-limit/cooldown adapter (§14)
    __tests__/
      calculate-discount.unit.spec.ts
      normalize-code.unit.spec.ts
      money.unit.spec.ts

apps/backend/src/workflows/voucher-engine/
  steps/
    normalize-code.ts
    lookup-voucher.ts
    validate-voucher.ts                     # V1–V8 orchestration (fail-fast)
    resolve-eligible-items.ts
    calculate-voucher-discount.ts
    enforce-global-cap.ts
    verify-cart-unchanged.ts                # concurrency marker check (§14)
    attach-voucher-to-cart.ts               # + compensation (re-derive, not stale restore)
    remove-voucher-from-cart.ts             # + compensation
    atomic-increment.ts                     # conditional usage_count++ (§14.3)
    create-usage-log.ts                     # append-only snapshot insert (§5.2)
    validate-voucher-config.ts              # admin create validation
    create-voucher-config.ts                # persists applicable_product_ids/applicable_category_ids directly (Decision B — no separate scope-rows step)
    invalidate-cache.ts                     # cache invalidation (§14.4)
  apply-voucher.ts                          # applyVoucherWorkflow (§11.1)
  remove-voucher.ts                         # removeVoucherWorkflow (§11.2)
  revalidate-voucher-on-cart-change.ts      # revalidateVoucherWorkflow (§11.3)
  record-voucher-usage.ts                   # recordVoucherUsageWorkflow (§11.4)
  admin/
    create-voucher.ts                       # createVoucherWorkflow (§11.6)
    voucher-analytics.ts                    # read-only analytics workflow/helper (§12)

apps/backend/src/api/store/carts/[id]/voucher/   # cart id = :id route param (Decision E, contract §7.7)
  route.ts                                  # POST (apply/replace) + DELETE (remove)
  validators.ts                             # ApplyVoucherSchema (body {code}) + ApplyVoucherQuerySchema ({replace}) + RemoveVoucherSchema ({}) — all zod v4 .strict()  [SHIPPED]
apps/backend/src/api/store/customers/me/vouchers/   # path per contract §1.3 (line 419); auth-optional, guest → {vouchers:[]} (Decision F, CONFLICT-7)
  route.ts                                  # GET list current-customer vouchers (customer id = req.auth_context?.actor_id, verified)
apps/backend/src/api/admin/vouchers/
  route.ts                                  # POST create, GET list
  validators.ts                             # CreateVoucherSchema
  [id]/analytics/route.ts                   # GET analytics
apps/backend/src/api/admin/discount-cap-config/
  route.ts                                  # GET active cap, POST update cap (§11.9)
  validators.ts                             # UpdateDiscountCapSchema

apps/backend/src/subscribers/
  voucher-cart-updated.ts                   # cart.updated → revalidate (external mutations, §13.1)
  voucher-order-placed.ts                   # order.placed → record usage (§13.2)
  # NOTE: no cache-invalidation subscriber — invalidation is inlined into admin workflows (§14.4)

apps/backend/src/links/
  voucher-config-promotion.ts                # VoucherConfig.promotion_id → Promotion (readOnly)  [Decision C, §14.2-A]
  # NOTE (Decision B, approved): no voucher-config-product.ts / voucher-config-category.ts — product/category
  # scope is stored as plain JSON arrays on VoucherConfig (§5.1/§5.4), not Link Module rows.

apps/backend/src/scripts/
  seed-vouchers.ts                          # idempotent seed (default DiscountCapConfig + sample vouchers)

apps/backend/integration-tests/
  setup.js                                  # referenced by jest.config.js but MISSING — create it
  http/
    apply-voucher.spec.ts
    remove-voucher.spec.ts
    admin-vouchers.spec.ts
```

### 4.2 Modified files

| File                                  | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/backend/medusa-config.ts`       | append `{ resolve: './src/modules/voucher-engine' }` to `modules[]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `apps/backend/src/api/middlewares.ts` | register `validateAndTransformBody(ApplyVoucherSchema)` for `POST /store/carts/:id/voucher` and `validateAndTransformBody(RemoveVoucherSchema)` for `DELETE /store/carts/:id/voucher`, plus `POST /admin/vouchers` and `POST /admin/discount-cap-config`. The `?replace=true` query flag is validated by `ApplyVoucherQuerySchema` — note `validateAndTransformQuery` (verified export, `@medusajs/framework/http`) requires a `QueryConfig` second arg tailored to list/retrieve routes, so for this single boolean flag the route handler may instead call `ApplyVoucherQuerySchema.parse(req.query)` inline; either wiring is acceptable as long as the flag is `.strict()`-validated (implementation choice, not a framework blocker). |

---

## 5. Data Models

All monetary fields are integers in the smallest currency unit (VND: 1 = 1 VND) — Rule 19 / INT-01. IDs of entities owned by other modules are `model.text()` with a read-only Link (never DB FK) — repo convention.

### 5.0 Ownership & sources of truth (authoritative)

To prevent the "which record is right?" ambiguity across VoucherEngine and Medusa, each concern has exactly one owner:

| Concern                                                                                                                                                                                  | Authoritative owner                                                                          | Notes                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native promotion configuration (code, type/value, status, validity/campaign display fields where expressible)                                                                            | **Medusa Promotion/Campaign** linked from `VoucherConfig.promotion_id`                       | VoucherEngine extends/customizes Promotion behavior through a real Module Link and Promotion-first admin create. These native records are canonical for native Promotion-facing fields where Medusa can represent them. Transitional `VoucherConfig` duplicate columns are denormalized read-cache only until cleanup. |
| Voucher-specific editable configuration (scope OR semantics, min-order until native parity is verified, `max_discount_amount`, per-user limit, segment conditions, global `usage_limit`) | **`VoucherConfig`** (VoucherEngine)                                                          | The source of truth for requirements Medusa Promotion cannot fully express or cannot enforce atomically for this SRS. `usage_limit` is configuration and may be editable in the VoucherConfig widget only after an update API/workflow is explicitly approved.                                                         |
| The discount amount landing in **Cart & Order totals**                                                                                                                                   | **an ephemeral, cart-specific Medusa Promotion** (id in `cart.metadata.voucher`, Decision G) | Native Promotion remains the carrier into authoritative `discount_total` / `items.adjustments`; the canonical linked Promotion is not mutated per cart because Promotion code is unique and its amount is shared. VoucherEngine computes the capped amount; a fresh per-cart fixed-amount Promotion transports it.     |
| Completed-redemption **audit & analytics**                                                                                                                                               | **`VoucherUsageLog`** (append-only, §5.2)                                                    | The authoritative record of _who redeemed what, when, and how much_ — the source for `GET /admin/vouchers/:id/analytics`. Never overwritten (INT-04).                                                                                                                                                                  |
| Fast **usage counter** for V3 availability checks                                                                                                                                        | **`VoucherConfig.usage_count`**                                                              | Authoritative fast counter; incremented atomically at redemption (§14.3). Must stay reconcilable with `count(VoucherUsageLog)`.                                                                                                                                                                                        |
| Medusa-side promotion usage (`Promotion.used` / `limit`)                                                                                                                                 | Medusa (secondary)                                                                           | A **secondary, defense-in-depth** value only. It **must not** be treated as the audit source or the usage counter — `VoucherUsageLog` + `VoucherConfig.usage_count` always win. If they diverge from `Promotion.used`, the VoucherEngine values are authoritative.                                                     |
| Cart contents & recalculated totals                                                                                                                                                      | Cart Module                                                                                  | VoucherEngine never writes totals directly (Rule 18).                                                                                                                                                                                                                                                                  |

Rule of thumb: **Promotion/Campaign = native voucher-facing config where Medusa supports it; VoucherConfig = SRS-specific extension fields and `usage_limit` config; ephemeral Promotion = cart-specific transport; VoucherUsageLog = truth of redemption record; usage_count = read-only runtime counter.**

### 5.1 `VoucherConfig` (`models/voucher-config.ts`)

Maps SRS §5.2 `VoucherConfig` as a custom module extension of Medusa Promotion behavior. Medusa v2 does not support DML model inheritance across modules, so "extends Promotion" is implemented as: a real read-only Module Link from `VoucherConfig.promotion_id` to the canonical Promotion, plus VoucherEngine-owned extension fields for the SRS-specific rules. The apply-time discount amount is transported by a fresh ephemeral, cart-specific Promotion so it lands in authoritative Cart/Order totals without mutating the shared canonical Promotion.

| Field                       | Type                                                            | Notes / SRS                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                        | `model.id().primaryKey()`                                       |                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `code`                      | `model.text()`                                                  | **stored UPPERCASE**, unique index; case-insensitive lookup (Rule 2, SEC-03). Also the backing Promotion's `code`.                                                                                                                                                                                                                                                                                                           |
| `promotion_id`              | `model.text().nullable()`                                       | id of the **canonical** Medusa **Promotion** provisioned by Promotion-first `createVoucherWorkflow`; client input is never trusted for this value. Cross-module ref → read-only Link to Promotion (§6), never DB FK. It is not mutated per cart and does not identify the cart/order adjustment; the actual adjustment carries the ephemeral promotion id/code stored in `cart.metadata.voucher` / `order.metadata.voucher`. |
| `discount_type`             | `model.enum(['percentage','fixed_amount'])`                     | SRS §5.2                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `discount_value`            | `model.number()`                                                | integer. For percentage: basis points per SRS (`2000` = 20.00%). **[NEEDS_VERIFICATION — unit convention]**: SRS §5.2 says `2000 = 20.00%` (basis points) but worked example §9.6 uses "10%". SPEC adopts **basis points** (`value/10000`); confirm at sign-off.                                                                                                                                                             |
| `min_order_value`           | `model.number().nullable()`                                     | V5                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `max_discount_amount`       | `model.number().nullable()`                                     | voucher-level cap (Rule 8)                                                                                                                                                                                                                                                                                                                                                                                                   |
| `applicable_product_ids`    | `model.json().nullable()`                                       | **Decision B (approved):** nullable JSON array of product ids. Both this and `applicable_category_ids` empty/null = unscoped (whole cart eligible). Cross-module ids as plain JSON, no Link Module, no DB FK — see §5.4.                                                                                                                                                                                                     |
| `applicable_category_ids`   | `model.json().nullable()`                                       | **Decision B (approved):** nullable JSON array of category ids. When either array is non-empty, a line item is eligible if its `product_id` is in `applicable_product_ids` **OR** any of its category ids is in `applicable_category_ids` (V6, §5.4).                                                                                                                                                                        |
| `stackable_with_promotions` | `model.boolean().default(true)`                                 | V8                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `per_user_limit`            | `model.number().default(1)`                                     | V4                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `usage_limit`               | `model.number().nullable()`                                     | V3 global                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `usage_count`               | `model.number().default(0)`                                     | incremented only at redemption (Rule 13). Atomicity → §14                                                                                                                                                                                                                                                                                                                                                                    |
| `user_segment_conditions`   | `model.json().nullable()`                                       | V7. Null means unrestricted. When configured, must be evaluated against the approved Customer/CRM segment source.                                                                                                                                                                                                                                                                                                            |
| `valid_from`                | `model.dateTime()`                                              | V2                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `valid_to`                  | `model.dateTime()`                                              | V2                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `is_active`                 | `model.boolean().default(true)`                                 | V1                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `usage_logs`                | `model.hasMany(() => VoucherUsageLog, { mappedBy: 'voucher' })` | audit                                                                                                                                                                                                                                                                                                                                                                                                                        |

Indexes: `{ on: ['code'], unique: true }`, `{ on: ['is_active','valid_from','valid_to'] }`.

> **Decision (SEC-03):** enforce `code` min 6 chars, alphanumeric, uppercased — in `CreateVoucherSchema` (admin) and in `normalize-code` (apply). Traced from SRS §9.2 SEC-03 (not present in Solution Flow).

### 5.2 `VoucherUsageLog` (`models/voucher-usage-log.ts`)

**Decision D (approved 2026-07-14):** every field in the table below, plus the unique `(voucher_id, order_id)` index, is the **approved** audit-snapshot requirement — not an illustrative superset. It supports point-in-time audit history, idempotent order-success processing, duplicate-event protection, and debugging of cap/stacking decisions. The currently shipped `voucher-usage-log.ts` model has only `voucher_id`, `customer_id`, `order_id`, `discount_applied`, `was_capped`, `original_discount`, `applied_at`, and only a non-unique `(voucher_id, customer_id)` index — extending it to the full schema below (migration + tests) is required Day-4/5 work, not a redesign. `discount_applied`/`original_discount` are **retained aliases** (defined precisely below) rather than a second, ambiguous pair of fields — this reconciles the SRS §5.2 field names with the §10 pipeline's own vocabulary without duplicate meanings.

Append-only, immutable (Rule 15 / INT-04). Never updated or deleted after creation. It is the durable redemption audit record and a **point-in-time snapshot** — it must remain correct even after the parent `VoucherConfig` is later edited, deactivated, or its scope changes (Solution Flow §7.6 step 4, D-07 "Discount snapshot", SRS INT-04). Therefore it copies the redemption-relevant voucher attributes at redemption time rather than relying on a live read of `VoucherConfig`.

| Field                                | Type                                        | Notes                                                                                                                                                              |
| ------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                                 | `model.id().primaryKey()`                   |                                                                                                                                                                    |
| `voucher_id`                         | `model.text()`                              | logical ref (link, not DB FK)                                                                                                                                      |
| `customer_id`                        | `model.text()`                              | Solution Flow §7.5                                                                                                                                                 |
| `order_id`                           | `model.text()`                              | Solution Flow §7.5                                                                                                                                                 |
| `currency_code`                      | `model.text()`                              | **snapshot** — order/cart currency (e.g. `vnd`); makes every monetary field self-describing for analytics and multi-currency safety                                |
| `voucher_code`                       | `model.text()`                              | **snapshot** — code as applied (survives rename/deactivation)                                                                                                      |
| `discount_type`                      | `model.enum(['percentage','fixed_amount'])` | **snapshot** of the rule kind used                                                                                                                                 |
| `discount_value`                     | `model.number()`                            | **snapshot** — bps or fixed amount used at redemption                                                                                                              |
| `raw_voucher_discount`               | `model.number()`                            | §10 `raw_voucher_discount` — voucher rule applied to eligible post-promotion subtotal, **before** any cap                                                          |
| `voucher_discount_after_voucher_cap` | `model.number()`                            | §10 `voucher_discount_after_voucher_cap` — after the voucher's own `max_discount_amount`, **before** the global cap                                                |
| `final_voucher_discount`             | `model.number()`                            | §10 `final_voucher_discount` — amount **actually charged** (after global cap); equals the applied Promotion adjustment total                                       |
| `discount_applied`                   | `model.number()`                            | **retained alias — DEFINED AS `= final_voucher_discount`** (kept for the SRS §5.2 field name; single canonical value, no drift)                                    |
| `original_discount`                  | `model.number()`                            | **retained alias — DEFINED AS `= voucher_discount_after_voucher_cap`** (the "pre-global-cap voucher discount" the SRS/UI compares against for the cap explanation) |
| `was_capped`                         | `model.boolean().default(false)`            | global cap reduced the voucher ⇔ `final_voucher_discount < voucher_discount_after_voucher_cap`                                                                     |
| `cap_percentage_bps`                 | `model.number().nullable()`                 | **snapshot** of `DiscountCapConfig.max_discount_percentage` in force at redemption                                                                                 |
| `original_subtotal`                  | `model.number()`                            | **snapshot** — cart original subtotal (audit basis for the cap calc, §10)                                                                                          |
| `item_promotion_discount`            | `model.number().default(0)`                 | **snapshot** — item-level promo total at redemption (proves cap arithmetic, Rule 11)                                                                               |
| `applied_at`                         | `model.dateTime()`                          | redemption timestamp (distinct from `created_at`; set explicitly by `createUsageLogStep`)                                                                          |

Indexes: **unique `{ on: ['voucher_id','order_id'], unique: true }`** → this unique constraint is the durable idempotency guard for redemption (§14.3, D-06, INT-02). Also `{ on: ['voucher_id'] }`, `{ on: ['customer_id'] }`, `{ on: ['order_id'] }` (analytics + idempotency lookups).

**Append-only enforcement (Rule 15 / INT-04) — how, concretely.** `MedusaService` auto-generates `update*` / `delete*` / `softDelete*` for every model (verified pattern — `suggestive-selling/service.ts`). Those generated mutators must be treated as **forbidden** for `VoucherUsageLog`:

1. **Service-level:** the module service overrides `updateVoucherUsageLogs`, `deleteVoucherUsageLogs`, `softDeleteVoucherUsageLogs` to throw `MedusaError(NOT_ALLOWED, 'voucher usage log is immutable')`. This is the enforced boundary since all app code goes through the service.
2. **Workflow-level:** no workflow references any usage-log mutator except `createUsageLogStep` (§11.4); `createUsageLogStep` has **no compensation that deletes** — a failed redemption transaction rolls back the insert atomically (§14.3), it never issues a delete.
3. **DB-level (defense in depth, optional):** a Postgres trigger/rule rejecting `UPDATE`/`DELETE` on the table. `[NEEDS_VERIFICATION #11a]` — whether a hand-authored trigger can coexist with Medusa's generated migrations without being dropped on regeneration; if not, rely on layers 1–2. Recorded, not required for MVP.
4. Corrections are made by appending a compensating record in a separate reversal log (future scope), never by mutating a row here.

### 5.3 `DiscountCapConfig` (`models/discount-cap-config.ts`)

Global singleton (SRS §5.2). One active record.

| Field                     | Type                            | Notes                                                         |
| ------------------------- | ------------------------------- | ------------------------------------------------------------- |
| `id`                      | `model.id().primaryKey()`       |                                                               |
| `max_discount_percentage` | `model.number()`                | basis points; `5000` = 50.00% (SRS §5.2). Default seed = 5000 |
| `is_active`               | `model.boolean().default(true)` | single active record enforced in service/seed                 |
| `updated_by`              | `model.text().nullable()`       | audit                                                         |

### 5.4 Voucher scope persistence (Decision B, approved 2026-07-14 — supersedes the earlier `VoucherScope` model design)

**There is no `VoucherScope` model.** Scope lives as two nullable JSON arrays directly on `VoucherConfig` (§5.1): `applicable_product_ids: model.json().nullable()` and `applicable_category_ids: model.json().nullable()`. This is the **approved MVP architecture** for this project, not an interim shortcut awaiting sign-off — an earlier revision of this SPEC proposed normalizing scope into a dedicated `VoucherScope` model wired through the Link Module (CONFLICT-2/PD-13 below); that proposal is superseded by this decision and must not be implemented.

- **Unscoped:** both `applicable_product_ids` and `applicable_category_ids` empty (`[]`) or `null` ⇒ the voucher applies to the whole cart.
- **Scoped:** when either array is non-empty, a cart line item is eligible (V6, Rule 7) if its `product_id` is in `applicable_product_ids` **OR** any of its category ids is in `applicable_category_ids` — OR semantics across both arrays, matching the shipped `resolveEligibleItems`/`VoucherScope` (the in-memory `{ product_ids, category_ids }` shape used by the pure calculator, not a DB model — see §10.7).
- **No Link Module wiring for scope**, and **no cross-module database foreign key** — product/category ids are plain JSON values on `VoucherConfig`, read and compared in application code. This does not apply to `VoucherConfig.promotion_id` (Decision C), whose read-only Link to the Promotion module is unaffected and stays as specified in §6.
- **Migration seam:** `toVoucherScope(voucher)` (`workflows/voucher-engine/lib/mappers.ts`) is the single function that maps the persisted `VoucherConfig` row to the `{ product_ids, category_ids }` shape consumed by `resolveEligibleItems`/`resolveEligibleItemsStep`. If a normalized, Link-Module-backed scope model is ever required later, `toVoucherScope` is the only seam that needs to change — `resolveEligibleItems`/`calculateVoucherDiscount` do not.

> A voucher with **no** scope rows = applies to the whole cart (unscoped). With scope rows = only matching line items are eligible (V6, Rule 7).

> **Cart↔voucher association is NOT a model here.** The active voucher is attached to the cart as an **ephemeral, cart-specific Promotion-driven adjustment** (Decision G, §14.2-A, verified mechanism), not a VoucherEngine table; `cart.metadata.voucher` holds the auxiliary snapshot **plus** the ephemeral Promotion's `{ promotion_id, code }` (operational data used to identify/detach the adjustment and to carry `voucher_id` to `order.metadata` for redemption — never the authoritative amount).

---

## 6. Links (Link Module)

Follow `src/links/suggestion-rule-item-product.ts` (read-only link on an existing text id field, no pivot table). **Decision B (approved 2026-07-14):** product/category voucher scope is plain JSON (§5.1/§5.4) and needs **no Link Module wiring at all** — there is no `VoucherScope` model to link from, and no cross-module database foreign key. Only the promotion reference (Decision C) is a real cross-module link:

```
src/links/voucher-config-promotion.ts
  defineLink({ linkable: VoucherEngineModule.linkable.voucherConfig, field: 'promotion_id' },
             PromotionModule.linkable.promotion, { readOnly: true })   # backing promotion (§14.2-A, §5.1)
```

- `[NEEDS_VERIFICATION #4]` — exact `PromotionModule.linkable.promotion` linkable key name (`@medusajs/medusa/promotion` subpath export is **verified** to exist — `package.json` `./*` → `dist/modules/*.js` — only the exact `.linkable.promotion` property name is unconfirmed). The earlier `[NV #4]` item for `ProductModule.linkable.productCategory` is dropped — Decision B means no product/category link is created.
- `.linkable` is auto-added to models — never call `.linkable()` in a model file (skill `type-linkable-auto`).

---

## 7. Service Layer

`service.ts` default-exports `VoucherEngineService extends MedusaService({ VoucherConfig, VoucherUsageLog, DiscountCapConfig })`. This auto-generates CRUD (`list*`, `retrieve*`, `create*`, `update*`, `delete*`, `softDelete*`, `listAndCount*`). No `VoucherScope` model is registered (Decision B, §5.4).

**Keep the module service CRUD-only** (skill `logic-module-service`). Custom orchestration/validation/calculation logic lives in workflow steps and `lib/` pure functions — NOT in the service. Read-only helper methods that are pure queries (e.g. `retrieveByCode`) may be added to the service. Voucher/cart/order mutations go through workflows; the only approved direct module-service mutation is the `DiscountCapConfig` singleton admin upsert (§11.9).

Pure, I/O-free logic (unit-tested directly):

- `lib/normalize-code.ts` — `normalizeCode(raw): string` = `raw.trim().toUpperCase()` (Rule 2).
- `lib/money.ts` — integer math helpers; percentage via `Math.floor(amount * bps / 10000)` (rounding policy below).
- `lib/calculate-discount.ts` — the entire §10 calculation contract as a deterministic function of primitive inputs.

---

## 8. DTOs, Validators & Error Contract

> **Decision A (approved 2026-07-14):** everywhere this section conflicts with the approved `docs/API_CONTRACT_Suggestive_Voucher_Cart.md`, the contract wins — error codes, HTTP statuses, Vietnamese customer messages, and response envelope wording below are the contract's, not an independent SPEC invention. This is a full rewrite of §8.1–§8.4 from an earlier illustrative pass; superseded wording (a `message_vi`/`message_params`/`severity`/`display_hint`/`retryable` envelope, `403`/`400`-heavy statuses, `VOUCHER_NOT_YET_ACTIVE`/`VOUCHER_USER_LIMIT_REACHED`/`VOUCHER_DISCOUNT_CAPPED` names) is removed, not merely annotated. Production code (`workflows/voucher-engine/lib/errors.ts`, verified 2026-07-14) already matches the contract byte-for-byte — this section brings the SPEC into line with already-correct code, not the other way around.

### 8.1 Store: Apply voucher

`POST /store/carts/:id/voucher` (route path per contract §1.3 + §7.7, governed independently of Decision A — see Decision E and §12/§23.5 for the route contract)

- **Cart id = the `:id` route param** (`req.params.id`), never a body field (Decision E; native Medusa `carts/[id]/promotions/route.js` reads `cart_id: req.params.id`, verified).
- Request body `ApplyVoucherSchema` (zod, `.strict()`): `{ code: string (min 6, /^[A-Za-z0-9]+$/) }` — **no `cart_id`, no `confirm_replace`** (§11.1, §23.5; matches shipped `carts/[id]/voucher/validators.ts`). `code` is normalized to upper/trim inside the workflow, not the validator.
- Query flag `ApplyVoucherQuerySchema` (zod, `.strict()`): `{ replace?: boolean }` via `?replace=true` (`z.coerce.boolean().optional()`) — confirms replacing an already-active voucher. This is the replace-confirmation mechanism (contract §1.3 request example: `{ "code": "SHUTTLE20" }` with "query optional: ?replace=true").
- Success response (API contract §1.3):

```jsonc
{
  "success": true,
  "discount_amount": 30000, // final_voucher_discount
  "discount_capped": false,
  "cap_explanation": null,
  "updated_cart_total": 4620000,
  "voucher_details": {
    "code": "SHUTTLE20",
    "type": "percentage",
    "value": 2000,
    "expires_at": "2026-12-31T23:59:59Z",
  },
}
```

- Success response — capped (API contract §1.3):

```jsonc
{
  "success": true,
  "discount_amount": 490000,
  "discount_capped": true,
  "cap_explanation": "Giảm giá đã được điều chỉnh từ 568.000₫ xuống 490.000₫ theo chính sách giảm tối đa 50%.",
  "updated_cart_total": 2350000,
  "voucher_details": {
    "code": "MEGA20",
    "type": "percentage",
    "value": 2000,
    "expires_at": "…",
  },
}
```

- Failure response (business error) — envelope per §8.3, HTTP/codes per §8.4:

```jsonc
{
  "type": "invalid_data",
  "code": "VOUCHER_MIN_ORDER_NOT_MET",
  "message": "subtotal {x} < min {y}",
  "customer_message": "Mua thêm 50.000₫ nữa để dùng được mã này nhé!",
  "details": { "remaining": 50000, "min_order_value": 500000 },
  "request_id": "req_01J...",
}
```

- Already-has-a-voucher → **409 `VOUCHER_REPLACE_REQUIRED`** (`details.current_code`); frontend confirms → retries with `?replace=true` on the query string (§11.1).
- 5 failed attempts / 15 min → **429 `VOUCHER_RATE_LIMITED`** (`details.retry_after_seconds`), 30-minute cooldown (EC-10/SEC-02, §14.1).

### 8.2 Store: Remove voucher

`DELETE /store/carts/:id/voucher` (cart id = `:id` route param; empty body validated by `RemoveVoucherSchema` `{}` `.strict()`) → `{ success: true, updated_cart_total, message: "Đã gỡ mã giảm giá." }` (API contract §1.3 wording). No active voucher on the cart → **200 no-op, idempotent** (`success: true`, total unchanged) — this is not an error.

### 8.3 Error envelope contract (Decision A — API contract is authoritative)

The approved `docs/API_CONTRACT_Suggestive_Voucher_Cart.md` §4 defines the **one** error envelope for VoucherEngine (and SuggestiveSelling/Cart) error responses:

```json
{
  "type": "invalid_data | not_found | conflict | rate_limited | unauthorized | not_allowed | server_error",
  "code": "MACHINE_ERROR_CODE",
  "message": "Internal English message — logs/devs only, may contain ids/numbers",
  "customer_message": "Thông báo tiếng Việt, ngắn, thân thiện, KHÔNG lộ kỹ thuật",
  "details": { "field": "…" },
  "request_id": "req_…"
}
```

- `code` is a stable `SCREAMING_SNAKE` constant; the frontend switches on `code`, never parses `message`.
- `message` (EN) is for logs/observability only; `customer_message` (VI) is what the customer sees.
- `details` is optional, structured data for the frontend to render (e.g. `remaining`, `retry_after_seconds`, `current_code`).
- **Never** return raw exception text, DB/Redis errors, stack traces, or workflow internals (API contract §4.3 "degrade, don't break the page").
- This is the envelope the HTTP route/error-handler layer (Day 4, `api/middlewares.ts` `errorHandler`) must produce. The current validation-step internal shape (`ValidationResult = { ok, code, http_status, customer_message, details? }`, `workflows/voucher-engine/lib/types.ts`) already carries `code`/`http_status`/`customer_message`/`details`; the route boundary is responsible for adding `type` (derived from `http_status`/§8.4) and `request_id`, and for using `http_status` only to set the HTTP status code, never returning it as a body field.

### 8.4 Error code catalogue & HTTP mapping (Decision A — source of truth is the API contract, not this SPEC's own invention)

Source of truth: `docs/API_CONTRACT_Suggestive_Voucher_Cart.md` §5.1 (codes/HTTP/`type`) and §6.1 (Vietnamese `customer_message`). Codes are **stable English constants**. Verified 2026-07-14: `workflows/voucher-engine/lib/errors.ts` already matches every V1–V8 row below verbatim (code name, HTTP status, `customer_message`) — no production-code change is required for this decision.

| Code                             | HTTP                     | `type`       | Trigger (validation stage)                                       | `details`                   | Notes                                                                                                                                                       |
| -------------------------------- | ------------------------ | ------------ | ---------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VOUCHER_NOT_FOUND`              | 404                      | not_found    | V1 code doesn't exist                                            | —                           | Message does not confirm/deny beyond this (anti-enumeration)                                                                                                |
| `VOUCHER_INACTIVE`               | 422                      | invalid_data | V1 `is_active=false`                                             | —                           | Same `customer_message` as `VOUCHER_NOT_FOUND` (anti-enumeration, §9.3)                                                                                     |
| `VOUCHER_NOT_YET_VALID`          | 422                      | invalid_data | V2 `now < valid_from`                                            | —                           | Supersedes an earlier `VOUCHER_NOT_YET_ACTIVE` — use only this name                                                                                         |
| `VOUCHER_EXPIRED`                | 422                      | invalid_data | V2 `now > valid_to`                                              | `expired_at`                |                                                                                                                                                             |
| `VOUCHER_USAGE_LIMIT_REACHED`    | 422                      | invalid_data | V3 `usage_count>=usage_limit`                                    | —                           |                                                                                                                                                             |
| `VOUCHER_PER_USER_LIMIT_REACHED` | 422                      | invalid_data | V4 per-user count reached                                        | `count,limit`               | Supersedes an earlier `VOUCHER_USER_LIMIT_REACHED` — use only this name                                                                                     |
| `VOUCHER_MIN_ORDER_NOT_MET`      | 422                      | invalid_data | V5 subtotal < min                                                | `remaining,min_order_value` | subtotal comparison basis = original subtotal (D3)                                                                                                          |
| `VOUCHER_NO_ELIGIBLE_ITEMS`      | 422                      | invalid_data | V6 no scope-matching line item                                   | `applicable_categories`     |                                                                                                                                                             |
| `VOUCHER_SEGMENT_NOT_ELIGIBLE`   | 422                      | invalid_data | V7 configured segment mismatch                                   | —                           | Null `user_segment_conditions` means unrestricted; configured conditions must be checked against the approved Customer/CRM segment source.                  |
| `VOUCHER_STACKING_CONFLICT`      | 422                      | invalid_data | V8 stacking conflict                                             | —                           |                                                                                                                                                             |
| `VOUCHER_REPLACE_REQUIRED`       | 409                      | conflict     | cart already has another active voucher, `?replace=true` not set | `current_code`              | Frontend confirms → retries with `?replace=true` on the query string (§8.1, §11.1)                                                                          |
| `VOUCHER_RATE_LIMITED`           | 429                      | rate_limited | §14.1 cooldown                                                   | `retry_after_seconds`       | SEC-02/EC-10                                                                                                                                                |
| `DISCOUNT_CAPPED`                | 200 (flag, not an error) | —            | §10 global cap reduced the voucher                               | `original,capped`           | Supersedes an earlier `VOUCHER_DISCOUNT_CAPPED` — surfaced as `discount_capped`/`cap_explanation` in the §8.1 success envelope, not a separate error object |
| `VOUCHER_AUTO_REMOVED`           | — (async notification)   | —            | §11.3/§13 revalidation fail                                      | `reason`                    | Not returned synchronously from the request that triggered it                                                                                               |
| `VOUCHER_CART_CHANGED`           | 409                      | conflict     | concurrency (EC-04)                                              | —                           | VoucherEngine-internal reserved code; the Locking Module (§14.2-C) makes this path rare but the code stays reserved                                         |
| `VOUCHER_CALCULATION_FAILED`     | 400                      | invalid_data | `verifyCartTotalsStep` mismatch — safe-fail (§23.4)              | —                           | Internal-safety code protecting INT-03; cart is reverted, never partially applied                                                                           |

**Brute-force counting (§9.3, unchanged by this decision):** only `VOUCHER_NOT_FOUND` increments the rate-limit counter; every other code implies the code is known and is a legitimate customer state, not guessing.

`[NEEDS_VERIFICATION #8]` — whether `MedusaError` supports a 429 mapping in 2.16, else the rate-limit route returns `res.status(429)` directly with the envelope (fallback is safe and known). Unchanged by Decision A.

---

## 9. Validation Pipeline (V1 → V8)

### 9.0 The three validation contexts

Validation runs in **three distinct contexts** with different rule subsets and different consequences. Do not collapse them into one call site — each has its own step and its own failure handling. All three obey the same **fail-fast** rule (stop at the first failed condition, return exactly one error, run no later checks — Rules 3–4; D-03; SRS §4.1 V-order) and the same V1→V8 ordering for whatever subset they run.

| Context                      | When                                                                     | Rules run (in order)                             | Consequence of failure                                                                                                | Increments brute-force counter?                                | Step / workflow                                               |
| ---------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------- |
| **Apply-time**               | Customer submits a code (`POST /store/carts/:id/voucher`), incl. replace | **V1 → V8** (full pipeline)                      | Cart unchanged; return one Vietnamese business error (§8). No voucher attached.                                       | Yes, only for security-relevant code failures (V1) — see 9.3   | `validateVoucherStep` in `applyVoucherWorkflow` (§11.1)       |
| **Cart-change revalidation** | An already-applied voucher must be re-checked after the cart mutates     | **V1, V2, V5, V6, V7 when configured, V8**       | If any fails → voucher **auto-removed** (`VOUCHER_AUTO_REMOVED` + reason); if all pass → discount recalculated (§10). | **No** (customer did not submit a code; not an attack surface) | `revalidateStep` in `revalidateVoucherWorkflow` (§11.3)       |
| **Redemption-time**          | `order.placed` for an order that carried a voucher                       | **V3, V4** only, enforced **atomically** (§14.3) | Redemption capacity exhausted → do **not** write usage/log; log for operational recovery (§11.4, §18.4-5).            | **No**                                                         | `atomicIncrementStep` in `recordVoucherUsageWorkflow` (§11.4) |

### 9.1 Validation stages (full pipeline, apply-time)

Implemented in `steps/validate-voucher.ts`. The full V1→V8 pipeline is the apply-time contract; the other two contexts run the subsets above by passing a `context` flag into the same step.

| Stage | Check                                                                                                                                                        | Inputs (source)                                                                                                                                                         | On failure                                  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| V1    | code exists AND `is_active`                                                                                                                                  | `VoucherConfig` by normalized code (VoucherEngine DB / short-TTL cache)                                                                                                 | `VOUCHER_NOT_FOUND` / `VOUCHER_INACTIVE`    |
| V2    | `valid_from <= now <= valid_to`                                                                                                                              | config + server clock                                                                                                                                                   | `VOUCHER_NOT_YET_VALID` / `VOUCHER_EXPIRED` |
| V3    | `usage_count < usage_limit` (or `usage_limit` null)                                                                                                          | config (authoritative DB read)                                                                                                                                          | `VOUCHER_USAGE_LIMIT_REACHED`               |
| V4    | per-user count `< per_user_limit`                                                                                                                            | `count(VoucherUsageLog where voucher_id, customer_id)`                                                                                                                  | `VOUCHER_PER_USER_LIMIT_REACHED`            |
| V5    | cart subtotal `>= min_order_value`                                                                                                                           | Cart module (post-promotion basis per §10 — subtotal comparison uses original subtotal per SRS V5 wording) `[NEEDS_VERIFICATION — which subtotal V5 compares]`          | `VOUCHER_MIN_ORDER_NOT_MET` (+ `remaining`) |
| V6    | ≥1 cart line item matches scope (or unscoped)                                                                                                                | `VoucherConfig.applicable_product_ids`/`applicable_category_ids` (JSON arrays, Decision B) via `toVoucherScope` + cart line items' product/category (via `query.graph`) | `VOUCHER_NO_ELIGIBLE_ITEMS`                 |
| V7    | customer meets `user_segment_conditions` when configured                                                                                                     | Approved Customer/CRM segment source; `null` conditions mean unrestricted                                                                                               | `VOUCHER_SEGMENT_NOT_ELIGIBLE`              |
| V8    | no stacking conflict: `stackable_with_promotions=false` AND cart has active item-promotions ⇒ conflict; and no other active voucher unless replace-confirmed | config + Promotion result on cart                                                                                                                                       | `VOUCHER_STACKING_CONFLICT`                 |

**V7 status:** required by SRS. `user_segment_conditions = null` passes. When conditions are configured, VoucherEngine must resolve the customer identity and evaluate the approved Customer/CRM segment data before allowing the voucher. If no customer/segment source can satisfy a configured condition, fail closed with `VOUCHER_SEGMENT_NOT_ELIGIBLE`; do not silently pass a configured segment restriction.

**Which failures increment the brute-force counter (§14):** only _security-relevant code failures_ — `VOUCHER_NOT_FOUND` (and arguably `VOUCHER_INACTIVE`). Business failures on a _known_ code (min-order, no-eligible-items, expired, usage-limit, segment, stacking) do **not** count toward brute-force (Solution Flow §7.1 step 9, §7.8 step 6). Exact classification list → confirm (part of PD-14 messaging).

### 9.2 Cart-change revalidation subset — rationale (RESOLVED)

The revalidation context (§11.3) re-runs **V1, V2, V5, V6, V7 when configured, V8** and deliberately **skips V3, V4**:

- **V1 (still active)** — re-run so admin deactivation between apply and cart change removes the voucher on the next cart mutation (this is the recommended resolution of **PD-08**; see §11.3).
- **V2 (not expired)** — re-run because the voucher may have expired while the cart was open.
- **V5 (min order), V6 (eligible items), V7 when configured, V8 (stacking)** — the voucher can become invalid after cart/customer context changes. SRS apply flow explicitly includes segment validation; if a configured segment restriction can no longer be satisfied, the applied voucher must be auto-removed with the same fail-fast rule semantics.
- **V3 (global usage) / V4 (per-user usage) — SKIPPED.** Usage is not consumed until order placement (Rules 12–13). Removing an already-applied cart voucher because the _global_ counter moved would punish a customer mid-checkout and contradicts EC-06. Usage capacity is re-checked authoritatively at redemption-time (§9.0, §14.3) instead.

Superseded note: earlier text described the revalidation subset as "V3–V8" or skipped V7 entirely; the resolved subset is **V1, V2, V5, V6, V7 when configured, V8**.

### 9.3 Brute-force classification (RESOLVED for MVP)

Only failures that reveal _whether a submitted code maps to a real voucher_ are security-relevant and increment the counter (§14.1):

- **Increments counter:** `VOUCHER_NOT_FOUND` (code does not exist). This is the only unambiguous guessing signal.
- **Does NOT increment:** `VOUCHER_INACTIVE`, `VOUCHER_NOT_YET_VALID`, `VOUCHER_EXPIRED`, `VOUCHER_USAGE_LIMIT_REACHED`, `VOUCHER_PER_USER_LIMIT_REACHED`, `VOUCHER_MIN_ORDER_NOT_MET`, `VOUCHER_NO_ELIGIBLE_ITEMS`, `VOUCHER_SEGMENT_NOT_ELIGIBLE`, `VOUCHER_STACKING_CONFLICT` — all imply the code is _known_, so they are legitimate-customer states, not guessing.
- **Trade-off recorded:** counting only `VOUCHER_NOT_FOUND` means an attacker who happens to hit a real-but-inactive code is not throttled by that specific response. Because SEC-02's goal is to slow _discovery of valid codes_, and inactive/expired codes are not usable, this is acceptable for MVP. If monitoring later shows enumeration of the known-code space, add `VOUCHER_INACTIVE`/`VOUCHER_EXPIRED` to the counted set (business decision, not a code blocker).
- The counter classification is applied **only in the apply-time context** (§9.0). Cart-change and redemption-time never touch it.

### 9.4 V7 segment status

V7 is SRS-required. It is conditional only in the sense that vouchers without `user_segment_conditions` have no segment gate. A voucher with configured conditions must check the approved segment source for the current customer. Guest carts or customers without matching segment data fail when a condition requires customer identity or segment membership.

> **Current implementation gap (2026-07-20 review):** `v7Segment` (`workflows/voucher-engine/lib/validators.ts`) is still a hardcoded no-op that always returns `PASS`, regardless of whether `user_segment_conditions` is configured. See "Known Implementation Gaps & Correction Order" above.

---

## 10. Discount Resolution

`lib/calculate-discount.ts` — pure, deterministic, integer-only (Rules 5–11, 18–19; D-04). Order is fixed (Solution Flow §9.1).

> **Price List interpretation:** in this project, "item-level promotion" means the Pricing Module's resolved sale price on the cart line (`items.unit_price`), not a native Promotion Module line-item adjustment unless a future requirement explicitly says otherwise. VoucherEngine calculates from Medusa's resolved cart line prices and never mutates Price List data. Historical native-Promotion coexistence findings are defensive context only, not a default SRS requirement.

### 10.1 Calculation contract (verbatim, Solution Flow §9.3 / D-04)

```text
original_subtotal
= sum(original line item totals)

post_promotion_subtotal
= original_subtotal - item_promotion_discount

eligible_post_promotion_subtotal
= sum(post-promotion values of voucher-eligible line items)

raw_voucher_discount
= calculate voucher rule against eligible_post_promotion_subtotal

voucher_discount_after_voucher_cap
= min(raw_voucher_discount, max_discount_amount)
  when max_discount_amount exists

maximum_combined_discount
= original_subtotal × global_discount_cap_percentage

final_voucher_discount
= min(
    voucher_discount_after_voucher_cap,
    maximum_combined_discount - item_promotion_discount
)

final_cart_total
= original_subtotal
  - item_promotion_discount
  - final_voucher_discount
```

### 10.2 Guard rules (Solution Flow §9.4)

- `final_voucher_discount` never negative → clamp at 0.
- item-level sale pricing is **never** reduced or rewritten by VoucherEngine (Rule 11). VoucherEngine reads the already-resolved sale `unit_price`, computes the voucher on that basis, and only reduces the voucher discount when the global cap is exceeded. If a future requirement introduces coexistence with native Promotion Module line-item adjustments, that is a separate compatibility requirement and should fail closed until explicitly designed.
- `final_cart_total` never negative; **≥ 1 VND** where policy requires (EC-03). `[NEEDS_VERIFICATION — is the "min 1 VND" clamp mandatory or policy-flagged?]` — SRS EC-03 says minimum 1 VND; Solution Flow §9.4 says "at least 1 VND where required by policy". Adopt: clamp to ≥ 1 VND and log a warning when the cap alone would drive total to 0 (EC-03).
- integer arithmetic only; **rounding policy:** percentage uses `Math.floor` (round down, favors the store; never creates fractional VND). Confirm at sign-off — recorded under §19.
- Fixed-amount voucher: `raw_voucher_discount = min(discount_value, eligible_post_promotion_subtotal)` (fixed can't exceed eligible subtotal — SRS §22.2).

### 10.3 Percentage basis-point convention

`raw = Math.floor(eligible_post_promotion_subtotal * discount_value / 10000)` (discount_value in bps). Global cap: `maximum_combined_discount = Math.floor(original_subtotal * max_discount_percentage / 10000)`.

### 10.4 Worked example — under cap (must reproduce Solution Flow §9.6 exactly)

```
original_subtotal            = 4,700,000
item_promotion_discount      =   900,000
post_promotion_subtotal      = 3,800,000
voucher 10% (bps 1000) on eligible = whole cart eligible → eligible = 3,800,000
raw_voucher_discount         =   380,000
no voucher cap
maximum_combined_discount    = 50% × 4,700,000 = 2,350,000
final_voucher_discount       = min(380,000, 2,350,000 - 900,000 = 1,450,000) = 380,000
final_cart_total             = 4,700,000 - 900,000 - 380,000 = 3,420,000   ✓
discount_capped = false
```

### 10.5 Worked example — cap exceeded (must reproduce Solution Flow §9.7 exactly)

```
original_subtotal            = 4,700,000
item_promotion_discount      = 1,860,000
voucher 20% (bps 2000) on eligible post-promotion (2,840,000)
raw_voucher_discount         =   568,000
maximum_combined_discount    = 2,350,000
final_voucher_discount       = min(568,000, 2,350,000 - 1,860,000 = 490,000) = 490,000
final_cart_total             = 4,700,000 - 1,860,000 - 490,000 = 2,350,000   ✓
discount_capped = true; original_amount=568,000; final_amount=490,000
```

### 10.6 EC-03 (would-be negative) example

Voucher 50% + item promo 50% ⇒ combined would be 100%. Global cap 50% forces `final_voucher_discount = max(0, 2,350,000 - item_promotion_discount)`; total clamped ≥ 1 VND; warning logged.

### 10.7 Source of `item_promotion_discount` and `original line item totals` — VERIFIED field sources

**Technically Verified** (fields exist and are the authoritative store cart fields — `@medusajs/medusa/dist/api/store/carts/query-config.js`) with one **narrow `[NEEDS_VERIFICATION]`** on exact discount-inclusion semantics. All inputs come from the **authoritative Cart + Promotion state** via `query.graph`, never recomputed by VoucherEngine (Rule 5/11/18, SEC-01, Solution Flow §3.2). `loadCartContextStep` (§11.1) reads these and hands the calculator **plain integers** (`CalcInputDTO`, §11.10).

| §10 calculator input                | Verified authoritative source (cart `query.graph` field)                                                                                                                                                    |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| resolved sale subtotal / cap base   | `Σ items.unit_price × items.quantity`, where `items.unit_price` is Medusa's Pricing Module resolved amount, including Price List sale price.                                                                |
| native non-voucher adjustment total | `Σ items.adjustments[].amount` over non-voucher adjustments. This is normally `0` under the current SRS interpretation because item promotion means Price List sale price, not native Promotion adjustment. |
| eligible voucher basis              | `Σ` over voucher-eligible lines of `(unit_price × quantity − Σ non-voucher adjustments on that line)` — all from verified line fields.                                                                      |
| eligible-item scope match (V6)      | **`items.product_id`** and **`items.product.categories.id`** (verified) matched against `VoucherConfig.applicable_product_ids`/`applicable_category_ids` (JSON arrays, Decision B) via `toVoucherScope`.    |

**Distinguishing item-promotion adjustments from VoucherEngine's own voucher adjustment (verified basis):** every adjustment carries **`promotion_id`** and **`code`** (verified fields). VoucherEngine's backing promotion (§14.2-A) has a known `promotion_id`/`code`; therefore:

- item-level promotion discount = `Σ items.adjustments[].amount WHERE promotion_id ≠ voucher.promotion_id`.
- the voucher's own contribution = the adjustment(s) where `promotion_id = voucher.promotion_id` (or `code = voucher.code`).

This makes VoucherEngine's responsibility concrete: it never changes `items.unit_price` or Price List data, and it never intentionally reduces non-voucher adjustments. The current SRS does not require supporting native Promotion Module line-item adjustments coexisting with vouchers; if such adjustments appear unexpectedly, `verifyCartTotalsStep` may keep a defensive non-voucher-adjustment shrink guard and fail closed with `VOUCHER_STACKING_UNSUPPORTED`.

**Narrow `[NEEDS_VERIFICATION #2]`:** the exact discount-inclusion semantics of `item_subtotal` vs `item_discount_total` vs `discount_total` — specifically whether `item_subtotal` is net of **item-level** promotions only (expected) vs all discounts, and whether `discount_total` includes shipping discounts. Confirm against the cart module's totals calculator (transitive `@medusajs/cart`, unreachable this pass). Mitigation: compute `item_promotion_discount` directly from per-line `items.adjustments[].amount` (excluding the voucher's own), which does not depend on the aggregate-field semantics. **The pure `lib/calculate-discount.ts` takes plain numbers and is fully unit-testable now** (§16.1). §10.7 (read) and §14.2-A (write) share the same verified adjustment model.

---

## 11. Workflows & Steps

Voucher/cart/order mutations go through workflows (skill `arch-workflow-required`). The approved `DiscountCapConfig` singleton admin upsert may be a direct route-level service operation (§11.9). Workflow composition constraints (skill): non-async regular `function`, no `await`, no conditionals (use `when()`), no direct var manipulation (use `transform()`), unique step `.config({name})` on repeats.

### 11.1 `applyVoucherWorkflow` (`workflows/voucher-engine/apply-voucher.ts`) — Solution Flow §7.1, D-02, SRS §7.2

Steps (each in `steps/`):

The whole read→compute→apply section runs inside a **Locking Module** lock keyed `voucher:cart:{cart_id}` (§14.2-C).

1. `normalizeCodeStep` — trim+upper (pure).
2. `checkRateLimitStep` — cooldown check via atomic counter client; throws `VOUCHER_RATE_LIMITED` if blocked (§14.1).
3. `lookupVoucherStep` — load `VoucherConfig` by code (row includes `applicable_product_ids`/`applicable_category_ids` and `promotion_id` directly — Decision B/C, no separate scope fetch). 404 → `VOUCHER_NOT_FOUND`.
4. `loadCartContextStep` — read the **latest** cart via `query.graph` (fields per §10.7); derive `original_item_subtotal`, per-line `items.adjustments`, `item_subtotal`, product/category. (No stale snapshot — the lock makes this read authoritative for the section.)
5. `validateVoucherStep` — V1–V8 fail-fast (§9). On security-relevant failure (V1 only, §9.3) increment the rate-limit counter (no compensation needed; cart unchanged).
6. `resolveEligibleItemsStep` — determine eligible line items from scope (`items.product_id` / `items.product.categories.id`).
7. `calculateVoucherDiscountStep` — raw + voucher cap (`lib/calculate-discount`, plain ints).
8. `enforceGlobalCapStep` — apply global cap; produce `final_voucher_discount`, `discount_capped`.
9. `applyVoucherPromotionStep` — **create an ephemeral, cart-specific fixed-amount Promotion** (`createPromotionsWorkflow`: `application_method { type:"fixed", target_type:"items", allocation:"across", value: final_voucher_discount, currency_code, target_rules?: best-effort — Rule 7 is enforced at §10 calc, not here (NV#16) }`, unique `code` with nonce suffix, `is_automatic:false`) and attach it via `updateCartPromotionsWorkflow ADD [ephemeral code]` (Decision G, §14.2-A). The Cart module recomputes authoritative totals from source. Write the auxiliary `cart.metadata.voucher` snapshot (including the ephemeral `{ promotion_id, code }`) + `_revalidation_marker`. **Compensation:** `updateCartPromotionsWorkflow REMOVE [ephemeral code]` **and delete the ephemeral Promotion**, letting the cart recompute — **never** write back a captured numeric total (Rule 18). (On replace, the previously-active ephemeral promotion is only detached+deleted after this step succeeds — §11.1 replace note.)
10. `verifyCartTotalsStep` — **refetch** the authoritative cart, sum the **ephemeral** voucher adjustment (`items.adjustments[] WHERE promotion_id == ephemeral promotion_id`, from `cart.metadata.voucher`) as **raw** (full-precision) amounts, read `cart.total`, and compare against the internally computed `final_voucher_discount` / `expected_final_cart_total` (§23.4, tasks 3.3.14 / 3.8.4). On mismatch → throw `VOUCHER_CALCULATION_FAILED`. **Compensation:** `updateCartPromotionsWorkflow REMOVE [ephemeral code]` (+delete ephemeral promotion) so the cart recomputes to its pre-voucher state. The internally computed total is used **only** for this assertion; the refetched Cart total is what the route returns.

(The former "verify-cart-unchanged / updated*at re-read" step is replaced by the lock + latest-read in §14.2-C; the new step 10 verifies \_totals correctness*, a different concern from concurrency.)

Full code-level contracts for the calculation/cart-context/verification/route files touched by steps 4, 7–10 are in **§23 (Code-Level Implementation Blueprint)**.

Returns the apply-success/failure envelope (§8). On any validation/calc failure the cart stays unchanged (§18.4).

**Replace (SRS VOUCH-001, Solution Flow §7.2):** the route reads the `?replace=true` query flag (via `ApplyVoucherQuerySchema`) and passes it into the workflow input as `replace: boolean` (the workflow receives a plain boolean; it does not know about query strings — Decision E). If cart already has an active voucher and `replace!==true`, the workflow short-circuits **before step 9 (`applyVoucherPromotionStep`)** and returns a "confirm replacement" signal (no mutation). If confirmed, the existing voucher's **ephemeral** promotion stays attached until step 9 succeeds; only then is the new ephemeral promotion created+`ADD`ed and the old one `REMOVE`d+deleted (Decision G — the two ephemeral promotions are distinct records, so this is a clean swap, not a value mutation). If the new voucher fails validation/calc, the old ephemeral promotion remains untouched (Solution Flow §7.2 "must not remove valid existing voucher before replacement validated"; §18.4 rule 3).

### 11.2 `removeVoucherWorkflow` (`workflows/voucher-engine/remove-voucher.ts`) — Solution Flow §13.2 (Remove), SRS VOUCH-004

1. `assertActiveVoucherStep` — confirm cart has an active voucher promotion by reading the **ephemeral** `{ promotion_id, code }` from `cart.metadata.voucher` and matching a cart adjustment with that ephemeral `promotion_id`/`code` (Decision G, §14.2-A). (Not `VoucherConfig.promotion_id` — that canonical record is never on the cart.)
2. `removeVoucherPromotionStep` — `updateCartPromotionsWorkflow REMOVE [ephemeral code]`, then **delete the ephemeral Promotion**; the Cart module recomputes totals **without** the voucher from source (never a stale write-back). Clear the `cart.metadata.voucher` snapshot. **Compensation:** re-create+`ADD` the ephemeral promotion (unlikely needed).
   No usage change (Rule 12/13). Returns `VOUCHER_REMOVED` envelope.

### 11.3 `revalidateVoucherWorkflow` (`workflows/voucher-engine/revalidate-voucher-on-cart-change.ts`) — Solution Flow §7.4, D-05, SRS VOUCH-005

Invoked by the `cart.updated` subscriber (external mutations) and inline at the end of voucher-owned flows (§11.5). Runs inside the `voucher:cart:{cart_id}` lock (§14.2-C).

1. `checkVoucherExistsStep` — if no active voucher, exit early (`when()`).
2. `loadCartContextStep` (reuse) — latest cart.
3. `revalidateStep` — re-run the cart-change validation subset **V1, V2, V5, V6, V7 when configured, V8** (§9.2).
   3a. valid → `calculateVoucherDiscountStep` + `enforceGlobalCapStep` → **replace the ephemeral promotion** carrying the new amount: `REMOVE`+delete the old ephemeral promotion, then create+`ADD` a new ephemeral fixed-amount promotion (value = recomputed `final_voucher_discount`) and update `cart.metadata.voucher`; the Cart module recomputes authoritative totals from source. A promotion's `value` is not mutated in place — replacing the ephemeral record keeps each amount cart-specific.
   3b. invalid → `removeVoucherPromotionStep` (+delete ephemeral promotion) + build `VOUCHER_AUTO_REMOVED` reason.
   Auto-removal reasons per Solution Flow §7.4 table (below min order, all eligible removed, scope ineligible → removed; else recalculated).

**Revalidation subset:** `revalidateStep` re-runs **V1, V2, V5, V6, V7 when configured, V8** (§9.2), **not** V3–V8 (usage rules are re-checked only at redemption, §9.0). Superseded note: the earlier "V3–V8" phrasing (and any elsewhere) is corrected to this subset.

### 11.4 `recordVoucherUsageWorkflow` (`workflows/voucher-engine/record-voucher-usage.ts`) — Solution Flow §7.5, D-06, SRS INT-02/INT-04

Invoked **primarily** as a synchronous step/hook of `completeCartWorkflow`, and **as a fallback** by the `order.placed` subscriber (§13.2/§13.3). Both are idempotent, so running both is safe.

1. `assertOrderHasVoucherStep` — resolve the applied voucher **from the order** via **`order.metadata.voucher.voucher_id`** → `VoucherConfig` (Decision G; verified propagation: `completeCartWorkflow` copies `metadata: cart.metadata` into the order, `complete-cart.js:404`). If absent → exit early via `when()` (not an error). **Why not the adjustment:** under Decision G the order's `items.adjustments[].promotion_id`/`code` carry the _ephemeral_ promotion's id/code, which do **not** map to `VoucherConfig` — so the adjustment identifies the amount but not the voucher; `order.metadata.voucher` is the identity channel. The applied-amount fields (step 4) are still read from the order's voucher adjustment (raw sum), which is authoritative for the money.
2. `idempotencyCheckStep` — if `VoucherUsageLog(voucher_id, order_id)` exists → stop (no increment). First idempotency guard (Rule; D-06).
3. `atomicIncrementStep` — conditional atomic global increment + concurrency-safe per-user check (§14.3), in one transaction.
4. `createUsageLogStep` — insert immutable `VoucherUsageLog` with the full audit snapshot (§5.2), incl. `discount_applied`/`original_discount`/`was_capped` read from the order's voucher adjustment (the ephemeral promotion's `items.adjustments`, summed raw; identified via `order.metadata.voucher.{promotion_id, code}`). Unique `(voucher_id, order_id)` = **second** idempotency guard. Same DB transaction as step 3 (§14.3).
5. failure (capacity exhausted at redemption) → do not create an invalid log; **log-and-alert, no auto-compensation** (§14.3, §18.4-5); order stands, redemption flagged for manual review.

> When run from the subscriber path, the handler must not throw (async, non-blocking): errors are caught + logged; idempotency makes redelivery safe (skill best-practices 2, 6). When run from the completion hook, a failure in steps 3–4 is caught and flagged (per step 5) rather than failing the order — the customer has already paid.

### 11.5 Cart-change revalidation — synchronous vs subscriber (RESOLVED: combination)

**Decision:** use **both**, with a single shared `revalidateVoucherWorkflow` invoked from two triggers. This resolves task item 8.

| Trigger                                                                                                            | Mode                             | Why                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------ | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Voucher-owned mutations (`applyVoucherWorkflow` end, before returning)                                             | **Synchronous, inline**          | The apply flow already holds the latest cart; the customer must see the correct total in the same response. This is the concurrency re-check (§14.2). |
| External cart mutations (item add/remove, qty change, variant change, suggestive-selling add) via core Cart routes | **Subscriber** on `cart.updated` | VoucherEngine does not own these routes and cannot wrap them; the event is the only decoupled hook (Solution Flow §7.4, §14 interaction map).         |

Rationale for the combination (not subscriber-only): a subscriber is **asynchronous and eventually-consistent**, so if the customer's _next_ action is reading the cart immediately after a voucher-affecting change made inside our own flow, an async-only design could show a stale total for a window. Inline revalidation on our own mutations closes that window; the subscriber covers everything we don't control. Both call the same workflow, so the rules cannot drift.

**Loop-guard (critical) — convergent, not counter-based.** Applying/updating the voucher promotion via `updateCartPromotionsWorkflow` mutates the cart and therefore may re-emit `cart.updated`, re-triggering the subscriber. The guard must guarantee the re-run performs **no further mutation**, so the loop terminates after one convergent pass:

- The workflow computes the **desired** voucher state `{voucher_id, final_voucher_discount, eligible_item_ids}` from the latest cart, then compares it to the **currently applied** state (the existing voucher adjustment amount + code already on the cart).
- If desired == applied → **exit before any write** (no promotion update, no metadata write). Because the second (echo) invocation recomputes the _same_ desired state that is already applied, it hits this branch and stops — the loop cannot continue.
- Only a genuine change (amount differs, or validity flipped) mutates, which is exactly the intended behavior.
- The `_revalidation_marker` is a cheap fast-path (skip recompute when the cart's change fingerprint is unchanged) but is **not** the loop's correctness mechanism — the desired-vs-applied equality is. This avoids the failure mode where writing the marker itself re-emits `cart.updated` and sustains the loop.

`[NEEDS_VERIFICATION #5]` — whether `updateCartPromotionsWorkflow`'s no-op case (re-adding an identical promotion) still emits `cart.updated`; if it does not, the guard is belt-and-suspenders; if it does, the desired-vs-applied equality above is load-bearing (and sufficient).

### 11.6 `createVoucherWorkflow` (`workflows/voucher-engine/admin/create-voucher.ts`) — Solution Flow §7.6, SRS §6.2 (NEW)

Admin create. Referenced by `POST /admin/vouchers` (§12) but previously undefined.

1. `validateVoucherConfigStep` — completeness/consistency: code format (SEC-03: ≥6 chars, `^[A-Z0-9]+$`, uppercased), `discount_value>0`, `valid_from<valid_to`, `per_user_limit>=1`, percentage `discount_value<=10000` bps, nullable-vs-required coherence. Business errors, not `MedusaError.NOT_FOUND`.
2. `normalizeVoucherCodeStep` — uppercase+trim (reuse `lib/normalize-code`); assert uniqueness (service `list` by code) → conflict error if taken.
3. `createBackingPromotionStep` — create the **canonical/reference** Medusa **Promotion** (Decision G, §14.2-A) via `createPromotionsWorkflow`: `code`, `application_method` (percentage/fixed), scope `target_rules` from `applicable_product_ids`/`applicable_category_ids` (Decision B), min-order `rules`, global `limit`, `is_automatic=false`. **This canonical Promotion is stored on `VoucherConfig.promotion_id` for admin/analytics reference and as the template for apply-time ephemeral promotions; it is NEVER attached to a cart and its rules/limit do NOT enforce at apply** (Decision G). **Compensation:** delete the created Promotion. `createPromotionsWorkflow` input signature verified (NV#3 resolved, §14.2-A).
4. `createVoucherConfigStep` — `create` `VoucherConfig` with `promotion_id` from step 3 (Decision C) and `applicable_product_ids`/`applicable_category_ids` (Decision B) set directly on the same row. **Compensation:** `delete` the created row. No separate scope-rows step exists (Decision B — there is no `VoucherScope` model).
5. `invalidateVoucherCacheStep` — invalidate config cache for the code (§14.4). Compensation: none (cache is non-authoritative).

> **Decision G note:** the canonical backing Promotion records the natively-expressible parts (code/percentage/fixed, scope via `target_rules`, min-order via `rules`, global `limit`) **for reference/admin/analytics and as the ephemeral-promotion template only** — since it is never attached to a cart, those native rules/limit enforce nothing. **All** validation (V1–V8), the global cap, per-user limit, and segment are enforced by VoucherEngine at apply/redemption; at apply, the final capped amount is carried to the cart by a fresh ephemeral fixed-amount Promotion (§14.2-A).

### 11.7 Admin update/deactivate voucher workflows — out of SRS scope

SRS §6.2 requires admin voucher creation and admin voucher analytics. It does not require voucher update or deactivate endpoints/workflows. Do not implement `updateVoucherWorkflow`, `deactivateVoucherWorkflow`, `POST /admin/vouchers/:id`, `PUT /admin/vouchers/:id`, or `DELETE /admin/vouchers/:id` unless a later approved requirement explicitly adds them.

If a future requirement adds update/deactivate, it must be Promotion-first and keep the canonical Promotion/Campaign and `VoucherConfig` extension fields in sync. That future design must not rewrite `VoucherUsageLog`; historical usage rows remain append-only.

### 11.9 `DiscountCapConfig` admin upsert — SRS §5.2 DiscountCapConfig, §6

Admin updates the global cap singleton through `GET /admin/discount-cap-config` and `POST /admin/discount-cap-config` (§12). A direct route-level singleton upsert is acceptable here because the SRS requires a single active record and the current repository already implements this as a small direct service operation; a workflow is optional if later orchestration/compensation is needed.

1. Validate input with `UpdateDiscountCapSchema`: integer `max_discount_percentage` in basis points, `0 <= value <= 10000`.
2. Enforce **single active record**: update the active row in place if it exists, otherwise create the first active row. Set `updated_by` from the authenticated admin/server context, never from client input. History is tracked through `updated_at`, not through multiple active/inactive rows.
3. Invalidate `DiscountCapConfig` cache if cap caching is enabled (§14.4).

> The cap change affects only **future** calculations. Live carts pick up the new cap on their next revalidation (§11.5); no retroactive rewrite.

### 11.10 Workflow-step contracts

Concrete input/output contracts for every step above. `Input`/`Output` are the step's own DTOs (define under `workflows/voucher-engine/steps/*` or `lib/`); names ending `DTO` are VoucherEngine-owned and fully specifiable now. Types tagged `[NV#n]` reference a Medusa framework type whose exact shape is unverified this pass (§19.2) — the step signature is defined, only the external type binding is pending. `Reads`/`Mutations` name the module and operation. `—` = none.

**`applyVoucherWorkflow` (§11.1)**

| Step                         | File                                | Input Type                                                                                                                                          | Output Type                                                                                                                                                                                                                          | Dependencies     | Reads                                                                                                                           | Mutations                                                                                                                                                                                                                             | Compensation                                                                                                                      | Errors                                                                            |
| ---------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| normalizeCodeStep            | steps/normalize-code.ts             | `{ code: string }`                                                                                                                                  | `{ normalized_code: string }`                                                                                                                                                                                                        | —                | —                                                                                                                               | —                                                                                                                                                                                                                                     | —                                                                                                                                 | — (pure)                                                                          |
| checkRateLimitStep           | steps/check-rate-limit.ts           | `{ identity: RateLimitIdentityDTO }`                                                                                                                | `{ allowed: true }`                                                                                                                                                                                                                  | normalizeCode    | Redis counter/cooldown keys (§14.1)                                                                                             | —                                                                                                                                                                                                                                     | —                                                                                                                                 | `VOUCHER_RATE_LIMITED` (429)                                                      |
| lookupVoucherStep            | steps/lookup-voucher.ts             | `{ normalized_code: string }`                                                                                                                       | `{ voucher: VoucherConfigDTO }` (scope is `voucher.applicable_product_ids`/`applicable_category_ids`, mapped via `toVoucherScope` — Decision B, no separate `scopes` array)                                                          | rateLimit        | VoucherEngine `list/retrieve` (+config cache §14.4)                                                                             | —                                                                                                                                                                                                                                     | —                                                                                                                                 | `VOUCHER_NOT_FOUND` (404)                                                         |
| loadCartContextStep          | steps/load-cart-context.ts          | `{ cart_id: string, customer_id?: string }`                                                                                                         | `CartContextDTO { original_item_subtotal:int, item_subtotal:int, item_discount_total:int, lines:[{id,unit_price,quantity,product_id,category_ids,adjustments:[{amount,promotion_id,code}]}] }` (all from verified cart fields §10.7) | —                | Cart `query.graph` (verified fields §10.7): totals + `items.adjustments` + `items.product.categories`                           | —                                                                                                                                                                                                                                     | —                                                                                                                                 | `VOUCHER_CALCULATION_FAILED` (safe)                                               |
| validateVoucherStep          | steps/validate-voucher.ts           | `{ voucher, cartContext, context:'apply', customer_usage_count:int }` (scope read from `voucher.applicable_product_ids`/`applicable_category_ids`)  | `{ valid: true, eligible_item_ids: string[] }`                                                                                                                                                                                       | lookup, loadCart | VoucherEngine usage `count` (V4)                                                                                                | Redis counter++ on V1 fail only (§9.3)                                                                                                                                                                                                | —                                                                                                                                 | `VOUCHER_*` per V1–V8 (§8.4), fail-fast                                           |
| resolveEligibleItemsStep     | steps/resolve-eligible-items.ts     | `{ scope: toVoucherScope(voucher), line_items }`                                                                                                    | `{ eligible: EligibleItemDTO[] }`                                                                                                                                                                                                    | validate         | — (uses loaded context)                                                                                                         | —                                                                                                                                                                                                                                     | —                                                                                                                                 | —                                                                                 |
| calculateVoucherDiscountStep | steps/calculate-voucher-discount.ts | `CalcInputDTO { eligible_post_promotion_subtotal:int, discount_type, discount_value:int, max_discount_amount?:int }`                                | `{ raw_voucher_discount:int, voucher_discount_after_voucher_cap:int }`                                                                                                                                                               | resolveEligible  | — (pure, `lib/calculate-discount`)                                                                                              | —                                                                                                                                                                                                                                     | —                                                                                                                                 | `VOUCHER_CALCULATION_FAILED`                                                      |
| enforceGlobalCapStep         | steps/enforce-global-cap.ts         | `{ voucher_discount_after_voucher_cap:int, original_subtotal:int, item_promotion_discount:int, cap_bps:int }`                                       | `{ final_voucher_discount:int, discount_capped:bool, original_discount:int }`                                                                                                                                                        | calculate        | DiscountCapConfig (+cap cache §14.4)                                                                                            | —                                                                                                                                                                                                                                     | —                                                                                                                                 | —                                                                                 |
| applyVoucherPromotionStep    | steps/apply-voucher-promotion.ts    | `ApplyInputDTO { cart_id, voucher_id, voucher_code, currency_code, final_voucher_discount, original_discount, discount_capped, eligible_item_ids }` | `{ cart, ephemeral_promotion_id, ephemeral_code }` (recomputed by Cart module)                                                                                                                                                       | enforceCap       | —                                                                                                                               | Promotion: `createPromotionsWorkflow` (ephemeral fixed/across, value=`final_voucher_discount`); Cart: `updateCartPromotionsWorkflow ADD [ephemeral code]` + `cart.metadata.voucher` snapshot incl. `{promotion_id,code}` (Decision G) | `updateCartPromotionsWorkflow REMOVE [ephemeral code]` + delete ephemeral Promotion → cart recomputes (NOT stale restore — §14.2) | `VOUCHER_CALCULATION_FAILED`; create-promotion signature verified (NV#3 resolved) |
| verifyCartTotalsStep         | steps/verify-cart-totals.ts         | `VerifyTotalsInputDTO { cart_id, ephemeral_promotion_id, final_voucher_discount:int, expected_final_cart_total:int }`                               | `{ cart, verified:true }` (authoritative refetched cart)                                                                                                                                                                             | applyPromotion   | Cart refetch (`query.graph`/`refetchCart`, §23.4); sum `items.adjustments[] WHERE promotion_id==ephemeral_promotion_id` **raw** | — (read-only; no total mutation)                                                                                                                                                                                                      | `updateCartPromotionsWorkflow REMOVE [ephemeral code]` + delete ephemeral Promotion → cart recomputes to pre-voucher state        | `VOUCHER_CALCULATION_FAILED` on total/adjustment mismatch (§23.4)                 |

**`removeVoucherWorkflow` (§11.2)**

| Step                       | File                              | Input Type                                            | Output Type                                    | Dependencies | Reads                                                                                           | Mutations                                                                                                                         | Compensation                                                        | Errors                                              |
| -------------------------- | --------------------------------- | ----------------------------------------------------- | ---------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------- |
| assertActiveVoucherStep    | steps/assert-active-voucher.ts    | `{ cart_id }`                                         | `{ voucher_id, code, ephemeral_promotion_id }` | —            | `cart.metadata.voucher` ephemeral `{promotion_id,code}` + matching cart adjustment (Decision G) | —                                                                                                                                 | —                                                                   | `VOUCHER_NOT_FOUND` (no active voucher → 404/no-op) |
| removeVoucherPromotionStep | steps/remove-voucher-promotion.ts | `{ cart_id, ephemeral_code, ephemeral_promotion_id }` | `{ cart }` (recomputed)                        | assert       | —                                                                                               | Cart: `updateCartPromotionsWorkflow REMOVE [ephemeral code]` → recompute; **delete ephemeral Promotion**; clear metadata snapshot | re-create+`ADD` ephemeral promotion → recompute (not stale restore) | `VOUCHER_CALCULATION_FAILED`                        |

**`revalidateVoucherWorkflow` (§11.3, §11.5)**

| Step                               | File                                      | Input Type                                                                                                                    | Output Type                                                 | Dependencies | Reads                       | Mutations                                                                              | Compensation                             | Errors                                     |
| ---------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------ | --------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------ |
| checkVoucherExistsStep             | steps/check-voucher-exists.ts             | `{ cart_id }`                                                                                                                 | `{ has_voucher:bool, voucher_id?, marker? }`                | —            | Cart voucher state `[NV#3]` | —                                                                                      | —                                        | — (exit via `when()`)                      |
| loadCartContextStep (reuse)        | steps/load-cart-context.ts                | `{ cart_id, customer_id? }`                                                                                                   | `CartContextDTO`                                            | checkExists  | as §11.1                    | —                                                                                      | —                                        | caught → log, no throw (subscriber)        |
| revalidateStep                     | steps/validate-voucher.ts                 | `{ voucher, cartContext, context:'revalidate' }` (scope read from `voucher.applicable_product_ids`/`applicable_category_ids`) | `{ still_valid:bool, failure_reason?, eligible_item_ids? }` | loadCart     | VoucherEngine               | —                                                                                      | —                                        | none surfaced to customer synchronously    |
| recalcAndUpdateStep (when valid)   | steps/apply-voucher-promotion.ts (reuse)  | `ApplyInputDTO`                                                                                                               | `{ cart }`                                                  | revalidate   | DiscountCapConfig           | Cart: `updateCartPromotionsWorkflow` re-apply new amount → recompute; refresh snapshot | re-derive (recompute, not stale restore) | `VOUCHER_CALCULATION_FAILED` (logged)      |
| removeAndNotifyStep (when invalid) | steps/remove-voucher-promotion.ts (reuse) | `{ cart_id, code, reason_code }`                                                                                              | `{ cart, notification }`                                    | revalidate   | —                           | Cart: `updateCartPromotionsWorkflow REMOVE` → recompute                                | —                                        | builds `VOUCHER_AUTO_REMOVED` (§13, async) |

**`recordVoucherUsageWorkflow` (§11.4)**

| Step                      | File                              | Input Type                                                 | Output Type                                                                              | Dependencies               | Reads                                                                                                                                                                                                                    | Mutations                                                                                                    | Compensation                         | Errors                                                                      |
| ------------------------- | --------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------ | --------------------------------------------------------------------------- |
| assertOrderHasVoucherStep | steps/assert-order-has-voucher.ts | `{ order_id }`                                             | `{ voucher_id, customer_id, discount_applied, original_discount, was_capped, snapshot }` | —                          | **Identity:** `order.metadata.voucher.voucher_id` → `VoucherConfig` (Decision G, verified propagation §13.3). **Amount:** order ephemeral `items.adjustments` (raw sum). NOT `adjustment.code→VoucherConfig` (ephemeral) | —                                                                                                            | —                                    | exit via `when()` if none                                                   |
| idempotencyCheckStep      | steps/idempotency-check.ts        | `{ voucher_id, order_id }`                                 | `{ already_processed:bool }`                                                             | assert                     | VoucherEngine `list VoucherUsageLog`                                                                                                                                                                                     | —                                                                                                            | —                                    | — (stop if processed)                                                       |
| atomicIncrementStep       | steps/atomic-increment.ts         | `{ voucher_id, customer_id, per_user_limit, usage_limit }` | `{ incremented:bool }`                                                                   | idempotency                | —                                                                                                                                                                                                                        | VoucherEngine: conditional `usage_count++` + per-user guard in txn (§14.3); Locking `voucher:redeem:{v}:{c}` | — (txn rollback is the compensation) | capacity-exhausted → no throw; flag for review (§18.4-5)                    |
| createUsageLogStep        | steps/create-usage-log.ts         | `UsageLogSnapshotDTO (§5.2)`                               | `{ usage_log_id }`                                                                       | atomicIncrement (same txn) | —                                                                                                                                                                                                                        | VoucherEngine: `create VoucherUsageLog` (append-only §5.2)                                                   | txn rollback                         | unique-violation on `(voucher_id,order_id)` → treated as idempotent success |

**Admin create + discount-cap operations (§11.6–11.9)**

| Step                                                | File                                        | Input Type                                                                    | Output Type                                                                                         | Dependencies           | Reads                             | Mutations                                                                                                                                                             | Compensation                          | Errors                                    |
| --------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------- |
| validateVoucherConfigStep                           | steps/validate-voucher-config.ts            | `CreateVoucherDTO / Partial<...>`                                             | `{ valid: true }`                                                                                   | —                      | VoucherEngine `list` (uniqueness) | —                                                                                                                                                                     | —                                     | `MedusaError.INVALID_DATA` (400)          |
| normalizeVoucherCodeStep                            | steps/normalize-voucher-code.ts             | `{ code }`                                                                    | `{ normalized_code }`                                                                               | validate               | VoucherEngine `list` by code      | —                                                                                                                                                                     | —                                     | conflict (409) if code taken              |
| createBackingPromotionStep                          | steps/create-backing-promotion.ts           | `CreateVoucherDTO` (incl. `applicable_product_ids`/`applicable_category_ids`) | `{ promotion_id }` (canonical/reference only — never cart-attached, Decision G)                     | normalize              | —                                 | Promotion: `createPromotionsWorkflow` (§14.2-A)                                                                                                                       | `delete` created Promotion            | NV#3 resolved (create signature verified) |
| createVoucherConfigStep                             | steps/create-voucher-config.ts              | `CreateVoucherDTO + promotion_id`                                             | `{ voucher_id }`                                                                                    | createBackingPromotion | —                                 | VoucherEngine `create VoucherConfig` (+`promotion_id`, + `applicable_product_ids`/`applicable_category_ids` directly on the row — Decision B, no separate scope step) | `delete VoucherConfig`                | —                                         |
| assertVoucherExistsStep                             | steps/assert-voucher-exists.ts              | `{ id }`                                                                      | `{ voucher: VoucherConfigDTO }` (prior field values, incl. scope arrays, captured for compensation) | —                      | VoucherEngine `retrieve`          | —                                                                                                                                                                     | —                                     | `VOUCHER_NOT_FOUND` (404)                 |
| validateCapInput                                    | route validator or steps/validate-cap.ts    | `{ max_discount_percentage:int }`                                             | `{ valid: true }`                                                                                   | —                      | —                                 | —                                                                                                                                                                     | —                                     | `INVALID_DATA` if out of 0..10000         |
| upsertActiveCap                                     | route handler or steps/upsert-active-cap.ts | `{ max_discount_percentage, updated_by }`                                     | `{ cap_id }`                                                                                        | validateCapInput       | DiscountCapConfig `list`          | update active `DiscountCapConfig` in place, or create the first active row if none exists                                                                             | restore prior value if workflow-based | —                                         |
| invalidateVoucherCacheStep / invalidateCapCacheStep | steps/invalidate-cache.ts                   | `{ code? \| 'cap' }`                                                          | `{ invalidated:bool }`                                                                              | (last)                 | —                                 | Redis `del` key(s) (§14.4)                                                                                                                                            | —                                     | swallow Redis error (fail-open, §14.5)    |

---

## 12. API Routes

Store routes require the publishable API key (SDK handles it); admin routes require admin auth (use `AuthenticatedMedusaRequest`, skill `type-authenticated-request`). Routes are thin: validate → run workflow → map result/error to envelope (skill `arch-workflow-required`, `logic-workflow-validation`).

| Method + path                       | Handler                                                                         | Workflow                                     | SRS / Flow             |
| ----------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------- | ---------------------- |
| `POST /store/carts/:id/voucher`     | apply/replace (`?replace=true`)                                                 | `applyVoucherWorkflow`                       | VOUCH-001, §7.1/§7.2   |
| `DELETE /store/carts/:id/voucher`   | remove                                                                          | `removeVoucherWorkflow`                      | VOUCH-004, §13.2       |
| `GET /store/customers/me/vouchers`  | list vouchers for current customer (auth-optional; guest → `{vouchers:[]}` 200) | read-only (`query.graph`, no workflow)       | §6.2, §7.1, Decision F |
| `POST /admin/vouchers`              | create                                                                          | `createVoucherWorkflow` (§11.6)              | §6.2, §7.6             |
| `GET /admin/vouchers`               | list                                                                            | read-only                                    | §7.6                   |
| `GET /admin/vouchers/:id/analytics` | usage/discount stats                                                            | read-only aggregation over `VoucherUsageLog` | §6.2                   |
| `GET /admin/discount-cap-config`    | read active cap                                                                 | read-only (`DiscountCapConfig` active row)   | §5.2, §5.3             |
| `POST /admin/discount-cap-config`   | upsert global cap singleton                                                     | direct singleton upsert or workflow (§11.9)  | §5.2, EC-01/EC-03      |

**Admin update/deactivate:** not required by SRS §6.2. Do not add voucher update/deactivate routes unless a later approved requirement explicitly adds them.

> **Current implementation gap (2026-07-20 review):** `GET /store/customers/me/vouchers` currently returns every active/valid voucher for any authenticated customer instead of filtering by the approved CRM/customer assignment source (Decision F). Guests correctly still get `200 { vouchers: [] }`. See "Known Implementation Gaps & Correction Order" above.

Rate limiting on `POST /store/carts/:id/voucher` is enforced inside the workflow (step 2) so the cooldown check shares the normalized-code context; a route-level middleware alternative is possible but not required.

Register body validators in `api/middlewares.ts` (verified pattern — `apps/backend/src/api/middlewares.ts` uses `defineMiddlewares` + `validateAndTransformBody`; note zod is **v4.2.0** per `package.json`, so use zod-v4 schema APIs) for `POST /store/carts/:id/voucher` (body `ApplyVoucherSchema`), `DELETE /store/carts/:id/voucher` (body `RemoveVoucherSchema`), `POST /admin/vouchers`, and `POST /admin/discount-cap-config`. The `?replace=true` query flag is validated by `ApplyVoucherQuerySchema` (see §4.2 note on `validateAndTransformQuery` vs inline `req.query` parse).

---

## 13. Subscribers & Events

Two subscribers only. Cache invalidation is **not** a subscriber — it is inlined into the admin workflows (§14.4), so §13.4 (old) is dropped. Revalidation is a **combination of synchronous + subscriber** (§11.5); this section covers the subscriber half.

### 13.1 `voucher-cart-updated.ts` — `cart.updated` (external cart mutations)

```ts
export const config: SubscriberConfig = { event: "cart.updated" };
```

Handler resolves the cart id from `data.id`, runs `revalidateVoucherWorkflow` (§11.3). Catches & logs errors (never throws — skill best-practice 2). Covers the mutations VoucherEngine does **not** own: item add/remove, qty change, variant change, suggestive-selling adds (§11.5). Voucher-owned flows revalidate **synchronously** and do not depend on this event.

**Loop-guard (load-bearing):** `revalidateVoucherWorkflow` updates cart totals, which may re-emit `cart.updated`. The workflow exits before mutating when its input marker equals `cart.metadata.voucher._revalidation_marker` (§11.5). Without this guard the subscriber can self-trigger indefinitely.

- `[NEEDS_VERIFICATION #5]` — that `cart.updated` fires for **every** relevant mutation and does **not** fire (or is guarded) for the totals-update our own workflow performs; and its exact payload shape (`data.id` assumed). Event **name** is documented in the medusa-dev skill (`reference/subscribers-and-events.md` Cart Events); payload/coverage unverified against installed source. (PD-03, PD-09.)

### 13.2 `voucher-order-placed.ts` — successful-order event (redemption trigger)

```ts
export const config: SubscriberConfig = { event: "order.placed" };
```

Runs `recordVoucherUsageWorkflow` (§11.4) with `order_id = data.id`. Idempotent (unique constraint + pre-check, §14.3), so duplicate delivery is safe. **This subscriber is the FALLBACK/repair path** — the primary redemption trigger is a synchronous completion hook (§13.3).

**Successful-order event — status `[NEEDS_VERIFICATION #6]`.** Verified: cart completion runs **`completeCartWorkflow`** and produces an order whose id is the completion `result.id` (`carts/[id]/complete/route.js`). The event **id string** and payload are defined in the transitive `@medusajs/utils` / `@medusajs/core-flows` (unreachable this pass — `framework/utils` only re-exports `@medusajs/utils`). So the literal name is **not** yet confirmed; candidate `order.placed` (medusa-dev skill reference). Because the **primary** trigger is the sync hook (§13.3), the fallback subscriber's unconfirmed event name no longer gates redemption — if the name is wrong the fallback simply never fires, while the primary hook still records usage. Confirm (a) the event id, (b) fires-once, (c) `data.id` = order id, against `@medusajs/utils` `OrderWorkflowEvents`/`completeCartWorkflow` emissions.

### 13.3 Cart→Order propagation + redemption trigger — VERIFIED propagation; sync hook PRIMARY

**Propagation — Technically Verified (two channels; Decision G splits money vs. identity).** The voucher discount is a Promotion-driven **line-item adjustment** (§14.2-A), and the order carries `*items.adjustments` plus the same computed `discount_total`/`item_subtotal` (verified: `orders/query-config.js`). So the **discount amount** survives cart→order natively.

- **Amount channel (verified):** the order's `items.adjustments` from the **ephemeral** promotion carry the applied discount; summing them raw gives `final_voucher_discount`. Authoritative for the money.
- **Identity channel (Decision G, verified):** the adjustment's `promotion_id`/`code` are the _ephemeral_ promotion's — they do **not** map to `VoucherConfig`. Redemption therefore resolves the voucher via **`order.metadata.voucher.voucher_id`**, which is verified to propagate: `completeCartWorkflow` copies `metadata: cart.metadata` into the created order (`@medusajs/core-flows/dist/cart/workflows/complete-cart.js:404`). This **supersedes** the earlier "no dependency on `cart.metadata` propagation / resolve voucher from `adjustment.code`→`VoucherConfig`" claim — that mapping is impossible under ephemeral promotions, and the metadata propagation it avoided is now source-verified, so the dependency is safe. (`CreatePromotionDTO` has no `metadata` field — verified — so identity cannot live on the ephemeral promotion; `order.metadata` is the only channel.)

`recordVoucherUsageWorkflow`'s `assertOrderHasVoucherStep` therefore reads `order.metadata.voucher.voucher_id` for identity and the ephemeral adjustment for the amount.

**Redemption trigger — sync hook PRIMARY, subscriber FALLBACK (resolves the "sync vs subscriber" correction):**

- **Primary (synchronous):** add a step/hook to the **`completeCartWorkflow`** so redemption (`recordVoucherUsageWorkflow` logic: idempotency check → atomic increment → usage-log insert, §14.3) runs **as part of successful order placement**, in the completion transaction. This is deterministic, ordered, and does not depend on the async event name. It fires exactly when the order is truly placed (Rule 13). `[NEEDS_VERIFICATION #6a]` — whether `completeCartWorkflow` exposes a consumable hook point (e.g. a `.hooks.*` such as an order-created hook) or must be extended by composing a wrapping workflow; verify in `@medusajs/core-flows`.
- **Fallback / repair (asynchronous):** the `order.placed` subscriber (§13.2) re-runs the same idempotent workflow. It covers orders created by paths that bypass the hook (e.g. admin/draft-order completion) and any missed hook execution. Because both paths share the `(voucher_id, order_id)` unique guard (§14.3), running both is safe — at most one redemption is recorded.
- If `[NV #6a]` shows no usable hook, the subscriber becomes primary and `[NV #6]` (event name) is promoted back to a redemption-slice blocker; documented so the fallback plan is explicit.

Net: propagation is **verified**; the redemption slice is **Ready after minor verification** (`[NV #6/#6a]`), no longer `BLOCKED`.

---

## 14. Redis Usage, Rate Limiting, Idempotency, Concurrency

Redis is **optional** in this repo — verified (repo): `medusa-config.ts` loads `@medusajs/cache-redis`, `@medusajs/event-bus-redis`, `@medusajs/workflow-engine-redis` under `key: Modules.CACHE / EVENT_BUS / WORKFLOW_ENGINE` **only when `REDIS_URL` is set**, otherwise Medusa's in-memory defaults apply. Redis is **never** the source of truth (Rule 20; Solution Flow §16.1).

**Access pattern `[NEEDS_VERIFICATION #9]`:** the cache module (`Modules.CACHE`, resolvable in workflow steps via the container) covers §14.4 caching cleanly, but it exposes only get/set/invalidate — it does **not** expose atomic `INCR`/`EXPIRE`/`SETNX`, which the rate-limiter (§14.1) and any optional lock (§14.2) need. Confirm whether this project standardises on (a) a thin dedicated `ioredis` client resolved from `REDIS_URL` for atomic ops, or (b) the cache module for cache + a separate client for counters. Recommendation: (b). The atomic-op client must degrade per §14.5 when `REDIS_URL` is unset.

### 14.1 Brute-force protection — RESOLVED (§7.8, SEC-02, EC-10)

**Algorithm (fixed 15-min window via TTL; simplest correct form):**

1. On an apply request, build the identity key (below) and read cooldown key first. If cooldown key exists → reject immediately with `VOUCHER_RATE_LIMITED` (429) and a `retry_after` derived from key TTL. No validation runs.
2. Otherwise run apply-time validation (§9.0). On a **security-relevant failure only** (`VOUCHER_NOT_FOUND`; §9.3): `INCR attempts_key`; if the INCR result is `1`, `EXPIRE attempts_key 900` (15 min). This makes the counter a **fixed 15-minute window** anchored at the first failure (chosen over a sliding log for simplicity and O(1) memory; documented trade-off — a burst straddling a window boundary can allow up to ~2×threshold, acceptable for MVP).
3. If the INCR result `>= threshold (5)` → `SET cooldown_key 1 EX 1800` (30 min) and `DEL attempts_key`; return `VOUCHER_RATE_LIMITED`.
4. On a **successful apply** → `DEL attempts_key` (do not touch cooldown; a success while cooling down is impossible because step 1 rejects first).

**Configurable** (env or DiscountCapConfig-adjacent config): `VOUCHER_RL_THRESHOLD=5`, `VOUCHER_RL_WINDOW_SEC=900`, `VOUCHER_RL_COOLDOWN_SEC=1800`.

> **Current implementation gap (2026-07-20 review):** `COOLDOWN_S` in `modules/voucher-engine/constants.ts` is `60`, not `1800`. This is a one-line implementation fix, not a design change — see "Known Implementation Gaps & Correction Order" above.

**Key patterns (§16.4 intent → concrete):**

| Purpose         | Key                              | Value             | TTL             |
| --------------- | -------------------------------- | ----------------- | --------------- |
| Failed attempts | `voucher:rl:attempts:{identity}` | integer count     | 900s (window)   |
| Cooldown        | `voucher:rl:cooldown:{identity}` | `1`               | 1800s           |
| Config lookup   | `voucher:cfg:{normalized_code}`  | serialized config | 60s (see §14.4) |
| Cap config      | `voucher:capcfg:active`          | serialized cap    | 60s             |

Concurrency locks are **not** Redis `SETNX` keys — they use the **Locking Module** (`Modules.LOCKING`, §14.2-C / §14.3) with keys `voucher:cart:{cart_id}` and `voucher:redeem:{voucher_id}:{customer_id}`. The rate-limit counters above still need atomic `INCR`/`EXPIRE`; those use the dedicated atomic client (`[NV #9]`), independent of the lock provider.

**Identity strategy — RESOLVED (recommended):** `identity = customer_id` when the request is authenticated, else `sess:{session_id}` for guests. IP is **logged** for monitoring (SEC-02) but **not** the primary throttle key, to avoid shared-network / CGNAT false positives. `[NEEDS_VERIFICATION #7]` — **narrowed:** how the store request exposes session id for **guests** in 2.16. The **customer-id** sub-part is now **VERIFIED**: native `dist/api/store/customers/me/route.js` reads the authenticated customer id as `req.auth_context.actor_id` (Decision F). This is **no longer** coupled to `cart_id` sourcing — `cart_id` is now **VERIFIED** to come from the `:id` route param (`req.params.id`), confirmed against native `carts/[id]/promotions/route.js` (Decision E, §8.1/§23.5); [NV#7] remains open only for guest session identity, not cart id and not customer id. Uniform `VOUCHER_RATE_LIMITED` response regardless of code validity (§7.8 — no oracle).

### 14.2 Cart↔voucher association + concurrency — mechanism VERIFIED, sub-flow binding pending

Status: **Technically Verified** (the discount must be an adjustment carried by a Promotion, applied through the cart-promotions workflow, to be in authoritative totals) + **Mechanism RESOLVED (Decision G)** (how VoucherEngine's cap-adjusted amount maps onto a Promotion = an ephemeral, cart-specific fixed-amount Promotion — NV#3 now verified). The earlier "pass a per-cart override amount into `updateCartPromotionsWorkflow` while reusing the shared per-voucher Promotion" plan is **superseded** — see Decision G (Approved Decisions block) for the full verified evidence that no such override exists and that mutating a shared Promotion is unsafe.

**(A) How the discount is persisted in authoritative Cart totals — VERIFIED mechanism = Promotion-driven adjustment.**

Evidence (verified, files in top note): the store cart totals (`subtotal`, `discount_total`, `discount_subtotal`, `item_discount_total`, `total`, `original_item_subtotal`) are **computed fields** returned by `query.graph` (`carts/query-config.js`), and the **only** way a discount enters them is a line-item **adjustment** (`items.adjustments.{amount, promotion_id, code, is_tax_inclusive}`), which is produced by applying a **Promotion** to the cart via `updateCartPromotionsWorkflowId` + `PromotionActions.ADD/REMOVE/REPLACE` (`carts/[id]/promotions/route.js`). `cart.metadata` is a **separate, non-computed** field — it does **not** participate in total computation. Therefore:

- **Selected:** the voucher discount is represented as a **Medusa Promotion** (specifically an **ephemeral, cart-specific fixed-amount Promotion** carrying the capped amount — Decision G / the mapping block below) whose adjustment lands in `items.adjustments`, so Cart, checkout, payment, and Order totals are all consistent and it **propagates to the Order** (verified: order carries `*items.adjustments` + same `discount_total`, `orders/query-config.js`).
- **Rejected — metadata-only / custom response total:** `cart.metadata` does not feed authoritative totals (verified); a discount kept only in metadata would diverge from the stored cart/order `total` at payment and completion. Metadata is retained **only** as an auxiliary, non-authoritative snapshot for messaging (`{ voucher_id, code, original_discount, was_capped }`) — never as the source of the amount.
- **Rejected — direct standalone line-item adjustment without a Promotion:** the shipped adjustment shape ties adjustments to a `promotion_id`, and the supported cart mutation path is the promotions workflow; hand-writing adjustments outside a Promotion is not an evidenced supported path.

**Promotion shape (VERIFIED fields, `admin/promotions/query-config.js`):** `code`, `type`, `is_automatic`, `limit`/`used` (native usage limit + counter), `status`, `application_method.{type,value,target_rules,buy_rules}`, `rules.{attribute,operator,values}`, `campaign.budget`. A Promotion _could_ natively express several voucher features — **scope** (V6) via `application_method.target_rules`, **min-order** (V5) via `rules`, **global usage limit** (V3) via `limit`/`used`, **code** (V1), **percentage/fixed** via `application_method.type/value`.

> **Decision G correction to the "natively covers" claim.** Under Decision G the voucher's canonical `VoucherConfig.promotion_id` Promotion is **never attached to a cart**, so its `rules`/`limit`/`target_rules` **do not enforce anything at apply/redemption** — V1–V8 in VoucherEngine's pipeline are the sole enforcers of V3/V5/V6/V7/etc. The **ephemeral, cart-specific** Promotion that actually carries the discount (below) MAY set `application_method.target_rules` as **best-effort** scope narrowing, but Rule 7 correctness comes from the §10 calc basis (the amount is computed only over eligible items), **not** from `target_rules` — whose ability to express Decision-B OR-scope is unverified (NV#16). The ACROSS total equals `value` regardless of the target set, so this does not affect any authoritative total. V5/V3 native enforcement via a backing Promotion is **not relied upon** — treat any native promotion counter as pure defense-in-depth only (§14.3).

**How VoucherEngine's cap-adjusted amount maps onto the Promotion — RESOLVED (Decision G, NV#3 verified):** VoucherEngine owns the cross-source **global cap** and the exact §10 math, which the promotion engine cannot express, and — verified — there is **no** caller-supplied override amount on `updateCartPromotionsWorkflow` (the adjustment always derives from the Promotion's own `application_method.value`). A shared per-voucher Promotion therefore cannot carry a cart-specific capped amount without corrupting other carts. Resolved mechanism:

- Admin `createVoucherWorkflow` (§11.6) **provisions a canonical/reference Promotion** (via `createPromotionsWorkflow`) and stores its id on `VoucherConfig.promotion_id` (Decision C, re-scoped). This canonical Promotion is for admin visibility / analytics cross-reference / as the template for the ephemeral apply-time promotion — it is **never attached to a cart** and enforces nothing at apply (see the correction note above).
- At apply, VoucherEngine runs V1–V8 + §10 (incl. global cap) → `final_voucher_discount`, then **creates a fresh, ephemeral, cart-scoped Promotion** via `createPromotionsWorkflow` and attaches it via `updateCartPromotionsWorkflow ADD [ephemeral code]`. The ephemeral Promotion shape (**verified expressible**, `@medusajs/types` `CreatePromotionDTO`/`CreateApplicationMethodDTO`):
  - `code`: unique cart-specific, e.g. `__VE_<VOUCHER_CODE>_<CART_ID>`; `type: "standard"`; `status: "active"`; `is_automatic: false`.
  - `application_method: { type: "fixed", target_type: "items", allocation: "across", value: final_voucher_discount, currency_code: <cart.currency_code>, target_rules?: <best-effort scope narrowing; NOT relied on for Rule 7 — see NV#16> }`.
  - **Why this is exact FOR THE VOUCHER'S OWN ADJUSTMENT ONLY:** for `fixed` + `across`, per-item value = `(lineItemAmount / lineItemsAmount) * value`, which **sums to exactly `value`** across the targeted items (`@medusajs/utils/dist/totals/promotion/index.js:12-19`, verified) — independent of which discountable items are targeted. `discount_total` sums the raw (full-precision) adjustment amounts (`utils/dist/totals/cart/index.js:117`), so the voucher's _own_ contribution `== final_voucher_discount` exactly even though per-item shares may be fractional. **`verifyCartTotalsStep` compares the RAW adjustment sum** (NV#14 — verify per-item `raw_amount` preserves fractional precision in a 0-decimal currency like VND; a precision loss would fail _safe_ — a false `VOUCHER_CALCULATION_FAILED`, never a money leak).
  - **Native Promotion adjustment coexistence is not a default SRS requirement.** This project treats item-level promotion as Price List sale price, which is already reflected in `items.unit_price` before VoucherEngine calculates. If a future requirement introduces coexistence with native Promotion Module line-item/order adjustments, design that separately and fail closed until verified.
- The ephemeral Promotion's `id`+`code` are written to `cart.metadata.voucher` — that is the adjustment identifier for `verifyCartTotalsStep`/remove/revalidate (NOT `VoucherConfig.promotion_id`).
- `[NEEDS_VERIFICATION #3]` — **RESOLVED.** `createPromotionsWorkflow` input = `{ promotionsData: CreatePromotionDTO[] } & AdditionalData` (`@medusajs/core-flows/dist/promotion/workflows/create-promotions.d.ts`, verified); `updateCartPromotionsWorkflow` input = `{ cart_id?, cart?, promo_codes?: string[], action?, force_refresh_payment_collection? }` with **no** amount override (`.../cart/workflows/update-cart-promotions.d.ts`, verified). The fixed/across/target_rules application method is verified expressible (above). No `addPromotionsToCartWorkflow` is needed — `updateCartPromotionsWorkflow` with `PromotionActions.ADD` is the attach path.

**Apply / replace / remove / revalidation behavior on this mechanism:**

- **Apply:** validate + compute → **create ephemeral cart-specific fixed-amount Promotion** (value = `final_voucher_discount`) → `updateCartPromotionsWorkflow ADD [ephemeral code]`. Cart totals recompute natively. Write the auxiliary `cart.metadata.voucher` snapshot including the ephemeral `{ promotion_id, code }`.
- **Replace (VOUCH-001):** the new voucher is validated/computed first; only on success is the old voucher's ephemeral promotion detached+deleted and the new ephemeral promotion created+`ADD`ed — so a failed new voucher leaves the old ephemeral promotion intact (Solution Flow §7.2, §18.4-3).
- **Remove:** `updateCartPromotionsWorkflow REMOVE [ephemeral code]` then **delete the ephemeral Promotion**; totals recompute without it; clear `cart.metadata.voucher`; no usage change (Rule 12/13).
- **Revalidation (§11.3):** on `cart.updated`, recompute; if still valid, **replace** the ephemeral promotion with a new one carrying the recomputed amount (`REMOVE`+delete old → create+`ADD` new); if invalid `REMOVE`+delete + `VOUCHER_AUTO_REMOVED`. (Value cannot be mutated in place — a promotion's `application_method.value` change would require an update-promotion call and re-run; replacing the ephemeral promotion is the clean path and keeps each amount cart-specific.)
- **Compensation / recalculation:** because totals are **always recomputed by the Cart module from source** after any promotion add/remove (verified: computed fields), compensation is simply "remove (+delete) the ephemeral voucher promotion and let the cart recompute" — VoucherEngine **never writes back a captured numeric total** (Rule 18/INT-03). This satisfies "compensation must not restore stale totals".
- **Remaining limitation:** representing a percentage voucher whose amount is later reduced by the global cap means the applied ephemeral promotion is a computed fixed amount, so the stored adjustment reflects the capped number, not the nominal percentage — acceptable and correct for totals; the nominal percentage is preserved on `VoucherConfig` for display.

**(B) Where active-voucher state lives.** The **authoritative** amount lives in the **ephemeral cart Promotion + its `items.adjustments`** (above). `cart.metadata.voucher` holds the **auxiliary snapshot** for messaging and a `_revalidation_marker` (§11.5) **and** the ephemeral `{ promotion_id, code }` needed to identify/detach the adjustment (this is operational data, not the amount). **Redemption identity (Decision G, verified):** the cart adjustment carries the _ephemeral_ `promotion_id`/`code` (not `VoucherConfig.promotion_id` or the voucher code), so redemption maps back to the voucher via **`order.metadata.voucher.voucher_id`**, which is **verified to propagate** — `completeCartWorkflow` copies `metadata: cart.metadata` into the created order (`@medusajs/core-flows/dist/cart/workflows/complete-cart.js:404`). This intentionally **reverses** the earlier "no `cart.metadata` propagation dependency" stance, which is now safe because the propagation is source-verified. (`CreatePromotionDTO` has no `metadata` field — verified — so identity cannot be stored on the ephemeral Promotion itself; `order.metadata` is the channel.)

**(C) EC-04 concurrency — RESOLVED using the Locking Module + latest-state recompute (not `updated_at` alone).** A bare pre-write `updated_at` re-read is a TOCTOU check with a race window between the read and the write; it is **not** sufficient. Resolved strategy (Solution Flow §7.7, PD-04):

1. **Serialize the critical section with the Locking Module** — `@medusajs/locking` is a verified dependency (`Modules.LOCKING`, with postgres/redis providers). `applyVoucherWorkflow` / `revalidateVoucherWorkflow` acquire a lock keyed `voucher:cart:{cart_id}` (short TTL) around the read→compute→apply-promotion section, so two voucher operations on one cart cannot interleave. Provider falls back to postgres when Redis is absent (Redis-optional, §14.5) — so this is **not** a Redis-only mechanism.
2. **Recompute against the latest cart inside the lock** — re-read the cart at the top of the locked section (not a cached snapshot) and run cart-dependent validation + §10 on that; then apply via `updateCartPromotionsWorkflow`. The promotion apply is itself the conditional write: it operates on the current cart the workflow engine sees.
3. **Cart-completion is separately guarded by Medusa** — verified: `completeCartWorkflow` rejects concurrent completion with `MedusaError.CONFLICT` (`transaction.hasFinished()`), so a voucher change racing a completion cannot half-apply.
4. If a cart mutation still lands between the recompute and the apply, the subsequent `cart.updated` revalidation (§11.5) re-runs and converges (removes/recalculates) — the system is **self-correcting**, and the lock keeps the common case consistent.
5. **Compensation re-derives, never restores stale totals** (Rule 18): compensation removes the voucher promotion and lets the cart recompute (§11.10 tables).

`[NEEDS_VERIFICATION #3a]` — exact `Modules.LOCKING` service API (`acquire`/`execute`/`release` signatures, default provider wiring) in 2.16; strategy is fixed, only the call shape is pending.

### 14.3 Atomic redemption & idempotency — RESOLVED (PD-05, INT-02, INT-04, D-06)

Two independent durable guards, both in PostgreSQL (Redis never authoritative):

- **Idempotency (over-processing guard):** unique DB index `(voucher_id, order_id)` on `VoucherUsageLog` (§5.2) **plus** the `idempotencyCheckStep` pre-check. A duplicate `order.placed` either short-circuits at the pre-check or, on a genuine race, fails the unique insert — both are treated as **idempotent success**, no second increment (Rule; §18.4-5). This is the primary guard and needs no Redis.
- **Over-redemption guard (atomic increment) — global:** in a single DB transaction —
  1. conditional update: `UPDATE voucher_config SET usage_count = usage_count + 1 WHERE id = :id AND (usage_limit IS NULL OR usage_count < usage_limit)`; if `0 rows affected` → global capacity exhausted at redemption.
  2. re-check per-user (see next bullet for concurrency).
  3. insert `VoucherUsageLog` (append-only snapshot, §5.2).
     All in one transaction so `usage_count` and the log commit atomically; the conditional `WHERE` prevents the read-check-write race under concurrent successful orders (SRS INT-02 / Solution Flow §7.5 "must not read→check→increment later").
- **Per-user limit — concurrency-safe (RESOLVED):** a plain `SELECT count(*) … < per_user_limit` before insert is a TOCTOU race (two concurrent orders by the same customer both read `count = limit-1`). Make it safe by **either** (preferred) serializing per (voucher, customer) with the **Locking Module** (`Modules.LOCKING`, verified dep) key `voucher:redeem:{voucher_id}:{customer_id}` around the count-check+insert, **or** enforcing it structurally with a conditional insert that fails when the limit is reached (e.g. insert guarded by `WHERE (SELECT count(*) …) < :per_user_limit`, or a partial unique index when `per_user_limit = 1`). Both close the window; the lock generalizes to any limit. The `(voucher_id, order_id)` unique index still guarantees one redemption per order regardless.
- **Backing-promotion counter — NOT a usable guard under Decision G.** The canonical `VoucherConfig.promotion_id` Promotion is never attached to a cart, so Medusa never increments its `used` counter; the **ephemeral** per-cart Promotion that _is_ attached gets `registerUsage` at completion (verified: `complete-cart.js:484`) but is a throwaway record (one per cart, cleaned up — NV#15), so its counter is not a durable cross-cart guard either. Therefore **do not rely on any promotion `limit`/`used` for over-redemption** — VoucherEngine's atomic `usage_count` conditional update + `VoucherUsageLog` unique `(voucher_id, order_id)` are the sole authoritative guards (SRS INT-02/INT-04).
- **Capacity-exhausted recovery — RESOLVED:** do **not** write an invalid log; **log-and-alert for operational review**, order stands (the customer already paid the discounted total — reversing at redemption would be worse). No automatic compensation. Approved resolution of the §11.4 step-5 open item.
- **`[NEEDS_VERIFICATION #10]`** — exact 2.16 mechanism for a raw conditional `UPDATE` + manual transaction inside a module service (MikroORM `EntityManager` `nativeUpdate` within `em.transactional(...)`, resolved from the module's manager), and the `Modules.LOCKING` API shape (shared with #3a). Strategy fixed; only the API binding is pending.

### 14.4 Caching — RESOLVED scope (PD-12)

- **Safe to cache (short TTL 60s):** `VoucherConfig` by normalized code (`voucher:cfg:{code}`), `DiscountCapConfig` (`voucher:capcfg:active`). Read-heavy, low-change (Solution Flow §16.2).
- **Never cache:** full apply result, cart totals, eligible-item result, live `usage_count`/redemption count (Solution Flow §16.2). Cart is authoritative.
- **No cart-dependent validation cache (PD-12 resolved):** because eligibility/min-order/stacking depend on live cart+promotion state, no validation result is cached and there is no cart-version cache key to reason about. The SRS "30s validation cache" (CONFLICT-5) is **rejected** for correctness; only config/cap are cached.
- **Invalidation (§16.3 → concrete):** `createVoucherWorkflow` (§11.6) calls `invalidateVoucherCacheStep` → `DEL voucher:cfg:{code}`. `updateDiscountCapConfigWorkflow` or the singleton cap admin route (§11.9) → `DEL voucher:capcfg:active`. A dedicated cache-invalidation subscriber is **not required** unless config can change outside these approved write paths.

### 14.5 Redis-unavailable fallback — RESOLVED per use case (PD-11)

| Use case                        | Behavior when `REDIS_URL` unset / Redis errors                                                                                                                                                                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rate limiting (§14.1)           | **Fail-open** — allow the apply, log a warning. Availability for real customers beats throttling a hypothetical attacker while infra is down (documented security trade-off; confirm at sign-off).                                                                                               |
| Config / cap cache (§14.4)      | **Fail-open to DB read** — cache miss semantics; correctness unaffected (DB authoritative).                                                                                                                                                                                                      |
| Concurrency locks (§14.2/§14.3) | **Not Redis-dependent** — the Locking Module has a **postgres provider** (`@medusajs/locking-postgres`, verified dep) usable without Redis, so locks still function; if locking is disabled entirely, the `cart.updated` revalidation (§11.5) and the DB guards (§14.3) keep the system correct. |
| Redemption coordination (§14.3) | **Unaffected** — the durable DB unique constraint + conditional update are authoritative and never depend on Redis.                                                                                                                                                                              |

Redis loss therefore degrades _protection/latency_, never _correctness or money_.

---

## 15. Migrations

- Do **not** hand-write migrations. Generate with the module's `db:generate` (skill `db-generate`) after models are defined; snapshot + migration land in `src/modules/voucher-engine/migrations/` (mirrors `suggestive-selling/migrations/*`).
- Command (from `apps/backend/`): `npx medusa db:generate voucherEngine` then `npx medusa db:migrate`. `[NEEDS_VERIFICATION — exact db:generate argument: module name vs module folder]`.
- Links may require running migrations after link definition (skill checklist: "Skipping migrations after creating module links"). The read-only links here create no new table (like the existing product link), but run `db:migrate` to be safe.
- Seed: `src/scripts/seed-vouchers.ts`, idempotent, default-exports `async ({ container }: ExecArgs)`, run via `npx medusa exec ./src/scripts/seed-vouchers.ts` (repo convention). Seeds one active `DiscountCapConfig` (50% = 5000 bps) and sample vouchers; resolves product/category ids by handle/name (runs after catalog seed, like `seed-suggestive-selling.ts`).

---

## 16. Test Plan

Framework: Jest via `TEST_TYPE` (verified). Naming per `.claude/rules`: unit `*.unit.spec.ts` in `__tests__/`; module integration in `src/modules/voucher-engine/__tests__/`; HTTP in `integration-tests/http/*.spec.ts`. **Create `integration-tests/setup.js`** (missing) before HTTP tests can run.

### 16.1 Unit (pure logic — no I/O) — `TEST_TYPE=unit`

| Test                                                              | Validates                   | SRS/Flow |
| ----------------------------------------------------------------- | --------------------------- | -------- |
| normalize-code: trim + uppercase; case-insensitive                | Rule 2                      | §7.1     |
| money: percentage floor, no float, integer only                   | INT-01, Rule 19             | §9.4     |
| calc: 10.4 under-cap reproduces 380,000 / 3,420,000               | VOUCH-003 happy, T-VOUCH-07 | §9.6     |
| calc: 10.5 cap-exceeded reproduces 490,000 / 2,350,000            | VOUCH-003 cap, T-VOUCH-08   | §9.7     |
| calc: EC-03 50%+50% clamps ≥1 VND, warning                        | EC-03, T-VOUCH-09           | §9.4     |
| calc: fixed voucher can't exceed eligible subtotal                | §22.2                       | §9.4     |
| calc: voucher max_discount_amount caps before global              | Rule 8, T-VOUCH: max amount | §9.3     |
| calc: item promo consumes entire cap → final voucher = 0          | §22.2                       | §9.5     |
| validate: each V1–V8 branch returns correct code, fail-fast stops | V1–V8, T-VOUCH-02..06       | §8, D-03 |

### 16.2 Module integration — `TEST_TYPE=integration:modules` (`src/modules/voucher-engine/__tests__/`)

Uses `@medusajs/test-utils` (present, v2.16.0 — verified repo, `package.json` devDeps) module test runner `[NEEDS_VERIFICATION #12 — exact 2.16 module test-runner import name]`.

- CRUD on VoucherConfig/UsageLog/DiscountCapConfig, including persisted `applicable_product_ids`/`applicable_category_ids` round-tripping as real JSON arrays (Decision B — no `VoucherScope` model).
- Unique `(voucher_id, order_id)` constraint rejects duplicate usage log (idempotency).
- Atomic conditional increment does not exceed `usage_limit` under sequential calls (concurrency-adjacent, T-VOUCH usage).

### 16.3 HTTP integration — `TEST_TYPE=integration:http` (`integration-tests/http/`)

Uses `medusaIntegrationTestRunner` `[NEEDS_VERIFICATION #12 — exact import in 2.16]`.
| Test | Validates |
|---|---|
| apply valid voucher → discount, total updated (SHUTTLE20 scenario) | VOUCH-001, T-VOUCH-01 |
| invalid code → `VOUCHER_NOT_FOUND` + Vietnamese message; cart unchanged | V1, T-VOUCH-02 |
| expired → `VOUCHER_EXPIRED` with date | V2, T-VOUCH-03 |
| per-user limit reached → `VOUCHER_PER_USER_LIMIT_REACHED` | V4, T-VOUCH-04 |
| below min → `VOUCHER_MIN_ORDER_NOT_MET` + remaining | V5, T-VOUCH-05 |
| no eligible items → `VOUCHER_NO_ELIGIBLE_ITEMS` | V6, T-VOUCH-06 |
| remove voucher → totals reverted, no usage increment | VOUCH-004, T-VOUCH-10 |
| remove eligible items after apply → auto-removed (subscriber) | VOUCH-005/EC-02, T-VOUCH-11 |
| 5 failed attempts → `VOUCHER_RATE_LIMITED` (429) | SEC-02/EC-10, T-VOUCH-12 |
| replace flow: new fails → old remains | §7.2, §22.1 |
| admin create voucher → persisted | §7.6 |

### 16.4 Subscriber / event tests

- `order.placed` delivered twice → single usage log, single increment (idempotency, §22.4).
- `cart.updated` after cart drops below min → voucher auto-removed with reason (§22.3).

### 16.5 Concurrency tests

- concurrent successful redemptions near `usage_limit` → limit not exceeded (SRS §10 usage). Strategy RESOLVED (§14.3); depends on txn binding `[NV #10]`.
- apply voucher while last eligible item removed (EC-04) → no stale voucher persisted. Strategy RESOLVED (§14.2-C); depends on marker field `[NV #3a]` + attach mechanism `[NV #3]`.

### 16.6 Redis-fallback tests

- rate-limit with Redis unavailable → fail-open per §14.5. Strategy RESOLVED; depends on Redis client `[NV #9]`.

---

## 17. SRS Traceability Matrix

| SRS ref                               | Covered by (this spec)                                                                    |
| ------------------------------------- | ----------------------------------------------------------------------------------------- |
| VOUCH-001 apply / replace             | §8.1, §11.1, §12                                                                          |
| VOUCH-002 V1–V8                       | §9, §8.4, D-03                                                                            |
| VOUCH-003 stacking + cap              | §10                                                                                       |
| VOUCH-004 remove                      | §11.2, §12                                                                                |
| VOUCH-005 auto-invalidation           | §11.3, §13.1                                                                              |
| V1–V8 (each)                          | §9 table                                                                                  |
| EC-01 promo+voucher near cap          | §10.5                                                                                     |
| EC-02 eligible items removed          | §11.3, §16.3                                                                              |
| EC-03 zero/negative total             | §10.2, §10.6, §16.1                                                                       |
| EC-04 concurrent apply/remove         | §14.2-C (RESOLVED strategy; #3a binding), §16.5                                           |
| EC-06 apply→remove→reapply            | Rule 12/13; §11.2; §9.2 (V3/V4 skipped at revalidate)                                     |
| EC-08 new promo tier on cart change   | §11.3, §11.5 (promo recalc before voucher)                                                |
| EC-10 brute-force                     | §14.1 (RESOLVED algorithm), §16.3                                                         |
| SEC-01 server-side truth              | §3 (cart authoritative), §10 (server calc)                                                |
| SEC-02 brute-force cooldown           | §14.1 (identity RESOLVED; #7 binding)                                                     |
| SEC-03 code format (min6/alnum/upper) | §5.1 decision, §8.1 validator, §11.6 create-validate                                      |
| SEC-04 admin auth / customer-scoped   | §12 (`AuthenticatedMedusaRequest`, publishable key)                                       |
| INT-01 integer money                  | §3, §5, §10, §16.1                                                                        |
| INT-02 atomic usage count             | §14.3 (RESOLVED; #10 binding)                                                             |
| INT-03 recalc from source             | Rule 18; §10; §11.10 (compensation re-derives)                                            |
| INT-04 immutable usage log            | §5.2 (snapshot + append-only enforcement), §11.4                                          |
| API §6.2 endpoints                    | §12 (store apply/remove/my-vouchers; admin create/list/analytics; discount-cap singleton) |
| Admin create/analytics/cap            | §11.6, §11.9, §12                                                                         |
| Data model §5.2                       | §5 (+ CONFLICT-1/2)                                                                       |
| Workflows §7.2/7.3/7.5/7.6            | §11.1/§11.3/§11.4/§11.6–§11.9                                                             |

### 17.1 Reverse test-ID → coverage map (SRS §10.2 acceptance tests)

Every acceptance test has a home; concurrency/redemption/fallback tests are gated on their binding `[NV]` (§19.2).

| Test ID    | Scenario (SRS §10.2)                   | Test file (§16)                  | Depends on |
| ---------- | -------------------------------------- | -------------------------------- | ---------- |
| T-VOUCH-01 | valid voucher applied → discount/total | §16.3 http apply-voucher         | #2,#3      |
| T-VOUCH-02 | invalid code → error, cart unchanged   | §16.1 validate unit + §16.3 http | —          |
| T-VOUCH-03 | expired → expiry error w/ date         | §16.1 validate unit              | —          |
| T-VOUCH-04 | per-user limit → usage error           | §16.1 validate unit + §16.3 http | —          |
| T-VOUCH-05 | below min → remaining shown            | §16.1 validate unit              | #2         |
| T-VOUCH-06 | no eligible items → scope error        | §16.1 validate unit              | #2         |
| T-VOUCH-07 | promo 20% + voucher 10% under cap      | §16.1 calc unit (§10.4)          | — (pure)   |
| T-VOUCH-08 | promo 40% + voucher 20% cap-exceeded   | §16.1 calc unit (§10.5)          | — (pure)   |
| T-VOUCH-09 | 50%+50% → cap prevents negative        | §16.1 calc unit (§10.6, EC-03)   | — (pure)   |
| T-VOUCH-10 | remove → reverted, no usage increment  | §16.3 http remove-voucher        | #3         |
| T-VOUCH-11 | remove eligible items → auto-removed   | §16.3 http + §16.4 subscriber    | #5         |
| T-VOUCH-12 | 5 failed attempts → rate limited (429) | §16.3 http + §16.6               | #7,#9      |

---

## 18. Conflicts (recorded, not silently changed)

- **[CONFLICT-1] "VoucherConfig extends Promotion" (SRS §5.2, §2.1).** Medusa v2 modules do not support entity inheritance / extending a core module's models; repo convention mandates **standalone modules + read-only links** (`.claude/rules`). **Resolution (now evidence-backed + Mechanism RESOLVED, Decision G):** VoucherEngine is a standalone `voucherEngine` module that references a **canonical** Medusa Promotion (`VoucherConfig.promotion_id` → read-only Link to Promotion, §5.1/§6) and, at apply, carries the cap-adjusted amount via a **fresh ephemeral, cart-specific fixed-amount Promotion** whose adjustment lands in authoritative Cart/Order totals (verified mechanism, §14.2-A / Decision G) — honoring the SRS's _intent_ behind "extends Promotion" (be a promotion for totals purposes) without model inheritance and without a shared per-voucher Promotion carrying a cart-specific amount (which is impossible: `updateCartPromotionsWorkflow` has no override and the amount always derives from the Promotion's own `application_method.value` — verified). Verified: promotion apply/create paths (`update-cart-promotions.d.ts`, `create-promotions.d.ts`), fixed/across sum-to-value (`utils/dist/totals/promotion/index.js`), cart→order metadata propagation (`complete-cart.js:404`). Needs business sign-off on the reinterpretation only.
- **[CONFLICT-2] Scope as array columns vs linkable rows (SRS §5.2 `applicable_*_ids uuid[]`) — RESOLVED (Decision B, 2026-07-14).** An earlier pass of this SPEC proposed normalizing scope into `VoucherScope` rows (§5.4) with read-only Link Module wiring, reasoning that the repo convention forbids DB FKs and JSON array columns can't be linked. **Approved resolution:** for this project and MVP timeline, `applicable_product_ids`/`applicable_category_ids` stay as nullable JSON arrays directly on `VoucherConfig` — no `VoucherScope` model, no Link Module wiring for scope, no cross-module FK. This is no longer an open conflict awaiting sign-off; see §5.4 for the full decision and `toVoucherScope` as the migration seam if normalization is ever needed later.
- **[CONFLICT-3] Percentage unit ambiguity.** SRS §5.2 uses basis points (`2000 = 20.00%`); worked examples state plain percents. Spec adopts basis points; confirm (§5.1, §10.3).
- **[CONFLICT-4] Admin update HTTP method — REMOVED.** SRS §6.2 does not require voucher update/deactivate endpoints. No admin voucher update method is specified by this SPEC unless a later approved requirement adds one.
- **[CONFLICT-5] "Voucher validation results cache TTL 30s" (SRS §2.1 / §9.1) vs cart-dependent staleness.** Caching a full validation result is unsafe because cart/promotion/eligibility change (Solution Flow §16.2). Spec caches only config/cap (safe), not full validation/apply result (PD-12).
- **[CONFLICT-6] Store voucher route transport: implicit-cart body shape vs Medusa route param — RESOLVED (Decision E, 2026-07-14).** An earlier SPEC pass specified `POST/DELETE /store/cart/voucher` with `cart_id` and `confirm_replace` in the request body, and a later session re-affirmed the `/store/cart/voucher` path reasoning that "route paths aren't in Decision A's scope." **Resolution:** routing is governed by the approved contract **independently of Decision A** — contract §7.7 (standardize on `/store/carts/:id/…` for JS-SDK compatibility) and §1.3 explicitly specify the route path, cart-id-in-param, and `?replace=true` query flag. The routes are `POST/DELETE /store/carts/:id/voucher`; cart id = `req.params.id`; replace = `?replace=true`. Confirmed by shipped `carts/[id]/voucher/validators.ts` (+ its unit test rejecting body `cart_id`/`confirm_replace`) and native `carts/[id]/promotions/route.js` (`cart_id: req.params.id`, verified). No business logic changed. This is no longer an open conflict; see Decision E, §8.1/§8.2, §23.5.
- **[CONFLICT-7] "My Vouchers" store route path (`/store/customer/vouchers` vs contract `/store/customers/me/vouchers`) — RESOLVED (Decision F, 2026-07-14).** A prior SPEC pass listed the customer voucher-list route as `GET /store/customer/vouchers` (singular `customer`, no `/me/`) in §12 and the §7 file layout. The approved contract (`docs/API_CONTRACT_Suggestive_Voucher_Cart.md` line 419) specifies `GET /store/customers/me/vouchers`, matching the native Medusa customer-own-resource convention (`dist/api/store/customers/me/*`, verified). **Resolution:** the route is `GET /store/customers/me/vouchers`, auth-optional, customer id from `req.auth_context?.actor_id`, guest → `200 {vouchers:[]}` (contract line 421), response shape per contract lines 423–436. Same authority basis as CONFLICT-6/Decision E: routing is contract-governed independently of Decision A. No shipped code existed for this route (verified absent), so this is a clean rename. This is no longer an open conflict; see Decision F, §12, §7 layout.
- **[CONFLICT-8] Native Promotion adjustment coexistence — REOPENED (2026-07-20), UNRESOLVED BACKEND BLOCKER.** Earlier analysis found a real Medusa 2.16 interaction when an ephemeral fixed Promotion coexists with a native percentage Promotion adjustment on the same lines. That analysis had (until 2026-07-20) been treated as historical/non-default because item-level promotion was defined as Price List sale price. **Decision H-2 (above) reverses that definition** — item-level promotion is now a native automatic Promotion adjustment, making this exact coexistence the SRS's _normal_ path, not an edge case. **This conflict is REOPENED and is an active backend blocker, not solved by the Admin unified-model implementation (2026-07-20).** Verified against the installed Medusa 2.16.0 source (`@medusajs/promotion/dist/services/promotion-module.js:374-375`, `dist/utils/compute-actions/buy-get.js:304-314`, `@medusajs/utils/dist/totals/promotion/index.js:54-130`): `computeActions` sorts active promotions by `application_method.value DESC`; the ephemeral voucher's fixed money value (thousands+) sorts before a percentage automatic promotion's fractional value (<1), so the automatic promotion is processed SECOND against an already-reduced `remainingItemAmount` — its own computed adjustment shrinks. This is exactly the "never shrink the automatic Promotion" violation Decision H-2 forbids, and it is the DEFAULT outcome of the current carrier's ordering, not a rare edge case. The existing Rule-11 shrink guard in `steps/verify-cart-totals.ts` detects this and throws `VOUCHER_STACKING_UNSUPPORTED` (blocks the apply) rather than fixing it — under the old interpretation this was an acceptable rarely-hit safety net; under Decision H-2 it means the voucher will routinely fail to apply whenever an eligible automatic item-level Promotion is active, which defeats Decision H-2's actual requirement (coexist correctly, cap only the voucher). **Fixing this requires a genuine carrier redesign (Phase 2-style engineering) — explicitly out of scope for the 2026-07-20 Admin unified-model implementation, which only implements the Enable-on-existing-Promotion admin flow and the source-of-truth fix, and does not touch `apply-voucher.ts`/`remove-voucher.ts`/`revalidate-voucher-on-cart-change.ts`/`verify-cart-totals.ts`'s carrier mechanics.** Do not mark this resolved until a change to the carrier itself is implemented AND a regression test proves the automatic Promotion's adjustment is preserved with both an automatic Promotion and a Voucher active on the same eligible items.

---

## 19. Pending Decisions Register + `[NEEDS_VERIFICATION]` Index

### 19.1 Pending Decisions (from Solution Flow §21)

| PD            | Topic                                              | Status in this SPEC                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Blocks impl of                                      |
| ------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| PD-01         | Voucher↔Cart association + total representation    | **RESOLVED.** VoucherEngine applies the final capped voucher amount through a cart-specific ephemeral Medusa Promotion. The canonical linked Promotion cannot be mutated per cart. Metadata-only, direct standalone adjustment, credit lines, payment credit, and customer credit are rejected. Native Promotion adjustment coexistence is a future requirement only if explicitly requested.                                                                                                                                                                                                                                                       | apply/remove promotion steps, §14.2-A               |
| PD-02         | Source of item-level promotion + line totals       | **Technically Verified fields** (`carts/query-config.js`): `original_item_subtotal`, `item_subtotal`, `item_discount_total`, `items.adjustments.{amount,promotion_id,code}`, `items.product_id`/`categories.id` (§10.7). Residual `[NV #2]` = `item_subtotal` inclusion semantics (mitigated by per-line adjustment sum)                                                                                                                                                                                                                                                                                                                            | `loadCartContextStep` adapter, §10.7                |
| PD-03         | Successful-order event / trigger + propagation     | **Propagation Technically Verified** (order carries `*items.adjustments`+`discount_total`, §13.3). **Trigger Resolved**: sync `completeCartWorkflow` hook primary, `order.placed` subscriber fallback. Residual `[NV #6/#6a]` = event id + hook point                                                                                                                                                                                                                                                                                                                                                                                               | redemption trigger, §13.2/§13.3                     |
| PD-04         | Cart concurrency mechanism                         | **RESOLVED** — **Locking Module** (`Modules.LOCKING`, verified dep, postgres fallback) around read→compute→apply + latest-read recompute (not `updated_at` alone); native completion CONFLICT guard verified (§14.2-C). Residual `[NV #3a]` = lock API shape                                                                                                                                                                                                                                                                                                                                                                                        | apply/revalidate, §14.2-C                           |
| PD-05         | Atomic usage-count strategy                        | **RESOLVED** — unique `(voucher_id,order_id)` + conditional `UPDATE … WHERE usage_count<usage_limit` + per-user re-check, one txn (§14.3). Txn API `[NV #10]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `atomic-increment`/`create-usage-log`, §14.3        |
| PD-06         | Customer segment source (V7)                       | **RESOLVED FOR SPEC.** Null `user_segment_conditions` passes. Configured segment conditions must be evaluated against the approved Customer/CRM source and fail closed with `VOUCHER_SEGMENT_NOT_ELIGIBLE` if not satisfied. Implementation must wire the source; configured V7 conditions cannot be skipped. **Current code (2026-07-20 review): `v7Segment` is still a hardcoded stub that always passes — not yet implemented.**                                                                                                                                                                                                                 | `validate` V7, §9.4                                 |
| PD-08         | Applied voucher after admin deactivation           | **FUTURE ONLY.** Admin deactivation is not part of SRS §6.2. If a later approved requirement adds it, active carts should remove the voucher on the next `cart.updated` revalidation by re-running V1.                                                                                                                                                                                                                                                                                                                                                                                                                                              | Future update/deactivate work                       |
| PD-09         | Real-time storefront update after async subscriber | **Deferred (approved)** — MVP refetch/polling                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | §13.1                                               |
| PD-11         | Redis-unavailable fallback                         | **RESOLVED** — per-use-case table (§14.5): fail-open rate-limit/cache/lock; redemption unaffected (DB authoritative)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | §14.5                                               |
| PD-12         | Validation cache scope                             | **RESOLVED** — config/cap only (60s TTL); no cart-dependent/validation cache (§14.4)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | §14.4                                               |
| PD-13         | Product/category scoping relationship              | **RESOLVED (Decision B, approved 2026-07-14)** — plain nullable JSON arrays on `VoucherConfig` (`applicable_product_ids`/`applicable_category_ids`), no `VoucherScope` model, no Link Module wiring. Not pending sign-off.                                                                                                                                                                                                                                                                                                                                                                                                                          | §5.4, §6                                            |
| PD-14         | Error/exception → HTTP mapping                     | **RESOLVED** (§8.4 + §9.3 counted-failure list); 429 `MedusaError` support `[NV #8]` pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | §8.4, §9                                            |
| PD-07 / PD-10 | purchase-history source / promo-tier recalc        | Deferred / covered by §11.3, §11.5                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | —                                                   |
| PD-15         | Native Promotion adjustment coexistence            | **REOPENED (2026-07-20) — UNRESOLVED BACKEND BLOCKER.** Decision H-2 (2026-07-20) makes item-level promotion mean a native automatic Promotion adjustment, so this coexistence is now the SRS's normal path, not a deferred edge case. Verified structural — see §18 CONFLICT-8. The Rule-11 shrink guard in `verify-cart-totals.ts` still blocks (throws `VOUCHER_STACKING_UNSUPPORTED`) rather than fixing the interaction; a carrier redesign is required and is explicitly out of scope for the 2026-07-20 Admin unified-model implementation. Do not close again without an implemented carrier fix and a passing coexistence regression test. | Carrier redesign (Phase 2-style), not yet scheduled |

**Net after 2026-07-20 correction:** the Admin unified model (Enable-on-existing-Promotion, eligibility rules, source-of-truth fix) is implemented and does not depend on CONFLICT-8/PD-15 being resolved — enabling VoucherEngine on a Promotion, and the calculation math itself, both work independently of the carrier issue. What remains blocked is specifically: a cart where an eligible automatic item-level Promotion AND a Voucher are both active on the same items at apply-time — that path can still incorrectly shrink the automatic Promotion's adjustment or hard-fail via `VOUCHER_STACKING_UNSUPPORTED`, and no carrier fix has been implemented yet. V7 is required when configured. PD-07 / PD-09 / PD-10 remain future/deferred items where they concern purchase-history, real-time push, or broader promotion-tier behavior outside the voucher SRS core.

### 19.2 `[NEEDS_VERIFICATION]` index — **framework binding verification, not SRS gaps**

Every item below is an **exact-API/signature binding** in an installed `@medusajs/*` package that this session could not reach (transitive packages behind pnpm peer-hashed paths; `Grep`/`Glob` disabled). **None is a missing or unmet SRS requirement** — the SRS behaviour is fully specified; only the framework call shape is pending. Confirm each against the named package (or MedusaDocs MCP) before writing that step. The load-bearing ones for the apply/redeem path are: backing-Promotion **create/update/apply** workflow input signatures (`#3`), the exact **per-cart fixed-discount** representation (`#3`), `completeCartWorkflow` **hook point** (`#6a`), successful-order **fallback event id + payload** (`#6`), **Locking Module** API (`#3a`), and **transaction / native-update** API (`#10`).

| #               | Item                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | File/section to check against                                                                                                       | Referenced in                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| #1              | Percentage unit convention (basis points, `value/10000`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | SRS §5.2 sign-off (business, not code)                                                                                              | §5.1, §10.3                     |
| #2              | **Field names VERIFIED** (`carts/query-config.js`). Residual: exact discount-inclusion semantics of `item_subtotal` / `item_discount_total` / `discount_total`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | transitive `@medusajs/cart` totals calculator (mitigated: sum per-line `adjustments.amount`)                                        | §10.7                           |
| #3              | **RESOLVED (Decision G).** `updateCartPromotionsWorkflow` input = `{cart_id?,cart?,promo_codes?,action?,force_refresh_payment_collection?}` — **no amount override** (verified `.../cart/workflows/update-cart-promotions.d.ts`). `createPromotionsWorkflow` input = `{promotionsData: CreatePromotionDTO[]}` with `application_method {type:"fixed",target_type:"items",allocation:"across",value,currency_code,target_rules}` verified expressible (`@medusajs/types` `CreateApplicationMethodDTO`). Mechanism = ephemeral cart-specific fixed-amount promotion.                                                                                                                                                                                                                                                                                                              | `@medusajs/core-flows` + `@medusajs/types` (read this session)                                                                      | §14.2-A, Decision G             |
| #3b             | **STILL OPEN (Decision G residual).** `deletePromotionsWorkflow` input signature — needed for **ephemeral-promotion delete** on remove/revalidate/cleanup (NV#15). `updatePromotionsWorkflow` is future-only unless a later approved admin update requirement is added.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `@medusajs/core-flows/dist/promotion/workflows/delete-promotions.d.ts`                                                              | §14.2-A                         |
| #3a             | `Modules.LOCKING` service API (`acquire`/`execute`/`release`) + default provider wiring                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `@medusajs/locking` (verified dep) / framework                                                                                      | §14.2-C, §14.3                  |
| #4              | `PromotionModule.linkable.promotion` linkable key (Decision B dropped the `ProductModule.linkable.productCategory` item — no product/category link is created)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `@medusajs/medusa/promotion` (subpath verified)                                                                                     | §6                              |
| #5              | `cart.updated` coverage of all mutations + whether `updateCartPromotions` no-op re-emits it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | transitive `@medusajs/core-flows` cart events                                                                                       | §13.1, §11.5                    |
| #6              | Successful-order **event id** (`order.placed`?), fires-once, `data.id` (fallback path only)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | transitive `@medusajs/utils` `OrderWorkflowEvents` / `@medusajs/core-flows` `completeCartWorkflow`                                  | §13.2                           |
| #6a             | Whether `completeCartWorkflow` exposes a **hook** for the synchronous redemption step (primary)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | transitive `@medusajs/core-flows` `completeCartWorkflow.hooks`                                                                      | §13.3                           |
| #6b             | ~~Order-level adjustment shape~~ **VERIFIED**: order carries `*items.adjustments` + `discount_total` + `metadata` (`orders/query-config.js`) — no longer open                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | (resolved)                                                                                                                          | §13.3                           |
| #7              | Store request session-id / customer-id / cart-id source                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `@medusajs/framework/http` store request types                                                                                      | §8.1, §14.1                     |
| #8              | `MedusaError` 429 mapping in 2.16 (else raw `res.status(429)`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `@medusajs/framework/utils` errors                                                                                                  | §8.4                            |
| #9              | Redis client access pattern (cache module vs dedicated `ioredis`) for atomic ops                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | project infra / `@medusajs/cache-redis`                                                                                             | §14                             |
| #10             | Raw conditional `UPDATE` / manual transaction in a module service                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `@medusajs/framework` service ORM/manager (`em.transactional`/`nativeUpdate`)                                                       | §14.3                           |
| #11             | `db:generate` argument (module name vs folder)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `@medusajs/cli`                                                                                                                     | §15                             |
| #11a            | Postgres immutability trigger coexists with generated migrations                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `@medusajs/framework` migration behavior                                                                                            | §5.2                            |
| #12             | `@medusajs/test-utils` module + HTTP test-runner imports (present, v2.16.0 — verified repo)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `@medusajs/test-utils` exports                                                                                                      | §16.2/§16.3                     |
| #13             | "min 1 VND" clamp mandatory vs policy-flagged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | SRS EC-03 sign-off (business)                                                                                                       | §10.2                           |
| #14             | Cart/line money fields returned as `BigNumberValue` (number vs `{value}`) — normalize via `money.toInt` before arithmetic/comparison                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `@medusajs/types` `BigNumberValue` / cart DTO                                                                                       | §23.0–§23.4                     |
| #16             | **`target_rules` fidelity to Decision-B OR-scope (Decision G).** Whether promotion `application_method.target_rules` (AND-combined attribute predicates) can express "product_id ∈ P **OR** category ∈ C" or enumerate explicit line-item ids. **Non-blocking:** the ephemeral fixed/ACROSS total equals `value` regardless of the target set, and Rule 7 is enforced in the §10 calc basis — so if unexpressible, omit `target_rules`. Verify only to decide whether to set best-effort attribution.                                                                                                                                                                                                                                                                                                                                                                           | `@medusajs/promotion` `areRulesValidForContext` / rule operators (`in`, etc.)                                                       | §14.2-A, Decision G             |
| #15             | **Ephemeral-promotion visibility and cleanup (Decision G).** Ephemeral `VEPH-*` Promotions are internal cart transport only. Separate this work from the main Voucher Admin UI: **Backend-5A** verifies whether `VEPH-*` rows appear in the native Promotion list and whether native list filtering can be influenced; **Backend-5B** handles lifecycle/cleanup, including post-order timing. On remove/revalidate the ephemeral Promotion is deleted synchronously. For a **completed order**, confirm (a) whether copied `items.adjustments` remain intact if the ephemeral Promotion is later deleted, and (b) the trigger to delete it **after** `recordVoucherUsageWorkflow` succeeds. If not confirmable, leave it and reap via a periodic job. **UI-5C** warning/labeling is fallback only; do not pretend a widget can override native list filtering if Medusa cannot. | `@medusajs/core-flows` `complete-cart` / `deletePromotionsWorkflow`; native Admin Promotion list behavior; requires empirical check | §14.2-A, Decision G, Decision K |
| #3 (createStep) | Workflow `createStep`/`StepResponse` + `updateCartPromotionsWorkflow` import & input shape for §23.3–23.5 steps                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `@medusajs/framework/workflows-sdk`, `@medusajs/core-flows`                                                                         | §23.3–§23.5                     |

---

## 20. Implementation Order

Build bottom-up so each layer is testable before the next. Do **not** start any slice whose blocking PD (§19.1) is unresolved.

1. **Models + service + migrations** (§5, §7, §15) — `db:generate`, `db:migrate`. No blockers (incl. usage-log snapshot + append-only overrides §5.2).
2. **Pure lib** (`normalize-code`, `money`, `calculate-discount`, `errors`) + **unit tests** (§16.1). No blockers — highest-value, fully testable now; reproduces §9.6/§9.7.
3. **Admin routes + workflows** (§11.6, §11.9, §12) — create voucher, list for dashboard, analytics, and DiscountCapConfig singleton. Do not build update/deactivate voucher endpoints unless later approved.
4. **Link + seed** (§6, §15) — resolve `[NV #4]` (promotion linkable name; Decision B means there is no scope link to resolve).
5. **Validation step** V1–V8 (§9) — V7 must evaluate configured segment conditions. Cart-dependent checks (V5/V6) need the cart adapter → resolve PD-02 / `[NV #2]`; V7 needs the approved Customer/CRM segment read path.
6. **Apply/Remove workflows + Store routes** (§11.1/§11.2, §12) — mechanism VERIFIED (promotion adjustment); resolve only `[NV #3]` (promotion-apply signature), `[NV #3a]` (lock API), `[NV #2]` (adapter semantics).
7. **Rate limiting** (§14.1) — strategy RESOLVED; resolve `[NV #7]` (identity source), `[NV #9]` (Redis client).
8. **cart.updated subscriber + revalidate workflow** (§11.3, §11.5, §13.1) — resolve `[NV #5]`.
9. **Redemption: completion-hook (primary) + order.placed subscriber (fallback)** (§11.4, §13.2/§13.3) — propagation VERIFIED; resolve `[NV #6a]` (hook point), `[NV #6]` (fallback event id), `[NV #10]` (txn/lock API).
10. **Integration/subscriber/concurrency/Redis tests** (§16.2–16.6) — create `integration-tests/setup.js` first.

> Reordered from the previous pass: admin workflows (now slice 3) move ahead of validation/apply because they carry **no framework `[NV]` blockers** and let real vouchers be seeded for the later slices. See §22 for the ready/blocked classification behind this order.

> **This order assumes a greenfield build.** For the current codebase's outstanding fixes against already-shipped code, use the correction order in "Known Implementation Gaps & Correction Order" near the top of this document instead: `COOLDOWN_S` fix → CRM/customer source → V7 → My Vouchers → (deferred) Promotion-detail widget.

### 20.1 Admin UI Migration Order

This order is separate from backend Admin API readiness. Keep each slice independently reviewable and do not add update/deactivate voucher APIs unless explicitly approved.

1. **UI-1 — Promotion-context Create Voucher flow:** finish/review the existing `/promotions/create-voucher` route and Promotions-context "Create Voucher" action; submit through `POST /admin/vouchers`; redirect to `/promotions/:promotion_id`; preserve `/vouchers`.
2. **UI-2A — Promotion Detail read-only VoucherConfig widget:** resolve VoucherConfig by canonical `promotion_id`; show native-owned fields read-only; show VoucherConfig-owned fields read-only; show link/sync status; handle non-voucher Promotions.
3. **UI-2C — Voucher discoverability/list-parity decision:** verify whether the native Promotion list is sufficient for finding/managing vouchers. If not, add a Promotion-context voucher view such as `/promotions/vouchers`, without creating a separate long-term sidebar domain.
4. **UI-3 — Promotion Detail Voucher analytics widget:** resolve VoucherConfig by `promotion_id`; use the existing analytics API; present `VoucherUsageLog`-derived metrics and states.
5. **UI-4 — Global DiscountCapConfig UI:** provide a global settings/admin surface using the singleton cap API; do not place editing controls inside individual Promotion detail widgets.
6. **Backend-5A — Ephemeral Promotion visibility verification:** verify whether internal `VEPH-*` Promotions appear in merchant-facing Promotion lists and what filtering/hiding hooks Medusa actually supports.
7. **Backend-5B — Ephemeral Promotion lifecycle/cleanup:** implement approved cleanup only after verifying order-adjustment safety and cleanup timing.
8. **Optional UI-5C — Ephemeral Admin fallback:** only if backend cleanup/filtering cannot prevent merchant confusion; label or warn, but do not claim native-list filtering if unsupported.
9. **UI-2B — Editable VoucherConfig widget:** deferred until an update API/workflow is explicitly approved; may edit only VoucherConfig-owned fields and must not edit native Promotion/Campaign-owned fields.
10. **UI-6 — Legacy `/vouchers` retirement:** remove the transitional page only after §20.2 parity is satisfied.

### 20.2 Legacy `/vouchers` Retirement Criteria

The standalone `/vouchers` page may be removed only when all conditions below are true:

1. UI-1 create flow works from the Promotions context and redirects to canonical Promotion detail.
2. UI-2A shows VoucherConfig data on Promotion Detail and handles non-voucher Promotions cleanly.
3. UI-3 replaces the legacy analytics drawer behavior with `VoucherUsageLog`-derived analytics.
4. UI-4 provides global DiscountCapConfig management outside Promotion Detail.
5. Voucher discoverability is resolved by the native Promotion list or by `/promotions/vouchers`.
6. If admins still need to edit VoucherConfig-owned fields, UI-2B and an approved update API/workflow exist.
7. Ephemeral `VEPH-*` Promotions are verified absent from merchant confusion, safely cleaned up, or handled with an approved fallback.
8. Existing legacy page features are mapped and either replaced or deliberately declared unnecessary.
9. Manual Admin verification passes for create, find, detail, analytics, global cap, and non-voucher Promotion cases.
10. No SRS-required backend API is removed.

---

## 21. Verification Commands

Run from the **inner** `hf-medusa-store/` workspace root unless noted.

```bash
# Type-check / build (catches workflow-composition + type errors) — run after every slice
pnpm --filter @dtc/backend build          # or: cd apps/backend && npm run build

# Generate + apply migrations (from apps/backend/)
npx medusa db:generate voucherEngine      # [NEEDS_VERIFICATION: arg]
npx medusa db:migrate

# Seed (after catalog seed)
npx medusa exec ./src/scripts/seed-vouchers.ts

# Tests (from apps/backend/)
pnpm test:unit                            # unit — discount math, validation branches
pnpm test:integration:modules            # module CRUD + constraints
pnpm test:integration:http               # apply/remove/admin over HTTP (needs integration-tests/setup.js)

# Lint
pnpm lint
```

**End-to-end manual check (after slice 6):** start backend (`pnpm backend:dev`), apply `POST /store/carts/:id/voucher` against a seeded cart, confirm the returned cart total matches the §10 contract and the Vietnamese envelope; remove (`DELETE /store/carts/:id/voucher`) and confirm revert.

---

## 22. Implementation Readiness

**Overall classification: SRS-aligned plan with known implementation gaps.** The SPEC preserves every in-scope SRS functional requirement, edge case, security rule, data-integrity rule, and acceptance test (see the SRS Compliance Summary, §22.1). V7 is included as required when configured; implementation must wire the approved Customer/CRM segment read path.

Each implementation slice is classified as **Ready for Implementation** (no blockers — can be written now), **Ready after minor verification** (buildable once one or two scoped `[NV]` framework bindings are confirmed — the _strategy/mechanism_ is fixed), or **Blocked** (a genuine unresolved design/business decision). "Owner" = who resolves the residual item: **Dev** = verify against installed source; **BO** = business-owner sign-off.

| Slice / component                                                                                                   | Classification                     | Residual item(s)                                                                                                                                                  | Owner |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Models + service + migrations (§5, incl. usage-log snapshot & append-only overrides)                                | **Ready for Implementation**       | —                                                                                                                                                                 | —     |
| Pure `lib/` (`normalize-code`, `money`, `calculate-discount`) + unit tests (§16.1, reproduces §10.4/§10.5/§10.6)    | **Ready for Implementation**       | —                                                                                                                                                                 | —     |
| Error catalogue + Vietnamese envelope (`lib/errors.ts`, §8)                                                         | **Ready for Implementation**       | 429 `MedusaError` mapping `[NV #8]` (has fallback: raw `res.status(429)`)                                                                                         | Dev   |
| Backend Admin APIs: create/list/analytics + discount-cap routes (§11.6, §11.9, §12)                                 | **Ready for Implementation**       | Voucher update/deactivate intentionally out of SRS scope                                                                                                          | —     |
| Admin UI migration — UI-1 Promotion-context create route/action (§20.1)                                             | **Ready for Implementation**       | Existing worktree files should be reviewed and completed, not discarded                                                                                           | Dev   |
| Admin UI migration — UI-2A read-only Promotion Detail VoucherConfig widget (§20.1)                                  | **Ready after minor verification** | Verify query path for resolving VoucherConfig by canonical `promotion_id`; no editing                                                                             | Dev   |
| Admin UI migration — UI-2C voucher discoverability/list parity (§20.1)                                              | **Ready after minor verification** | Decide whether native Promotion list is sufficient; otherwise plan `/promotions/vouchers`                                                                         | Dev   |
| Admin UI migration — UI-3 Promotion Detail analytics widget (§20.1)                                                 | **Ready after minor verification** | Reuse existing analytics API after resolving VoucherConfig by `promotion_id`; extend only if recent usage is approved/needed                                      | Dev   |
| Admin UI migration — UI-4 global DiscountCapConfig UI (§20.1)                                                       | **Ready for Implementation**       | Use global settings/admin surface, not Promotion Detail                                                                                                           | Dev   |
| Admin UI migration — Backend-5A/5B ephemeral visibility + cleanup (§20.1, NV#15)                                    | **Ready after verification**       | Verify native list pollution, cleanup timing, and order-adjustment safety before backend cleanup                                                                  | Dev   |
| Admin UI migration — optional UI-5C ephemeral Admin fallback (§20.1)                                                | **Blocked unless needed**          | Only if backend cleanup/filtering cannot prevent merchant confusion                                                                                               | Dev   |
| Admin UI migration — UI-2B editable VoucherConfig widget (§20.1)                                                    | **Blocked pending approval**       | Requires explicit approval for VoucherConfig update API/workflow; never edit native Promotion/Campaign-owned fields                                               | BO    |
| Admin UI migration — UI-6 legacy `/vouchers` retirement (§20.2)                                                     | **Blocked pending parity**         | Requires every §20.2 retirement criterion to pass                                                                                                                 | BO    |
| Store `GET /store/customers/me/vouchers` — My Vouchers (§12, Decision F)                                            | **Implementation gap**             | Currently lists all active vouchers; must filter by approved CRM/customer assignment source (shares dependency with V7 below)                                     | Dev   |
| Brute-force rate limiting (§14.1) — algorithm, keys, TTL, cooldown, fallback                                        | **Implementation gap**             | `COOLDOWN_S = 60` in code, must be `1800`; also identity source `[NV #7]`, Redis client `[NV #9]`                                                                 | Dev   |
| Redis caching + invalidation (§14.4)                                                                                | **Ready after minor verification** | Redis client `[NV #9]`                                                                                                                                            | Dev   |
| Validation step V1–V8 (§9)                                                                                          | **Ready after minor verification** | cart adapter `[NV #2]` (for V5/V6 inputs); Customer/CRM segment read path for V7                                                                                  | Dev   |
| Redemption atomicity + idempotency (§14.3) — unique constraint, conditional update, per-user re-check               | **Ready after minor verification** | txn/`nativeUpdate` API `[NV #10]`                                                                                                                                 | Dev   |
| Cart-change revalidation — sync + subscriber combination (§11.3, §11.5, §13.1)                                      | **Ready after minor verification** | `cart.updated` coverage/self-trigger `[NV #5]`                                                                                                                    | Dev   |
| Apply / Remove workflows + store routes (§11.1/§11.2) — **promotion-adjustment mechanism VERIFIED**                 | **Ready after minor verification** | `[NV #3]` promotion-apply input signature; `[NV #3a]` lock API                                                                                                    | Dev   |
| `loadCartContextStep` cart/promotion adapter (§10.7) — **fields VERIFIED**                                          | **Ready after minor verification** | `[NV #2]` `item_subtotal` inclusion semantics (mitigated by per-line adjustment sum)                                                                              | Dev   |
| Redemption trigger — **cart→order propagation VERIFIED**; sync hook primary + subscriber fallback (§13.2/§13.3)     | **Ready after minor verification** | `[NV #6a]` completion hook point; `[NV #6]` fallback event id                                                                                                     | Dev   |
| V7 segment validation (§9.4)                                                                                        | **Implementation gap**             | Current code is a hardcoded stub (`return PASS`); must wire approved CRM/customer segment source (shares dependency with My Vouchers above); null conditions pass | Dev   |
| Promotion link (§6) — scope itself needs no link (Decision B: plain JSON, **Ready for Implementation**, no blocker) | **Ready after minor verification** | promotion linkable key `[NV #4]`                                                                                                                                  | Dev   |
| HTTP / concurrency / subscriber / Redis-fallback tests (§16.3–§16.6)                                                | **Ready after minor verification** | `integration-tests/setup.js` missing (must create); test-runner import `[NV #12]`                                                                                 | Dev   |

**Readiness summary:**

- **Ready now (no blockers):** models/service/migrations, pure discount lib + unit tests, error/envelope catalogue, backend admin create/list/analytics routes, the DiscountCapConfig singleton route, UI-1, and UI-4. Coherent first delivery, fully testable without any framework `[NV]`.
- **Ready after minor verification (strategy/mechanism fixed, one binding each):** apply/remove (promotion adjustment **verified**), cart adapter (fields **verified**), redemption trigger (propagation **verified**), rate limiting, caching, validation step, redemption atomicity, revalidation, scope links, tests. Each needs a single confirmable API-shape/id/semantic from the transitive `@medusajs/*` packages; **none needs a new design decision.**
- **No remaining Blocked slices** for the three target gaps — pass 2 verified their mechanisms from shipped `@medusajs/medusa/dist/api/**`. What's left are narrow `[NV]` bindings (workflow input signatures, one event-id string, a hook-point, a field-inclusion semantic, lock/txn API shapes) in transitive packages reachable once `Grep`/`Glob` are enabled or via MedusaDocs MCP.
- **Deferred by approval (not blocking):** editable VoucherConfig widget/update workflow (UI-2B), legacy `/vouchers` retirement (UI-6), real-time push (PD-09), purchase-history (PD-07), promo-tier recalc beyond Price List sale-price behavior (PD-10 — covered by §11.5 where relevant).

### 22.1 SRS Compliance Summary

The SPEC covers all in-scope Voucher requirements of `SRS_SuggestiveSelling_Voucher_v1.0`. (Full section-level mapping in §17; this is the checklist view.)

| SRS group      | Items                                               | Covered by                                                                                                                                             |
| -------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Functional     | **VOUCH-001 … VOUCH-005**                           | §11.1 (apply/replace), §11.2 (remove), §11.3/§11.5 (revalidation), §8.1/§12 (apply+My-Vouchers list+replace-confirm), §9 (V-pipeline)                  |
| Validation     | **V1 … V8**                                         | §9.0/§9.1 (apply-time full), §9.2 (revalidation subset V1,V2,V5,V6,V7 when configured,V8), §9.0 (redemption V3,V4); fail-fast, Vietnamese-first (§8.3) |
| Edge cases     | **EC-01, EC-02, EC-03, EC-04, EC-06, EC-08, EC-10** | §10.5/§10 (EC-01), §11.3 (EC-02), §10.2/§10.6 (EC-03), §14.2-C (EC-04), §9.2+Rule 12/13 (EC-06), §11.5 (EC-08), §14.1 (EC-10)                          |
| Security       | **SEC-01 … SEC-04**                                 | §3+§10 server-side truth (SEC-01), §14.1 brute-force (SEC-02), §5.1/§8.1 code format (SEC-03), §12 admin auth + customer-scoped (SEC-04)               |
| Data integrity | **INT-01 … INT-04**                                 | §5/§10 integer money (INT-01), §14.3 atomic usage (INT-02), Rule 18/§11 recalc-from-source (INT-03), §5.2 append-only usage log (INT-04)               |

**Deliberate, flagged implementation interpretations (not SRS removals):** "extends Promotion" → custom module linked to native Promotion/Campaign (CONFLICT-1); percentage values use basis points (CONFLICT-3); voucher update/deactivate admin APIs are excluded because SRS §6.2 requires create and analytics only. V7 is required when configured. **Not yet acceptance-criteria'd:** SRS §9.1 performance targets are addressed by design (Redis caching, no DB writes during calc) but lack explicit p95 test assertions — recommended follow-up, not an SRS functional gap.

---

## 23. Code-Level Implementation Blueprint — Focus Tasks

Full per-file contracts for the pricing-integrity tasks. Each file subsection uses the 13-point structure so an implementation agent writes it without redesign. Naming follows verified repo conventions (kebab-case files as in `suggestion-rule-item.ts`; camelCase functions as in `invalidateSuggestionCache`; PascalCase types; zod v4 validators as in `admin/suggestion-rules/validators.ts`; unit tests `*.unit.spec.ts` under `__tests__/` per `jest.config.js`). Comments in the written code must cite the SRS/task id, mirroring the existing modules (e.g. `// SRS INT-01`).

### 23.0 Task → file → SRS map, and global prohibitions

| Task       | Meaning                                                    | SRS anchor          | Primary file(s)                                                        |
| ---------- | ---------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------- |
| **3.3.1**  | Integer-only monetary calculation, no floating-point       | INT-01, Rule 19     | §23.1 `lib/money.ts`                                                   |
| **3.3.2**  | Original Cart subtotal calculation                         | §9.3/§10, VOUCH-003 | §23.2 `lib/calculate-discount.ts` + §23.3 `steps/load-cart-context.ts` |
| **3.3.14** | Final Cart total recalculated from authoritative Cart data | INT-03              | §23.4 `steps/verify-cart-totals.ts` (+ expected-total from §23.2)      |
| **3.8.3**  | Server-side-only discount calculation                      | SEC-01              | §23.5 route + §23.1–23.4 (all calc server-side)                        |
| **3.8.4**  | Cart total is the single pricing truth                     | INT-03/SEC-01       | §23.4 + §23.5 (route returns refetched Cart)                           |

**Global prohibitions (enforced by review + a lint note; apply to every file in §23).** Implementation MUST NOT:

- use floating-point for money — no non-integer percentages in arithmetic (percent is basis-point **integers**, `value/10000` via `Math.floor`);
- call `parseFloat`, `Number.parseFloat`, or `toFixed` anywhere in monetary paths;
- trust client-provided totals, discounts, eligibility, `promotion_id`, or amounts (§23.5 forbidden fields);
- mutate Cart totals directly (only the Cart Module recomputes; VoucherEngine applies/removes a Promotion — §14.2-A);
- perform any monetary calculation inside an API route handler (routes only validate → run workflow → return refetched Cart — §23.5).

`[NEEDS_VERIFICATION #14]` — Medusa 2.16 may return cart/line money fields as **`BigNumberValue`** (a number or `{ value, ... }`), not always a raw JS integer. Before any arithmetic/comparison, normalize each money field to a safe integer through a single helper (§23.1 `toInt`). Confirm the runtime shape against `@medusajs/types` `BigNumberValue` / the cart DTO; the algorithms below assume post-normalization integers.

### 23.1 `apps/backend/src/modules/voucher-engine/lib/money.ts` — integer money utilities (task 3.3.1)

1. **File path:** `apps/backend/src/modules/voucher-engine/lib/money.ts`
2. **Purpose:** the only place monetary primitives are manipulated; guarantees integer, safe-integer, floor-rounded, non-negative arithmetic (INT-01, Rule 19). Pure, no I/O, no framework imports.
3. **Exports (named):** `toInt`, `assertSafeInt`, `bps`, `clampMin`, `sumInts`, and const `BPS_DENOMINATOR = 10000`.
4. **Owned types:** `type Money = number` (branded doc-only alias; integer VND). No classes.
5. **Dependencies:** none (no imports). Deliberately framework-free so it is trivially unit-testable and reusable by pure calc.
6. **Function contracts:**
   - `toInt(value: unknown, label: string): number` — normalize a possibly-`BigNumberValue` money field to an integer; if `value` is `{ value }` unwrap it; reject non-finite/non-integer (`throw new MoneyError(...)`). Resolves `[NV #14]`.
   - `assertSafeInt(value: number, label: string): void` — throw unless `Number.isSafeInteger(value)`.
   - `bps(amount: number, basisPoints: number): number` — `assertSafeInt` both, return `Math.floor((amount * basisPoints) / BPS_DENOMINATOR)`. The only percentage primitive (basis-point → amount). **Floor** = round toward store, never fractional VND (§10.2).
   - `clampMin(value: number, floor = 0): number` — `Math.max(floor, value)`.
   - `sumInts(values: number[], label: string): number` — reduce with `assertSafeInt` per element and on the running total (overflow guard).
7. **Meaningful variables:** `BPS_DENOMINATOR` (10000). No mutable module state.
8. **Ordered algorithm (`bps`):** (a) `assertSafeInt(amount)`; (b) `assertSafeInt(basisPoints)`; (c) `product = amount * basisPoints`; (d) `assertSafeInt(product)` (catch overflow before divide); (e) `return Math.floor(product / 10000)`.
9. **Validation & guards:** integer-only; safe-integer bounds; no float branch exists; `bps` requires `0 ≤ basisPoints ≤ 10000` for discounts (caller passes validated config) — assert range.
10. **Errors:** throws a local `class MoneyError extends Error` (with `label`). Callers in steps catch and re-map to `VOUCHER_CALCULATION_FAILED` (§8.4) so raw errors never reach the client (§12.5).
11. **Side effects:** none (pure).
12. **Compensation:** n/a (pure).
13. **Mapped tests:** `lib/__tests__/money.unit.spec.ts` — `bps(3_800_000, 1000) === 380_000`; `bps(2_840_000, 2000) === 568_000` (feeds §10.5); floor case `bps(150_000, 2000)===30_000`; `toFixed`/`parseFloat` absent (grep assertion in test); `assertSafeInt` throws on `1e20`; `toInt({value: '30000'})===30000` (`[NV #14]`). (INT-01, Rule 19.)

### 23.2 `apps/backend/src/modules/voucher-engine/lib/calculate-discount.ts` — pure discount resolution (tasks 3.3.2, 3.3.14)

1. **File path:** `apps/backend/src/modules/voucher-engine/lib/calculate-discount.ts`
2. **Purpose:** the entire §10 calculation contract as a deterministic function of plain integers — original subtotal (3.3.2), voucher discount with both caps, and the **expected final Cart total** used later for verification (3.3.14). No I/O, no Medusa imports.
3. **Exports (named):** `calculateOriginalSubtotal`, `calculateItemPromotionDiscount`, `calculateEligiblePostPromotionSubtotal`, `calculateVoucherDiscount`; types `LineValue`, `VoucherDiscountInput`, `VoucherDiscountResult`.
4. **Owned types:**
   - `interface LineValue { line_id: string; unit_price: number; quantity: number; item_promotion_discount: number; is_eligible: boolean }` — one per cart line, item-promotion discount already summed from **non-voucher** adjustments (§23.3).
   - `interface VoucherDiscountInput { lines: LineValue[]; discount_type: 'percentage' | 'fixed_amount'; discount_value: number; max_discount_amount: number | null; global_cap_bps: number }`
   - `interface VoucherDiscountResult { original_subtotal: number; item_promotion_discount: number; post_promotion_subtotal: number; eligible_post_promotion_subtotal: number; raw_voucher_discount: number; voucher_discount_after_voucher_cap: number; maximum_combined_discount: number; final_voucher_discount: number; discount_capped: boolean; expected_final_cart_total: number }`
5. **Dependencies:** `./money` (`bps`, `clampMin`, `sumInts`, `assertSafeInt`). Nothing else.
6. **Function contracts:**
   - `calculateOriginalSubtotal(lines: LineValue[]): number` — `sumInts(lines.map(l => l.unit_price * l.quantity))` (each line asserted integer). = §10 `original_subtotal`.
   - `calculateItemPromotionDiscount(lines): number` — `sumInts(lines.map(l => l.item_promotion_discount))`. = §10 `item_promotion_discount`.
   - `calculateEligiblePostPromotionSubtotal(lines): number` — `sumInts(eligible lines → l.unit_price*l.quantity − l.item_promotion_discount)`, `clampMin(_,0)` per line.
   - `calculateVoucherDiscount(input): VoucherDiscountResult` — full pipeline (algorithm below).
7. **Meaningful variables:** `original_subtotal`, `item_promotion_discount`, `post_promotion_subtotal`, `eligible_post_promotion_subtotal`, `raw_voucher_discount`, `voucher_discount_after_voucher_cap`, `maximum_combined_discount`, `remaining_cap_capacity`, `final_voucher_discount`, `discount_capped`, `expected_final_cart_total` — names mirror §9.2/§10.1 exactly.
8. **Ordered algorithm (`calculateVoucherDiscount`) — mirrors §10.1 / Solution Flow §9.1:**
   1. `original_subtotal = calculateOriginalSubtotal(lines)`.
   2. `item_promotion_discount = calculateItemPromotionDiscount(lines)`.
   3. `post_promotion_subtotal = clampMin(original_subtotal − item_promotion_discount)`.
   4. `eligible_post_promotion_subtotal = calculateEligiblePostPromotionSubtotal(lines)`.
   5. `raw_voucher_discount =` percentage → `bps(eligible_post_promotion_subtotal, discount_value)`; fixed → `Math.min(discount_value, eligible_post_promotion_subtotal)` (fixed can't exceed eligible — §10.2).
   6. `voucher_discount_after_voucher_cap = max_discount_amount == null ? raw : Math.min(raw, max_discount_amount)` (Rule 8).
   7. `maximum_combined_discount = bps(original_subtotal, global_cap_bps)` (Rule 9 — cap on **original** subtotal).
   8. `remaining_cap_capacity = clampMin(maximum_combined_discount − item_promotion_discount)` (Rule 10/11 — item promo never reduced).
   9. `final_voucher_discount = clampMin(Math.min(voucher_discount_after_voucher_cap, remaining_cap_capacity))`.
   10. `discount_capped = final_voucher_discount < voucher_discount_after_voucher_cap`.
   11. `expected_final_cart_total = clampMin(original_subtotal − item_promotion_discount − final_voucher_discount)` (§10.1 `final_cart_total`; EC-03 min-1-VND policy handled by caller/`[NV #13]`).
9. **Validation & guards:** every intermediate through `money.ts` (integer/safe/floor); `discount_value` percentage asserted `≤ 10000`; all clamped `≥ 0`; deterministic (no `Date`/`random`).
10. **Errors:** propagates `MoneyError` → step maps to `VOUCHER_CALCULATION_FAILED`.
11. **Side effects:** none.
12. **Compensation:** n/a.
13. **Mapped tests:** `lib/__tests__/calculate-discount.unit.spec.ts` — reproduces §10.4 (→ `final=380_000`, `expected_final_cart_total=3_420_000`, T-VOUCH-07); §10.5 (→ `final=490_000`, `expected=2_350_000`, `discount_capped=true`, T-VOUCH-08); §10.6 (50%+50% → `final=0`/clamp, EC-03/T-VOUCH-09); fixed-voucher cap (§10.2); `max_discount_amount` before global cap (Rule 8); item-promo consumes entire cap → `final=0` (§10.5 boundary). Relationship to SRS: each asserted number equals the SRS §4.1 VOUCH-003 worked examples.

### 23.3 `apps/backend/src/workflows/voucher-engine/steps/load-cart-context.ts` — authoritative Cart read + mapping (task 3.3.2)

1. **File path:** `apps/backend/src/workflows/voucher-engine/steps/load-cart-context.ts`
2. **Purpose:** read the latest Cart from Medusa and map it to the pure calculator's `LineValue[]`, excluding VoucherEngine's own adjustment. The single adapter between framework money shapes and the pure layer.
3. **Exports:** `loadCartContextStep` (a `createStep(...)` from `@medusajs/framework/workflows-sdk` `[NV #3]`); type `CartContext`.
4. **Owned types:** `interface CartContext { cart_id: string; currency_code: string; lines: LineValue[]; original_subtotal: number; item_promotion_discount: number; post_promotion_subtotal: number; concurrency_marker: string }` (reuses `LineValue` from §23.2).
5. **Dependencies:** `ContainerRegistrationKeys.QUERY` / `remoteQueryObjectFromString` (verified in `carts/helpers.js`); `../../../modules/voucher-engine/lib/money` (`toInt`); `./`-local none.
6. **Function/step contract:** input `{ cart_id: string; voucher_promotion_id?: string }` → output `CartContext`. Reads exactly the verified fields (§10.7): cart `currency_code`, `original_item_subtotal`, `item_subtotal`, `item_discount_total`, `updated_at`; line `items.id`, `items.unit_price`, `items.quantity`, `items.product_id`, `items.product.categories.id`, `items.adjustments.{amount,promotion_id,code}`.
7. **Meaningful variables:** `raw_cart` (query result), `voucher_promotion_id` (to exclude own adjustment), per-line `line_item_promotion_discount`.
8. **Ordered algorithm:**
   1. `query.graph({ entity: 'cart', filters: { id: cart_id }, fields: [...§10.7] })` → `raw_cart`; if none → throw.
   2. For each `item`: `unit_price = toInt(item.unit_price)`, `quantity = toInt(item.quantity)`.
   3. `line_item_promotion_discount = sumInts(item.adjustments.filter(a => a.promotion_id !== voucher_promotion_id).map(a => toInt(a.amount)))` — **excludes VoucherEngine's own adjustment** (Rule 11; distinguishes by `promotion_id`, verified §10.7).
   4. `is_eligible` set later by `resolveEligibleItemsStep`; default `false` here (or fold scope-match in — keep here read-only, eligibility in its own step).
   5. Aggregate `original_subtotal`, `item_promotion_discount`, `post_promotion_subtotal` via `calculate*` (§23.2) for cross-checking against cart aggregates.
   6. `concurrency_marker = raw_cart.updated_at` (`[NV #3a]`).
9. **Validation & guards:** `toInt` on every money field (`[NV #14]`); if `item_discount_total` (cart aggregate) ≠ Σ line promotion discounts (excluding voucher) → log a warning and **trust the per-line sum** (mitigation for `[NV #2]` semantics); missing/empty `adjustments` → treat as `0` (no item promo); negative computed line value → `clampMin`.
10. **Errors:** cart-not-found or malformed money → `VOUCHER_CALCULATION_FAILED` (safe; cart untouched).
11. **Side effects:** read-only (no mutation).
12. **Compensation:** none (read-only step).
13. **Mapped tests:** module-integration `src/modules/voucher-engine/__tests__/load-cart-context.spec.ts` — seeds a cart with an item promotion + a voucher adjustment, asserts the voucher adjustment is excluded and `item_promotion_discount` equals the item-promo only; empty-adjustments cart → `0`. (Feeds T-VOUCH-01/05/06.)

### 23.4 `apps/backend/src/workflows/voucher-engine/steps/verify-cart-totals.ts` — authoritative-total verification (tasks 3.3.14, 3.8.4)

1. **File path:** `apps/backend/src/workflows/voucher-engine/steps/verify-cart-totals.ts`
2. **Purpose:** after the voucher Promotion is applied (§11.1 step 9), prove the Cart Module's own recomputed totals match VoucherEngine's internal calculation. The internal number is used **only** as an assertion oracle; the refetched Cart total is the single pricing truth (3.8.4, INT-03).
3. **Exports:** `verifyCartTotalsStep`.
4. **Owned types:** `interface VerifyTotalsInput { cart_id: string; promotion_id: string; final_voucher_discount: number; expected_final_cart_total: number; pre_apply_non_voucher_adjustment_total?: number }`; `interface VerifyTotalsOutput { cart: unknown /* refetched authoritative cart */; verified: true }`.
5. **Dependencies:** QUERY/`refetchCart`-style read (verified `carts/helpers.js`); `../../../modules/voucher-engine/lib/money` (`toInt`).
6. **Step contract:** input `VerifyTotalsInput` → output `VerifyTotalsOutput`.
7. **Meaningful variables:** `cart` (refetched), `applied_adjustment_total` (Σ `items.adjustments[].amount where promotion_id === promotion_id`), `authoritative_total = toInt(cart.total)`, `TOLERANCE = 0` (exact integer equality — no rounding slack).
8. **Ordered algorithm:**
   1. Refetch the cart with §10.7 fields + `total`, `discount_total`, `items.adjustments`.
   2. `applied_adjustment_total = sumInts(cart.items.flatMap(i => i.adjustments).filter(a => a.promotion_id === input.promotion_id).map(a => toInt(a.amount)))`.
   3. **Assert** `applied_adjustment_total === input.final_voucher_discount` (the voucher discount Medusa recorded equals what VoucherEngine computed).
   4. **Defensive non-voucher-adjustment guard.** Recompute the post-apply non-voucher adjustment total = `sumInts(cart.items.flatMap(i => i.adjustments).filter(a => a.promotion_id !== input.promotion_id).map(a => toInt(a.amount)))`. If a pre-apply baseline is supplied, assert the post-apply value did not shrink. This protects against unexpected native Promotion Module adjustment coexistence, which is not part of the default SRS interpretation. On shrink → throw `VOUCHER_STACKING_UNSUPPORTED` and revert the voucher.
   5. **Assert** `toInt(cart.total) === input.expected_final_cart_total`.
   6. On the step-3 or step-5 mismatch → throw `VOUCHER_CALCULATION_FAILED`; on the step-4 shrink → throw `VOUCHER_STACKING_UNSUPPORTED`.
   7. Return `{ cart, verified: true }` — the **refetched** cart is what flows to the response.
9. **Validation & guards:** exact integer equality (`TOLERANCE = 0`); `toInt` normalization (`[NV #14]`); the Rule-11-shrink guard above; never writes a total.
10. **Errors:** `VOUCHER_CALCULATION_FAILED` and `VOUCHER_STACKING_UNSUPPORTED`. **`VOUCHER_STACKING_UNSUPPORTED` is an internal/diagnostic distinction only** — the **customer-facing** envelope (code + Vietnamese message + HTTP status) stays within the Decision-A-authoritative API contract (map it to the same generic "cannot apply voucher" customer response as `VOUCHER_CALCULATION_FAILED` unless/until the approved contract adds a dedicated code; do NOT invent a new customer-facing code here). The distinct internal code exists for logs/metrics so operators can tell a Rule-11 stacking break apart from a generic total mismatch. The mismatch/shrink detail (expected vs actual, per-promotion) is logged internally only (§12.5, §18.6).
11. **Side effects:** read-only.
12. **Compensation:** on this step's throw, the workflow runs `applyVoucherPromotionStep`'s compensation → `updateCartPromotionsWorkflow REMOVE` the voucher code, so the Cart recomputes to its pre-voucher state (never a stale write-back — Rule 18). No custom total is persisted.
13. **Why no custom total:** persisting or returning a VoucherEngine-computed total would create a second pricing source that could diverge from Cart/Order at payment/completion (violates 3.8.4/INT-03/SEC-01). The internal `expected_final_cart_total` exists solely to fail fast if the Promotion mechanism produced a different number than intended.
14. **Mapped tests:** http-integration `integration-tests/http/apply-voucher.spec.ts` asserts the response cart `total` equals the §10.4 contract (`3_420_000`) and that a deliberately mismatched fixture triggers `VOUCHER_CALCULATION_FAILED` with the cart reverted (no voucher adjustment remains). (T-VOUCH-01; INT-03.) The Price List sale-price basis requires a regression test proving voucher discount is calculated from `items.unit_price` and never mutates `compare_at_unit_price` or Price List data. A native Promotion adjustment coexistence test is optional future coverage only if the business requires that scenario.

### 23.5 `apps/backend/src/api/store/carts/[id]/voucher/route.ts` + `validators.ts` — server-side-only enforcement (tasks 3.8.3, 3.8.4)

1. **File paths:** `apps/backend/src/api/store/carts/[id]/voucher/route.ts`, `.../validators.ts` (Decision E — the `[id]` segment is the cart id route param; `validators.ts` is already **SHIPPED** and matches this contract).
2. **Purpose:** thin HTTP boundary. Validates the minimal client input, runs `applyVoucherWorkflow` / `removeVoucherWorkflow`, and returns the **authoritative refetched Cart** + Vietnamese envelope. Performs **zero** monetary calculation (3.8.3).
3. **Exports:** `POST`, `DELETE` (route); `ApplyVoucherSchema`, `ApplyVoucherBody`, `ApplyVoucherQuerySchema`, `ApplyVoucherQuery`, `RemoveVoucherSchema`, `RemoveVoucherBody` (validators).
4. **Owned types:** `ApplyVoucherBody = z.infer<typeof ApplyVoucherSchema>`; `ApplyVoucherQuery = z.infer<typeof ApplyVoucherQuerySchema>`; `RemoveVoucherBody = z.infer<typeof RemoveVoucherSchema>`.
5. **Dependencies:** `@medusajs/framework/http` (`MedusaRequest`,`MedusaResponse`), `Modules.WORKFLOW_ENGINE` resolve (pattern verified in `carts/[id]/complete/route.js`), the two workflows, the error→envelope mapper (`lib/errors`).
6. **Contracts:**
   - `ApplyVoucherSchema` (zod v4, **`.strict()`** so unknown keys are rejected): `{ code: z.string().min(MIN_CODE_LENGTH).regex(/^[A-Za-z0-9]+$/) }` — **no `cart_id`, no `confirm_replace`** (both are rejected by `.strict()`; cart id is the `:id` route param, replace is the query flag). `code` normalized to upper in the workflow (not the route).
   - `ApplyVoucherQuerySchema` (zod v4, **`.strict()`**): `{ replace: z.coerce.boolean().optional() }` — the `?replace=true` confirmation flag.
   - `RemoveVoucherSchema` (zod v4, **`.strict()`**): `z.object({})` — DELETE carries no body; strict rejects any smuggled pricing/identity field.
   - `POST(req: MedusaRequest<ApplyVoucherBody>, res)` → the **contract §1.3 / §8.1 success shape**: `{ success: true, discount_amount, discount_capped, cap_explanation, updated_cart_total, voucher_details: { code, type, value, expires_at } }`. All scalar fields are **derived server-side from the refetched authoritative cart** produced by `verifyCartTotalsStep` (INT-03 — the route computes nothing; `updated_cart_total` = the cart's authoritative total, `discount_amount`/`discount_capped`/`cap_explanation` from the workflow result). Do **not** return a raw Medusa `cart` object here — the store contract exposes only the scalar envelope (§8.1), unlike native cart routes.
   - `DELETE(req, res)` → the **§8.2 shape**: `{ success: true, updated_cart_total, message: "Đã gỡ mã giảm giá." }` (`updated_cart_total` from the refetched cart). No-active-voucher → 200 no-op.
7. **Meaningful variables:** `code` (body), `replace` (query), `cart_id = req.params.id` (route param) — the only client-influenced values; `cart_id` arrives via the URL path, not the body.
8. **Ordered algorithm (`POST`):** (a) body already validated by `validateAndTransformBody(ApplyVoucherSchema)` in `middlewares.ts`; (b) parse `replace` from the query via `ApplyVoucherQuerySchema` (middleware `validateAndTransformQuery` or inline `ApplyVoucherQuerySchema.parse(req.query)` — see §4.2 note); (c) read `cart_id = req.params.id`; (d) resolve WORKFLOW_ENGINE; (e) `run(applyVoucherWorkflowId, { input: { code, cart_id: req.params.id, customer_id: req.auth_context?.actor_id ?? null, replace } })` — `cart_id` from the **route param** and `customer_id` from the **server** auth context, never the body (`[NV #7]` for customer id only; cart id sourcing verified); (f) map workflow error → envelope (§8.4); (g) `res.json(...)` the **scalar success envelope** of step 6 (derived from the refetched authoritative cart returned by the workflow — never a raw `cart` object). `DELETE`: same but `run(removeVoucherWorkflowId, { input: { cart_id: req.params.id } })` and return the §8.2 shape.
9. **Validation & guards — client field policy (3.8.3):**
   - **May submit:** `code` (body), `replace` (query), cart id (URL path param). Nothing else.
   - **MUST NEVER submit (rejected by `.strict()`):** `cart_id` (body), `confirm_replace`, `discount_amount`, `final_voucher_discount`, any `*_total`, `original_discount`, `discount_capped`, `promotion_id`, `voucher_id`, `usage_count`, `eligible_item_ids`, `customer_id`, `min_order_value`, or any monetary/eligibility/identity field.
   - **Always loaded server-side:** cart contents/totals (Cart Module), voucher rules (`VoucherConfig`), backing Promotion, global cap (`DiscountCapConfig`), customer identity (auth context).
10. **Errors:** business errors → typed envelope with `MedusaError` mapping (§8.4); rate limit → 429 (`[NV #8]`); never leak raw errors (§12.5).
11. **Side effects:** none in the route itself; all mutation is inside the workflow.
12. **Compensation:** n/a at route level (workflow owns compensation).
13. **Mapped tests:** `integration-tests/http/apply-voucher.spec.ts` — (a) a body containing `discount_amount`/`final_voucher_discount`/`cart_id`/`confirm_replace` → 400 (strict rejection), proving tampering has no effect (SEC-01/T-VOUCH tamper); (b) valid apply `POST /store/carts/:id/voucher` → response `updated_cart_total` equals the server-side authoritative cart total (3.8.4); (c) applying when a voucher is already active without `?replace=true` → 409 `VOUCHER_REPLACE_REQUIRED`; retry with `?replace=true` swaps it, and if the new voucher fails validation the old one remains (§11.1 replace flow, tasks 3.4.7/3.4.8); (d) `DELETE /store/carts/:id/voucher` → totals reverted, no usage increment (T-VOUCH-10); no-active-voucher DELETE → 200 no-op.

> **Readiness of §23 files:** with the contracts above, `lib/money.ts` and `lib/calculate-discount.ts` are **Ready for Implementation** (no framework `[NV]`; fully unit-testable now). `load-cart-context.ts`, `verify-cart-totals.ts`, and the store route are **Ready after minor verification** — they need only `[NV #3]` (`createStep`/`updateCartPromotionsWorkflow` shapes), `[NV #7]` (auth-context field), `[NV #14]` (`BigNumberValue` normalization), all confirmable in installed `@medusajs/*`.

---

> **STOP.** This is a planning artifact only. No source code has been created or modified. Await manual review and approval before implementation. Pass 2 verified the three cart/order/promotion mechanisms against shipped `@medusajs/medusa/dist/api/**` (see top verification log); §23 adds code-level contracts for the pricing-integrity tasks. Before writing each slice, confirm its remaining narrow `[NEEDS_VERIFICATION]` binding (§19.2) against the named transitive `@medusajs/*` package (reachable with `Grep`/`Glob` or MedusaDocs MCP).
