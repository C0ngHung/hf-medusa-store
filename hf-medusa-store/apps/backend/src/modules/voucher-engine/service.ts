import {
  InjectTransactionManager,
  MedusaContext,
  MedusaError,
  MedusaService,
} from "@medusajs/framework/utils";
import type { Context } from "@medusajs/framework/types";
import VoucherConfig from "./models/voucher-config";
import VoucherUsageLog from "./models/voucher-usage-log";
import DiscountCapConfig from "./models/discount-cap-config";
import { DEFAULT_CAP_PCT } from "./constants";
import { normalizeCode } from "../../workflows/voucher-engine/lib/normalize";

export interface UsageLogEntry {
  voucher_id: string;
  customer_id: string;
  order_id: string;
  currency_code: string;
  voucher_code: string;
  discount_type: "percentage" | "fixed_amount";
  discount_value: number;
  raw_voucher_discount: number;
  voucher_discount_after_voucher_cap: number;
  final_voucher_discount: number;
  discount_applied: number;
  original_discount: number;
  was_capped: boolean;
  cap_percentage_bps: number | null;
  original_subtotal: number;
  item_promotion_discount: number;
  applied_at: Date;
}

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
    const normalized = normalizeCode(code);
    if (!normalized) return null;
    const [voucher] = await this.listVoucherConfigs(
      { code: normalized },
      { take: 1 },
    );
    return voucher ?? null;
  }

  /**
   * VOUCH-003 — active global discount cap in basis-points (5000 = 50%).
   * Falls back to DEFAULT_CAP_PCT when no active singleton row exists.
   */
  async getActiveCap(): Promise<number> {
    const [cap] = await this.listDiscountCapConfigs(
      { is_active: true },
      { take: 1 },
    );
    return cap?.max_discount_percentage ?? DEFAULT_CAP_PCT;
  }

  /**
   * V4 — how many times this customer has already redeemed this voucher.
   * Counts the append-only usage log (INT-04).
   */
  async countUserUsage(voucherId: string, customerId: string): Promise<number> {
    const [, count] = await this.listAndCountVoucherUsageLogs({
      voucher_id: voucherId,
      customer_id: customerId,
    });
    return count;
  }

  /**
   * §14.3 / INT-02/INT-04 — atomic redemption: conditional `usage_count += 1`
   * (only when the voucher still has capacity) AND the immutable
   * `VoucherUsageLog` insert (full §5.2 audit snapshot, Decision D), in ONE
   * DB transaction, so the counter and the audit row commit together.
   *
   * Uses `manager.getKnex()`/`getTransactionContext()` for a raw conditional
   * `UPDATE ... WHERE usage_limit IS NULL OR usage_count < usage_limit` — the
   * generated `update*` helpers do a naive read-then-write and would race
   * under concurrent successful orders (SRS INT-02 "must not read→check→
   * increment later"). `@InjectTransactionManager` opens the transaction and
   * threads it through both operations (verified pattern — mirrors
   * `@medusajs/promotion`'s `registerUsage`).
   *
   * Returns `{ incremented: false }` when capacity is exhausted (0 rows
   * affected) — the caller must NOT have already committed a log for this
   * case (checked by `incremented` before proceeding, not after).
   */
  @InjectTransactionManager()
  async redeemVoucherAtomic(
    voucherId: string,
    logEntry: UsageLogEntry,
    @MedusaContext() sharedContext: Context = {},
  ): Promise<{ incremented: boolean; usage_log_id?: string }> {
    const manager = sharedContext.transactionManager as any;
    if (!manager) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "redeemVoucherAtomic requires a transaction manager",
      );
    }
    const knex = manager.getTransactionContext?.() ?? manager.getKnex();

    const affected: number = await knex("voucher_config")
      .where({ id: voucherId, deleted_at: null })
      .andWhere((qb: any) =>
        qb.whereNull("usage_limit").orWhereRaw("usage_count < usage_limit"),
      )
      .update({ usage_count: knex.raw("usage_count + 1") });

    if (affected === 0) {
      return { incremented: false };
    }

    const [log] = await this.createVoucherUsageLogs([logEntry], sharedContext);
    return { incremented: true, usage_log_id: log.id };
  }
}

export default VoucherEngineService;
