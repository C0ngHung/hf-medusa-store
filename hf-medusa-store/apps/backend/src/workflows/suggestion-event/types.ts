/**
 * SuggestiveSelling analytics-event workflow types — SUGG-006 / SPEC A.11.
 *
 * Plain TypeScript (no Medusa runtime) so both the workflow and the route can
 * share these shapes. Mirrors the `suggestion_event` model (SPEC A.1) minus the
 * server-managed columns (`id`, `created_at`).
 */

/** A single analytics event to persist (append-only). Enum + id only — no free text (SEC-04). */
export interface SuggestionEventInput {
  /** Rule that produced the suggestion; null for tier-agnostic events. */
  rule_id?: string | null;
  source_context: "product_view" | "cart";
  /** The product whose page/cart context produced the suggestion (product context only). */
  source_product_id?: string | null;
  suggested_product_id: string;
  /** From auth context only — never trusted from the client body (SEC-04). */
  customer_id?: string | null;
  session_id?: string | null;
  action: "impression" | "tap" | "add_to_cart" | "dismiss";
  /** Which suggestion tier the event belongs to (`manual`|`category`|`behavioral`, SF-08). */
  tier?: string | null;
  /** 1-based display slot for per-position funnel analysis (SPEC A.11). */
  slot?: number | null;
}

/** Workflow input: a batch of events, with an opt-in best-effort mode. */
export interface CreateSuggestionEventsInput {
  events: SuggestionEventInput[];
  /**
   * When true, a persistence failure is swallowed and reported as `accepted: 0`
   * instead of throwing — analytics must never break the flow that emitted it
   * (SUGG-006 fire-and-forget). Callers on the critical path (e.g. dismissal /
   * add-to-cart side events) set this.
   */
  best_effort?: boolean;
}

/** Workflow output: the persisted rows and how many were accepted. */
export interface CreateSuggestionEventsResult {
  events: unknown[];
  accepted: number;
}
