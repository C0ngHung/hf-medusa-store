import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";
import { VOUCHER_ENGINE_MODULE } from "../../../../modules/voucher-engine";

const BPS_PER_PERCENT = 100;
// Money-critical parity with create-mode (CreateVoucherSchema, INT-01): a
// derived discount_value must still be a real discount, and a percentage
// value still can't exceed 100%. Medusa's own promotion validation only
// bounds `percentage` to (0,100] — a `fixed_amount` (Medusa type "fixed")
// promotion can have value 0 or negative, which would otherwise slip an
// unbounded voucher into attach mode.
const MAX_PERCENTAGE_BPS = 10000;

export type ResolvePromotionSnapshotStepInput = {
  promotion_id: string;
};

/**
 * Promotion shape read via `query.graph` (only the selected fields) — declared
 * locally (mirrors `hydrate-voucher-from-promotion.ts`'s `LinkedPromotionView`)
 * because `query.graph`'s generic dotted-path field selection doesn't produce a
 * precisely-typed nested object for `application_method`/`campaign`.
 */
interface QueriedPromotion {
  code?: string | null;
  application_method?: { type?: string | null; value?: number | null } | null;
  campaign?: {
    id?: string | null;
    starts_at?: Date | string | null;
    ends_at?: Date | string | null;
  } | null;
  metadata?: Record<string, unknown> | null;
}

export type PromotionSnapshot = {
  code: string;
  campaign_id: string | null;
  discount_type: "percentage" | "fixed_amount";
  discount_value: number;
  valid_from: Date;
  valid_to: Date;
  metadata: Record<string, unknown> | null;
  /** Already carries the guardrail flag — lets the workflow skip a no-op update. */
  metadata_ok: boolean;
};

/**
 * Task 4 (attach mode, SPEC Decision C/G/I) — reads the EXISTING Promotion's
 * `application_method`/`campaign` to derive the voucher's deprecated snapshot
 * columns (code, discount_type/value, valid_from/valid_to) so they are never
 * NULL at insert time; at runtime these columns are still read-through from
 * the Promotion (`hydrateVoucherFromPromotion`, Decision I) — this is only to
 * satisfy the NOT NULL columns on first write.
 *
 * Also surfaces whether `metadata.voucher_engine` is already set (`metadata_ok`)
 * so the calling workflow can skip the `updatePromotionsWorkflow` guardrail
 * write when an admin-created Promotion already carries it.
 *
 * Task 7 code-review FIX 2 (MEDIUM): also guards against a duplicate
 * voucher_config for the same `promotion_id` (see inline comment below) —
 * this is the first step the attach branch runs, i.e. strictly before
 * `createVoucherStep`.
 */
export const resolvePromotionSnapshotStep = createStep(
  "resolve-promotion-snapshot",
  async (input: ResolvePromotionSnapshotStepInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const { data: [promotion] = [] } = (await query.graph({
      entity: "promotion",
      filters: { id: input.promotion_id },
      fields: [
        "code",
        "application_method.type",
        "application_method.value",
        "campaign.id",
        "campaign.starts_at",
        "campaign.ends_at",
        "metadata",
      ],
    })) as { data: QueriedPromotion[] };

    if (!promotion) {
      // FIX 2 (code review, MEDIUM): a plain Error surfaced as an
      // unhandled 500; MedusaError NOT_FOUND maps to the correct 404.
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Promotion ${input.promotion_id} not found (voucher attach mode)`,
      );
    }

    // Task 7 code-review FIX 2 (MEDIUM, race/invariant): guard against two
    // concurrent/duplicate "Enable as voucher" calls creating two
    // voucher_config rows for the same promotion_id — the widget's
    // `GET ?promotion_id=&limit=1` would then arbitrarily show one, and the
    // other becomes an orphaned, unreachable row. Runs BEFORE
    // createVoucherStep in the attach branch (this step is the first thing
    // that branch does). `listVoucherConfigs` excludes soft-deleted rows by
    // default, so a previously-disabled voucher never blocks a re-attach.
    const voucherEngine: any = container.resolve(VOUCHER_ENGINE_MODULE);
    const [existing] = await voucherEngine.listVoucherConfigs(
      { promotion_id: input.promotion_id },
      { take: 1 },
    );
    if (existing) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `A voucher is already attached to this promotion`,
      );
    }

    const am = promotion.application_method ?? {};
    const isPercentage = am.type === "percentage";
    const value = Number(am.value ?? 0);
    const metadata =
      (promotion.metadata as Record<string, unknown> | null) ?? null;

    const discountType = isPercentage ? "percentage" : "fixed_amount";
    const discountValue = isPercentage
      ? Math.floor(value * BPS_PER_PERCENT)
      : Math.floor(value);

    // FIX 1 (code review, HIGH, money-critical): enforce the SAME sanity
    // bounds create-mode's CreateVoucherSchema enforces (INT-01). Medusa's
    // promotion validation only bounds `percentage` to (0,100]; a
    // `fixed_amount` promotion can have value 0 or negative, which would
    // otherwise derive a meaningless/negative voucher discount_value here.
    if (discountValue < 1) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Promotion ${input.promotion_id} has application_method.value ` +
          `resolving to discount_value ${discountValue}, which is < 1 ` +
          `(voucher attach mode requires a real discount).`,
      );
    }
    if (isPercentage && discountValue > MAX_PERCENTAGE_BPS) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Promotion ${input.promotion_id} has a percentage discount_value ` +
          `of ${discountValue} basis points, which exceeds the maximum of ` +
          `${MAX_PERCENTAGE_BPS} (100%) allowed for voucher attach mode.`,
      );
    }

    const snapshot: PromotionSnapshot = {
      code: promotion.code as string,
      campaign_id: (promotion.campaign?.id ?? null) as string | null,
      discount_type: discountType,
      discount_value: discountValue,
      // Deprecated snapshot columns — fall back to a wide-open window when the
      // Promotion has no Campaign, so the NOT NULL column is always satisfied.
      valid_from: promotion.campaign?.starts_at
        ? new Date(promotion.campaign.starts_at)
        : new Date(),
      valid_to: promotion.campaign?.ends_at
        ? new Date(promotion.campaign.ends_at)
        : new Date("2099-12-31T23:59:59.000Z"),
      metadata,
      metadata_ok: metadata?.voucher_engine === true,
    };

    return new StepResponse(snapshot);
  },
);
