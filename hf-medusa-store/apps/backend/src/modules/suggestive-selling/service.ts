import { MedusaService } from '@medusajs/framework/utils'
import SuggestionRule from './models/suggestion-rule'
import SuggestionRuleItem from './models/suggestion-rule-item'
import SuggestionRuleSource from './models/suggestion-rule-source'
import CartSuggestionCondition from './models/cart-suggestion-condition'
import SuggestionEvent from './models/suggestion-event'
import CategoryComplementMapping from './models/category-complement-mapping'
import ProductBulkMapping from './models/product-bulk-mapping'

/**
 * SuggestiveSellingService — SRS §2.1.
 * MedusaService auto-generates CRUD (list/retrieve/create/update/delete +
 * soft-delete) for every model below. Custom query/orchestration logic
 * (rule evaluation, cache) is layered on top by the evaluator + workflows.
 */
class SuggestiveSellingService extends MedusaService({
  SuggestionRule,
  SuggestionRuleItem,
  SuggestionRuleSource,
  CartSuggestionCondition,
  SuggestionEvent,
  CategoryComplementMapping,
  ProductBulkMapping,
}) {}

export default SuggestiveSellingService
