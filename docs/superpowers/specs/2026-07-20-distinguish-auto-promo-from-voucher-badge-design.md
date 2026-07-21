# Distinguish auto-applied promotions from the voucher in cart "Applied codes"

## Problem

The storefront cart's "Applied codes:" section (`hf-medusa-store/apps/storefront/src/modules/checkout/components/discount-code/index.tsx`) renders two structurally distinct things that currently look identical:

- Entries from `cart.promotions` (native Medusa array — may include merchant automatic item-level promotions like `DEMO-CAP-CONFLICT-40`), rendered lines 508-553.
- The customer's one active VoucherEngine voucher (`activeVoucher`, sourced from `cart.metadata.voucher`, never part of `cart.promotions` per Decision H), rendered lines 555-594.

Root cause (verified in code): line 516 colors a `cart.promotions` entry `"green"` when `is_automatic` is true; line 562 hardcodes the voucher badge to `"green"` too. Both end up the same color, so a customer (or a developer reading the UI) sees two identical green pills and reasonably concludes "2 vouchers are stacked" — violating no rule (VOUCH-003 Rule 1+2 explicitly allows an automatic item promo and one voucher to coexist), but the UI doesn't communicate that distinction.

## Fix

Single file, no backend change: `discount-code/index.tsx`.

1. Line 516: drop the `is_automatic ? "green" : "grey"` ternary — every entry in the `displayedPromotions` loop renders `color="grey"` unconditionally. Nothing in this loop is ever the customer's voucher (that's a structurally separate code path), so `"green"` becomes exclusively reserved for the one real voucher badge at line 562 (unchanged).
2. Add an inline label, shown only when `promotion.is_automatic` is true, immediately after the existing code+value text: `(Auto-applied)` — explains why this code appeared without the customer entering anything. Non-automatic entries in this loop (a customer-entered native code that isn't a VoucherEngine voucher — rare, but structurally possible since the block-voucher-promotion guardrail only blocks codes with `metadata.voucher_engine === true`) get no extra label, since the customer typed those in themselves.
3. No change to line 536 (trash button already correctly hidden for automatic promotions) or the voucher block (555-594, already correct).

## Out of scope

- No backend/API change — `is_automatic` already exists on `HttpTypes.StorePromotion` and is already read client-side.
- No i18n — the file's existing copy ("Applied codes:", "You saved", "Remove") is English; the new label matches that convention, not a Vietnamese-first rewrite.
- No layout/structural change (two separate sections) — this was considered and explicitly declined in favor of the smaller color+label fix.

## Testing

No test harness exists for this storefront component in this repo (confirmed pattern for prior storefront-only changes this session). Verify via: `tsc`/`next build` for the storefront, and a manual description of expected before/after rendering (this session cannot drive a browser).
