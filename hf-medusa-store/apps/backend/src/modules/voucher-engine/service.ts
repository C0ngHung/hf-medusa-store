import { MedusaService } from '@medusajs/framework/utils'
import VoucherConfig from './models/voucher-config'
import VoucherUsageLog from './models/voucher-usage-log'
import DiscountCapConfig from './models/discount-cap-config'
import { DEFAULT_CAP_PCT } from './constants'
import { normalizeCode } from '../../workflows/voucher-engine/lib/normalize'

/**
 * VoucherEngineService — SRS §5.2, §5.3.
 * MedusaService auto-generates CRUD (list/retrieve/create/update/delete +
 * soft-delete) for every model below. Day 2 layers thin READ helpers on top;
 * the V1–V8 validation chain (Day 3) and stacking/cap (Day 4) build on these.
 */
class VoucherEngineService extends MedusaService({
  VoucherConfig,
  VoucherUsageLog,
  DiscountCapConfig,
}) {
  /**
   * V1 — look up a voucher by code. Codes are stored UPPERCASE/trimmed, so we
   * normalize the input the same way before matching. Returns the single row or
   * null (no throw — the validation chain decides the error message).
   */
  async findByCode(code: string) {
    const normalized = normalizeCode(code)
    if (!normalized) return null
    const [voucher] = await this.listVoucherConfigs(
      { code: normalized },
      { take: 1 },
    )
    return voucher ?? null
  }

  /**
   * VOUCH-003 — active global discount cap in basis-points (5000 = 50%).
   * Falls back to DEFAULT_CAP_PCT when no active singleton row exists.
   */
  async getActiveCap(): Promise<number> {
    const [cap] = await this.listDiscountCapConfigs(
      { is_active: true },
      { take: 1 },
    )
    return cap?.max_discount_percentage ?? DEFAULT_CAP_PCT
  }

  /**
   * V4 — how many times this customer has already redeemed this voucher.
   * Counts the append-only usage log (INT-04).
   */
  async countUserUsage(voucherId: string, customerId: string): Promise<number> {
    const [, count] = await this.listAndCountVoucherUsageLogs({
      voucher_id: voucherId,
      customer_id: customerId,
    })
    return count
  }

  /**
   * INT-04 — append a redemption to the immutable usage log. Called only from
   * the order.placed usage workflow (Day 4/5); made atomic/idempotent there.
   */
  async recordUsage(entry: {
    voucher_id: string
    customer_id: string
    order_id: string
    discount_applied: number
    was_capped: boolean
    original_discount: number
    applied_at: Date
  }) {
    return this.createVoucherUsageLogs(entry)
  }
}

export default VoucherEngineService
