# Medusa workflow composer: `when().then()` cannot nest, and calling the same core workflow's `.runAsStep()` twice in one file collides on step id regardless of `when()` branching

## Problem

While building the Day-4 `recordVoucherUsageWorkflow` and `revalidateVoucherWorkflow`, the WHOLE
APP failed to boot (not just these workflows) with `Cannot read properties of undefined (reading
'steps')` thrown from Medusa's workflow loader at startup. Separately, after fixing that, the app
booted but then failed again at load time with `Step delete-promotions-as-step is already defined
in workflow` — again crashing the entire app, not just the one workflow.

## Incorrect assumption or failed approach

Assumed Medusa's `when(cond).then(() => { ... })` composer helper supports arbitrary nesting — e.g.
a `when()` block inside another `when().then()` callback to express "if A, then (if B, do X, else
do Y)" — the same way a plain `if` statement nests in normal JS. Also assumed that because two
`runAsStep()` calls on the same underlying core workflow sat in mutually-exclusive `when()`
branches (only one could ever execute at runtime), the workflow builder would treat them as
independent and not collide.

## Root cause

1. **No nested `when()`.** The composer tracks the "current" condition via a single module-level
   global (`global[SymbolMedusaWorkflowComposerCondition]`) that is set at the start of `when()` and
   deleted at the end of `.then()`. A `when()` call inside another `.then()` callback overwrites that
   global before the outer `.then()` has finished reading it, corrupting the outer condition's step
   list. This does not just break the specific workflow — it breaks the whole app's workflow loader
   at boot, because workflow definitions are evaluated eagerly at module-load time.
2. **Static step discovery ignores `when()` branching for id collisions.** Medusa's workflow builder
   walks every step call in a workflow's composer FUNCTION BODY to build its step graph, regardless
   of which `when()` branch (if any) surrounds it. Two `someWorkflow.runAsStep()` calls on the exact
   same underlying workflow (e.g. `deletePromotionsWorkflow`) anywhere in one workflow file — even in
   two branches that can never both execute — generate the same auto-derived step id and collide,
   because the collision check happens at DEFINITION time (building the static graph), not at
   EXECUTION time (when only one branch would actually run).

## Verified evidence

Reproduced both crashes empirically this session (Day-4 implementation of
`record-voucher-usage.ts` and `revalidate-voucher-on-cart-change.ts`): nesting an idempotency-check
`when()` inside a has-voucher `when()` crashed app boot with the "reading 'steps'" error; giving
`deletePromotionsWorkflow.runAsStep()` two call sites in `revalidate-voucher-on-cart-change.ts` (one
in the "recompute" branch, one in the "remove" branch) crashed app boot with the "already defined in
workflow" error — even though `shouldRecompute`/`shouldRemove` are mutually exclusive booleans.
Both were fixed and the app booted cleanly afterward; both fixes were re-verified by full app boot

- passing HTTP integration tests exercising both branches.

## Resolution

- **Never nest `when().then()`.** Flatten to independent TOP-LEVEL `when()` calls, each gated on its
  own single boolean built via `transform()` that ANDs together whatever conditions would otherwise
  have been expressed as nested ifs (e.g. `shouldRecompute = existing.has_voucher &&
revalidation.still_valid`, `shouldRemove = existing.has_voucher && !revalidation.still_valid`).
  Steps that would have lived "inside" the outer-only branch (e.g. an idempotency check that only
  matters when a voucher exists) instead run UNCONDITIONALLY, made safe for the "nothing to do" case
  (empty/null/default input — e.g. an idempotency-check step given an empty `voucher_id` simply
  returns "not a duplicate" and is ignored downstream by the flattened boolean gate).
- **Give every repeated `runAsStep()` call on the same underlying workflow an explicit unique
  `.config({ name: "..." })`**, even when the call sites are in provably-mutually-exclusive branches.
  `deletePromotionsWorkflow`'s declared TS return type is `never`, which makes `.config` structurally
  unavailable via TypeScript even though it exists at runtime — cast: `(someCall as
any).config({ name: "..." })`.

## Prevention rule

When a workflow needs "if A then (if B ... else ...)" logic, always flatten to sibling top-level
`when()` blocks gated on combined booleans, never nest one `when().then()` inside another's
callback. When a workflow calls `.runAsStep()` on the SAME underlying core/shared workflow more than
once anywhere in the file — even in mutually-exclusive branches — give every call site beyond the
first an explicit `.config({ name })` (cast past `never`-typed builders with `as any` where needed).
Verify both by actually booting the app (`pnpm backend:dev` or letting a `medusaIntegrationTestRunner`
test boot it), not just by `tsc`/lint — both crash classes are load-time, not type-time, errors.

## Applicability

Applies to: any custom Medusa v2 workflow in this repo using `when()`/`.then()` composer helpers,
especially ones with more than one conditional branch or that call the same core-flow
(`@medusajs/core-flows`) workflow more than once (common with `createPromotionsWorkflow`/
`deletePromotionsWorkflow`/`updateCartPromotionsWorkflow` pairs for ephemeral-Promotion patterns).
Does not apply to a workflow with only ONE `when()` block and no repeated `runAsStep()` calls on the
same underlying workflow — those have nothing to collide.

## Related task IDs

3.5.1, 3.5.7, 3.5.8 (`revalidateVoucherWorkflow`), 3.6.1, 3.6.4, 3.6.5, 3.6.7
(`recordVoucherUsageWorkflow`).

## Related SPEC sections

§11.3/§11.5 (revalidation), §13.3 (redemption). No SPEC text changed — this is a workflow-composer
implementation constraint, not a business-rule change.

## Relevant production and test files

- `apps/backend/src/workflows/voucher-engine/revalidate-voucher-on-cart-change.ts` (flattened
  `shouldRecompute`/`shouldRemove`; the two `deletePromotionsWorkflow.runAsStep()` calls each carry
  an explicit unique `.config({ name })`).
- `apps/backend/src/workflows/voucher-engine/record-voucher-usage.ts` (flattened `shouldRedeem`).
- `apps/backend/src/workflows/voucher-engine/apply-voucher.ts` (two separate
  `updateCartPromotionsWorkflow.runAsStep()` calls — `"detach-old-ephemeral-promotion"` and
  `"attach-new-ephemeral-promotion"` — each explicitly named for the same reason).

## Revision history

- 2026-07-14: initial lesson captured while implementing Thức's VoucherEngine Day 4 tasks, after
  both crash classes were reproduced and fixed in the same session.
