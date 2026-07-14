import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { SUGGESTIVE_SELLING_MODULE } from "../../../modules/suggestive-selling";

/**
 * GET /admin/suggestion-events — read-only analytics feed (SUGG-006).
 * The suggestion_event table is append-only (written by the store analytics
 * endpoint), so admin only reads it. Query: source_context, action, tier,
 * suggested_product_id, source_product_id, limit, offset.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const {
    source_context,
    action,
    tier,
    suggested_product_id,
    source_product_id,
    limit = "100",
    offset = "0",
  } = req.query as Record<string, string>;

  const filters: Record<string, unknown> = {};
  if (source_context) filters.source_context = source_context;
  if (action) filters.action = action;
  if (tier) filters.tier = tier;
  if (suggested_product_id) filters.suggested_product_id = suggested_product_id;
  if (source_product_id) filters.source_product_id = source_product_id;

  const service: any = req.scope.resolve(SUGGESTIVE_SELLING_MODULE);
  const [suggestion_events, count] = await service.listAndCountSuggestionEvents(
    filters,
    {
      take: Number(limit),
      skip: Number(offset),
      order: { created_at: "DESC" },
    },
  );

  res.json({
    suggestion_events,
    count,
    limit: Number(limit),
    offset: Number(offset),
  });
};
