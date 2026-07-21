/**
 * resolveCustomerSegment — the approved source for V7 segment validation AND
 * "My Vouchers" filtering (SPEC Decision J; rebuild-decisions.md Decision 8/9).
 *
 * This codebase has no CRM/customer-assignment data model (verified: no
 * `customer_group`/`CustomerGroup` usage, no `customer.metadata` usage, no
 * campaign-assignment table anywhere prior to this change). Medusa's NATIVE
 * Customer Group module already exists and is queryable — `groups` is an
 * allowed relation on the `customer` entity (verified against installed
 * `@medusajs/medusa` 2.16.0, `dist/api/admin/customers/query-config.js`) — so
 * this project uses native Customer Groups as the segment source rather than
 * inventing a new model. `user_segment_conditions` on `VoucherConfig` is
 * therefore `{ customer_group_ids: string[] } | null`.
 *
 * `customerId` null/empty (guest, not authenticated) always resolves to no
 * groups — a configured segment condition can never pass for a guest.
 */
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { CustomerSegmentSnapshot } from "./types";

/**
 * Deliberately loose: callers pass either a workflow step's `container` or an
 * Express route's `req.scope` — both are Medusa's real container type, but
 * this helper only needs `.resolve(key)` to exist, so it accepts either
 * without importing a specific container type into this pure-ish lib file.
 */
interface ResolvableContainer {
  resolve: (key: string) => any;
}

export async function resolveCustomerSegment(
  container: ResolvableContainer,
  customerId: string | null | undefined,
): Promise<CustomerSegmentSnapshot> {
  if (!customerId) {
    return { customer_id: null, group_ids: [] };
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "customer",
    filters: { id: customerId },
    fields: ["id", "groups.id"],
  });

  const customer = data?.[0] as
    | { id: string; groups?: { id: string }[] | null }
    | undefined;

  return {
    customer_id: customer?.id ?? null,
    group_ids: (customer?.groups ?? []).map((group) => group.id),
  };
}
