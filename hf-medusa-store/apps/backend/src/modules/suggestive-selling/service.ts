import { MedusaService } from '@medusajs/framework/utils'
import SuggestionRule from './models/suggestion-rule'
import SuggestionRuleItem from './models/suggestion-rule-item'
import CartSuggestionCondition from './models/cart-suggestion-condition'
import SuggestionEvent from './models/suggestion-event'
import CategoryComplementMapping from './models/category-complement-mapping'

/**
 * SuggestiveSellingService — SRS §2.1.
 * MedusaService auto-generates CRUD (list/retrieve/create/update/delete +
 * soft-delete) for every model below. Custom query/orchestration logic
 * (rule evaluation, cache) is layered on top by the evaluator + workflows.
 */
class SuggestiveSellingService extends MedusaService({
  SuggestionRule,
  SuggestionRuleItem,
  CartSuggestionCondition,
  SuggestionEvent,
  CategoryComplementMapping,
}) {}

export default SuggestiveSellingService
