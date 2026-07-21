/**
 * loadCustomerSegmentStep — thin I/O wrapper resolving the current customer's
 * native Medusa Customer Group membership for V7 (SPEC Decision J).
 *
 * See `lib/customer-segment.ts` for why native Customer Groups are the
 * approved source (no CRM model exists in this codebase).
 */
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { resolveCustomerSegment } from "../lib/customer-segment";
import type { CustomerSegmentSnapshot } from "../lib/types";

export const loadCustomerSegmentStepId = "load-customer-segment";

export interface LoadCustomerSegmentInput {
  /** Server-side auth context value — never client-supplied. Empty/null for guests. */
  customer_id: string | null;
}

export const loadCustomerSegmentStep = createStep(
  loadCustomerSegmentStepId,
  async (input: LoadCustomerSegmentInput, { container }) => {
    const segment = await resolveCustomerSegment(container, input.customer_id);
    return new StepResponse(segment as CustomerSegmentSnapshot);
  },
  // Read-only step — no compensation.
);
