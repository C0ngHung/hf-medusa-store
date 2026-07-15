# Testing an `order.placed`-driven workflow does not require a full `completeCartWorkflow`/payment/shipping scaffold — directly create an Order carrying the same `order.metadata` shape

## Problem

`recordVoucherUsageWorkflow` (the workflow the `order.placed` subscriber calls to redeem a
voucher — SPEC §11.4) had zero test coverage of its own: only the underlying
`VoucherEngineService.redeemVoucherAtomic` DB transaction was tested
(`service.integration.spec.ts`). Proving tasks 4.3.7/4.3.8 ("checkout/order success triggers usage
recording", "final order contains voucher discount") looked like it required driving a real
`completeCartWorkflow` checkout completion — region, sales channel, shipping option, payment
collection/session — none of which has an existing pattern anywhere in this repo's tests.

## Incorrect assumption or failed approach

The instinct was to either (a) build a full browser-driven checkout (region + shipping + Stripe
test-card payment) to get a "real" order, or (b) skip the workflow-level seam entirely and rely on
`service.integration.spec.ts`'s existing atomic-redeem coverage as "close enough." Both are wrong:
(a) is disproportionate effort for what the seam actually needs to prove, and (b) leaves the
workflow's own three steps (`assertOrderHasVoucherStep` → `idempotencyCheckStep` →
`atomicRedeemStep`, wired together via `when()`) completely unexercised.

## Root cause

`assertOrderHasVoucherStep` (`workflows/voucher-engine/steps/assert-order-has-voucher.ts`) only
ever reads `order.metadata.voucher` via `query.graph({entity: "order", fields: ["metadata", ...]})`
— it has no dependency on how the order was created, what payment/shipping it has, or any other
order field. The cart→order `metadata` propagation itself (`complete-cart.js:404`) is a separate,
already-SPEC-verified hop (Decision G) and is exercised live by the existing apply-voucher
cart-total assertions. A directly-created `Order` (via `OrderModuleService.createOrders({...,
metadata: {voucher: <snapshot>}})`) carrying the exact same metadata shape
`writeVoucherCartMetadataStep` would have written triggers the identical code path a real checkout
completion would — with a fraction of the setup.

## Verified evidence

- New test `integration-tests/http/record-voucher-usage-workflow.spec.ts` (3/3 passing) creates an
  `Order` directly (no cart, no payment, no shipping) with `metadata: { voucher: {...} }` matching
  `VoucherCartMetadata`'s shape, then calls `recordVoucherUsageWorkflow(container).run({input:
{order_id}})` directly (same pattern `revalidate-voucher-workflow.spec.ts` already used for
  `revalidateVoucherWorkflow`) — asserting exactly one `VoucherUsageLog` row, `usage_count`
  incremented once, a repeat call staying idempotent (no duplicate, no double-increment), and a
  no-voucher order being a no-op.
- Confirmed via reading `assert-order-has-voucher.ts`: its `query.graph` call only requests `["id",
"customer_id", "currency_code", "metadata"]` — no relation to cart, payment, or fulfillment.

## Resolution

Added the test using the direct-Order-creation pattern instead of a full checkout scaffold. No
production code change was needed — the workflow was already correct; it simply had no test
proving it.

## Prevention rule

Before building a full checkout/payment scaffold to test an `order.placed`-triggered workflow in
this repo, check what fields the workflow's own steps actually read from the order (`query.graph`
field list is the tell). If the fields are a small, order-level set (metadata, customer_id,
currency_code — not line items, payments, or fulfillments), a directly-created `Order` via
`OrderModuleService.createOrders` is sufficient and is the pattern this repo's existing
`revalidate-voucher-workflow.spec.ts` already established for the analogous cart-side workflow
(invoke the production workflow directly, not through the subscriber, since the subscriber only
adds fire-and-forget wiring around the same call).

## Applicability

Applies to any future backend test needing to exercise `recordVoucherUsageWorkflow` or a similarly
`order.placed`-triggered VoucherEngine workflow (e.g. Day 6 T-VOUCH acceptance tests that need a
"completed order with a voucher" fixture) — reuse the direct-Order-creation pattern rather than
re-deriving it or reaching for a full checkout flow.

## Related task IDs

4.3.7, 4.3.8

## Related SPEC sections

§11.4 (recordVoucherUsageWorkflow), §13.3 (order.placed subscriber as primary redemption trigger),
§14.3 (idempotency)

## Relevant production and test files

- `hf-medusa-store/apps/backend/src/workflows/voucher-engine/record-voucher-usage.ts`
- `hf-medusa-store/apps/backend/src/workflows/voucher-engine/steps/assert-order-has-voucher.ts`
- `hf-medusa-store/apps/backend/src/workflows/voucher-engine/steps/idempotency-check.ts`
- `hf-medusa-store/apps/backend/src/workflows/voucher-engine/steps/atomic-redeem.ts`
- `hf-medusa-store/apps/backend/integration-tests/http/record-voucher-usage-workflow.spec.ts` (new)
- `hf-medusa-store/apps/backend/integration-tests/http/revalidate-voucher-workflow.spec.ts` (established the direct-workflow-invocation pattern this test reuses)
