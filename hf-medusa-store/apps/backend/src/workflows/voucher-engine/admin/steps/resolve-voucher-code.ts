import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { normalizeCode } from "../../lib/normalize";
import { generateVoucherCode } from "../../lib/gen-code";

/**
 * resolveVoucherCodeStep — decides the voucher's final canonical code ONCE, up
 * front (SEC-03). Auto-generates when the admin omits it, then normalizes to
 * UPPERCASE. Lives in a STEP (not a `transform`) on purpose: `generateVoucherCode`
 * uses randomness, and a `transform` re-executes on workflow replay/retry, which
 * would produce a DIFFERENT code the second time; a step's output is memoized, so
 * the same code is reused for BOTH the backing Promotion and the voucher_config
 * row (they must match).
 */
export const resolveVoucherCodeStep = createStep(
  "resolve-voucher-code",
  async (input: { code?: string | null }) => {
    const code = normalizeCode(input.code || generateVoucherCode());
    return new StepResponse({ code });
  },
);
