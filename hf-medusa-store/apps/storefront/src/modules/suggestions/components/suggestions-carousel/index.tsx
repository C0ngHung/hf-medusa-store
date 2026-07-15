"use client"

import {
  addSuggestedItem,
  trackSuggestionEvents,
  undoSuggestedItem,
} from "@lib/data/suggestions"
import { convertToLocale } from "@lib/util/money"
import {
  ArrowUturnLeft,
  ChevronLeftMini,
  ChevronRightMini,
  XCircleSolid,
} from "@medusajs/icons"
import {
  Button,
  Heading,
  IconButton,
  Text,
  clx,
} from "@modules/common/components/ui"
import {
  SuggestionContext,
  SuggestionEventInput,
  SuggestionItem,
  ThresholdInfo,
} from "@modules/suggestions/types"
import { useCallback, useEffect, useRef, useState } from "react"
import SuggestionCard from "../suggestion-card"

type SuggestionsCarouselProps = {
  initialItems: SuggestionItem[]
  context: SuggestionContext
  countryCode: string
  currencyCode: string
  heading: string
  subheading?: string
  variant?: "grid" | "compact"
  sourceProductId?: string | null
  threshold?: ThresholdInfo | null
}

const TOAST_MS = 3000 // Undo / error window (4.4.3 / 4.4.3b)
const IMPRESSION_FLUSH_MS = 400 // debounce so cards visible together batch into one POST (4.4.10)

/** Success carries the variant for Undo; error is informational only (4.4.3b). */
type Toast =
  | { type: "success"; name: string; lineItemId: string | null }
  | { type: "error"; name: string }

/**
 * Client shell for a suggestion row (tasks 4.4.1/4.4.3/4.4.4/4.4.8/4.4.9-consumer).
 * Owns the mutable item list (dismiss removes a card), the add-to-cart Undo /
 * error toast, desktop scroll arrows, and the analytics events for add/dismiss.
 * When the list empties (all dismissed) it renders nothing, so the section
 * disappears (4.4.8).
 */
const SuggestionsCarousel = ({
  initialItems,
  context,
  countryCode,
  currencyCode,
  heading,
  subheading,
  variant = "grid",
  sourceProductId = null,
  threshold,
}: SuggestionsCarouselProps) => {
  const [items, setItems] = useState<SuggestionItem[]>(initialItems)
  const [toast, setToast] = useState<Toast | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep local list in sync when the server re-fetches (cart auto-refresh, 4.4.9).
  useEffect(() => setItems(initialItems), [initialItems])
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
    },
    [],
  )

  const showToast = (t: Toast) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(t)
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS)
  }

  // One-tap add (4.4.3). Returns false on failure so the card reverts its button
  // and skips the "Added" state; the error is surfaced as a red toast (4.4.3b).
  const handleAdd = async (item: SuggestionItem): Promise<boolean> => {
    if (!item.variant_id) return false
    let lineItemId: string | null = null
    try {
      // Attributed one-tap add (SUGG-003): the endpoint persists attribution onto
      // the line item + emits the authoritative add_to_cart event server-side
      // (2.6.10), so we do NOT track it client-side here (would double-count).
      const res = await addSuggestedItem({
        productId: item.product_id,
        variantId: item.variant_id,
        countryCode,
        idempotencyKey: crypto.randomUUID(),
        attribution: {
          rule_id: item.rule_id,
          source_context: context,
          source_product_id: sourceProductId,
        },
      })
      lineItemId = res.lineItemId
    } catch {
      // 409 stock / 422 attribution·variant·inactive → error toast (4.4.3b).
      showToast({ type: "error", name: item.name })
      return false
    }
    showToast({ type: "success", name: item.name, lineItemId })
    return true
  }

  const handleUndo = async () => {
    if (toast?.type !== "success" || !toast.lineItemId) return
    const { lineItemId } = toast
    setToast(null)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    // Undo by the exact line item the add returned (avoids hitting a different
    // line of the same variant, SF-04).
    await undoSuggestedItem({ lineId: lineItemId })
  }

  const handleDismiss = (item: SuggestionItem) => {
    setItems((prev) => prev.filter((i) => i.product_id !== item.product_id))
    void trackSuggestionEvents([
      {
        action: "dismiss",
        source_context: context,
        suggested_product_id: item.product_id,
        rule_id: item.rule_id,
        source_product_id: sourceProductId,
        tier: item.tier,
      },
    ])
  }

  // Full client payload for the four actions (4.4.14); customer_id is server-side.
  const buildEvent = useCallback(
    (
      action: SuggestionEventInput["action"],
      item: SuggestionItem,
      slot: number,
    ): SuggestionEventInput => ({
      action,
      source_context: context,
      suggested_product_id: item.product_id,
      rule_id: item.rule_id,
      source_product_id: sourceProductId,
      tier: item.tier,
      slot: slot || null,
    }),
    [context, sourceProductId],
  )

  // Impression tracking (4.4.10). Cards fire as they cross the 50%/dwell gate; we
  // buffer and debounce-flush so a screenful that appears at once posts as ONE
  // batch (endpoint accepts ≤10/batch). Stable identity → card observers don't
  // re-subscribe each render.
  const impressionBuffer = useRef<SuggestionEventInput[]>([])
  const impressionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flushImpressions = useCallback(() => {
    impressionTimer.current = null
    const batch = impressionBuffer.current
    if (!batch.length) return
    impressionBuffer.current = []
    void trackSuggestionEvents(batch)
  }, [])

  const handleImpression = useCallback(
    (item: SuggestionItem, slot: number) => {
      impressionBuffer.current.push(buildEvent("impression", item, slot))
      if (!impressionTimer.current) {
        impressionTimer.current = setTimeout(
          flushImpressions,
          IMPRESSION_FLUSH_MS,
        )
      }
    },
    [buildEvent, flushImpressions],
  )

  // Tap (4.4.11) — fire immediately (navigation follows); fire-and-forget.
  const handleTap = useCallback(
    (item: SuggestionItem, slot: number) => {
      void trackSuggestionEvents([buildEvent("tap", item, slot)])
    },
    [buildEvent],
  )

  // Flush any buffered impressions on unmount so they aren't lost.
  useEffect(
    () => () => {
      if (impressionTimer.current) {
        clearTimeout(impressionTimer.current)
        flushImpressions()
      }
    },
    [flushImpressions],
  )

  // ── Horizontal scroll: native touch-swipe on mobile, arrow buttons on desktop
  //    (point 3). Edge state hides an arrow when there is nothing more that way. ──
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({
    overflow: false,
    atStart: true,
    atEnd: false,
  })

  const syncEdges = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    const overflow = el.scrollWidth > el.clientWidth + 1
    setEdges({
      overflow,
      atStart: el.scrollLeft <= 1,
      atEnd: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1,
    })
  }, [])

  useEffect(() => {
    syncEdges()
    const el = scrollerRef.current
    if (!el) return
    const ro = new ResizeObserver(syncEdges)
    ro.observe(el)
    return () => ro.disconnect()
  }, [syncEdges, items])

  const scrollByCards = (dir: 1 | -1) => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollBy({
      left: dir * Math.round(el.clientWidth * 0.9),
      behavior: "smooth",
    })
  }

  // 4.4.8 — hide the entire section once nothing is left to show.
  if (!items.length) return null

  return (
    <div className="w-full" data-testid={`suggestions-${context}`}>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Heading level="h3" className="text-lg">
            {heading}
          </Heading>
          {threshold && threshold.remaining > 0 ? (
            <Text className="text-sm text-ui-fg-subtle">
              Thêm{" "}
              <span className="font-semibold text-green-600">
                {convertToLocale({
                  amount: threshold.remaining,
                  currency_code: currencyCode,
                })}
              </span>{" "}
              nữa để được miễn phí vận chuyển 🚚
            </Text>
          ) : (
            subheading && (
              <Text className="text-sm text-ui-fg-subtle">{subheading}</Text>
            )
          )}
        </div>

        {/* Desktop-only scroll arrows (hidden on touch/mobile) */}
        {edges.overflow && (
          <div className="hidden shrink-0 gap-2 small:flex">
            <IconButton
              onClick={() => scrollByCards(-1)}
              disabled={edges.atStart}
              aria-label="Cuộn trái"
              className="border border-gray-200"
            >
              <ChevronLeftMini />
            </IconButton>
            <IconButton
              onClick={() => scrollByCards(1)}
              disabled={edges.atEnd}
              aria-label="Cuộn phải"
              className="border border-gray-200"
            >
              <ChevronRightMini />
            </IconButton>
          </div>
        )}
      </div>

      <div
        ref={scrollerRef}
        onScroll={syncEdges}
        className={clx(
          "flex gap-4 overflow-x-auto scroll-smooth pb-2",
          // Native horizontal swipe on mobile without hijacking vertical page
          // scroll; contain the bounce so it doesn't chain to the page (point 3).
          "snap-x snap-mandatory overscroll-x-contain [scrollbar-width:thin]",
        )}
      >
        {items.map((item, index) => (
          <div key={item.product_id} className="snap-start h-full">
            <SuggestionCard
              item={item}
              currencyCode={currencyCode}
              variant={variant}
              slot={index + 1}
              onAdd={handleAdd}
              onDismiss={handleDismiss}
              onImpression={handleImpression}
              onTap={handleTap}
            />
          </div>
        ))}
      </div>

      {/* One-tap-add toast: success → Undo (4.4.3); failure → red error (4.4.3b) */}
      {toast && (
        <div
          className={clx(
            "fixed bottom-6 right-6 z-50 flex items-center gap-4 rounded-lg px-4 py-3 text-white shadow-lg",
            toast.type === "error" ? "bg-red-600" : "bg-black",
          )}
          data-testid="suggestion-toast"
          data-toast-type={toast.type}
          role="status"
        >
          {toast.type === "success" ? (
            <>
              <Text className="text-sm text-white">
                Đã thêm <span className="font-semibold">{toast.name}</span> vào
                giỏ
              </Text>
              <Button
                variant="transparent"
                size="small"
                onClick={handleUndo}
                className="text-white hover:bg-white/10"
                data-testid="suggestion-undo"
              >
                <ArrowUturnLeft /> Hoàn tác
              </Button>
            </>
          ) : (
            <Text className="flex items-center gap-2 text-sm text-white">
              <XCircleSolid />
              Không thể thêm <span className="font-semibold">
                {toast.name}
              </span>{" "}
              vào giỏ. Vui lòng thử lại.
            </Text>
          )}
        </div>
      )}
    </div>
  )
}

export default SuggestionsCarousel
