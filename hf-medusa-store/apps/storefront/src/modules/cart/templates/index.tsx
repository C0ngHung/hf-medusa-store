import ItemsTemplate from "./items"
import Summary from "./summary"
import EmptyCartMessage from "../components/empty-cart-message"
import SignInPrompt from "../components/sign-in-prompt"
import Divider from "@modules/common/components/divider"
import CartSuggestions from "@modules/suggestions/templates/cart-suggestions"
import SuggestionsSkeleton from "@modules/suggestions/components/suggestions-skeleton"
import { HttpTypes } from "@medusajs/types"
import { Suspense } from "react"

const CartTemplate = ({
  cart,
  customer,
  countryCode,
}: {
  cart: HttpTypes.StoreCart | null
  customer: HttpTypes.StoreCustomer | null
  countryCode: string
}) => {
  return (
    <div className="py-12">
      <div className="content-container" data-testid="cart-container">
        {cart?.items?.length ? (
          <div className="grid grid-cols-1 small:grid-cols-[1fr_360px] gap-x-40">
            <div className="flex flex-col bg-white py-6 gap-y-6">
              {!customer && (
                <>
                  <SignInPrompt />
                  <Divider />
                </>
              )}
              <ItemsTemplate cart={cart} />
              {/* 4.4.5 — "Bạn có thể cần thêm" (SUGG-004). Suspense streams the
                  compact skeleton (4.4.7) while the list resolves; the section
                  re-fetches on every cart render, giving auto-refresh (4.4.9). */}
              <Suspense fallback={<SuggestionsSkeleton variant="compact" />}>
                <CartSuggestions
                  cartId={cart.id}
                  countryCode={countryCode}
                  currencyCode={cart.currency_code}
                />
              </Suspense>
            </div>
            <div className="relative">
              <div className="flex flex-col gap-y-8 sticky top-12">
                {cart && cart.region && (
                  <>
                    <div className="bg-white py-6">
                      <Summary cart={cart} />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div>
            <EmptyCartMessage />
          </div>
        )}
      </div>
    </div>
  )
}

export default CartTemplate
