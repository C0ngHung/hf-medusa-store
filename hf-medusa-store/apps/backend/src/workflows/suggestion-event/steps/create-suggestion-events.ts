import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { SUGGESTIVE_SELLING_MODULE } from "../../../modules/suggestive-selling";
import type {
  CreateSuggestionEventsInput,
  CreateSuggestionEventsResult,
} from "../types";

/**
 * Persist a batch of suggestion analytics events (SUGG-006 / SPEC A.11).
 *
 * Append-only insert via the auto-generated `createSuggestionEvents`. In
 * `best_effort` mode a failure is logged and reported as `accepted: 0` rather than
 * thrown — analytics must never break the flow that emitted it. Compensation
 * deletes the inserted rows if a later step in the workflow rolls back.
 */
export const createSuggestionEventsStep = createStep(
  "create-suggestion-events",
  async (
    input: CreateSuggestionEventsInput,
    { container },
  ): Promise<StepResponse<CreateSuggestionEventsResult, string[]>> => {
    const events = input.events ?? [];
    // Empty batch → nothing to persist, nothing to compensate.
    if (events.length === 0) {
      return new StepResponse({ events: [], accepted: 0 }, []);
    }

    const service: any = container.resolve(SUGGESTIVE_SELLING_MODULE);
    try {
      const created = await service.createSuggestionEvents(events);
      const rows = Array.isArray(created) ? created : [created];
      const ids = rows
        .map((e: { id?: string }) => e?.id)
        .filter((id: unknown): id is string => typeof id === "string");
      return new StepResponse({ events: rows, accepted: rows.length }, ids);
    } catch (err) {
      if (input.best_effort) {
        const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
        logger.warn(
          `[suggestive] createSuggestionEvents best-effort swallow (${events.length} events): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        return new StepResponse({ events: [], accepted: 0 }, []);
      }
      throw err;
    }
  },
  async (ids, { container }) => {
    if (!ids || ids.length === 0) return;
    const service: any = container.resolve(SUGGESTIVE_SELLING_MODULE);
    await service.deleteSuggestionEvents(ids);
  },
);
