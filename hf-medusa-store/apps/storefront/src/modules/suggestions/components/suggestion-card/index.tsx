"use client"

import { CheckCircleSolid, Plus, XMarkMini } from "@medusajs/icons"
import {
  Badge,
  Button,
  IconButton,
  Text,
  clx,
} from "@modules/common/components/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Thumbnail from "@modules/products/components/thumbnail"
import { convertToLocale } from "@lib/util/money"
import { SuggestionItem } from "@modules/suggestions/types"
import { useState } from "react"

type SuggestionCardProps = {
  item: SuggestionItem
  currencyCode: string
  variant?: "grid" | "compact"
  /** One-tap add (4.4.3): resolves `true` once in cart, `false` on failure (4.4.3b). */
  onAdd: (item: SuggestionItem) => Promise<boolean>
  /** Dismiss (4.4.4): called after the fade-out animation completes. */
  onDismiss: (item: SuggestionItem) => void
}

const DISMISS_ANIM_MS = 300
const ADDED_STATE_MS = 3000 // "Added" confirmation window (4.4.3)

/**
 * A single suggested-product card (tasks 4.4.2/4.4.3/4.4.4/4.4.6). Shows the six
 * display fields (image, name, price, discount_price, label/badge), a one-tap
 * add with a 3s "Added" state, and a dismiss control that fades + collapses the
 * card before removing it. Presentational only — add/dismiss side effects and
 * the toast live in the parent carousel.
 */
const SuggestionCard = ({
  item,
  currencyCode,
  variant = "grid",
  onAdd,
  onDismiss,
}: SuggestionCardProps) => {
  const [isAdding, setIsAdding] = useState(false)
  const [isAdded, setIsAdded] = useState(false)
  const [isDismissing, setIsDismissing] = useState(false)

  const compact = variant === "compact"
  const hasDiscount =
    item.discount_price != null &&
    item.price != null &&
    item.discount_price < item.price
  const displayPrice = item.discount_price ?? item.price

  // Only a resolvable default variant supports one-tap add; otherwise send the
  // shopper to the PDP to pick a variant (compact variant-selector, 2.3.8).
  const canQuickAdd =
    !!item.variant_id && item.in_stock && !item.requires_variant_selection
  const productHref = item.handle ? `/products/${item.handle}` : null

  const handleAdd = async () => {
    if (!canQuickAdd || isAdding) return
    setIsAdding(true)
    try {
      // On failure the parent shows an error toast (4.4.3b); the button simply
      // reverts to idle here — no "Added" confirmation.
      const ok = await onAdd(item)
      if (ok) {
        setIsAdded(true)
        setTimeout(() => setIsAdded(false), ADDED_STATE_MS)
      }
    } finally {
      setIsAdding(false)
    }
  }

  const handleDismiss = () => {
    if (isDismissing) return
    setIsDismissing(true)
    // Let the fade/collapse play, then ask the parent to remove + track.
    setTimeout(() => onDismiss(item), DISMISS_ANIM_MS)
  }

  const image = (
    <Thumbnail thumbnail={item.image_url} size="square" className="w-full" />
  )
  const name = (
    <Text className="line-clamp-2 text-sm font-medium text-ui-fg-base">
      {item.name}
    </Text>
  )

  return (
    <div
      className={clx(
        "relative flex shrink-0 flex-col rounded-lg border border-gray-100 bg-white p-3 transition-all duration-300 ease-out",
        compact ? "w-56" : "w-44",
        isDismissing && "-translate-y-1 scale-95 opacity-0",
      )}
      data-testid="suggestion-card"
      data-product-id={item.product_id}
    >
      {/* Dismiss (4.4.4) */}
      <IconButton
        onClick={handleDismiss}
        aria-label="Bỏ qua gợi ý"
        className="absolute right-1 top-1 z-10 bg-white/80 p-1 backdrop-blur"
        data-testid="suggestion-dismiss"
      >
        <XMarkMini className="text-ui-fg-subtle" />
      </IconButton>

      {/* CR-02 nudge badge (4.4.6) */}
      {item.badge_text && (
        <Badge
          color="green"
          className="absolute left-1 top-1 z-10"
          data-testid="suggestion-badge"
        >
          {item.badge_text}
        </Badge>
      )}

      {/* Image + name link to the PDP (tap navigation) */}
      {productHref ? (
        <LocalizedClientLink href={productHref} className="flex flex-col gap-2">
          {image}
          {name}
        </LocalizedClientLink>
      ) : (
        <div className="flex flex-col gap-2">
          {image}
          {name}
        </div>
      )}

      {/* Product-level custom label (4.4.2) */}
      {item.label && !item.badge_text && (
        <Text className="mt-1 text-xs text-ui-fg-subtle">{item.label}</Text>
      )}

      {/* Price / discount_price (4.4.2) */}
      <div className="mt-2 flex items-baseline gap-2">
        {displayPrice != null && (
          <Text
            className={clx(
              "text-sm font-semibold",
              hasDiscount ? "text-red-600" : "text-ui-fg-base",
            )}
          >
            {convertToLocale({
              amount: displayPrice,
              currency_code: currencyCode,
            })}
          </Text>
        )}
        {hasDiscount && (
          <Text className="text-xs text-ui-fg-muted line-through">
            {convertToLocale({
              amount: item.price!,
              currency_code: currencyCode,
            })}
          </Text>
        )}
      </div>

      {/* One-tap add (4.4.3) — or a PDP link when a variant must be chosen */}
      <div className="mt-3">
        {canQuickAdd ? (
          <Button
            onClick={handleAdd}
            isLoading={isAdding}
            variant={isAdded ? "secondary" : "primary"}
            size="small"
            className="w-full"
            data-testid="suggestion-add"
          >
            {isAdded ? (
              <>
                <CheckCircleSolid className="text-green-600" /> Đã thêm
              </>
            ) : (
              <>
                <Plus /> Thêm
              </>
            )}
          </Button>
        ) : productHref ? (
          // Styled as a link (not a <button> in an <a>) to keep DOM nesting valid.
          <LocalizedClientLink
            href={productHref}
            className="inline-flex h-8 w-full items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-sm font-medium text-black transition-colors hover:bg-gray-50"
          >
            Chọn phân loại
          </LocalizedClientLink>
        ) : null}
      </div>
    </div>
  )
}

export default SuggestionCard
