import {
  InjectManager,
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
import { toInt } from "./lib/money";

export interface UsageAnalyticsAggregate {
  total_uses: number;
  total_discount_given: number;
  capped_count: number;
}

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
   *
   * `usageLimit` (bug-bash fix, 2026-07-21 — supersedes rebuild-decisions.md
   * Decision 3, 2026-07-20, which had this read live from the Promotion's
   * Campaign budget instead): `usage_limit` is VoucherConfig-owned
   * configuration (SPEC.md §5.4/§10/§11.4), so the caller passes the current
   * `voucher_config.usage_limit` column value, freshly re-fetched immediately
   * before this call (`steps/resolve-voucher-usage-limit.ts`) rather than
   * reused from an earlier step's output — not derived from the Promotion at
   * all. `usage_count` itself stays the one value read fresh, inside this
   * same atomic UPDATE, from the DB row — it has no native equivalent (the
   * canonical Promotion is never attached to any cart/order, so native
   * `registerUsage`/`campaign.budget.used` never see a VoucherEngine
   * redemption at all; this counter is the only authoritative usage tracking
   * VoucherEngine has).
   */
  @InjectTransactionManager()
  async redeemVoucherAtomic(
    voucherId: string,
    usageLimit: number | null,
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
      .andWhere((qb: any) => {
        if (usageLimit == null) return qb.whereRaw("1=1");
        return qb.whereRaw("usage_count < ?", [usageLimit]);
      })
      .update({ usage_count: knex.raw("usage_count + 1") });

    if (affected === 0) {
      return { incremented: false };
    }

    const [log] = await this.createVoucherUsageLogs([logEntry], sharedContext);
    return { incremented: true, usage_log_id: log.id };
  }

  /**
   * 3.4.12, SRS §6.4 — code-review Task 7.2: aggregate `voucher_usage_log` at
   * the DB layer (`COUNT`/`SUM`/`COUNT ... FILTER`) instead of
   * `listVoucherUsageLogs` fetching every row so the caller can reduce them in
   * JS. Scoped to exactly the 3 fields real rows can vary — `discount_applied`
   * and `was_capped` are `integer`/`boolean not null` columns (see the
   * migrations), so `SUM`/`COUNT` need no floor/null-guard the way the old
   * per-row JS reduce did. `avg_order_value`/`conversion_rate` are NOT
   * computed here: `voucher_usage_log` has no `order_value` column at all
   * (see the OPEN ISSUE in `workflows/voucher-engine/lib/analytics.ts`), so
   * both were always a constant 0 for every real DB-backed row before this
   * change too — the caller (`voucherAnalyticsStep`) fills them in directly.
   * Read-only, so `@InjectManager` (a fresh, non-transactional manager) is
   * enough — no `@InjectTransactionManager` needed.
   */
  @InjectManager()
  async getUsageAnalyticsAggregate(
    voucherId: string,
    @MedusaContext() sharedContext: Context = {},
  ): Promise<UsageAnalyticsAggregate> {
    const manager = sharedContext.manager as any;
    const knex = manager.getKnex();

    const row = await knex("voucher_usage_log")
      .where({ voucher_id: voucherId })
      .whereNull("deleted_at")
      .first(
        knex.raw('count(*) as "total_uses"'),
        knex.raw(
          'coalesce(sum(discount_applied), 0) as "total_discount_given"',
        ),
        knex.raw('count(*) filter (where was_capped) as "capped_count"'),
      );

    return {
      total_uses: toInt(
        row.total_uses,
        "getUsageAnalyticsAggregate.total_uses",
      ),
      total_discount_given: toInt(
        row.total_discount_given,
        "getUsageAnalyticsAggregate.total_discount_given",
      ),
      capped_count: toInt(
        row.capped_count,
        "getUsageAnalyticsAggregate.capped_count",
      ),
    };
  }
}

export default VoucherEngineService;
