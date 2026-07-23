import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { evaluateProductSuggestionsWorkflow } from "./suggestive-selling/evaluate-product-suggestions";
import { EvaluationEngine } from "../modules/suggestive-selling/evaluator";
import { RAW_CANDIDATE_CAP } from "../modules/suggestive-selling/constants";
import { cache, productCacheKey } from "../lib/suggestion-cache";
import type {
  ProductEvaluationRequest,
  ProductSuggestion,
  RawCandidate,
} from "../modules/suggestive-selling/types";

/**
 * evaluateSuggestions workflow — SRS §7.1, SPEC A.7 (task 2.2.1).
 *
 * Two composed stages, honouring the team split:
 *   1. SELECTION (Linh) — `evaluateProductSuggestionsWorkflow` produces ranked
 *      Tier-1/Tier-2 candidate ids ("load rules → Tier-1 → backfill → rank").
 *   2. ENRICH + FILTER + RESPONSE (Sơn) — this workflow's step runs the
 *      EvaluationEngine over those candidates: pricing/variant/stock/taxonomy
 *      enrichment, BR-02 per-customer filtering, and the wire projection.
 *
 * The route stays thin: it maps the HTTP request to this workflow's input and
 * serializes the result (D7 — synchronous & authoritative, not a subscriber).
 *
 * Tier 3 Behavioral is Phase 2 (SUGG-001 / task 2.2.8): the data model supports it
 * (rule.tier / suggestion_event.tier accept 'behavioral'), but neither the
 * selection nor this layer produces behavioral candidates yet.
 */
export interface EvaluateSuggestionsInput {
  productId: string;
  request: ProductEvaluationRequest;
}

const finalizeProductSuggestionsStep = createStep(
  "finalize-product-suggestions",
  async (
    input: {
      candidates: RawCandidate[];
      productId: string;
      request: ProductEvaluationRequest;
    },
    { container },
  ) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

    // Cache the RAW enriched buffer per product (2.6.3) ONLY for the region-
    // deterministic no-cart path (guest / LCP hot path). With a cart, pricing is
    // region-specific and the in-cart filter is request-specific → compute fresh.
    const cacheKey = input.request.cartId
      ? null
      : productCacheKey(input.productId);

    const engine = new EvaluationEngine({
      query,
      logger,
      cache: cache(container),
      cacheKey,
    });
    const suggestions = await engine.enrichAndFinalize(
      input.candidates ?? [],
      input.productId,
      input.request,
    );

    return new StepResponse<ProductSuggestion[]>(suggestions);
  },
);

export const evaluateSuggestionsWorkflow = createWorkflow(
  "evaluate-suggestions",
  (input: EvaluateSuggestionsInput) => {
    // Stage 1 — candidate SELECTION (Linh). Ask for a buffer (RAW_CANDIDATE_CAP),
    // not the display limit, so the downstream BR-02 filter has material to backfill
    // slots it drops (out-of-stock / in-cart / …). NOTE: fully correct backfill-
    // after-filter also needs the selection to keep filling when Tier-1 is nominally
    // ≥ threshold but items later fail the filter — a follow-up on the selection gate.
    const candidates = evaluateProductSuggestionsWorkflow.runAsStep({
      input: { productId: input.productId, limit: RAW_CANDIDATE_CAP },
    });

    // Stage 2 — ENRICH + BR-02 FILTER + RESPONSE (Sơn).
    const suggestions = finalizeProductSuggestionsStep({
      candidates,
      productId: input.productId,
      request: input.request,
    });

    return new WorkflowResponse(suggestions);
  },
);

export default evaluateSuggestionsWorkflow;
