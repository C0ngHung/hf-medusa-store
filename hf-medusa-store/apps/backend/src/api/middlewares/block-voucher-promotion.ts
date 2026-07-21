import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

/**
 * Guardrail (spec §5): voucher là promotion code thật. Khách có thể gửi code đó
 * vào route native POST /store/carts/:id/promotions → Medusa attach thẳng, né
 * V1–V8/cap/rate-limit và tái hiện bug Rule 11. Chặn: code thuộc promotion có
 * metadata.voucher_engine=true → 422 (canonical ErrorEnvelope), buộc dùng ô
 * voucher (POST .../voucher).
 */
export async function blockVoucherPromotionMiddleware(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction,
) {
  const codes: string[] = Array.isArray((req.body as any)?.promo_codes)
    ? (req.body as any).promo_codes
    : [];
  if (codes.length === 0) return next();

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data: promos = [] } = await query.graph({
    entity: "promotion",
    filters: { code: codes },
    fields: ["code", "metadata"],
  });
  const offending = promos.find(
    (p: any) => p?.metadata?.voucher_engine === true,
  );
  if (offending) {
    // Same `ErrorEnvelope` shape every other VoucherEngine error uses
    // (`lib/errors.ts`) — `customer_message` (VI, verbatim to the FE) is the
    // field the storefront's generic error handling reads; `message` (EN) is
    // for logs only. This response bypasses `toErrorEnvelope` (it's a
    // middleware short-circuit, not a workflow error, same as
    // voucher-rate-limit.ts), so the shape is kept in sync with it by hand.
    // 422 (not 400) matches the V1–V8 client-input-policy-violation family.
    return res.status(422).json({
      type: "invalid_data",
      code: "VOUCHER_CODE_NOT_A_PROMOTION",
      message: "voucher code sent to native cart-promotions route",
      customer_message: "Mã này là voucher — vui lòng nhập ở ô mã voucher.",
    });
  }
  return next();
}

export default blockVoucherPromotionMiddleware;
