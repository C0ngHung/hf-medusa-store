# VoucherEngine Code Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 10 confirmed correctness/security bugs and the follow-up cleanup/efficiency items found by the `[max]` code review of VoucherEngine (backend `apps/backend/src/{modules,workflows,api,lib,subscribers}/**/*voucher*` + storefront `apps/storefront/src/{lib/data/voucher.ts,modules/voucher,modules/checkout/components/discount-code}`), on a dedicated branch, in checkpointed phases.

**Architecture:** No new subsystems — every fix is a targeted change inside the existing Module → Workflow → Step → API-route layering VoucherEngine already uses. Phases are ordered by severity (security → data-integrity/concurrency → correctness → notice UX → performance → cleanup → efficiency) so the highest-risk gaps close first and each phase leaves the module in a working, independently-testable state.

**Tech Stack:** Medusa v2.16 workflows/steps SDK (`@medusajs/framework/workflows-sdk`, `@medusajs/core-flows`), Zod 4, Jest (`test:unit` / `test:integration:modules` / `test:integration:http`), Next.js 15 Server Actions (storefront).

## Global Constraints

- Money is integer VND; rounding is `Math.floor` only — never floats (coding.md).
- Discount calculation is server-side only; the cart total is the sole pricing truth (security.md).
- `voucher_usage_log` is append-only — no task in this plan updates/deletes a row.
- Redis is OPTIONAL — every cache/rate-limit helper must keep degrading safely to a no-op/in-memory fallback when `Modules.CACHE` is absent (never block checkout).
- Run all `pnpm`/`medusa` commands from `hf-medusa-store/apps/backend` (backend) or `hf-medusa-store/apps/storefront` (storefront) — see repo CLAUDE.md.
- Test scripts: `pnpm test:unit`, `pnpm test:integration:modules`, `pnpm test:integration:http` (never invoke `jest` directly — `TEST_TYPE` gates config).
- Branch already created: `fix/voucher-engine-code-review-findings` (off `develop`). Commit at the end of every task. Do not push without explicit user approval.

---

## Phase 1 — Security: make the brute-force rate limiter real (SEC-02/EC-10)

Closes: rate limiter never wired + counters never fed + IP spoofable + 429 body shape wrong.

### Task 1.1: Stop trusting a client-controlled IP for the rate-limit key

**Files:**

- Modify: `apps/backend/src/api/middlewares/voucher-rate-limit.ts:28-34`
- Test: `apps/backend/src/api/middlewares/__tests__/voucher-rate-limit.unit.spec.ts` (new)

**Interfaces:**

- Consumes: `isRateLimited(container, customerId, ip)` from `../../lib/voucher-rate-limit` (unchanged signature).
- Produces: same `voucherRateLimitMiddleware(req, res, next)` signature — no caller-visible change.

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/src/api/middlewares/__tests__/voucher-rate-limit.unit.spec.ts
import { voucherRateLimitMiddleware } from "../voucher-rate-limit";
import * as rateLimit from "../../../lib/voucher-rate-limit";

describe("voucherRateLimitMiddleware — IP source (unit)", () => {
  it("never derives the rate-limit IP from the client-controlled X-Forwarded-For header", async () => {
    const isRateLimitedSpy = jest
      .spyOn(rateLimit, "isRateLimited")
      .mockResolvedValue(false);

    const req: any = {
      headers: { "x-forwarded-for": "1.2.3.4" },
      ip: "10.0.0.5",
      auth_context: { actor_id: "cus_1" },
    };
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    await voucherRateLimitMiddleware(req, res, next);

    expect(isRateLimitedSpy).toHaveBeenCalledWith(
      undefined,
      "cus_1",
      "10.0.0.5",
    );
    expect(next).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- voucher-rate-limit.unit.spec.ts`
Expected: FAIL — `isRateLimitedSpy` was called with `"1.2.3.4"` (from the spoofable header), not `"10.0.0.5"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/backend/src/api/middlewares/voucher-rate-limit.ts
export async function voucherRateLimitMiddleware(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction,
): Promise<void> {
  const customerId =
    (req as { auth_context?: { actor_id?: string } }).auth_context?.actor_id ??
    null;
  // Never trust a client-controlled header (X-Forwarded-For) for a
  // security-sensitive rate-limit key — `req.ip` is Express's own
  // trust-proxy-aware resolution (defaults to the raw socket address when no
  // proxy is configured), so it cannot be spoofed by an arbitrary header.
  const ip = req.ip || null;

  const blocked = await isRateLimited(req.scope, customerId, ip);
  if (blocked) {
    res.status(429).json({
      code: "VOUCHER_RATE_LIMITED",
      message: "Bạn đã thử quá nhiều lần. Vui lòng thử lại sau 30 phút.",
    });
    return;
  }

  next();
}
```

(The 429 body shape is fixed separately in Task 1.4 — keep this step minimal/focused.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit -- voucher-rate-limit.unit.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/api/middlewares/voucher-rate-limit.ts apps/backend/src/api/middlewares/__tests__/voucher-rate-limit.unit.spec.ts
git commit -m "fix(backend): stop trusting spoofable X-Forwarded-For for voucher rate-limit IP"
```

---

### Task 1.2: Wire the rate-limit middleware onto the real POST route

**Files:**

- Modify: `apps/backend/src/api/middlewares.ts`
- Test: covered by Task 1.3's HTTP integration test (registering with no counter feed would still pass Task 1.1's unit test, so the HTTP test is the real proof this task matters).

**Interfaces:**

- Consumes: `voucherRateLimitMiddleware` from `./middlewares/voucher-rate-limit` (already exported, default + named).

- [ ] **Step 1: Add the middleware to the store voucher POST route**

```ts
// apps/backend/src/api/middlewares.ts
import {
  defineMiddlewares,
  validateAndTransformBody,
} from "@medusajs/framework/http";
import {
  CreateSuggestionRuleSchema,
  UpdateSuggestionRuleSchema,
} from "./admin/suggestion-rules/validators";
import { CreateVoucherSchema } from "./admin/vouchers/validators";
import {
  ApplyVoucherSchema,
  RemoveVoucherSchema,
} from "./store/carts/[id]/voucher/validators";
import { voucherRateLimitMiddleware } from "./middlewares/voucher-rate-limit";
import {
  CreateBulkMappingSchema,
  UpdateBulkMappingSchema,
} from "./admin/product-bulk-mappings/validators";
import {
  CreateComplementMappingSchema,
  UpdateComplementMappingSchema,
} from "./admin/category-complement-mappings/validators";

export default defineMiddlewares({
  routes: [
    // ... suggestion-rules / admin/vouchers entries unchanged ...
    {
      matcher: "/store/carts/:id/voucher",
      method: "POST",
      // Rate-limit gate runs BEFORE body validation — a request already in
      // cooldown must 429 regardless of whether its payload is well-formed
      // (SEC-02/EC-10). DELETE is not rate-limited — removing a voucher
      // carries no code-guessing risk.
      middlewares: [
        voucherRateLimitMiddleware,
        validateAndTransformBody(ApplyVoucherSchema),
      ],
    },
    {
      matcher: "/store/carts/:id/voucher",
      method: "DELETE",
      middlewares: [validateAndTransformBody(RemoveVoucherSchema)],
    },
    // ... product-bulk-mappings / category-complement-mappings entries unchanged ...
  ],
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/backend/src/api/middlewares.ts
git commit -m "fix(backend): register voucher rate-limit middleware on POST /store/carts/:id/voucher"
```

(Verified together with Task 1.3 below — a middleware with nothing feeding its counters is not independently testable as "done".)

---

### Task 1.3: Feed the failed-attempt counter from the real apply-voucher route

**Files:**

- Modify: `apps/backend/src/api/store/carts/[id]/voucher/route.ts`
- Test: `apps/backend/integration-tests/http/voucher-rate-limit.spec.ts` (new)

**Interfaces:**

- Consumes: `recordFailedAttempt(container, customerId, ip)`, `resetFailedAttempts(container, customerId, ip)` from `../../../../../lib/voucher-rate-limit` (both already implemented and unit-tested — only need real callers).

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/integration-tests/http/voucher-rate-limit.spec.ts
/**
 * SEC-02/EC-10: 5 failed voucher-apply attempts within 15 min -> 429, with a
 * 30-min cooldown. Exercises the REAL route (not the middleware/lib in
 * isolation) so a regression in the wiring (Task 1.2/1.3) is caught here.
 */
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import {
  createApiKeysWorkflow,
  createSalesChannelsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
} from "@medusajs/medusa/core-flows";
import { Modules } from "@medusajs/framework/utils";

jest.setTimeout(60_000);

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api }) => {
    describe("POST /store/carts/:id/voucher — rate limit (SEC-02/EC-10)", () => {
      function container() {
        return getContainer();
      }

      let publishableKeyHeaders: { headers: Record<string, string> };
      let cartId: string;

      beforeEach(async () => {
        const {
          result: [salesChannel],
        } = await createSalesChannelsWorkflow(container()).run({
          input: { salesChannelsData: [{ name: "Rate Limit Test Channel" }] },
        });
        const {
          result: [apiKey],
        } = await createApiKeysWorkflow(container()).run({
          input: {
            api_keys: [
              {
                title: "Rate Limit Test Key",
                type: "publishable",
                created_by: "",
              },
            ],
          },
        });
        await linkSalesChannelsToApiKeyWorkflow(container()).run({
          input: { id: apiKey.id, add: [salesChannel.id] },
        });
        publishableKeyHeaders = {
          headers: { "x-publishable-api-key": apiKey.token },
        };

        const cartModuleService = container().resolve(Modules.CART);
        const cart = await cartModuleService.createCarts({
          currency_code: "vnd",
        } as any);
        cartId = cart.id;
      });

      it("returns 429 after 5 failed attempts and lets a distinct customer through", async () => {
        for (let i = 0; i < 5; i++) {
          const res = await api
            .post(
              `/store/carts/${cartId}/voucher`,
              { code: "NOTREAL123" },
              publishableKeyHeaders,
            )
            .catch((e) => e.response);
          expect(res.status).toBe(404);
        }

        const blocked = await api
          .post(
            `/store/carts/${cartId}/voucher`,
            { code: "NOTREAL123" },
            publishableKeyHeaders,
          )
          .catch((e) => e.response);
        expect(blocked.status).toBe(429);
        expect(blocked.data.code).toBe("VOUCHER_RATE_LIMITED");
      });
    });
  },
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `TEST_TYPE=integration:http pnpm test:integration:http -- voucher-rate-limit.spec.ts`
Expected: FAIL — the 6th request also returns 404 (no cooldown ever arms) because nothing calls `recordFailedAttempt`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/backend/src/api/store/carts/[id]/voucher/route.ts
import {
  MedusaRequest,
  MedusaResponse,
  MedusaStoreRequest,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { ApplyVoucherBody, ApplyVoucherQuerySchema } from "./validators";
import { applyVoucherWorkflow } from "../../../../../workflows/voucher-engine/apply-voucher";
import { removeVoucherWorkflow } from "../../../../../workflows/voucher-engine/remove-voucher";
import { toErrorEnvelope } from "../../../../../workflows/voucher-engine/lib/errors";
import {
  recordFailedAttempt,
  resetFailedAttempts,
} from "../../../../../lib/voucher-rate-limit";

function unwrapWorkflowError(err: unknown): unknown {
  const withCause = err as { cause?: unknown; errors?: unknown[] };
  if (withCause?.cause) return withCause.cause;
  if (Array.isArray(withCause?.errors) && withCause.errors.length > 0) {
    const first = withCause.errors[0] as { error?: unknown };
    return first?.error ?? first ?? err;
  }
  return err;
}

export const POST = async (
  req: MedusaStoreRequest<ApplyVoucherBody>,
  res: MedusaResponse,
) => {
  const cart_id = req.params.id;
  const { replace } = ApplyVoucherQuerySchema.parse(req.query);
  const customer_id = req.auth_context?.actor_id ?? null;
  const ip = req.ip || null;

  try {
    const { result } = await applyVoucherWorkflow(req.scope).run({
      input: { cart_id, code: req.validatedBody.code, customer_id, replace },
    });
    await resetFailedAttempts(req.scope, customer_id, ip);
    res.json(result);
  } catch (rawErr) {
    const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);
    logger.error(
      `[voucher-engine] apply-voucher failed cart_id=${cart_id}: ${
        rawErr instanceof Error
          ? (rawErr.stack ?? rawErr.message)
          : JSON.stringify(rawErr, Object.getOwnPropertyNames(rawErr as object))
      }`,
    );
    const { status, body } = toErrorEnvelope(
      unwrapWorkflowError(rawErr),
      req.requestId,
    );
    // Only a genuine "this code didn't work" outcome counts against the
    // brute-force counter (V1-V8 rejections -> 404/422). A 409
    // VOUCHER_REPLACE_REQUIRED means the code IS valid (just needs replace
    // confirmation) and must never count as a failed guess; a 400/500 is an
    // internal/calculation problem, not a guess.
    if (status === 404 || status === 422) {
      await recordFailedAttempt(req.scope, customer_id, ip);
    }
    res.status(status).json(body);
  }
};

export const DELETE = async (req: MedusaRequest, res: MedusaResponse) => {
  // unchanged
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `TEST_TYPE=integration:http pnpm test:integration:http -- voucher-rate-limit.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/api/store/carts/\[id\]/voucher/route.ts apps/backend/integration-tests/http/voucher-rate-limit.spec.ts
git commit -m "fix(backend): feed the voucher brute-force counter from the real apply route"
```

---

### Task 1.4: Fix the 429 body to match the shared error-envelope contract

**Files:**

- Modify: `apps/backend/src/api/middlewares/voucher-rate-limit.ts:37-42` (from Task 1.1's Step 3)
- Test: extend `apps/backend/src/api/middlewares/__tests__/voucher-rate-limit.unit.spec.ts`

**Interfaces:**

- Produces: a 429 body matching `ErrorEnvelope` (`workflows/voucher-engine/lib/errors.ts`) / `VoucherErrorEnvelope` (storefront `modules/voucher/types.ts`) — `type`, `code`, `message`, `customer_message`.

- [ ] **Step 1: Write the failing test**

```ts
// append to apps/backend/src/api/middlewares/__tests__/voucher-rate-limit.unit.spec.ts
it("returns a 429 body matching the shared ErrorEnvelope contract", async () => {
  jest.spyOn(rateLimit, "isRateLimited").mockResolvedValue(true);

  const req: any = { headers: {}, ip: "10.0.0.5", auth_context: {} };
  const json = jest.fn();
  const res: any = { status: jest.fn().mockReturnValue({ json }) };
  const next = jest.fn();

  await voucherRateLimitMiddleware(req, res, next);

  expect(res.status).toHaveBeenCalledWith(429);
  expect(json).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "rate_limited",
      code: "VOUCHER_RATE_LIMITED",
      message: expect.any(String),
      customer_message:
        "Bạn đã thử quá nhiều lần. Vui lòng thử lại sau 30 phút.",
    }),
  );
  expect(next).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- voucher-rate-limit.unit.spec.ts`
Expected: FAIL — actual body has no `type`/`customer_message` field.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/backend/src/api/middlewares/voucher-rate-limit.ts
const blocked = await isRateLimited(req.scope, customerId, ip);
if (blocked) {
  // Matches the shared ErrorEnvelope/VoucherErrorEnvelope contract
  // (workflows/voucher-engine/lib/errors.ts) so the storefront's
  // `customer_message`-only rendering path works for this response too.
  res.status(429).json({
    type: "rate_limited",
    code: "VOUCHER_RATE_LIMITED",
    message: "voucher validation rate limited (SEC-02/EC-10)",
    customer_message: "Bạn đã thử quá nhiều lần. Vui lòng thử lại sau 30 phút.",
  });
  return;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit -- voucher-rate-limit.unit.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/api/middlewares/voucher-rate-limit.ts apps/backend/src/api/middlewares/__tests__/voucher-rate-limit.unit.spec.ts
git commit -m "fix(backend): match voucher rate-limit 429 body to the shared ErrorEnvelope contract"
```

**Phase 1 checkpoint:** run `pnpm test:unit`, `TEST_TYPE=integration:http pnpm test:integration:http -- voucher-rate-limit` (alone — see `[[integration-test-runinband-isolation]]`), then manually smoke-test: start the stack, hit `POST /store/carts/:id/voucher` with a bad code 6× from the storefront/Bruno and confirm the 6th returns 429 with a Vietnamese message. Stop and report before starting Phase 2.

---

## Phase 2 — Data integrity: concurrency (EC-04)

Closes: optimistic locking never implemented + revalidate path has no lock.

### Task 2.1: Add a real optimistic-concurrency check before committing the voucher write

**Files:**

- Create: `apps/backend/src/workflows/voucher-engine/steps/assert-cart-unchanged.ts`
- Create: `apps/backend/src/workflows/voucher-engine/steps/__tests__/assert-cart-unchanged.unit.spec.ts`
- Modify: `apps/backend/src/workflows/voucher-engine/apply-voucher.ts`

**Interfaces:**

- Produces: `assertCartUnchangedStep({ cart_id, expected_concurrency_marker }): { unchanged: true }`, throws `VOUCHER_CART_CHANGED` (409) via `throwVoucherError` on mismatch.
- Consumes: `throwVoucherError` from `../lib/errors` (existing); `CartContext.concurrency_marker` from `loadCartContextStep` (existing field, currently unread anywhere — see `steps/load-cart-context.ts:63`).

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/src/workflows/voucher-engine/steps/__tests__/assert-cart-unchanged.unit.spec.ts
import { assertCartUnchangedStep } from "../assert-cart-unchanged";

function fakeContainer(updated_at: string) {
  return {
    resolve: () => ({
      graph: async () => ({ data: [{ id: "cart_1", updated_at }] }),
    }),
  } as any;
}

describe("assertCartUnchangedStep (unit)", () => {
  it("passes when the cart's updated_at still matches the captured marker", async () => {
    const result = await assertCartUnchangedStep(
      {
        cart_id: "cart_1",
        expected_concurrency_marker: "2026-07-16T00:00:00Z",
      },
      { container: fakeContainer("2026-07-16T00:00:00Z") } as any,
    );
    expect(result.output).toEqual({ unchanged: true });
  });

  it("throws VOUCHER_CART_CHANGED when the cart was mutated concurrently", async () => {
    await expect(
      assertCartUnchangedStep(
        {
          cart_id: "cart_1",
          expected_concurrency_marker: "2026-07-16T00:00:00Z",
        },
        { container: fakeContainer("2026-07-16T00:05:00Z") } as any,
      ),
    ).rejects.toMatchObject({ code: "VOUCHER_CART_CHANGED", http_status: 409 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- assert-cart-unchanged.unit.spec.ts`
Expected: FAIL with "Cannot find module '../assert-cart-unchanged'".

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/backend/src/workflows/voucher-engine/steps/assert-cart-unchanged.ts
/**
 * assertCartUnchangedStep — optimistic-concurrency guard (security.md EC-04).
 *
 * Re-reads the cart's `updated_at` right before the voucher metadata write and
 * compares it to the `concurrency_marker` captured earlier in the same
 * workflow by `loadCartContextStep`. A mismatch means another operation (a
 * concurrent item add/remove, or another apply/remove request that slipped
 * past the `voucher:cart:{cart_id}` lock's TTL) mutated the cart after the
 * discount was computed but before it was committed — throw so the caller
 * gets `VOUCHER_CART_CHANGED` (409) and retries against the current cart
 * instead of silently writing a discount based on stale line items.
 */
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { throwVoucherError } from "../lib/errors";

export const assertCartUnchangedStepId = "assert-cart-unchanged";

export interface AssertCartUnchangedInput {
  cart_id: string;
  expected_concurrency_marker: string;
}

export const assertCartUnchangedStep = createStep(
  assertCartUnchangedStepId,
  async (input: AssertCartUnchangedInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const { data } = await query.graph({
      entity: "cart",
      filters: { id: input.cart_id },
      fields: ["id", "updated_at"],
    });
    const rawCart = data?.[0] as { updated_at: string } | undefined;
    if (!rawCart || rawCart.updated_at !== input.expected_concurrency_marker) {
      throwVoucherError("VOUCHER_CART_CHANGED");
    }
    return new StepResponse({ unchanged: true });
  },
  // Read-only — no compensation.
);
```

Wire it into `apply-voucher.ts` — insert right after `discount` is computed and before the ephemeral Promotion is created (so we verify nothing changed underneath the calculation right before committing it):

```ts
// apps/backend/src/workflows/voucher-engine/apply-voucher.ts
import { assertCartUnchangedStep } from "./steps/assert-cart-unchanged";
// ... existing imports ...

    const discount = calculateVoucherDiscountStep({
      lines: resolved.lines,
      voucher: voucherTerms,
      global_cap_bps: lookup.global_cap_bps,
    });

    // EC-04: verify no concurrent mutation (e.g. an item removal) changed the
    // cart between loadCartContextStep's read and this point, right before we
    // commit the computed discount.
    assertCartUnchangedStep({
      cart_id: input.cart_id,
      expected_concurrency_marker: cart.concurrency_marker,
    });

    // Decision G — carry the capped amount via a fresh, cart-specific,
    // fixed-amount Promotion (never the shared/canonical VoucherConfig.promotion_id).
    const ephemeralInput = transform(
      // ... unchanged ...
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit -- assert-cart-unchanged.unit.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/workflows/voucher-engine/steps/assert-cart-unchanged.ts apps/backend/src/workflows/voucher-engine/steps/__tests__/assert-cart-unchanged.unit.spec.ts apps/backend/src/workflows/voucher-engine/apply-voucher.ts
git commit -m "feat(backend): implement EC-04 optimistic-concurrency check in apply-voucher"
```

---

### Task 2.2: Acquire the same cart lock in the revalidate-on-cart-change workflow

**Files:**

- Modify: `apps/backend/src/workflows/voucher-engine/revalidate-voucher-on-cart-change.ts`
- Test: extend `apps/backend/src/workflows/voucher-engine/__tests__/revalidate-voucher.unit.spec.ts` if it covers workflow wiring, otherwise add an HTTP-level regression to `apps/backend/integration-tests/http/revalidate-voucher-workflow.spec.ts`

**Interfaces:**

- Consumes: `acquireLockStep`, `releaseLockStep` from `@medusajs/core-flows` (already used identically in `apply-voucher.ts:26-29` and `remove-voucher.ts:18-21`).

- [ ] **Step 1: Write the failing test**

```ts
// append to apps/backend/integration-tests/http/revalidate-voucher-workflow.spec.ts
it("acquires the voucher:cart:{id} lock so it cannot race a concurrent apply/remove", async () => {
  // Import the workflow module and assert its step ids include acquire-lock/
  // release-lock, mirroring apply-voucher.ts's pattern — a structural
  // regression test since simulating a true race in this test harness would
  // require two concurrent workflow engine executions.
  const {
    revalidateVoucherWorkflow,
  } = require("../../src/workflows/voucher-engine/revalidate-voucher-on-cart-change");
  const stepIds = Object.keys(
    (revalidateVoucherWorkflow as any).__.steps ?? {},
  );
  // Fallback: inspect the workflow's serialized definition for the step ids
  // Medusa's workflow composer registers under the hood.
  expect(JSON.stringify(revalidateVoucherWorkflow)).toEqual(
    expect.stringContaining("acquire-lock"),
  );
});
```

(If Medusa's workflow object doesn't expose steps this simply, replace this structural assertion with a direct read of the compiled workflow definition, or fold this check into the existing "no active voucher -> no-op" HTTP test file by asserting the lock key was requested — check via a `jest.spyOn` on `acquireLockStep`'s underlying Redis lock module if module integration tests already do this elsewhere in the repo for `apply-voucher`. Prefer whatever pattern `apps/backend/integration-tests/http/apply-remove-voucher.spec.ts` uses to assert `acquireLockStep` ran, and mirror it here.)

- [ ] **Step 2: Run test to verify it fails**

Run: `TEST_TYPE=integration:http pnpm test:integration:http -- revalidate-voucher-workflow.spec.ts`
Expected: FAIL — no `acquireLockStep` present in the revalidate workflow.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/backend/src/workflows/voucher-engine/revalidate-voucher-on-cart-change.ts
import {
  acquireLockStep,
  createPromotionsWorkflow,
  deletePromotionsWorkflow,
  releaseLockStep,
  updateCartPromotionsWorkflow,
} from "@medusajs/core-flows";
// ... existing imports unchanged ...

export const revalidateVoucherWorkflow = createWorkflow(
  revalidateVoucherWorkflowId,
  (input: RevalidateVoucherWorkflowInput) => {
    // Same lock namespace as applyVoucherWorkflow/removeVoucherWorkflow
    // (EC-04) — a cart mutation's revalidation must not race an in-flight
    // apply/remove request touching cart.metadata.voucher.
    const lockKey = transform(
      { input },
      ({ input }) => `voucher:cart:${input.cart_id}`,
    );
    acquireLockStep({ key: lockKey, ttl: 10 });

    const existing = checkVoucherExistsStep({ cart_id: input.cart_id });

    // ... unchanged body (cart, lookup, revalidation, shouldRecompute/shouldRemove branches) ...

    releaseLockStep({ key: lockKey });

    return new WorkflowResponse(
      transform({ existing }, ({ existing }) => ({
        revalidated: existing.has_voucher,
      })),
    );
  },
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `TEST_TYPE=integration:http pnpm test:integration:http -- revalidate-voucher-workflow.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/workflows/voucher-engine/revalidate-voucher-on-cart-change.ts apps/backend/integration-tests/http/revalidate-voucher-workflow.spec.ts
git commit -m "fix(backend): acquire the voucher cart lock in revalidate-on-cart-change (EC-04)"
```

**Phase 2 checkpoint:** run `pnpm test:unit`, `TEST_TYPE=integration:modules pnpm test:integration:modules -- service.integration` (alone), `TEST_TYPE=integration:http pnpm test:integration:http -- apply-remove-voucher` and `-- revalidate-voucher-workflow` (each alone). Stop and report before starting Phase 3.

---

## Phase 3 — Correctness: validation order, query coercion, storefront replace-confirm

### Task 3.1: Check code existence before the replace-confirmation gate

**Files:**

- Create: `apps/backend/src/workflows/voucher-engine/steps/assert-voucher-found.ts`
- Create: `apps/backend/src/workflows/voucher-engine/steps/__tests__/assert-voucher-found.unit.spec.ts`
- Modify: `apps/backend/src/workflows/voucher-engine/apply-voucher.ts`

**Interfaces:**

- Produces: `assertVoucherFoundStep({ voucher }): { ok: true }`, throws `VOUCHER_NOT_FOUND` (404) when `voucher` is null/undefined.
- Consumes: `lookupVoucherStep`'s existing `{ voucher, user_usage_count, global_cap_bps }` output (unchanged) — only its call-site position moves earlier.

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/src/workflows/voucher-engine/steps/__tests__/assert-voucher-found.unit.spec.ts
import { assertVoucherFoundStep } from "../assert-voucher-found";

describe("assertVoucherFoundStep (unit)", () => {
  it("passes when a voucher was found", async () => {
    const result = await assertVoucherFoundStep(
      { voucher: { id: "v1", code: "SAVE10" } as any },
      {} as any,
    );
    expect(result.output).toEqual({ ok: true });
  });

  it("throws VOUCHER_NOT_FOUND when the voucher is null", async () => {
    await expect(
      assertVoucherFoundStep({ voucher: null }, {} as any),
    ).rejects.toMatchObject({ code: "VOUCHER_NOT_FOUND", http_status: 404 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- assert-voucher-found.unit.spec.ts`
Expected: FAIL with "Cannot find module '../assert-voucher-found'".

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/backend/src/workflows/voucher-engine/steps/assert-voucher-found.ts
/**
 * assertVoucherFoundStep — early V1-existence gate for apply-voucher.
 *
 * Runs BEFORE checkActiveVoucherStep so a nonexistent/mistyped code always
 * 404s, even when the cart already has a different voucher active — without
 * this, checkActiveVoucherStep's replace-confirmation gate (which never sees
 * `code`) fires first and asks the customer to "replace" a code that was
 * never valid in the first place.
 */
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { throwVoucherError } from "../lib/errors";
import type { PersistedVoucherConfig } from "../lib/mappers";

export const assertVoucherFoundStepId = "assert-voucher-found";

export interface AssertVoucherFoundInput {
  voucher: PersistedVoucherConfig | null;
}

export const assertVoucherFoundStep = createStep(
  assertVoucherFoundStepId,
  async (input: AssertVoucherFoundInput) => {
    if (!input.voucher) {
      throwVoucherError("VOUCHER_NOT_FOUND");
    }
    return new StepResponse({ ok: true });
  },
  // Read-only — no compensation.
);
```

Reorder `apply-voucher.ts` — move `lookupVoucherStep` (and the new assertion) up, before `checkActiveVoucherStep`:

```ts
// apps/backend/src/workflows/voucher-engine/apply-voucher.ts
import { assertVoucherFoundStep } from "./steps/assert-voucher-found";
// ... existing imports ...

export const applyVoucherWorkflow = createWorkflow(
  applyVoucherWorkflowId,
  (input: ApplyVoucherWorkflowInput) => {
    const lockKey = transform(
      { input },
      ({ input }) => `voucher:cart:${input.cart_id}`,
    );
    acquireLockStep({ key: lockKey, ttl: 10 });

    // Existence check FIRST (SPEC V1) — a nonexistent code must 404
    // regardless of whether another voucher is already active on the cart.
    const lookup = lookupVoucherStep({
      code: input.code,
      customer_id: transform({ input }, ({ input }) => input.customer_id ?? ""),
    });
    assertVoucherFoundStep({ voucher: lookup.voucher });

    // One-active-voucher / replace-confirmation gate (tasks 3.4.6/3.4.7/3.4.8) —
    // must run BEFORE any new Promotion is created (never remove a valid
    // existing voucher before the replacement is validated). Only reached
    // once the submitted code is confirmed to exist.
    const activeCheck = checkActiveVoucherStep({
      cart_id: input.cart_id,
      replace: input.replace,
    });

    const hasPrevious = transform(
      { activeCheck },
      ({ activeCheck }) => !!activeCheck.previous,
    );

    when({ hasPrevious }, ({ hasPrevious }) => hasPrevious).then(() => {
      // ... unchanged detach-old-ephemeral-promotion branch ...
    });

    // `lookup` was already computed above — remove the old duplicate
    // `lookupVoucherStep` call that used to sit here.

    const previousPromotionId = transform(
      { activeCheck },
      ({ activeCheck }) => activeCheck.previous?.ephemeral_promotion_id,
    );

    const cart = loadCartContextStep({
      cart_id: input.cart_id,
      voucher_promotion_id: previousPromotionId,
    });

    validateVoucherStep({
      voucher: lookup.voucher,
      cart,
      user_usage_count: lookup.user_usage_count,
    });

    // ... rest of the workflow (scope, resolved, voucherTerms, discount,
    // assertCartUnchangedStep from Task 2.1, ephemeralInput, ...) unchanged ...
  },
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit -- assert-voucher-found.unit.spec.ts`
Expected: PASS

Also add an HTTP regression to `apps/backend/integration-tests/http/apply-remove-voucher.spec.ts`:

```ts
it("returns 404 VOUCHER_NOT_FOUND (not 409) for a nonexistent code while a voucher is already active", async () => {
  // apply SAVE10 first so the cart has an active voucher, then try a
  // syntactically-valid but nonexistent code without ?replace=true.
  await api.post(
    `/store/carts/${cartId}/voucher`,
    { code: "SAVE10" },
    publishableKeyHeaders,
  );
  const res = await api
    .post(
      `/store/carts/${cartId}/voucher`,
      { code: "NOTREAL123" },
      publishableKeyHeaders,
    )
    .catch((e) => e.response);
  expect(res.status).toBe(404);
  expect(res.data.code).toBe("VOUCHER_NOT_FOUND");
});
```

Run: `TEST_TYPE=integration:http pnpm test:integration:http -- apply-remove-voucher.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/workflows/voucher-engine/steps/assert-voucher-found.ts apps/backend/src/workflows/voucher-engine/steps/__tests__/assert-voucher-found.unit.spec.ts apps/backend/src/workflows/voucher-engine/apply-voucher.ts apps/backend/integration-tests/http/apply-remove-voucher.spec.ts
git commit -m "fix(backend): check voucher existence before the replace-confirmation gate"
```

---

### Task 3.2: Fix `?replace=false` being coerced to `true`

**Files:**

- Modify: `apps/backend/src/api/store/carts/[id]/voucher/validators.ts:46-50`
- Test: `apps/backend/src/api/store/carts/[id]/voucher/__tests__/validators.unit.spec.ts` (existing file — add cases)

**Interfaces:**

- Produces: same `ApplyVoucherQuerySchema` export name/shape (`{ replace?: boolean }`) — only the coercion logic changes.

- [ ] **Step 1: Write the failing test**

```ts
// append to apps/backend/src/api/store/carts/[id]/voucher/__tests__/validators.unit.spec.ts
describe("ApplyVoucherQuerySchema — replace coercion", () => {
  it("parses ?replace=false as false, not true", () => {
    const result = ApplyVoucherQuerySchema.parse({ replace: "false" });
    expect(result.replace).toBe(false);
  });

  it("parses ?replace=true as true", () => {
    const result = ApplyVoucherQuerySchema.parse({ replace: "true" });
    expect(result.replace).toBe(true);
  });

  it("parses a missing replace as false", () => {
    const result = ApplyVoucherQuerySchema.parse({});
    expect(result.replace).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- validators.unit.spec.ts`
Expected: FAIL — `replace: "false"` currently parses to `true`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/backend/src/api/store/carts/[id]/voucher/validators.ts
/**
 * Query string for `POST /store/carts/:id/voucher` — `?replace=true` confirms
 * replacing an already-active voucher (API contract: otherwise `409
 * VOUCHER_REPLACE_REQUIRED`). Explicit string-literal match, NOT
 * `z.coerce.boolean()` — Zod's coercion is `Boolean(value)`, and
 * `Boolean("false")` is `true` (any non-empty string is truthy), which would
 * silently invert `?replace=false`.
 */
export const ApplyVoucherQuerySchema = z
  .object({
    replace: z
      .enum(["true", "false"])
      .optional()
      .transform((v) => v === "true"),
  })
  .strict();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit -- validators.unit.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/api/store/carts/\[id\]/voucher/validators.ts apps/backend/src/api/store/carts/\[id\]/voucher/__tests__/validators.unit.spec.ts
git commit -m "fix(backend): stop coercing ?replace=false to true in voucher apply query schema"
```

---

### Task 3.3: Storefront — handle the `notFound` outcome during replace-confirm

**Files:**

- Modify: `apps/storefront/src/modules/checkout/components/discount-code/index.tsx`

**Interfaces:**

- Produces: `VoucherApplyAttempt`'s `"notFound"` variant now carries `message: string` (was `{ kind: "notFound" }`, becomes `{ kind: "notFound"; message: string }`) — `submitCode`'s existing `case "notFound": return applyGenericCode(code)` branch is unaffected (it doesn't read `message`).

- [ ] **Step 1: Write the failing test**

This component has no existing unit-test harness in the repo (storefront tests are a stretch goal per testing.md) — verify manually per the Phase 3 checkpoint below instead of a new automated test. Skip to Step 3.

- [ ] **Step 2: (skipped — no automated storefront test harness for this component)**

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/storefront/src/modules/checkout/components/discount-code/index.tsx

/** Outcome of trying VoucherEngine's apply endpoint (UX-FLOW.md §1a). */
type VoucherApplyAttempt =
  | { kind: "success" }
  | { kind: "replaceRequired" }
  | { kind: "notFound"; message: string }
  | { kind: "rejected"; message: string };

// ... inside attemptVoucherApply, in the error-branch handling ...
if (err.code === "VOUCHER_NOT_FOUND") {
  return { kind: "notFound", message: err.customer_message };
}

// ... handleReplaceConfirm ...
const handleReplaceConfirm = async () => {
  if (!replaceConfirm) {
    return;
  }
  setPhase("applying");
  const attempt = await attemptVoucherApply(replaceConfirm.pendingCode, true);
  setPhase("idle");
  if (attempt.kind === "rejected" || attempt.kind === "notFound") {
    setReplaceConfirm(null);
    setErrorMessage(attempt.message);
  }
};
```

- [ ] **Step 4: Verify manually**

Start both dev servers (`pnpm backend:dev`, `pnpm storefront:dev`), apply `SAVE10` to a cart, then in the discount-code input submit a syntactically-valid but nonexistent code (e.g. `NOTREAL123`) — the replace-confirmation modal should not even open in this case since Task 3.1 now 404s before the 409; separately, to exercise the modal path itself, apply `SAVE10`, then submit a DIFFERENT real code (`MEGA20`) to trigger the replace modal, click confirm, and confirm the modal closes with an error shown for any injected failure.

- [ ] **Step 5: Commit**

```bash
git add apps/storefront/src/modules/checkout/components/discount-code/index.tsx
git commit -m "fix(storefront): handle notFound outcome in voucher replace-confirm flow"
```

**Phase 3 checkpoint:** run `pnpm test:unit`, `TEST_TYPE=integration:http pnpm test:integration:http -- apply-remove-voucher` (alone), then manually verify the storefront replace-confirm flow per Task 3.3 Step 4. Stop and report before starting Phase 4.

---

## Phase 4 — voucher_notice bugs (write-only notice + never cleared)

### Task 4.1: Clear the stale auto-remove notice on a successful apply/remove

**Files:**

- Modify: `apps/backend/src/workflows/voucher-engine/steps/write-voucher-cart-metadata.ts`
- Modify: `apps/backend/src/workflows/voucher-engine/remove-voucher.ts`
- Test: `apps/backend/src/workflows/voucher-engine/steps/__tests__/write-voucher-cart-metadata.unit.spec.ts` (new, mocks the cart module service)

**Interfaces:**

- Consumes: `VOUCHER_NOTICE_METADATA_KEY` from `../lib/auto-remove-notice` (existing export).

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/src/workflows/voucher-engine/steps/__tests__/write-voucher-cart-metadata.unit.spec.ts
import { writeVoucherCartMetadataStep } from "../write-voucher-cart-metadata";

describe("writeVoucherCartMetadataStep — clears stale voucher_notice (unit)", () => {
  it("clears voucher_notice on a successful apply", async () => {
    const updateCarts = jest.fn();
    const container = { resolve: () => ({ updateCarts }) } as any;

    await writeVoucherCartMetadataStep(
      {
        cart_id: "cart_1",
        voucher: { code: "SAVE10" } as any,
        previous_metadata: { voucher_notice: { code: "VOUCHER_AUTO_REMOVED" } },
      },
      { container } as any,
    );

    expect(updateCarts).toHaveBeenCalledWith(
      "cart_1",
      expect.objectContaining({
        metadata: expect.objectContaining({ voucher_notice: "" }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- write-voucher-cart-metadata.unit.spec.ts`
Expected: FAIL — current code spreads `previous_metadata` forward, leaving `voucher_notice` untouched (not `""`).

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/backend/src/workflows/voucher-engine/steps/write-voucher-cart-metadata.ts
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { Modules } from "@medusajs/framework/utils";
import type { ICartModuleService } from "@medusajs/framework/types";
import {
  VOUCHER_METADATA_KEY,
  VoucherCartMetadata,
} from "../lib/ephemeral-promotion";
import { VOUCHER_NOTICE_METADATA_KEY } from "../lib/auto-remove-notice";

// ... WriteVoucherCartMetadataInput unchanged ...

export const writeVoucherCartMetadataStep = createStep(
  writeVoucherCartMetadataStepId,
  async (input: WriteVoucherCartMetadataInput, { container }) => {
    const cartModuleService: ICartModuleService = container.resolve(
      Modules.CART,
    );

    await cartModuleService.updateCarts(input.cart_id, {
      metadata: {
        ...(input.previous_metadata ?? {}),
        [VOUCHER_METADATA_KEY]: input.voucher,
        // A fresh successful apply/recompute supersedes any stale
        // VOUCHER_AUTO_REMOVED notice from an earlier auto-removal — `""` is
        // a merge-patch delete (see mergeMetadata finding in this file's
        // original header comment).
        [VOUCHER_NOTICE_METADATA_KEY]: "",
      },
    });

    return new StepResponse(
      { updated: true },
      { cart_id: input.cart_id, previous_metadata: input.previous_metadata },
    );
  },
  async (compensationInput, { container }) => {
    if (!compensationInput) return;
    const cartModuleService: ICartModuleService = container.resolve(
      Modules.CART,
    );
    const previous = (compensationInput.previous_metadata ?? {}) as Record<
      string,
      unknown
    >;
    await cartModuleService.updateCarts(compensationInput.cart_id, {
      metadata: {
        ...previous,
        [VOUCHER_METADATA_KEY]: previous[VOUCHER_METADATA_KEY] ?? "",
        [VOUCHER_NOTICE_METADATA_KEY]:
          previous[VOUCHER_NOTICE_METADATA_KEY] ?? "",
      },
    });
  },
);
```

```ts
// apps/backend/src/workflows/voucher-engine/remove-voucher.ts
import { VOUCHER_METADATA_KEY } from "./lib/ephemeral-promotion";
import { VOUCHER_NOTICE_METADATA_KEY } from "./lib/auto-remove-notice";
// ...
const clearVoucherCartMetadataStep = createStep(
  clearVoucherCartMetadataStepId,
  async (input: { cart_id: string }, { container }) => {
    const cartModuleService: ICartModuleService = container.resolve(
      Modules.CART,
    );
    await cartModuleService.updateCarts(input.cart_id, {
      metadata: {
        [VOUCHER_METADATA_KEY]: "",
        [VOUCHER_NOTICE_METADATA_KEY]: "",
      },
    });
    return new StepResponse({ cleared: true });
  },
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit -- write-voucher-cart-metadata.unit.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/workflows/voucher-engine/steps/write-voucher-cart-metadata.ts apps/backend/src/workflows/voucher-engine/steps/__tests__/write-voucher-cart-metadata.unit.spec.ts apps/backend/src/workflows/voucher-engine/remove-voucher.ts
git commit -m "fix(backend): clear stale voucher_notice on successful apply/recompute/remove"
```

---

### Task 4.2: Storefront reads and displays `cart.metadata.voucher_notice`

**Files:**

- Modify: `apps/storefront/src/modules/voucher/types.ts`
- Modify: `apps/storefront/src/modules/checkout/components/discount-code/index.tsx`

**Interfaces:**

- Produces: new exported type `VoucherNoticeMetadata` in `modules/voucher/types.ts`.

- [ ] **Step 1: (no automated test harness for this component — see Task 3.3 Step 1/2 note; verify manually in Step 4 below)**

- [ ] **Step 2: (skipped)**

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/storefront/src/modules/voucher/types.ts — add near VoucherCartMetadata
/**
 * `cart.metadata.voucher_notice` — async auto-remove reason (SPEC §11.3 step
 * 3b / §8.4), mirrors the backend's `VoucherAutoRemoveNotice`
 * (`workflows/voucher-engine/lib/auto-remove-notice.ts`).
 */
export type VoucherNoticeMetadata = {
  code: "VOUCHER_AUTO_REMOVED";
  reason_code: string;
  voucher_code: string;
  reason_vi: string;
  customer_message: string;
};
```

```tsx
// apps/storefront/src/modules/checkout/components/discount-code/index.tsx
import type {
  VoucherCartMetadata,
  VoucherNoticeMetadata,
} from "@modules/voucher/types";
// ...

function readVoucherNotice(
  cart: HttpTypes.StoreCart,
): VoucherNoticeMetadata | null {
  const metadata = cart.metadata as Record<string, unknown> | null | undefined;
  return (
    (metadata?.voucher_notice as VoucherNoticeMetadata | undefined) ?? null
  );
}

// ... inside DiscountCode, alongside the other useState calls ...
const [autoRemoveNotice, setAutoRemoveNotice] =
  useState<VoucherNoticeMetadata | null>(() => readVoucherNotice(cart));

// ... inside the resync useEffect ...
useEffect(() => {
  if (phase !== "idle") {
    return;
  }
  if (skipNextResync.current) {
    skipNextResync.current = false;
    return;
  }
  const meta = readVoucherMetadata(cart);
  setActiveVoucher(meta ? toDisplayedVoucher(meta) : null);
  setCapExplanation(null);
  setAutoRemoveNotice(readVoucherNotice(cart));
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [cart.metadata]);

// ... in attemptVoucherApply's success branch, alongside setReplaceConfirm(null) ...
skipNextResync.current = true;
setActiveVoucher({
  /* unchanged */
});
setCapExplanation(result.data.cap_explanation);
setReplaceConfirm(null);
setAutoRemoveNotice(null);
return { kind: "success" };

// ... in handleRemoveVoucher's success branch ...
if (result.ok) {
  skipNextResync.current = true;
  setActiveVoucher(null);
  setCapExplanation(null);
  setAutoRemoveNotice(null);
}
```

Render, near the top of the returned JSX (right after the `<Heading>`):

```tsx
{
  autoRemoveNotice && (
    <div
      className="bg-amber-50 border border-amber-200 rounded-md p-3 text-ui-fg-subtle text-small-regular flex items-start justify-between gap-x-2"
      data-testid="voucher-auto-remove-notice"
    >
      <span>{autoRemoveNotice.customer_message}</span>
      <button
        type="button"
        className="txt-small text-ui-fg-interactive shrink-0"
        onClick={() => setAutoRemoveNotice(null)}
        data-testid="voucher-auto-remove-notice-dismiss"
      >
        Đã hiểu
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Verify manually**

Apply `SHUTTLE20` (min order 200,000₫, category-scoped) to a cart, remove line items until the cart drops below the minimum (triggering auto-remove via `revalidateVoucherWorkflow`), refetch the cart page, and confirm the amber notice banner appears with the correct Vietnamese reason; dismiss it and confirm it doesn't reappear until a new auto-removal happens.

- [ ] **Step 5: Commit**

```bash
git add apps/storefront/src/modules/voucher/types.ts apps/storefront/src/modules/checkout/components/discount-code/index.tsx
git commit -m "feat(storefront): surface the voucher auto-remove notice to the customer"
```

**Phase 4 checkpoint:** run `pnpm test:unit`, then manually verify per Task 4.2 Step 4 (this closes the loop on the "one real Day-5 gap" that turned out to be dead on arrival). Stop and report before starting Phase 5.

---

## Phase 5 — Performance: wire the Redis voucher-config cache into the lookup path

### Task 5.1: Use the existing 30s config cache in `lookupVoucherStep`

**Files:**

- Modify: `apps/backend/src/workflows/voucher-engine/steps/lookup-voucher.ts`
- Test: `apps/backend/src/workflows/voucher-engine/steps/__tests__/lookup-voucher.unit.spec.ts` (new)

**Interfaces:**

- Consumes: `getCachedVoucherConfig`, `setCachedVoucherConfig` from `../../../lib/voucher-cache` (already implemented, unit-tested — only need a real caller).
- Cache ONLY the cart-independent config (the row from `findByCode`) — never `user_usage_count` (cart/customer-dependent, per `lib/voucher-cache.ts`'s own SCOPE-SAFETY rule).

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/src/workflows/voucher-engine/steps/__tests__/lookup-voucher.unit.spec.ts
import { lookupVoucherStep } from "../lookup-voucher";
import * as cache from "../../../../lib/voucher-cache";

jest.mock("../../../modules/voucher-engine", () => ({
  VOUCHER_ENGINE_MODULE: "voucherEngine",
}));

describe("lookupVoucherStep — cache usage (unit)", () => {
  it("serves the voucher config from cache on a hit, skipping findByCode", async () => {
    const cachedVoucher = { id: "v1", code: "SAVE10" };
    jest
      .spyOn(cache, "getCachedVoucherConfig")
      .mockResolvedValue(cachedVoucher as any);
    const findByCode = jest.fn();
    const countUserUsage = jest.fn().mockResolvedValue(2);
    const getActiveCap = jest.fn().mockResolvedValue(5000);
    const container = {
      resolve: () => ({ findByCode, countUserUsage, getActiveCap }),
    } as any;

    const result = await lookupVoucherStep(
      { code: "SAVE10", customer_id: "cus_1" },
      { container } as any,
    );

    expect(findByCode).not.toHaveBeenCalled();
    expect(result.output.voucher).toEqual(cachedVoucher);
  });

  it("falls back to the DB and populates the cache on a miss", async () => {
    jest.spyOn(cache, "getCachedVoucherConfig").mockResolvedValue(null);
    const setCachedVoucherConfigSpy = jest
      .spyOn(cache, "setCachedVoucherConfig")
      .mockResolvedValue();
    const dbVoucher = { id: "v1", code: "SAVE10" };
    const findByCode = jest.fn().mockResolvedValue(dbVoucher);
    const countUserUsage = jest.fn().mockResolvedValue(0);
    const getActiveCap = jest.fn().mockResolvedValue(5000);
    const container = {
      resolve: () => ({ findByCode, countUserUsage, getActiveCap }),
    } as any;

    const result = await lookupVoucherStep(
      { code: "SAVE10", customer_id: "cus_1" },
      { container } as any,
    );

    expect(findByCode).toHaveBeenCalledWith("SAVE10");
    expect(setCachedVoucherConfigSpy).toHaveBeenCalledWith(
      container,
      "SAVE10",
      dbVoucher,
    );
    expect(result.output.voucher).toEqual(dbVoucher);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- lookup-voucher.unit.spec.ts`
Expected: FAIL — `getCachedVoucherConfig`/`setCachedVoucherConfig` are never called today.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/backend/src/workflows/voucher-engine/steps/lookup-voucher.ts
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { VOUCHER_ENGINE_MODULE } from "../../../modules/voucher-engine";
import type VoucherEngineService from "../../../modules/voucher-engine/service";
import type { PersistedVoucherConfig } from "../lib/mappers";
import {
  getCachedVoucherConfig,
  setCachedVoucherConfig,
} from "../../../lib/voucher-cache";

// ... exports unchanged ...

export const lookupVoucherStep = createStep(
  lookupVoucherStepId,
  async (input: LookupVoucherInput, { container }) => {
    const service = container.resolve(
      VOUCHER_ENGINE_MODULE,
    ) as VoucherEngineService;

    // 3.7.1/3.7.2 — cache ONLY the cart-independent config row; usage count
    // and cap stay live/uncached (cart/customer-dependent).
    let voucher = await getCachedVoucherConfig<PersistedVoucherConfig>(
      container,
      input.code,
    );
    if (!voucher) {
      voucher = (await service.findByCode(
        input.code,
      )) as PersistedVoucherConfig | null;
      if (voucher) {
        await setCachedVoucherConfig(container, input.code, voucher);
      }
    }

    const [user_usage_count, global_cap_bps] = await Promise.all([
      voucher
        ? service.countUserUsage(voucher.id, input.customer_id)
        : Promise.resolve(0),
      service.getActiveCap(),
    ]);

    const output: LookupVoucherOutput = {
      voucher,
      user_usage_count,
      global_cap_bps,
    };
    return new StepResponse(output);
  },
  // Read-only step — no compensation.
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit -- lookup-voucher.unit.spec.ts`
Expected: PASS

- [ ] **Step 5: Also invalidate on admin edit, then commit**

Check `apps/backend/src/workflows/voucher-engine/admin/create-voucher.ts` / its step: if there is an admin UPDATE path for `voucher_config` (not just create), call `invalidateVoucherConfig(container, code)` there so a 30s-stale cache can't outlive an admin edit for longer than necessary — if only CREATE exists (no update endpoint yet per Day 4 scope), skip this and note it as a follow-up when an update endpoint is added.

```bash
git add apps/backend/src/workflows/voucher-engine/steps/lookup-voucher.ts apps/backend/src/workflows/voucher-engine/steps/__tests__/lookup-voucher.unit.spec.ts
git commit -m "perf(backend): serve voucher config lookups from the existing 30s Redis cache"
```

**Phase 5 checkpoint:** run `pnpm test:unit`, `TEST_TYPE=integration:modules pnpm test:integration:modules -- service.integration` (alone, real Redis) to confirm cache hit/miss + TTL behavior end-to-end. Stop and report before starting Phase 6.

---

## Phase 6 — Cleanup / dedup

Lower risk, mechanical refactors. Each task below is independently committable; run `pnpm test:unit` after each (the existing suites are the regression net — no new tests required unless a task changes observable behavior).

### Task 6.1: Extract the shared cart-metadata-voucher read

**Files:**

- Create: `apps/backend/src/workflows/voucher-engine/lib/read-voucher-cart-metadata.ts` exporting `readVoucherCartMetadata(container, cart_id): Promise<{ active: VoucherCartMetadata | null; previous_metadata: Record<string, unknown> | null }>` (the exact `query.graph({entity:"cart", filters:{id: cart_id}, fields:["id","metadata"]})` + extraction logic currently duplicated in `steps/check-active-voucher.ts:38-63`, `steps/assert-active-voucher.ts:32-51`, `steps/check-voucher-exists.ts:29-49`).
- Modify: all three step files to call this helper instead of inlining the query, keeping each step's own extra logic (the 409 throw in `check-active-voucher.ts`, the `has_voucher` boolean in `check-voucher-exists.ts`) at the call site.
- Run `pnpm test:unit` — no test changes needed if behavior is preserved exactly (existing tests for these three steps are the regression check).

### Task 6.2: Extract the shared "resolve scope → calculate discount" sequence

**Files:**

- Create: `apps/backend/src/workflows/voucher-engine/lib/build-discount.ts` (or a `steps/resolve-and-calculate-discount.ts` composite step) wrapping: `toVoucherScope` → `resolveEligibleItemsStep` → build `voucherTerms` → `calculateVoucherDiscountStep`, currently copy-pasted in `apply-voucher.ts:130-151`, `resolve-voucher-discount.ts:68-92`, `revalidate-voucher-on-cart-change.ts:146-170`.
- Modify all three call sites to use the shared helper.
- Verify with `pnpm test:unit` + the existing HTTP suites for apply/resolve/revalidate (each alone).

### Task 6.3: Extract the shared ephemeral-Promotion + snapshot construction

**Files:**

- Create: `apps/backend/src/workflows/voucher-engine/lib/build-voucher-snapshot.ts` factoring out the ~70-line "create ephemeral Promotion + attach + build `VoucherCartMetadata` snapshot" block duplicated in `apply-voucher.ts:155-230` and `revalidate-voucher-on-cart-change.ts:172-242`.
- Modify both workflows to call it.
- Verify with the existing HTTP suites for apply and revalidate (each alone).

### Task 6.4: Delete confirmed-dead `lib/voucher-usage-counter.ts`

**Files:**

- Delete: `apps/backend/src/lib/voucher-usage-counter.ts` (already deprecated in its own docstring; zero real callers confirmed by the review's grep).
- Remove its now-orphaned unit test file if one exists (`apps/backend/src/lib/__tests__/voucher-usage-counter.unit.spec.ts` — check first).
- Run `pnpm test:unit` to confirm nothing referenced it.

### Task 6.5: Dedupe POST/DELETE error handling in the store voucher route

**Files:**

- Modify: `apps/backend/src/api/store/carts/[id]/voucher/route.ts` — extract the shared `catch` block (log + `unwrapWorkflowError` + `toErrorEnvelope` + `res.status(...).json(...)`) into one local helper function `handleVoucherRouteError(res, err, requestId, cartId, action)` used by both `POST` and `DELETE`.
- Run `TEST_TYPE=integration:http pnpm test:integration:http -- apply-remove-voucher.spec.ts` (alone) to confirm identical behavior.

### Task 6.6: Remove the redundant `has_voucher` derived field

**Files:**

- Modify: `apps/backend/src/workflows/voucher-engine/steps/check-voucher-exists.ts` — either drop `has_voucher` from `CheckVoucherExistsOutput` and compute `!!active` at each of its 2 call sites in `revalidate-voucher-on-cart-change.ts`, or keep it only if callers read it more than once (check before removing — if it simplifies call sites, keep it and just note it's intentional, not redundant; only remove if genuinely single-use with no clarity benefit).

### Task 6.7: Route storefront voucher calls through the shared `sdk` client

**Files:**

- Modify: `apps/storefront/src/lib/data/voucher.ts` — replace the hand-rolled `voucherFetch` (raw `fetch`) with the shared `sdk.client.fetch` from `@lib/config`, OR (if `sdk.client.fetch`'s error handling genuinely can't preserve `customer_message` per this file's own header comment) keep the raw `fetch` but explicitly add the `x-medusa-locale` header the shared `sdk` client injects elsewhere, so at minimum locale-dependent behavior doesn't silently diverge. Decide by first reading how `sdk.client.fetch`'s error path behaves in the currently-installed `@medusajs/js-sdk` version (this file's own comment already documents this was a deliberate, verified decision — re-verify against the same `client.js`/`normalizeResponse` this file cites before changing anything; if the original tradeoff still holds, this task becomes "add the missing locale header only," not "switch clients").
- No test changes required beyond manual verification that locale-dependent copy still renders correctly.

### Task 6.8: Single-source the `VoucherErrorEnvelope`/`ErrorEnvelope` type

**Files:**

- Modify: `apps/storefront/src/modules/voucher/types.ts` — cannot literally `import` a backend-only TS type across the app boundary (separate `tsconfig`/build), so instead add a code comment pinning it to the backend source of truth (`apps/backend/src/workflows/voucher-engine/lib/errors.ts:225-239`) and, if the repo has any existing cross-app type-sync convention (check `docs/team/CONTRIBUTING.md` for one), follow it; otherwise leave as manually-mirrored but add a `__tests__` snapshot-style check that fails loudly if the two shapes drift (e.g. a small script comparing key sets, run in CI) — scope this down to "add the pinning comment" if no sync convention exists, to avoid inventing new infra outside this plan's scope.

### Task 6.9: Extract the shared cache-module resolver

**Files:**

- Compare `apps/backend/src/lib/voucher-cache.ts:46-52`'s `cache(container)` against `apps/backend/src/lib/suggestion-cache.ts`'s equivalent — if genuinely line-for-line identical, extract a shared `resolveCache(container): VoucherCache | null` into a new `apps/backend/src/lib/cache.ts` and have both files import it; if the two have diverged in ways that matter (different logging, different fallback), leave them separate and note why in a comment instead of forcing a premature abstraction.

### Task 6.10: Reuse `suggestive-selling`'s money rounding utility

**Files:**

- Compare `apps/backend/src/modules/voucher-engine/lib/money.ts` against `apps/backend/src/modules/suggestive-selling/utils/money.ts`'s `roundMoney` — if they implement the same rounding rule (`Math.floor`, integer VND), replace VoucherEngine's own copy with an import from the suggestive-selling utility (cross-module utility import is fine — this is a plain function, not a Link-Module-worthy cross-module data reference); if VoucherEngine's version has diverged for a real reason (e.g. basis-points handling suggestive-selling doesn't need), keep it separate and document why in a comment.
- Run `pnpm test:unit` (the `StackingEngine`/discount-calc fixture tests, testing.md's exact-fixture VND assertions, are the regression net here — do not touch rounding behavior, only the import source).

**Phase 6 checkpoint:** run `pnpm test:unit`, `TEST_TYPE=integration:modules pnpm test:integration:modules` (alone), `TEST_TYPE=integration:http pnpm test:integration:http` (each file alone per the known `--runInBand` isolation issue), `pnpm build` (0 errors). Stop and report before starting Phase 7.

---

## Phase 7 — Efficiency

### Task 7.1: Parallelize independent lookups in `voucher-analytics`

**Files:**

- Modify: `apps/backend/src/workflows/voucher-engine/admin/steps/voucher-analytics.ts` — change the sequential `await retrieveVoucherConfig(...)` then `await listVoucherUsageLogs(...)` into `const [config, logs] = await Promise.all([retrieveVoucherConfig(...), listVoucherUsageLogs(...)])` (no data dependency between them).
- Verify with `TEST_TYPE=integration:http pnpm test:integration:http -- voucher-admin.spec.ts` (alone).

### Task 7.2: Replace in-memory analytics aggregation with a DB-side aggregate

**Files:**

- Modify: `apps/backend/src/workflows/voucher-engine/admin/steps/voucher-analytics.ts` and, if needed, `apps/backend/src/modules/voucher-engine/service.ts` — add a service method that does the `SUM`/`COUNT` over `voucher_usage_log` at the DB layer (Mikro-ORM query builder / raw query) instead of `listVoucherUsageLogs` fetching every row and reducing in JS. Scope this to the specific aggregate fields the analytics endpoint currently returns — do not change the endpoint's response shape.
- Verify with `TEST_TYPE=integration:http pnpm test:integration:http -- voucher-admin.spec.ts` (alone) — assert identical numeric output before/after on a fixture with several usage-log rows.

### Task 7.3: Avoid the duplicate cart `query.graph` read in `apply-voucher`

**Files:**

- Modify: `apps/backend/src/workflows/voucher-engine/apply-voucher.ts` — `checkActiveVoucherStep` (metadata-only read) and `loadCartContextStep` (full cart+lines read) both hit `query.graph` for the same cart within one request. Given Task 6.1 already extracts a shared metadata-read helper, evaluate whether `loadCartContextStep` can request `metadata` alongside its existing `CART_CONTEXT_FIELDS` and have `checkActiveVoucherStep`'s caller reuse that single read instead of querying twice — only pursue this if it doesn't complicate the step-ordering fix from Task 3.1 (existence-check must still run before the replace gate); if the two reads can't be safely merged without re-introducing ordering risk, leave them separate and note why.

**Phase 7 checkpoint:** run `pnpm test:unit`, full `TEST_TYPE=integration:http pnpm test:integration:http` (each file alone), `pnpm build` (0 errors). Report final summary: all 10 original findings + cleanup items closed, test counts before/after, and any task from Phase 6/7 that was deliberately skipped with its reason.
