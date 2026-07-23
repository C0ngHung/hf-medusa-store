import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { createSuggestionEventsWorkflow } from "../../../workflows/suggestion-event";
import type { SuggestionEventInput } from "../../../workflows/suggestion-event";
import { addDismissal, dismissalScope } from "../../../lib/suggestion-cache";

/**
 * POST /store/suggestion-events — batch analytics tracking (SUGG-006 / SF-08,
 * API Contract §1.1, tasks 2.5.3 / 2.6.8–2.6.12). Fire-and-forget: always returns
 * 202 Accepted and never blocks render/interaction.
 *
 * Validation (SEC-04): actions and contexts are closed enums, `suggested_product_id`
 * is required. A malformed event is rejected INDIVIDUALLY (counted in `rejected`) —
 * one bad event never fails the whole batch. `customer_id` is taken from the auth
 * context only (never the body); `session_id` falls back to the `x-session-id`
 * header. Batches over MAX_BATCH are truncated.
 *
 * NOTE: the authoritative `add_to_cart` event is emitted server-side by the
 * suggested-items route (Day 5); events posted here are auxiliary client tracking.
 * Per-session rate limiting (EC-12, 60 req/min) is out of scope for this route.
 */

/** 2.6.8–2.6.11 — the four tracked actions. */
const ACTIONS = new Set(["impression", "tap", "add_to_cart", "dismiss"]);
const CONTEXTS = new Set(["product_view", "cart"]);
const MAX_BATCH = 10;

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);

  try {
    const body = (req.body ?? {}) as { events?: unknown };
    const rawEvents = Array.isArray(body.events)
      ? body.events.slice(0, MAX_BATCH) // excess truncated (SUGG-006)
      : [];

    // Customer from auth context only (SEC-04); guests → null.
    const authContext = (
      req as unknown as {
        auth_context?: { actor_id?: string; actor_type?: string };
      }
    ).auth_context;
    const customerId =
      authContext?.actor_type === "customer"
        ? (authContext.actor_id ?? null)
        : null;
    const sessionHeader =
      typeof req.headers["x-session-id"] === "string"
        ? req.headers["x-session-id"]
        : null;

    const valid: SuggestionEventInput[] = [];
    let rejected = 0;

    for (const raw of rawEvents) {
      const e = (raw ?? {}) as Record<string, unknown>;
      const action = e.action;
      const source_context = e.source_context;
      const suggested_product_id = e.suggested_product_id;

      // Per-event schema gate — reject individually, keep the rest (SEC-04).
      if (
        typeof action !== "string" ||
        !ACTIONS.has(action) ||
        typeof source_context !== "string" ||
        !CONTEXTS.has(source_context) ||
        typeof suggested_product_id !== "string" ||
        !suggested_product_id
      ) {
        rejected++;
        continue;
      }

      // Full payload (2.6.12); customer/session are server-controlled.
      valid.push({
        rule_id: typeof e.rule_id === "string" ? e.rule_id : null,
        source_context:
          source_context as SuggestionEventInput["source_context"],
        source_product_id:
          typeof e.source_product_id === "string" ? e.source_product_id : null,
        suggested_product_id,
        customer_id: customerId,
        session_id:
          typeof e.session_id === "string" ? e.session_id : sessionHeader,
        action: action as SuggestionEventInput["action"],
        tier: typeof e.tier === "string" ? e.tier : null,
        slot: typeof e.slot === "number" ? e.slot : null,
      });
    }

    // SUGG-002 / BR-02(c) — persist dismissals server-side so subsequent GETs drop
    // the product ("dismissed → không hiện lại trong session", T-SUGG-05). Without
    // this the dismissal set has no writer and dismissed items reappear on re-fetch.
    // Scope/context mirror the read side (getDismissed in the suggestions routes):
    // customer id when logged in, else session; keyed per source_context. Best-effort
    // (addDismissal swallows cache errors) so it never affects the analytics 202.
    for (const e of valid) {
      if (e.action !== "dismiss") continue;
      await addDismissal(
        req.scope,
        dismissalScope(e.customer_id, e.session_id),
        e.source_context,
        e.suggested_product_id,
      );
    }

    let accepted = 0;
    if (valid.length > 0) {
      const { result } = await createSuggestionEventsWorkflow(req.scope).run({
        input: { events: valid, best_effort: true },
      });
      accepted = result?.accepted ?? 0;
    }

    res.status(202).json({ accepted, rejected });
  } catch (err) {
    // Analytics is best-effort: swallow, log, still answer 202 (never 5xx).
    logger.error(
      `[suggestive] POST suggestion-events failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    res.status(202).json({ accepted: 0, rejected: 0 });
  }
};
