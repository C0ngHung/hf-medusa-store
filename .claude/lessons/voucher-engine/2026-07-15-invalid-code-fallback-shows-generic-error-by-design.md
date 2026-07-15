# An unrecognized code intentionally falls back to the generic-promotion path and shows its (English) error — this is approved UX design, not a bug

## Problem

While verifying Day 5 Slice 1 (tasks 4.1.2/4.1.3/4.1.5/4.1.6/4.3.4/4.3.5), submitting a code
that matches no `VoucherConfig` and no generic Medusa promotion (`NOTAREALCODE123`) produced the
error text `"Error setting up the request: The promotion code NOTAREALCODE123 is invalid"` — an
English, Medusa-generated message — instead of a VoucherEngine Vietnamese `customer_message`. This
looked like a defect against `.claude/skills/execute-voucher-engine-tasks/references/storefront-day5-testing.md`
Test B, whose one-line requirement reads: "an unknown code produces the Vietnamese
`customer_message`, not the English `message`, **and does not fall back to a generic-promotion
attempt**."

## Incorrect assumption or failed approach

The initial read was that Test B's wording is the requirement, and the observed English-fallback
error is therefore a regression that needs a code fix (e.g. suppress the generic-promotion fallback
for a code that 404s as `VOUCHER_NOT_FOUND`, and show the voucher's own Vietnamese message instead).

## Root cause

Test B's one-line summary does not fully capture the approved routing rule. The authoritative
design doc, `docs/voucher-engine-ui/UX-FLOW.md` §1a ("Single-input routing rule"), explicitly
specifies, step 5: on a `404 VOUCHER_NOT_FOUND`, **fall back to the existing generic-promotion
apply call... if that also fails, show whatever error the generic-promotion path returns instead.**
Steps 3/4 of the same section are what "does not fall back" actually describes — a code recognized
as a real voucher (`VOUCHER_REPLACE_REQUIRED` or a business-rule rejection like expired/min-order)
must NOT fall back and must show the Vietnamese `customer_message` verbatim. Test B's phrasing
conflates "unrecognized code" (step 5, DOES fall back, generic error is expected) with "recognized
but rejected code" (steps 3/4, does NOT fall back). The shipped `discount-code/index.tsx`
(`attemptVoucherApply`/`submitCode`) implements §1a correctly step-by-step; the reference test
file's summary sentence is the inaccurate artifact, not the code.

## Verified evidence

- Live test: fresh cart, no active voucher, submitted `NOTAREALCODE123` via the real UI (headless
  Chrome + CDP) → `discount-error-message` showed `"Error setting up the request: The promotion
code NOTAREALCODE123 is invalid"` (English, from Medusa's own promotion-code apply), cart total
  unchanged (₫980,000 before and after) — matching `UX-FLOW.md` §1a step 5 exactly.
- `docs/voucher-engine-ui/UX-FLOW.md` lines 87–92 (§1a, steps 1–6), explicitly discussing this as a
  known, intentional design tradeoff (also flagged at line 96 as a latency cost, and at lines 98–104
  as a rate-limiting interaction risk) — this is a deliberated decision, not an oversight.
- `hf-medusa-store/apps/storefront/src/modules/checkout/components/discount-code/index.tsx`
  `attemptVoucherApply`/`submitCode`: only `VOUCHER_NOT_FOUND` triggers `applyGenericCode`; every
  other VoucherEngine response (`success`, `replaceRequired`, or any other `rejected` code) returns
  without falling back — matching §1a steps 2–4/6 verbatim.

## Resolution

No code change. Confirmed the shipped behavior is correct against the authoritative UX design doc.
Flagged the reference test file's Test B wording as imprecise (conflates two different §1a branches
under one requirement sentence) in the Day 5 Slice 1 completion report, without editing
`storefront-day5-testing.md` itself (out of this session's scope; a future doc-maintenance pass can
tighten the wording to explicitly separate "recognized-but-rejected" from "unrecognized").

## Prevention rule

When a manual/E2E test scenario description in a skill reference file appears to contradict
observed behavior, check the actual UX/API design doc's step-by-step rule (`UX-FLOW.md` §1a here)
before concluding the code is wrong — a one-line test summary can lose branch-specific nuance that
a numbered design-doc section preserves. For VoucherEngine specifically: "does this code fall back
to generic promotion?" always depends on which §1a step the response falls under (5 = yes; 3/4/6 =
no), never on "is the code valid or not" as a single boolial.

## Applicability

Applies to any future Day 5+ manual verification of the single-input routing rule (§1a) — tasks
touching `4.1.2`, `4.3.4`, `4.3.6` (any code-submission scenario through the unified `DiscountCode`
input). Does not apply to the replace-confirmation (`VOUCHER_REPLACE_REQUIRED`) or business-rule-
rejection (`422`) paths, which correctly never fall back — those are steps 3/4, not step 5.

## Related task IDs

4.1.2 (mapped Day 5 task for Test B in `storefront-day5-testing.md`)

## Related SPEC sections

None — this is a storefront UX-design-doc-vs-testing-reference-doc finding, not a backend SPEC
conflict. `docs/voucher-engine-ui/UX-FLOW.md` §1a is the relevant design section; no
`.claude/specs/voucher-engine/SPEC.md` section was touched or needed.

## Relevant production and test files

- `hf-medusa-store/apps/storefront/src/modules/checkout/components/discount-code/index.tsx`
- `docs/voucher-engine-ui/UX-FLOW.md` (§1a)
- `.claude/skills/execute-voucher-engine-tasks/references/storefront-day5-testing.md` (Test B —
  wording flagged as imprecise, not yet corrected)
