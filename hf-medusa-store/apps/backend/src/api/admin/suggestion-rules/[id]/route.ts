import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { UpdateSuggestionRuleBody } from "../validators";
import { getSuggestionRuleWorkflow } from "../../../../workflows/suggestive-selling/admin/get-suggestion-rule";
import { updateSuggestionRuleWorkflow } from "../../../../workflows/suggestive-selling/admin/update-suggestion-rule";
import { deleteSuggestionRuleWorkflow } from "../../../../workflows/suggestive-selling/admin/delete-suggestion-rule";

/** GET /admin/suggestion-rules/:id — retrieve one rule with children. */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { result } = await getSuggestionRuleWorkflow(req.scope).run({
    input: { id: req.params.id },
  });
  res.json({ suggestion_rule: result });
};

/** PUT /admin/suggestion-rules/:id — update fields; items/conditions/sources replace. */
export const PUT = async (
  req: MedusaRequest<UpdateSuggestionRuleBody>,
  res: MedusaResponse,
) => {
  const { result } = await updateSuggestionRuleWorkflow(req.scope).run({
    input: { id: req.params.id, ...req.validatedBody },
  });
  res.json({ suggestion_rule: result });
};

/** DELETE /admin/suggestion-rules/:id — soft delete (children cascade). */
export const DELETE = async (req: MedusaRequest, res: MedusaResponse) => {
  const { result } = await deleteSuggestionRuleWorkflow(req.scope).run({
    input: { id: req.params.id },
  });
  res.json({ id: result, object: "suggestion_rule", deleted: true });
};
