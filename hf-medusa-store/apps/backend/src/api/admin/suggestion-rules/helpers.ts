import { MedusaContainer } from '@medusajs/framework/types'

/**
 * Cache-invalidation hook for suggestion rules.
 *
 * Day 2: interface only — logs intent. Day 3 wires the real Redis invalidation
 * together with Sơn's cache adapter (keys `product:{id}:suggestions`,
 * `cart:{id}:suggestions`, SRS §7.1 step 7 / SUGG-005).
 */
export async function invalidateSuggestionCache(
  scope: MedusaContainer,
  ruleId: string
): Promise<void> {
  const logger = scope.resolve('logger')
  // TODO(Day 3, with Sơn): resolve cacheService and delete affected
  // product:{id}:suggestions / cart:{id}:suggestions keys for this rule.
  logger.debug(`[suggestive] cache invalidation requested for rule ${ruleId} (no-op until Day 3)`)
}
