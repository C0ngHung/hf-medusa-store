# No generic Medusa `Promotion` is seeded anywhere, and no seeded voucher rate alone reaches the 50% cap — live/manual verification of stacking + cap scenarios is blocked by data, not code

## Problem

Verifying Day 5 Slice 2 (tasks 4.2.1–4.2.7: item-promotion-before-voucher ordering, eligible
post-promotion basis, global-cap enforcement, cap-explanation display) against
`storefront-day5-testing.md` Test I (capped voucher explanation) and Test K (suggested item +
item-level promotion + voucher stacking) requires a live cart carrying an item-level Promotion
alongside an applied voucher, with a combined discount large enough to trip the 50% global cap.
No such cart is constructible from existing seed data today.

## Incorrect assumption or failed approach

It would be easy to assume that because the suggestive-selling module seeds rich "suggested item"
product mappings (`seed-suggestive-selling.ts`, Tier-1/Tier-2 rules) and VoucherEngine seeds three
active vouchers (`seed-voucher-engine.ts`), a stacking+cap scenario is just a matter of picking the
right seeded product + voucher combination. It is not — the missing ingredient (any item-level
Promotion at all) isn't part of either seed script.

## Root cause

- `src/scripts/seed-voucher-engine.ts` seeds exactly three `VoucherConfig` rows — `SAVE10` (10%),
  `MEGA20` (20%), `SHUTTLE20` (20%, category-scoped `Shuttlecocks`, min-order 200,000). All are
  `percentage`, `stackable_with_promotions: true`, none is `product_id`-scoped.
- `src/scripts/seed-suggestive-selling.ts` seeds only suggestion rules/mappings (Tier-1 manual
  product→product, Tier-2 category-complement) — it never touches the Promotion module.
- A repo-wide grep (`createPromotions`, `Modules.PROMOTION`, `promotionModuleService`) across
  `src/` and `src/migration-scripts/initial-data-seed.ts` finds **zero** standing item/order-level
  `Promotion` creation anywhere. The only `Promotion` entities ever created are the ephemeral,
  cart-specific, ALWAYS-fixed-type carrier VoucherEngine itself creates at apply time
  (`createPromotionsWorkflow` in `apply-voucher.ts` / `revalidate-voucher-on-cart-change.ts`) — never
  a merchant-configured percentage promotion.
- Even ignoring item promotions, no seeded voucher's own rate (max 20%, `MEGA20`/`SHUTTLE20`) can
  reach the 50% global cap alone — `discount_capped` only flips true when
  `item_promotion_discount > original_subtotal × (0.5 − rate) / (1 − rate)`, i.e. for `MEGA20`
  (`rate=0.20`) the item promotion alone must already discount more than 37.5% of the subtotal;
  for `SAVE10` (`rate=0.10`), more than 44.4%. With `item_promotion_discount = 0` (no seeded
  Promotion exists), this can never trigger.

## Verified evidence

- `calculate-discount.unit.spec.ts` (25/25 passing) proves the pure calculation exactly reproduces
  SRS T-VOUCH-07/08/09 (₫3,420,000 / ₫2,350,000 / ₫2,350,000) — the _math_ is proven correct and
  needs no live re-verification.
- Explore-agent grep across `src/` confirms no seed path creates any `Promotion` record, and the
  three seeded `VoucherConfig` rows' rates are listed above (verbatim from
  `src/scripts/seed-voucher-engine.ts` lines 19–47).
- The storefront's `discount-code/index.tsx` already renders `cap_explanation` from the apply
  response (`voucher-cap-explanation` test id, gated on `discount_capped && capExplanation`) and
  `apply-voucher.ts:276` already maps `discount.cap_explanation?.message_vi` into that response
  field — the **display wiring** is code-verified; only the **triggering scenario** is unreachable
  from seed data.

## Resolution

No code change. This is a data gap, not a defect — do not "fix" it by inventing a large one-off
setup mid-verification-slice (explicitly out of the fast-scoped Day 5 Slice 2 approach). Recorded as
a blocker with the exact missing pieces (see Applicability) for whoever picks up seed/test-fixture
work next (likely Day 6, tasks `5.2.7`–`5.2.9` / T-VOUCH-07/08/09, or a dedicated seed-data task).

## Prevention rule

Before scoping ANY manual/live verification of VoucherEngine stacking or cap behavior, grep for
`createPromotions|Modules.PROMOTION|promotionModuleService` across seed/migration scripts first —
do not assume a "suggested item" or "item-level promotion" fixture exists just because the
suggestive-selling and voucher-engine seed scripts are both rich. They seed disjoint concerns; only
a real Medusa `Promotion` record (not a `VoucherConfig` row) produces `items.adjustments` for the
Rule-11/CONFLICT-8 shrink guard or for `item_promotion_discount` in the cap formula.

## Applicability

Applies to Day 5 tasks `4.2.1`, `4.2.4`, `4.2.5`, `4.2.6`, `4.2.7` (live/manual verification only —
calculation-layer proof is unaffected) and to Day 6 tasks `5.2.7`–`5.2.9` (T-VOUCH-07/08/09
acceptance tests, which need the same missing fixtures if implemented as HTTP/E2E rather than pure
unit tests). To make these scenarios seedable, a future session needs: (1) at least one generic
`Promotion` with `application_method: { type: "percentage", target_type: "items"|"order" }` scoped
to a product/category (ideally a Tier-1 suggested-product handle, e.g. `yonex-bg65`), created via
`createPromotionsWorkflow` or the Admin API — not currently in any seed script; (2) that
Promotion's rate/scope large enough to discount &gt;37.5–44.4% of the relevant subtotal to actually
trip the 50% cap against `MEGA20`/`SHUTTLE20`/`SAVE10`; (3) optionally a fourth `VoucherConfig` with
`stackable_with_promotions: false` to also exercise `VOUCHER_STACKING_CONFLICT` (V8), which is
equally unseedable today for the same reason.

## Related task IDs

4.2.1, 4.2.4, 4.2.5, 4.2.6, 4.2.7, 5.2.7, 5.2.8, 5.2.9

## Related SPEC sections

§10.2 (cap formula), §18 CONFLICT-8, §19 PD-15, §23.4 (verify-cart-totals required test — same
missing-fixture gap applies to the SPEC's own "CONFLICT-8/PD-15 test (required)" note)

## Relevant production and test files

- `hf-medusa-store/apps/backend/src/scripts/seed-voucher-engine.ts`
- `hf-medusa-store/apps/backend/src/scripts/seed-suggestive-selling.ts`
- `hf-medusa-store/apps/backend/src/modules/voucher-engine/lib/calculate-discount.ts`
- `hf-medusa-store/apps/backend/src/workflows/voucher-engine/steps/verify-cart-totals.ts`
- `hf-medusa-store/apps/storefront/src/modules/checkout/components/discount-code/index.tsx`
