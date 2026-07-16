# VoucherEngine Storefront UI — Wireframes (Design Phase)

**Status:** Design resolved, not implemented. Companion to `UX-FLOW.md`. Compact text/ASCII wireframes only — no visual mockups, no code.

**Revision note (architecture correction):** this revision replaces the earlier design's two side-by-side surfaces (the generic `DiscountCode` component plus a separate `VoucherPanel`) with **one unified, customer-facing discount-code module**. Medusa's storefront already ships a Promotion Code UI in the cart/checkout summary, and VoucherEngine applies its discount through an **ephemeral Medusa Promotion** attached to the same `cart.promotions` collection that UI reads. Showing a second, independent input/panel next to it would duplicate the discount-code surface for the customer. See §0 below for the corrected architecture.

**Language note — three distinct facts, not to be blurred together:**

1. **UI-authored labels/buttons/placeholders are English.** `Promotion code`, `Apply`, `Available vouchers`, `Remove`, etc. are English in these wireframes and in the eventual implementation.
2. **Backend-supplied strings — `customer_message`, the replace-confirmation prompt, `cap_explanation`, the remove confirmation — are rendered verbatim, and are currently Vietnamese.** No backend code was touched by this revision. Every illustrative message shown below (validation errors, the cap banner, the replace-confirmation prompt, the remove confirmation) is an **English stand-in for whatever string the backend actually returns** — implementation must render that string exactly as received, never translate it at runtime.
3. **Fully English customer-facing copy end-to-end would be a separate backend copy/catalogue change** (the `lib/errors.ts` catalogue and `cap_explanation` generation) — out of scope for this wireframe pass and for the frontend code refactor it feeds.

**Conventions used below:**

- `[ ... ]` = button. `( ... )` = text input. `<...>` = link/tappable text.
- `small:` breakpoint = desktop (per this repo's Tailwind preset, ≥1024px — see `REQUIREMENTS.md` §1.7). Below it = mobile.
- All layouts assume the existing `Summary` column (cart page, right rail on desktop / stacked on mobile).

---

## 0. Architecture note — one enhanced Promotion Code module, not two panels

The customer sees **exactly one** discount-code surface, referred to below as **`EnhancedDiscountCode`** (equally acceptable names: `PromotionCodeModule`, or "`DiscountCode` with Voucher Engine support" — pick one at implementation time, but use it consistently). It **replaces** today's generic `DiscountCode` component in place — same position in the `Summary`/checkout layout, same single input + single Apply button, same applied-codes list — extended to also understand VoucherEngine codes. There is no second, VoucherEngine-only input anywhere in these wireframes.

- **One input, one button.** The customer types either a generic promotion code or a voucher code into the same field and taps the same "Apply" button. There is never a second code field or a second Apply button on screen at once. (See `UX-FLOW.md` §1a for the single-input routing rule that decides, behind the scenes, whether a submitted code is handled as a voucher or a generic promotion.)
- **One applied-codes list.** Generic promotions and an active voucher render as rows in the same "Applied codes" list (§1.3–§1.5 below), not in two separate lists or panels.
- **Voucher state comes from `cart.metadata.voucher`, never from `cart.promotions`.** The module reads `cart.metadata.voucher` to know whether a voucher is active, what its human `code`/savings/cap state are, and whether to render a voucher-style row. `cart.promotions` remains the source for every _generic_ promotion row, exactly as today.
- **The ephemeral internal voucher Promotion is hidden from the applied-codes list.** VoucherEngine applies its discount by attaching a Medusa Promotion whose `id` matches `cart.metadata.voucher.ephemeral_promotion_id` and whose internal `code` is a system-generated string (e.g. `VEPH-...`) — never the human-readable voucher code the customer typed. The module filters this one entry out of whatever it reads from `cart.promotions` before rendering the generic rows, and instead renders the voucher row itself from `cart.metadata.voucher` using the **human voucher code** (e.g. `SHUTTLE20`). The internal ephemeral code is never shown to the customer, anywhere, under any state.
- **Removing/adding a generic code must not detach the active voucher.** When the customer applies or removes a _generic_ promotion code, the module resubmits its full code list; that resubmission must still include the ephemeral voucher's internal code so the voucher stays attached (it is simply excluded from what's _displayed_, not from what's _sent_). Removing the _voucher itself_ is a distinct action (the "Remove" affordance on the voucher row, §1.4) that goes through VoucherEngine's own remove call, not the generic code-list resubmission.
- **One-active-voucher rule (Rule 1) still applies**, so at most one row in the applied-codes list is ever voucher-flavored; any number of generic promotion rows may appear alongside it.
- **"Available vouchers" is a trigger inside this same module**, not a separate component's affordance — see §2.

---

## 1. Desktop — Cart page summary column (`small:` and up)

### 1.1 No code active (default / empty state)

```
┌─────────────────────────────────────────┐
│ Summary                                  │
├─────────────────────────────────────────┤
│ Promotion code                           │  ← EnhancedDiscountCode header (ONE module,
│ ( Enter promotion or voucher code )      │     replaces the old DiscountCode + VoucherPanel pair)
│                            [ Apply ]     │
│ <Available vouchers>                     │  ← D6 label, opens modal from this same module
├─────────────────────────────────────────┤
│ Subtotal (excl. shipping and taxes)  X   │  ← CartTotals, unchanged
│ Shipping                              X  │
│ Taxes                                 X  │
│ ───────────────────────────────────────  │
│ Total                                 X  │
├─────────────────────────────────────────┤
│           [ Go to checkout ]             │
└─────────────────────────────────────────┘
```

### 1.2 Input focused / applying

```
│ Promotion code                           │
│ ( SAVE10█ )                    [ ⟳ Apply ]│  ← button shows spinner, input disabled
│ <Available vouchers>  (disabled while applying) │
```

The module does not know in advance whether the typed code is a generic promotion or a voucher — it is a single submit path; the response (or the state read back from the cart) determines which row style renders next (§1.3 vs §1.4).

### 1.3 Applied — generic promotion only (unchanged behavior)

```
│ Promotion code                           │
│ ( Enter promotion or voucher code )      │  ← input stays available for another code
│                            [ Apply ]     │
│ <Available vouchers>                     │
├─────────────────────────────────────────┤
│ Applied codes:                           │
│ [SAVE10]  (10%)                    Remove │  ← generic Promotion row, rendered exactly as
└─────────────────────────────────────────┘     the current DiscountCode component does today
```

### 1.4 Applied — voucher (uncapped)

```
│ Promotion code                           │
│ ( Enter promotion or voucher code )      │
│                            [ Apply ]     │
│ <Available vouchers>                     │
├─────────────────────────────────────────┤
│ Applied codes:                           │
│ [SHUTTLE20]  You saved 380,000₫    Remove │  ← HUMAN voucher code + savings, read from
└─────────────────────────────────────────┘     cart.metadata.voucher — never the internal
                                                 ephemeral promotion id/code (e.g. VEPH-...)
```

If a generic promotion is _also_ applied, its row (§1.3) appears in the same list alongside this one — both are rows of one list, not two panels.

### 1.5 Applied — voucher, capped (VOUCH-003 EC-01)

```
│ Promotion code                           │
├─────────────────────────────────────────┤
│ Applied codes:                           │
│ [MEGA20]  You saved 490,000₫       Remove │
│ ┌───────────────────────────────────┐    │
│ │ ⓘ This discount was adjusted     │    │  ← CapExplanationBanner, attached directly
│ │   from 568,000₫ to 490,000₫      │    │     under the voucher's row in the same list;
│ │   under the 50% maximum discount │    │     verbatim cap_explanation from the backend
│ │   policy.                        │    │     (D9) — English text here is illustrative
│ └───────────────────────────────────┘    │     only, neutral/info tone, not error-red
├─────────────────────────────────────────┤
│ ... Discount   -2,350,000₫ ...           │
│ Total                          2,350,000₫│
```

### 1.6 Validation error (VOUCH-002)

```
│ Promotion code                           │
│ ( EXPIRED1 )                   [ Apply ] │
│ ⚠ This code has expired. Check           │  ← same InlineErrorMessage slot the module
│   "Available vouchers" for other options.│     already uses for a rejected generic code;
│ <Available vouchers>                     │     `customer_message` shown VERBATIM (D9) —
└───────────────────────────────────────────┘    English text here is illustrative only
```

Because the module doesn't pre-classify the code as "voucher" vs "generic promotion" before submitting, a rejected generic code and a rejected voucher code render through this exact same inline-error slot — there is no separate voucher-only error surface.

### 1.7 Rate limited (429, defensive — D10, NOT implemented behavior yet)

```
┌─────────────────────────────────────────┐
│ ⚠ You've tried too many times. Please    │  ← RateLimitBanner (CartMismatchBanner style)
│   try again in 30 minutes.               │     text = customer_message verbatim
└─────────────────────────────────────────┘
│ ( ...input disabled... )       [ Apply ] │  ← Apply button disabled while rate_limited
```

_Unverified against a real backend response — see UX-FLOW.md §5.7. Backend rate limiting (task 3.7.x) is not implemented yet; this state is speculative/defensive only, not implemented behavior — do not wire real integration until 3.7.x ships._

### 1.8 Reconciling (bounded post-mutation refresh, D8)

```
│ Promotion code                           │
├─────────────────────────────────────────┤
│ Applied codes:                           │
│ [SHUTTLE20]  You saved 380,000₫    Remove │  ← last-known state kept visible (voucher row)
├─────────────────────────────────────────┤
│ ⋯ Updating your cart...                  │  ← small, non-blocking inline hint
```

No banner, no modal — subtle text only, cleared as soon as the bounded window resolves (§3 in UX-FLOW.md). Any generic-promotion rows in the same list are unaffected by this hint.

### 1.9 Auto-removed notice (async, VOUCH-005)

```
┌─────────────────────────────────────────┐
│ ⓘ Promotion code SHUTTLE20 was removed.  │  ← AutoRemovedBanner
│   [reason text if backend supplies it,   │     (see UX-FLOW.md §3 dependency note —
│    else omitted per D9]                  │      no frontend-authored reason text; deferred
│                                  [ OK ]  │      until the backend metadata channel is confirmed)
└─────────────────────────────────────────┘
│ Promotion code                           │
│ ( Enter promotion or voucher code )      │  ← module reverts to "no code active" state;
│                            [ Apply ]     │     any generic-promotion rows still applied
│ <Available vouchers>                     │     remain in the list, only the voucher row is gone
```

---

## 2. "Available vouchers" modal (desktop) — launched from `EnhancedDiscountCode`, reuses existing `Modal`

**Current shipped behavior — CORRECTED (verified against the running backend 2026-07-15; supersedes an earlier "public, no gating at all" claim, which was wrong):** `GET /store/customers/me/vouchers` is **customer-gated, not public**. Core Medusa applies a blanket `authenticate("customer", ["session","bearer"])` middleware to the wildcard path `/store/customers/me*` (`@medusajs/medusa/dist/api/store/customers/middlewares.js`) — this intercepts the request before the custom route handler runs, regardless of what that handler's own code does. An unauthenticated request returns **`401`**, empirically confirmed against a live instance — not a 200 with vouchers. See `REQUIREMENTS.md` §2 for the full correction.

**What this means for the three states below:** the frontend (`fetchAvailableVouchers()`, `lib/data/voucher.ts`) does not currently distinguish a 401 from a real empty list — it catches any failure and resolves to `[]` either way. So today, a guest sees exactly the same markup as an authenticated customer with zero vouchers (§2.2) — **not** a distinct sign-in prompt. §2.3's dedicated "sign in to view" copy is **not what a guest sees today**; it is kept only as a possible future state, contingent on either (a) the backend being changed to make the route truly public, or (b) the frontend being changed to detect the 401 specifically and render a real sign-in prompt instead of the generic empty state. Neither has happened — **this is an open product/backend decision**, not settled by this document.

### 2.1 Vouchers available (authenticated customer, has active vouchers)

```
┌───────────────────────────────────────────────┐
│  Available vouchers                      [×]  │  ← Modal.Title (D6 label, not "My vouchers")
├───────────────────────────────────────────────┤
│ ┌───────────────────────────────────────────┐ │
│ │ SHUTTLE20                                 │ │
│ │ 20% off badminton shuttlecocks             │ │
│ │ Min. order 200,000₫ · Valid until 31 Dec  │ │
│ │  2026                                      │ │
│ │ Applies to: Shuttlecocks                   │ │
│ │                                 [ Apply ] │ │
│ ├───────────────────────────────────────────┤ │
│ │ SAVE10                                    │ │
│ │ 10% off your entire cart                   │ │
│ │ ...                             [ Apply ] │ │
│ └───────────────────────────────────────────┘ │
└───────────────────────────────────────────────┘
```

Only reachable when the customer is authenticated with a valid session/bearer token — a guest's request 401s before it ever reaches the data this list is built from (see the correction above), so a guest never sees this state as currently shipped. Tapping `[ Apply ]` on a row submits through the **same single apply path** the manual input uses (5.1–5.3 in UX-FLOW.md) — it is not a separate voucher-only submission mechanism. Button shows a spinner while in flight; a failure renders inline under that row (same `customer_message`-verbatim rule) without closing the modal. On success, the modal closes and the voucher row (§1.4/§1.5) appears in `EnhancedDiscountCode`'s single applied-codes list.

### 2.2 Empty — CURRENT behavior for BOTH guests and authenticated customers with zero vouchers

```
┌───────────────────────────────────────────────┐
│  Available vouchers                      [×]  │
├───────────────────────────────────────────────┤
│                                                 │
│     No vouchers available right now.           │
│                                                 │
└───────────────────────────────────────────────┘
```

This is the state a **guest actually sees today** (the 401 degrades to this, per the correction above) — indistinguishable from an authenticated customer who genuinely has zero active vouchers, since the frontend doesn't currently tell the two cases apart. Not an error banner, not a sign-in prompt — just the plain empty state.

### 2.3 (Possible future state only — NOT current behavior) Distinct guest sign-in prompt

```
┌───────────────────────────────────────────────┐
│  Available vouchers                      [×]  │
├───────────────────────────────────────────────┤
│                                                 │
│      Sign in to view available vouchers.       │  ← neutral empty-state, not an error
│                                                 │
│              [ Sign in ]                       │  ← optional, links to existing sign-in flow
│                                                 │
└───────────────────────────────────────────────┘
```

**A guest does not see this today — they see §2.2 instead** (the frontend can't currently tell a 401 apart from a real empty list). This mockup is kept only as a placeholder for _if_ the frontend is later changed to detect the 401 specifically and show a real sign-in prompt instead of collapsing it into the generic empty state — do not implement this until that product/backend decision (§0 above, `REQUIREMENTS.md` §2) is made. Manual code entry in the main module remains fully available to guests regardless of whether this state is ever built.

---

## 3. Replace-confirmation modal — belongs to `EnhancedDiscountCode`, reuses existing `Modal`

```
┌───────────────────────────────────────────────┐
│  Replace promotion code?                 [×]  │
├───────────────────────────────────────────────┤
│  You're currently using code SAVE10.          │  ← customer_message verbatim,
│  Replace it with the new code?                │     server-filled {current_code} (D9) —
│                                                 │     English text here is illustrative only
├───────────────────────────────────────────────┤
│                [ Cancel ]   [ Replace ]        │  ← Cancel / Confirm
└───────────────────────────────────────────────┘
```

This is not a separate voucher-panel concern — it is the same `EnhancedDiscountCode` module pausing to confirm before it resubmits. Confirm re-submits the pending code with `?replace=true` (UX-FLOW.md §5.5); Cancel closes the modal and leaves the currently-active voucher row (§1.4/§1.5) untouched.

---

## 4. Loading & skeleton state

```
│ Promotion code                           │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  ▓▓▓▓▓▓▓▓▓▓          │  ← one skeleton for the one module,
└───────────────────────────────────────────┘     reuses existing skeleton-code-form
```

Shown only before the cart itself has hydrated (first paint); never shown mid-interaction (applying/removing use their own inline pending indicators, §1.2/§5.6 of UX-FLOW.md). There is only ever one skeleton here — not one for a generic-promotion panel and a second for a voucher panel.

---

## 5. Mobile (< `small:`, i.e. below 1024px)

Layout stacks vertically (unchanged cart-page convention); `EnhancedDiscountCode` occupies full width as the **only** discount-code surface — there is no second, voucher-specific form anywhere on mobile either. The "Available vouchers" and replace-confirmation surfaces reuse the **same center `Modal`** as desktop — full-width, scrollable body, no bottom-sheet primitive introduced (D5/D8 in UX-FLOW.md §0).

### 5.1 No code active

```
┌───────────────────────────┐
│ Promotion code             │
│ (Enter promotion or        │
│  voucher code)              │
│ [          Apply         ]│  ← full-width button, stacked below input
│ <Available vouchers>       │
└───────────────────────────┘
```

### 5.2 Applied — generic promotion only

```
┌───────────────────────────┐
│ [SAVE10]  (10%)      Remove│
└───────────────────────────┘
```

### 5.3 Applied — voucher (uncapped)

```
┌───────────────────────────┐
│ [SHUTTLE20]          Remove│
│ You saved 380,000₫         │  ← human voucher code; savings wraps to its own
└───────────────────────────┘     line on narrow widths, same as a generic row would
```

A generic-promotion row (§5.2) and the voucher row (§5.3) stack in the same single list when both are present — never two separate cards.

### 5.4 "Available vouchers" modal, mobile

```
┌───────────────────────────┐
│ Available vouchers    [×] │
├───────────────────────────┤
│ SHUTTLE20                 │
│ 20% off badminton          │
│  shuttlecocks               │
│ Min. order 200,000₫        │
│ Valid until 31 Dec 2026    │
│ [         Apply          ]│  ← full-width row button
├───────────────────────────┤
│ SAVE10                    │
│ ...                       │
│ [         Apply          ]│
└───────────────────────────┘
```

Same `Modal` component as desktop (§2.1–§2.3), full viewport width, scrollable list body — not a distinct mobile component.

### 5.5 Rate-limited / auto-removed banners, mobile

Same copy and component as desktop §1.7/§1.9, full width, text wraps naturally — no layout-specific behavior beyond the existing responsive banner pattern already used by `CartMismatchBanner`.

---

## 6. State → wireframe cross-reference

`EnhancedDiscountCode` (aka `PromotionCodeModule` / "`DiscountCode` with Voucher Engine support") is the single component these states describe — there is no separate `VoucherPanel` component or status machine anymore. The status names below are the same conceptual states `UX-FLOW.md` §2 describes, retained here only as state labels for cross-reference.

| Module status                                                                | Wireframe section |
| ---------------------------------------------------------------------------- | ----------------- |
| `hydrating`                                                                  | §4                |
| `none` (no voucher active; generic promotions, if any, still shown per §1.3) | §1.1 / §5.1       |
| `applying`                                                                   | §1.2              |
| generic promotion applied (no voucher)                                       | §1.3 / §5.2       |
| voucher active (uncapped)                                                    | §1.4 / §5.3       |
| voucher active (capped)                                                      | §1.5              |
| `error`                                                                      | §1.6              |
| `rate_limited` (defensive only, not implemented behavior — D10)              | §1.7 / §5.5       |
| `reconciling`                                                                | §1.8              |
| `auto_removed`                                                               | §1.9 / §5.5       |
| `replace_confirm`                                                            | §3                |
| Available-vouchers modal (any entry state)                                   | §2 / §5.4         |

---

_Design phase stops here for manual review. No code was written or modified._
