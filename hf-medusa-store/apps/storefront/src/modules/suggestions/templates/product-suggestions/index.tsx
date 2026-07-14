import { getCartId } from "@lib/data/cookies"
import { listProductSuggestions } from "@lib/data/suggestions"
import SuggestionsCarousel from "@modules/suggestions/components/suggestions-carousel"

type ProductSuggestionsProps = {
  productId: string
  countryCode: string
  currencyCode: string
}

/**
 * PDP "Thường được mua cùng" section (task 4.4.1, SUGG-001). Server component:
 * fetches product-level suggestions (passing the current cart for the in-cart
 * filter + region pricing) and renders nothing when the list is empty so the
 * section is fully hidden (4.4.8 / BR-10). Wrap in <Suspense> at the mount site
 * for the skeleton fallback (4.4.7).
 */
const ProductSuggestions = async ({
  productId,
  countryCode,
  currencyCode,
}: ProductSuggestionsProps) => {
  const cartId = await getCartId()
  const { suggestions } = await listProductSuggestions({
    productId,
    cartId,
  })

  if (!suggestions.length) return null

  return (
    <SuggestionsCarousel
      initialItems={suggestions}
      context="product_view"
      countryCode={countryCode}
      currencyCode={currencyCode}
      heading="Thường được mua cùng"
      subheading="Gợi ý cho bạn dựa trên sản phẩm này"
      variant="grid"
      sourceProductId={productId}
    />
  )
}

export default ProductSuggestions
