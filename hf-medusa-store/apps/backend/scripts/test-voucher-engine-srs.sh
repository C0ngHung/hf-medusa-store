#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PNPM_CMD=(pnpm --config.pm-on-fail=ignore)
PORT="${VOUCHER_ENGINE_TEST_PORT:-9009}"

section() {
  printf '\n\033[1;36m==> %s\033[0m\n' "$1"
}

run_unit() {
  local spec="$1"
  "${PNPM_CMD[@]}" test:unit -- "$spec"
}

run_http() {
  local spec="$1"
  "${PNPM_CMD[@]}" test:integration:http -- "$spec"
}

port_is_busy() {
  if command -v ss >/dev/null 2>&1; then
    ss -ltn | awk '{print $4}' | grep -Eq "(:|\\.)${PORT}$"
    return $?
  fi

  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1
    return $?
  fi

  return 1
}

section "VoucherEngine SRS test preflight"
printf 'Backend: %s\n' "$ROOT_DIR"
printf 'Port check: %s\n' "$PORT"

if port_is_busy; then
  printf '\nPort %s is already in use. Stop the existing Medusa/test process before running VoucherEngine integration tests.\n' "$PORT" >&2
  exit 1
fi

section "SRS pure rules: V1-V8, calculation, eligibility, native-field derivation"
run_unit "src/workflows/voucher-engine/__tests__/validators.unit.spec.ts"
run_unit "src/modules/voucher-engine/lib/__tests__/calculate-discount.unit.spec.ts"
run_unit "src/workflows/voucher-engine/admin/lib/__tests__/check-promotion-voucher-eligibility.unit.spec.ts"
run_unit "src/workflows/voucher-engine/admin/lib/__tests__/derive-voucher-config-cache-fields.unit.spec.ts"

section "Admin and model APIs: VoucherConfig attachment, admin voucher APIs, global cap"
run_http "attach-voucher-config.spec.ts"
run_http "voucher-admin.spec.ts"
run_http "discount-cap-config-admin.spec.ts"

section "Store/cart workflows: apply, remove, replace, resolve, revalidate, cache, rate limit"
run_http "apply-remove-voucher.spec.ts"
run_http "voucher-engine-resolve-workflow.spec.ts"
run_http "revalidate-voucher-workflow.spec.ts"
run_http "voucher-config-cache.spec.ts"
run_http "voucher-rate-limit.spec.ts"

section "Order/redemption: usage log timing, atomic counter, idempotency, cleanup"
run_http "record-voucher-usage-workflow.spec.ts"

section "SRS regressions: My Vouchers, automatic-promotion coexistence, abandoned ephemeral cleanup"
run_http "my-vouchers.spec.ts"
run_http "conflict-8-automatic-promotion-coexistence.spec.ts"
run_http "reap-ephemeral-promotions.spec.ts"

section "VoucherEngine SRS test pass complete"
