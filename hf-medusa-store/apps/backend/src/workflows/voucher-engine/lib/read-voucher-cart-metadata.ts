/**
 * readVoucherCartMetadata — shared `cart.metadata.voucher` read (Decision G,
 * §14.2-B), factored out of `steps/check-active-voucher.ts`,
 * `steps/assert-active-voucher.ts`, and `steps/check-voucher-exists.ts` (all
 * three previously re-implemented this exact `query.graph` read). Each step
 * keeps its own extra logic (the replace-confirmation throw, the
 * `has_voucher` boolean) at the call site — this helper only does the read.
 */
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import {
  VOUCHER_METADATA_KEY,
  VoucherCartMetadata,
} from "./ephemeral-promotion";

export interface VoucherCartMetadataRead {
  active: VoucherCartMetadata | null;
  previous_metadata: Record<string, unknown> | null;
}

export async function readVoucherCartMetadata(
  container: MedusaContainer,
  cart_id: string,
): Promise<VoucherCartMetadataRead> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const { data } = await query.graph({
    entity: "cart",
    filters: { id: cart_id },
    fields: ["id", "metadata"],
  });

  const cart = data?.[0] as { metadata?: Record<string, unknown> } | undefined;
  const active = (cart?.metadata?.[VOUCHER_METADATA_KEY] ??
    null) as VoucherCartMetadata | null;

  return {
    active,
    previous_metadata: cart?.metadata ?? null,
  };
}
