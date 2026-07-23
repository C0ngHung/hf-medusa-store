import { listCartSuggestions } from "@lib/data/suggestions"
import SuggestionsCarousel from "@modules/suggestions/components/suggestions-carousel"

type CartSuggestionsProps = {
  cartId: string
  countryCode: string
  currencyCode: string
}

/**
 * Cart "Bạn có thể cần thêm" section (task 4.4.5, SUGG-004). Server component
 * re-fetched on every cart render, so add/remove refreshes the list (4.4.9),
 * matched by the backend `cart.updated` cache invalidation (2.6.6). `threshold_info`
 * drives the CR-02 free-shipping nudge (4.4.6). Empty list → renders nothing so
 * the section disappears (4.4.8 / BR-10). Mount inside <Suspense> for the async
 * skeleton (4.4.7 / 2.7.5).
 */
const CartSuggestions = async ({
  cartId,
  countryCode,
  currencyCode,
}: CartSuggestionsProps) => {
  const { suggestions, threshold_info } = await listCartSuggestions({ cartId })

  if (!suggestions.length) return null

  return (
    <SuggestionsCarousel
      initialItems={suggestions}
      context="cart"
      countryCode={countryCode}
      currencyCode={currencyCode}
      heading="Bạn có thể cần thêm"
      variant="compact"
      threshold={threshold_info}
    />
  )
}

export default CartSuggestions
