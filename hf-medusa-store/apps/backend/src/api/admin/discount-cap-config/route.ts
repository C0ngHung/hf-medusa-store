import {
  AuthenticatedMedusaRequest,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { VOUCHER_ENGINE_MODULE } from "../../../modules/voucher-engine";
import { DEFAULT_CAP_PCT } from "../../../modules/voucher-engine/constants";
import { UpsertDiscountCapConfigBody } from "./validators";

/** Fallback identity when the admin auth context carries no actor id. */
const UPDATED_BY_FALLBACK = "system";

interface DiscountCapConfigRow {
  id: string;
  max_discount_percentage: number;
  is_active: boolean;
  updated_at?: Date | string | null;
  updated_by?: string | null;
}

/**
 * Shared response shape for GET/POST (SRS §5.2). When no active row exists,
 * a synthetic default is returned (`id: null`, `DEFAULT_CAP_PCT`,
 * `is_active: true` — this is the cap value actually in force per
 * `VoucherEngineService.getActiveCap()`'s own fallback, so reporting it as
 * active here is accurate, not just a placeholder) rather than 404 — there is
 * always an effective cap, persisted or not.
 */
function formatDiscountCapConfig(cap: DiscountCapConfigRow | null) {
  if (!cap) {
    return {
      id: null,
      max_discount_percentage: DEFAULT_CAP_PCT,
      is_active: true,
      updated_at: null,
      updated_by: null,
    };
  }
  return {
    id: cap.id,
    max_discount_percentage: cap.max_discount_percentage,
    is_active: cap.is_active,
    updated_at: cap.updated_at ? new Date(cap.updated_at).toISOString() : null,
    updated_by: cap.updated_by ?? null,
  };
}

/** GET /admin/discount-cap-config — the active singleton, or the default. */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const service: any = req.scope.resolve(VOUCHER_ENGINE_MODULE);
  const [cap] = await service.listDiscountCapConfigs(
    { is_active: true },
    { take: 1 },
  );
  res.json({ discount_cap_config: formatDiscountCapConfig(cap ?? null) });
};

/**
 * POST /admin/discount-cap-config — upsert the single active row (SRS §5.2:
 * "single active record, history tracked via updated_at"). Updates the
 * existing active row if one exists; creates it only when none does — never
 * creates a second active row (mirrors the crash-safety pattern already used
 * by `backfill-voucher-promotions.ts`: look up the existing row before
 * deciding to create).
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<UpsertDiscountCapConfigBody>,
  res: MedusaResponse,
) => {
  const service: any = req.scope.resolve(VOUCHER_ENGINE_MODULE);
  const updated_by = req.auth_context.actor_id ?? UPDATED_BY_FALLBACK;

  const [existing] = await service.listDiscountCapConfigs(
    { is_active: true },
    { take: 1 },
  );

  const cap = existing
    ? await service.updateDiscountCapConfigs({
        id: existing.id,
        max_discount_percentage: req.validatedBody.max_discount_percentage,
        updated_by,
      })
    : await service.createDiscountCapConfigs({
        max_discount_percentage: req.validatedBody.max_discount_percentage,
        is_active: true,
        updated_by,
      });

  res.json({ discount_cap_config: formatDiscountCapConfig(cap) });
};
