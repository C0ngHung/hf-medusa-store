import type { VoucherErrorEnvelope } from "./types"

/**
 * Kept in a plain (non-`"use server"`) module deliberately: Next.js only
 * allows async function exports from a `"use server"` file, so this class
 * (used by both the `lib/data/voucher.ts` server actions that throw it and
 * the client components that catch it) cannot live there.
 */
export class VoucherApiError extends Error {
  status: number
  code: string
  customerMessage: string
  details?: Record<string, unknown>

  constructor(envelope: VoucherErrorEnvelope, status: number) {
    super(envelope.message || envelope.code)
    this.name = "VoucherApiError"
    this.status = status
    this.code = envelope.code
    this.customerMessage = envelope.customer_message
    this.details = envelope.details
  }
}
