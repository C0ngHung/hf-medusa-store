import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { CreateSuggestionRuleBody } from "./validators";
import { listSuggestionRulesWorkflow } from "../../../workflows/suggestive-selling/admin/list-suggestion-rules";
import { createSuggestionRuleWorkflow } from "../../../workflows/suggestive-selling/admin/create-suggestion-rule";

/**
 * GET /admin/suggestion-rules — list rules (SRS §6.1).
 * Query: type, is_active, limit, offset. Thin route → workflow (no service here).
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const {
    type,
    is_active,
    limit = "50",
    offset = "0",
  } = req.query as Record<string, string>;

  const filters: Record<string, unknown> = {};
  if (type) filters.type = type;
  if (is_active !== undefined) filters.is_active = is_active === "true";

  const { result } = await listSuggestionRulesWorkflow(req.scope).run({
    input: { filters, take: Number(limit), skip: Number(offset) },
  });

  res.json({ ...result, limit: Number(limit), offset: Number(offset) });
};

/**
 * POST /admin/suggestion-rules — create a rule with nested items/conditions/sources.
 */
export const POST = async (
  req: MedusaRequest<CreateSuggestionRuleBody>,
  res: MedusaResponse,
) => {
  const { result } = await createSuggestionRuleWorkflow(req.scope).run({
    input: req.validatedBody,
  });
  res.status(201).json({ suggestion_rule: result });
};
