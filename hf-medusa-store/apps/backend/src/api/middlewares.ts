import { defineMiddlewares, validateAndTransformBody } from '@medusajs/framework/http'
import {
  CreateSuggestionRuleSchema,
  UpdateSuggestionRuleSchema,
} from './admin/suggestion-rules/validators'

/**
 * API middlewares. Body validation for admin suggestion-rule writes (SRS §6.1):
 * validateAndTransformBody parses with the zod schema and sets req.validatedBody.
 */
export default defineMiddlewares({
  routes: [
    {
      matcher: '/admin/suggestion-rules',
      method: 'POST',
      middlewares: [validateAndTransformBody(CreateSuggestionRuleSchema)],
    },
    {
      matcher: '/admin/suggestion-rules/:id',
      method: 'PUT',
      middlewares: [validateAndTransformBody(UpdateSuggestionRuleSchema)],
    },
  ],
})
