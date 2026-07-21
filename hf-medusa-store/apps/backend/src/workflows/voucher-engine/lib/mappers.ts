/**
 * Pure mappers bridging the persisted `VoucherConfig` row and the authoritative
 * `CartContext` (steps/load-cart-context.ts) into the two independent pure layers
 * that were built without a shared DTO: the V1-V8 validation chain (lib/types.ts
 * `VoucherSnapshot`/`CartSnapshot`) and the discount calculator
 * (modules/voucher-engine/lib/calculate-discount.ts `VoucherScope`).
 *
 * This is the task 3.3.5 / Phase-3-item-4/5 wiring: without these mappers the
 * persisted `applicable_product_ids`/`applicable_category_ids` scope never reaches
 * `resolveEligibleItems`, and the DB-backed voucher/cart reads never reach
 * `validateVoucher` — both pure functions were unit-tested in isolation but never
 * connected to real data.
 */
import type { VoucherScope } from "../../../modules/voucher-engine/lib/calculate-discount";
import type { CartContext } from "../steps/load-cart-context";
import type { CartSnapshot, VoucherSnapshot } from "./types";

/**
 * The subset of `voucher_config` fields the workflow layer reads, typed as plain
 * data (decoupled from `VoucherEngineService`'s generated MedusaService types).
 */
export interface PersistedVoucherConfig {
  id: string;
  /** Links to the canonical Promotion (Decision C / Rebuild Phase 1 `defineLink`) — null for a voucher never linked to one. Used by `lookupVoucherStep`'s Promotion-authoritative field overlay. */
  promotion_id?: string | null;
  code: string;
  discount_type: "percentage" | "fixed_amount";
  discount_value: number;
  min_order_value: number | null;
  max_discount_amount: number | null;
  applicable_product_ids: string[] | null;
  applicable_category_ids: string[] | null;
  per_user_limit: number;
  usage_limit: number | null;
  usage_count: number;
  user_segment_conditions: Record<string, unknown> | null;
  valid_from: Date;
  valid_to: Date;
  is_active: boolean;
}

/** V6 scope (task 3.3.5): both arrays null/empty on the persisted row -> unscoped. */
export function toVoucherScope(
  voucher: Pick<
    PersistedVoucherConfig,
    "applicable_product_ids" | "applicable_category_ids"
  >,
): VoucherScope {
  return {
    product_ids: voucher.applicable_product_ids ?? [],
    category_ids: voucher.applicable_category_ids ?? [],
  };
}

/**
 * Maps the persisted voucher row to the V1-V8 chain's plain-data snapshot.
 *
 * `valid_from`/`valid_to` are normalized via `new Date(...)` even though
 * `PersistedVoucherConfig` types them as `Date` — verified empirically
 * (integration test against the real DB) that MikroORM's `dateTime` fields
 * come back as ISO strings at runtime through `VoucherEngineService`'s
 * generated read methods, not `Date` instances. `new Date(dateInstance)` is
 * also a safe no-op, so this normalizes both shapes.
 */
export function toVoucherSnapshot(
  voucher: PersistedVoucherConfig,
): VoucherSnapshot {
  return {
    code: voucher.code,
    is_active: voucher.is_active,
    valid_from: new Date(voucher.valid_from),
    valid_to: new Date(voucher.valid_to),
    usage_limit: voucher.usage_limit,
    usage_count: voucher.usage_count,
    per_user_limit: voucher.per_user_limit,
    min_order_value: voucher.min_order_value,
    applicable_product_ids: voucher.applicable_product_ids,
    applicable_category_ids: voucher.applicable_category_ids,
    user_segment_conditions: voucher.user_segment_conditions,
  };
}

/**
 * Maps the authoritative `CartContext` (real Cart read, task 3.3.2/3.8.4) to the
 * V1-V8 chain's `CartSnapshot` — V5 reads `original_subtotal` (decision D3, the
 * PRE-promotion subtotal), V6 reads `items[].product_id`/`category_ids`, V8 reads
 * `has_item_promotion`.
 */
export function toCartSnapshot(cart: CartContext): CartSnapshot {
  return {
    original_subtotal: cart.original_subtotal,
    items: cart.lines.map((line) => ({
      product_id: line.product_id ?? "",
      category_ids: line.category_ids ?? [],
      quantity: line.quantity,
      unit_price: line.unit_price,
    })),
    has_item_promotion: cart.item_promotion_discount > 0,
  };
}
