import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";

/**
 * Invalidate suggestion caches affected by a rule change (SUGG-005 / SPEC A.9).
 * Stub for now — Sơn wires the real Redis DEL of product:{id}:suggestions /
 * cart:{id}:suggestions here when the cache adapter lands.
 */
export const invalidateSuggestionCacheStep = createStep(
  "invalidate-suggestion-cache",
  async (input: { ruleId: string }, { container }) => {
    const logger = container.resolve("logger");
    // TODO(Sơn, Day 3+): resolve cache adapter and DEL affected suggestion keys.
    logger.debug(
      `[suggestive] cache invalidation requested for rule ${input.ruleId} (no-op until cache wired)`,
    );
    return new StepResponse();
  },
);
