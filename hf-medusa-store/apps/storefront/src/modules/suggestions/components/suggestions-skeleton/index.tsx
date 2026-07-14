import repeat from "@lib/util/repeat"
import { clx } from "@modules/common/components/ui"

/**
 * Skeleton loader for a suggestion row (task 4.4.7). Rendered as the Suspense
 * fallback while a suggestion section fetches — most visible on the cart page,
 * where the list re-fetches every time the cart changes (async, 2.7.5 / 4.4.9).
 */
const SuggestionsSkeleton = ({
  variant = "grid",
  count = 3,
}: {
  variant?: "grid" | "compact"
  count?: number
}) => {
  const compact = variant === "compact"

  return (
    <div className="w-full animate-pulse" data-testid="suggestions-skeleton">
      <div className="mb-4 h-6 w-56 rounded bg-gray-100" />
      <div className="flex gap-4 overflow-hidden">
        {repeat(count).map((i) => (
          <div
            key={i}
            className={clx(
              "shrink-0 rounded-lg border border-gray-100 p-3",
              compact ? "w-56" : "w-44",
            )}
          >
            <div
              className={clx(
                "mb-3 w-full rounded bg-gray-100",
                compact ? "h-24" : "h-40",
              )}
            />
            <div className="mb-2 h-4 w-full rounded bg-gray-100" />
            <div className="mb-3 h-4 w-2/3 rounded bg-gray-100" />
            <div className="h-8 w-full rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default SuggestionsSkeleton
