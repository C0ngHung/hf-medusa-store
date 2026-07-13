---
description: Security rules for hf-medusa-store — server-side pricing, rate limiting, audit integrity
---

# Security rules

Focused on the money-and-abuse surface of VoucherEngine. See also [coding.md](./coding.md) (money)
and `docs/team/REDIS_USAGE.md` (rate-limit implementation).

## Pricing authority
- **Discount calculation is server-side only** (SEC / INT-03). The client never computes or
  supplies a discount, total, or eligibility — it only sends a voucher code / item ids.
- The **cart total is the sole pricing truth**; recompute from authoritative cart data on every
  mutation. Reject any client-provided monetary field.

## Rate limiting & brute-force (SEC-02 / EC-10)
- Voucher validation is rate-limited by **`customer_id` + IP**.
- **5 failed attempts within 15 minutes → `429`**, then a **30-minute cooldown** before retry.
- Count over the 15-minute window; penalize for 30 minutes (team-unified EC-10 + SEC-02 rule).
- Implemented via Redis (see `docs/team/REDIS_USAGE.md`); must degrade safely when Redis is absent.

## Audit & anti-over-redemption
- `voucher_usage_log` is **append-only / immutable** — never update or delete rows.
- `usage_count` increments are **atomic** (Redis `INCR` synced to DB, INT-02); re-validate V3
  (global limit) immediately before finalizing at `order.placed`.
- Applying a voucher to a cart MUST NOT increment `usage_count` — only a placed order does.
- Idempotency keyed by `voucher + order` so concurrent/duplicated order events can't double-count.

## Concurrency
- Cart operations use **optimistic locking** (version column, EC-04) to handle concurrent voucher
  application and item removal without lost updates.

## Secrets
- Secrets live in `.env` (gitignored). Commit only `.env.template`. Never hardcode credentials,
  API keys, or connection strings in source or docs.
