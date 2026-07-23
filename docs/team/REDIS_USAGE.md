# Redis Usage — Finalized Decision (chốt)

Single source of truth for how Redis is used. Task **1.3.5**. Consolidates the decisions already
made in `docs/TECHNICAL_SOLUTION_DESIGN.md`, `docs/SPEC.md`, and the memory-bank `techContext.md`
— this doc is the authoritative version; if anything conflicts, this wins.

> **Redis is OPTIONAL.** Infra modules load only when `REDIS_URL` is set; otherwise the code uses an
> in-memory fallback (see §4). Never assume Redis is present. Dev infra: Redis on port **6380**.

## 1. Suggestion cache (SuggestiveSelling — owner: Sơn)
Cache the **raw, pre-filter** suggestion result; per-customer exclusion filters (in-cart, out of
stock, dismissed, recently purchased) run at **runtime** on top of the cached list. This resolves
the shared-cache-vs-personal-filter tension (SRS §11.3-1).

| Key | TTL | Contents | Invalidation |
|-----|-----|----------|--------------|
| `product:{product_id}:suggestions` | **5 min** | raw ranked suggestions for a product detail page | rule create/update/delete (Admin API); natural TTL expiry |
| `cart:{cart_id}:suggestions` | **5 min** | raw cart-level ("You Might Also Need") suggestions | **synchronous delete on `cart.updated`** (item add/remove/qty change), then re-evaluate |

- On cold miss: run the `evaluateSuggestions` workflow → DB query → write cache → return.
- Optional: a short stock-availability cache for suggested products (advisory ~60s) — always
  re-check stock at execution; never trust the snapshot for the final add-to-cart.

## 2. Voucher validation cache (VoucherEngine — owner: Thức / Hùng)
| Key | TTL | Contents |
|-----|-----|----------|
| `voucher:{code}:config` (or validation result) | **30 s** | the **cart-independent** parts of validation — voucher exists/active (V1), date window (V2), and the static config |

- **Scope-safety rule (critical):** cache **only cart-independent** checks. Cart-dependent checks —
  V3/V4 usage counts, V5 min order value, V6 eligible items, V8 stacking — are **always evaluated
  live against the current cart**, never served from cache. This prevents stale cart-dependent
  validation. The 30s TTL is short precisely because voucher state changes fast.

## 3. Failed-attempt counter & rate limiting (owner: Hùng)
Unifies EC-10 + SEC-02 (SRS §11.3-2): **count over 15 min, penalize for 30 min.**

| Key | TTL | Behavior |
|-----|-----|----------|
| `voucher:fail:{customer_id}:{ip}` | 15 min sliding | `INCR` on each failed validation; at **5 fails → `429`** and set cooldown |
| `voucher:cooldown:{customer_id}:{ip}` | 30 min | presence = blocked; all voucher attempts return `429` until it expires |

- Usage-count enforcement (V3 global limit): `usage_count` uses an **atomic Redis `INCR`** (INT-02)
  synced to the DB at `order.placed`, with a re-check of V3 immediately before finalizing to close
  the over-redemption window. Idempotency keyed by `voucher + order`.
- Log every failed attempt for monitoring / demo evidence.

## 4. Fallback when Redis is unavailable
When `REDIS_URL` is unset or Redis is down, the system must **degrade, not fail**:
- **Suggestion cache** → skip cache, query DB every time (correctness preserved, latency higher).
- **Voucher validation cache** → validate live every time (no staleness risk).
- **Rate limiting** → fall back to an in-memory per-process counter (best-effort; documented as
  weaker across multiple instances). Never let a missing Redis block a legitimate checkout.
- **Usage count** → rely on DB-level atomic increment + optimistic locking (EC-04) as the backstop.

## 5. Summary — every key at a glance
| Key | TTL | Trigger to clear | Fallback |
|-----|-----|------------------|----------|
| `product:{id}:suggestions` | 5 min | rule mutation / TTL | DB query |
| `cart:{cart_id}:suggestions` | 5 min | `cart.updated` (sync delete) | DB query |
| `voucher:{code}:config` | 30 s | TTL only | live validation |
| `voucher:fail:{customer}:{ip}` | 15 min | TTL / success reset | in-memory counter |
| `voucher:cooldown:{customer}:{ip}` | 30 min | TTL | in-memory counter |
| `usage_count` (atomic INCR) | — | synced to DB at `order.placed` | DB atomic increment |
