# File Ownership Map

Prevents merge conflicts when 4 devs code in parallel over 7 days. Task **1.2.5**.
Derived directly from [`../tasks_grouped.md`](../tasks_grouped.md).

> **One file = one owner.** If you need to change a file you don't own, ping the owner and
> coordinate — do not edit it in your PR. Shared touch-points (`medusa-config.ts`, `links/`) have
> explicit rules below.

## Owners at a glance
| Dev | Domain |
|-----|--------|
| **Linh** | Repo/infra + SuggestiveSelling **foundation** (module scaffold, models, migration, service, seed) + product-level tier logic + suggestion Admin API + one-tap-add/cart wiring |
| **Sơn** | SuggestiveSelling **runtime** — `SuggestionEvent`, `evaluateSuggestions` workflow, filtering/ranking, cart-level CR-01..04, Store suggestion APIs, `cart.updated` subscriber, suggestion Redis cache, analytics events |
| **Thức** | VoucherEngine **discount runtime** — monetary calc, StackingEngine pure fn, global 50% cap, voucher Store APIs, revalidation subscriber, usage-recording workflow, checkout integration |
| **Hùng** | Claude tooling (Day 1) + VoucherEngine **foundation** (module scaffold, models, migration, services, seed) + V1–V8 validation + voucher Admin API + Redis rate-limit / failed-attempt counter |

## Backend file ownership (`apps/backend/src/`)

### `modules/suggestive-selling/` — co-owned by **Linh** + **Sơn**
| Path | Owner |
|------|-------|
| `index.ts` | **Linh** (scaffold) — Sơn coordinates for new-model registration |
| `service.ts` | **Linh** owns foundation methods; **Sơn** adds evaluate/event methods — split by clearly-commented sections, coordinate before editing |
| `models/suggestion-rule.ts`, `suggestion-rule-item.ts`, `cart-suggestion-condition.ts` | **Linh** |
| `models/suggestion-event.ts` | **Sơn** |
| migrations | **Linh** for foundation tables; **Sơn** for `suggestion_event` (separate migration files) |

### `modules/voucher-engine/` — co-owned by **Hùng** + **Thức**
| Path | Owner |
|------|-------|
| `index.ts` | **Hùng** (scaffold) |
| `service.ts` | **Hùng** owns config/usage + V1–V8 validation; **Thức** adds discount/stacking methods — split by commented sections, coordinate |
| `models/voucher-config.ts`, `voucher-usage-log.ts`, `discount-cap-config.ts` | **Hùng** |
| `stacking-engine.ts` (pure fn) | **Thức** |
| migrations | **Hùng** (all voucher tables) |

### `api/`
| Path | Owner |
|------|-------|
| `api/store/products/[id]/suggestions`, `api/store/cart/suggestions`, `api/store/suggestions/*` | **Sơn** |
| `api/admin/suggestion-rules/*` | **Linh** |
| `api/store/cart/voucher`, `api/store/customer/vouchers` | **Thức** |
| `api/admin/vouchers/*` | **Hùng** |

### `workflows/`, `subscribers/`, `links/`
| Path | Owner |
|------|-------|
| `workflows/evaluate-suggestions.ts` | **Sơn** |
| `workflows/apply-voucher.ts`, `revalidate-voucher-on-cart-change.ts`, usage-recording | **Thức** |
| `subscribers/cart-updated.ts` (suggestions) | **Sơn** |
| `subscribers/*` voucher revalidation / `order.placed` usage | **Thức** |
| `links/*` | file per link; owner = the module that adds the reference. New links in **separate files** — never edit another's link file |

## Shared touch-points — coordination rules
- **`apps/backend/medusa-config.ts`** (module registration): each owner adds **their own module's
  one-line `{ resolve }` entry** in a single small PR at scaffold time. Do it early on Day 2 and
  announce it to avoid two people editing the same lines. Never reorder others' entries.
- **`docs/tasks_grouped.md`**: only tick **your own** task checkboxes.
- **Storefront** (`apps/storefront/`): suggestion UI/one-tap-add = **Linh**; voucher/checkout UI =
  **Thức**; shared cart response wiring coordinate between the two.
- **`.claude/` rules & `docs/team/`**: owned by **Hùng**; propose changes via PR to Hùng.

## Conflict-avoidance checklist
1. One model = one file = one owner. Never add two models to one file.
2. For a co-owned `service.ts`, keep each owner's methods in a clearly-commented block and pull
   `develop` before editing.
3. Register your module in `medusa-config.ts` early and in isolation.
4. If a task seems to need a file you don't own, it's probably mis-scoped — check this map and the
   task list, then coordinate.
