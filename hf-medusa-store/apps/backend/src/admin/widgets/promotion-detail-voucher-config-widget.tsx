import { useState, type ReactNode } from "react";
import { defineWidgetConfig } from "@medusajs/admin-sdk";
import type {
  AdminPromotion,
  DetailWidgetProps,
} from "@medusajs/framework/types";
import {
  Button,
  Container,
  Heading,
  Input,
  Label,
  StatusBadge,
  Switch,
  Text,
  toast,
} from "@medusajs/ui";
import {
  useDisableVoucherEngine,
  useEnableVoucherEngine,
  useVoucherByPromotion,
  type EnableVoucherEnginePayload,
} from "../lib/api";
import { ProductMultiSelect } from "../components/product-multi-select";
import { CategoryMultiSelect } from "../components/category-multi-select";
import { CustomerGroupMultiSelect } from "../components/customer-group-multi-select";
import { useCustomerGroupNames } from "../lib/use-customer-groups";
import { checkPromotionVoucherEligibility } from "../../workflows/voucher-engine/admin/lib/check-promotion-voucher-eligibility";
import type { VoucherConfig } from "../lib/types";

/**
 * Promotion Detail / "VoucherEngine Settings" section (Admin unified model).
 * Voucher is not a separate long-term Admin domain — everything starts from
 * and lives on the native Promotion. INLINE ONLY: no modal, drawer, or
 * separate route — the Enable form expands in place with Save/Cancel, and
 * Disable shows an inline confirmation before acting.
 *
 * States:
 *   1. Automatic or otherwise-ineligible Promotion — no toggle at all, just
 *      the reason (mirrors `check-promotion-voucher-eligibility.ts`'s
 *      server-side rules; best-effort client mirror for UX — the backend is
 *      the actual gate on submit).
 *   2. Eligible, unlinked (or linked-but-disabled) Promotion — toggle OFF;
 *      switching it on expands the VoucherEngine-only settings form inline,
 *      pre-filled from a previous disabled VoucherConfig if one exists
 *      (re-enable reuses history), with Save/Cancel. Save calls Enable
 *      (idempotent create-or-reactivate-or-update); Cancel collapses
 *      without persisting anything.
 *   3. Enabled (linked, `is_active: true`) — toggle ON; switching it off
 *      shows an inline confirmation (not a browser `confirm()`) before
 *      calling Disable, which never deletes the Promotion, VoucherConfig,
 *      usage history, or analytics.
 *
 * Zone: `promotion.details.side.before` (verified real zone,
 * `@medusajs/admin-shared@2.16.0/dist/index.js:234-239`) — an official
 * Promotion Detail widget slot. No dashboard fork, no native route override.
 */

function formatVnd(amount: number): string {
  return `${new Intl.NumberFormat("vi-VN").format(amount)}₫`;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-ui-border-base flex items-center justify-between border-t px-6 py-3">
      <Text size="small" leading="compact" className="text-ui-fg-subtle">
        {label}
      </Text>
      <div className="text-ui-fg-base max-w-[60%] text-right">{children}</div>
    </div>
  );
}

function ScopeValue({ ids, noun }: { ids?: string[] | null; noun: string }) {
  if (!ids || ids.length === 0) {
    return (
      <Text size="small" className="text-ui-fg-subtle">
        All {noun}
      </Text>
    );
  }
  return (
    <div className="flex flex-col items-end gap-y-1">
      <Text size="small">
        {ids.length} {noun}
      </Text>
      <Text
        size="xsmall"
        className="text-ui-fg-muted max-w-[220px] break-all font-mono"
      >
        {ids.join(", ")}
      </Text>
    </div>
  );
}

/**
 * Read-only rendering of `voucher.user_segment_conditions` — resolves
 * `customer_group_ids` to names via `useCustomerGroupNames` (bug-bash fix,
 * 2026-07-21) instead of the previous raw `JSON.stringify` dump, which told
 * an admin nothing about what the configured value actually meant.
 */
function CustomerSegmentValue({
  conditions,
}: {
  conditions?: Record<string, unknown> | null;
}) {
  const ids = Array.isArray(conditions?.customer_group_ids)
    ? (conditions!.customer_group_ids as string[])
    : [];
  const { data: names = {} } = useCustomerGroupNames(ids);

  if (ids.length === 0) {
    return (
      <Text size="small" className="text-ui-fg-subtle">
        Unrestricted
      </Text>
    );
  }
  return (
    <div className="flex flex-col items-end gap-y-1">
      <Text size="small">
        {ids.length} group{ids.length > 1 ? "s" : ""}
      </Text>
      <Text size="xsmall" className="text-ui-fg-muted max-w-[220px] break-all">
        {ids.map((id) => names[id]?.name ?? id).join(", ")}
      </Text>
    </div>
  );
}

/**
 * Best-effort CLIENT mirror of `assert-promotion-voucher-eligible.ts`'s
 * server-side eligibility checks — reuses the SAME pure function the
 * backend step delegates to, so the two can never silently drift apart.
 * Not authoritative on its own: the backend enforces every one of these
 * again on submit.
 */
function ineligibilityReason(promotion: AdminPromotion): string | null {
  const result = checkPromotionVoucherEligibility(promotion as any);
  return result.eligible ? null : result.reason;
}

type Mode = "view" | "editing" | "confirming-disable";

type FormState = {
  min_order_value: string;
  max_discount_amount: string;
  applicable_product_ids: string[];
  applicable_category_ids: string[];
  per_user_limit: string;
  customer_group_ids: string[];
  valid_from: string;
  valid_to: string;
};

/** yyyy-MM-ddThh:mm, the format `<input type="datetime-local">` needs. */
function toDatetimeLocal(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultValidFrom(): string {
  return toDatetimeLocal(new Date().toISOString());
}

function defaultValidTo(): string {
  const oneYearOut = new Date();
  oneYearOut.setFullYear(oneYearOut.getFullYear() + 1);
  return toDatetimeLocal(oneYearOut.toISOString());
}

function formFromVoucher(voucher: VoucherConfig | null): FormState {
  return {
    min_order_value: voucher?.min_order_value?.toString() ?? "",
    max_discount_amount: voucher?.max_discount_amount?.toString() ?? "",
    applicable_product_ids: voucher?.applicable_product_ids ?? [],
    applicable_category_ids: voucher?.applicable_category_ids ?? [],
    per_user_limit: voucher?.per_user_limit?.toString() ?? "1",
    customer_group_ids: Array.isArray(
      voucher?.user_segment_conditions?.customer_group_ids,
    )
      ? (voucher!.user_segment_conditions!.customer_group_ids as string[])
      : [],
    valid_from: voucher?.valid_from
      ? toDatetimeLocal(voucher.valid_from)
      : defaultValidFrom(),
    valid_to: voucher?.valid_to
      ? toDatetimeLocal(voucher.valid_to)
      : defaultValidTo(),
  };
}

function validateForm(
  form: FormState,
  isPercentageVoucher: boolean,
  isFirstEnable: boolean,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (form.per_user_limit.trim() && Number(form.per_user_limit) <= 0) {
    errors.per_user_limit = "Must be a positive number";
  }
  // valid_from/valid_to are only ever edited on the very first Enable — once
  // a VoucherConfig row exists (even disabled), the inputs are locked, so
  // there's nothing to validate on a re-save (2026-07-21 form validation fix).
  if (isFirstEnable) {
    if (!form.valid_from.trim()) {
      errors.valid_from = "Required";
    }
    if (!form.valid_to.trim()) {
      errors.valid_to = "Required";
    }
    if (
      form.valid_from.trim() &&
      form.valid_to.trim() &&
      new Date(form.valid_to).getTime() <= new Date(form.valid_from).getTime()
    ) {
      errors.valid_to = "Must be after the start date";
    }
  }

  // max_discount_amount rule — mirrors the server-side
  // `validateAttachVoucherConfigInput` exactly, so the customer sees the same
  // rule inline instead of only on submit-failure. No relation to
  // min_order_value is enforced (bug-bash fix, 2026-07-21: removed entirely,
  // no basis in SRS — max_discount_amount is only a standalone cap on the
  // voucher's own discount).
  if (form.max_discount_amount.trim() && !isPercentageVoucher) {
    errors.max_discount_amount =
      "Only applies to a percentage discount — this Promotion's discount type is fixed.";
  }

  return errors;
}

const PromotionDetailVoucherConfigWidget = ({
  data,
}: DetailWidgetProps<AdminPromotion>) => {
  const {
    data: voucher,
    isLoading,
    isError,
    refetch,
  } = useVoucherByPromotion(data.id);
  const enable = useEnableVoucherEngine(data.id);
  const disable = useDisableVoucherEngine(data.id);

  const [mode, setMode] = useState<Mode>("view");
  const [form, setForm] = useState<FormState>(() => formFromVoucher(null));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const reason = ineligibilityReason(data);
  const isEnabled = !!voucher?.is_active;
  const isPercentageVoucher = data.application_method?.type === "percentage";
  // valid_from/valid_to are only editable the very first time this Promotion
  // is ever enabled — once a VoucherConfig row exists (even disabled), the
  // dates are locked (2026-07-21 form validation fix; mirrors the backend's
  // create-only write in `upsert-linked-voucher-config.ts`).
  const isFirstEnable = !voucher;

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => {
      const next = { ...e };
      delete next[key];
      return next;
    });
  };

  const startEditing = () => {
    setForm(formFromVoucher(voucher ?? null));
    setErrors({});
    setMode("editing");
  };

  const cancelEditing = () => {
    setMode("view");
    setErrors({});
  };

  const handleSave = async () => {
    const fieldErrors = validateForm(form, isPercentageVoucher, isFirstEnable);
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return;
    }

    const user_segment_conditions: Record<string, unknown> | null = form
      .customer_group_ids.length
      ? { customer_group_ids: form.customer_group_ids }
      : null;

    const payload: EnableVoucherEnginePayload = {
      min_order_value: form.min_order_value.trim()
        ? Number(form.min_order_value)
        : null,
      // Force null when not a percentage voucher, regardless of form state —
      // defense in depth on top of the disabled input (2026-07-21).
      max_discount_amount:
        isPercentageVoucher && form.max_discount_amount.trim()
          ? Number(form.max_discount_amount)
          : null,
      applicable_product_ids: form.applicable_product_ids.length
        ? form.applicable_product_ids
        : null,
      applicable_category_ids: form.applicable_category_ids.length
        ? form.applicable_category_ids
        : null,
      per_user_limit: form.per_user_limit.trim()
        ? Number(form.per_user_limit)
        : 1,
      user_segment_conditions,
      // Ignored by the backend on an update/re-enable (create-only) — still
      // sent unchanged so the payload shape stays uniform either way.
      valid_from: new Date(form.valid_from).toISOString(),
      valid_to: new Date(form.valid_to).toISOString(),
    };

    try {
      await enable.mutateAsync(payload);
      toast.success("VoucherEngine enabled for this Promotion.");
      setMode("view");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to enable VoucherEngine.");
    }
  };

  const handleConfirmDisable = async () => {
    try {
      await disable.mutateAsync();
      toast.success("VoucherEngine disabled for this Promotion.");
      setMode("view");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to disable VoucherEngine.");
    }
  };

  // Switch shows ON while attempting-to-enable (editing) or
  // pending-disable-confirmation (still on until confirmed); otherwise
  // reflects the persisted flag.
  const switchChecked = mode === "view" ? isEnabled : true;

  const handleToggle = (checked: boolean) => {
    if (mode !== "view") return; // mid-flow — Save/Cancel/Confirm/Cancel own the transition
    if (checked) {
      if (reason) return; // ineligible — toggle shouldn't be reachable, defensive no-op
      startEditing();
    } else {
      setMode("confirming-disable");
    }
  };

  return (
    <Container className="p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex flex-col gap-y-1">
          <div className="flex items-center gap-x-2">
            <Heading level="h2">VoucherEngine settings</Heading>
            {!isLoading && !isError && (
              <StatusBadge
                color={reason ? "grey" : isEnabled ? "green" : "grey"}
              >
                {reason ? "Not eligible" : isEnabled ? "Enabled" : "Disabled"}
              </StatusBadge>
            )}
          </div>
          <Text size="small" className="text-ui-fg-subtle">
            {reason
              ? "This Promotion cannot become a Voucher."
              : "Turn this Promotion into a code-redeemable Voucher."}
          </Text>
        </div>
        {!isLoading && !isError && !reason && (
          <Switch
            checked={switchChecked}
            disabled={mode !== "view" || enable.isPending || disable.isPending}
            onCheckedChange={handleToggle}
          />
        )}
      </div>

      {isLoading ? (
        <div className="border-ui-border-base border-t px-6 py-8">
          <Text size="small" className="text-ui-fg-muted">
            Loading…
          </Text>
        </div>
      ) : isError ? (
        <div className="border-ui-border-base flex flex-col items-start gap-y-3 border-t px-6 py-8">
          <Text size="small" className="text-ui-fg-error">
            Failed to load VoucherConfig.
          </Text>
          <Button size="small" variant="secondary" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : reason ? (
        <div className="border-ui-border-base border-t px-6 py-4">
          <Text size="small" className="text-ui-fg-subtle max-w-md">
            {reason}
          </Text>
        </div>
      ) : mode === "confirming-disable" ? (
        <div className="border-ui-border-base flex flex-col gap-y-3 border-t px-6 py-6">
          <Text size="small">
            Disable VoucherEngine for this Promotion? Its settings, usage
            history, and analytics are kept — re-enabling reuses them.
          </Text>
          <div className="flex gap-x-2">
            <Button
              size="small"
              variant="danger"
              onClick={handleConfirmDisable}
              isLoading={disable.isPending}
            >
              Disable
            </Button>
            <Button
              size="small"
              variant="secondary"
              onClick={() => setMode("view")}
              disabled={disable.isPending}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : mode === "editing" ? (
        <div className="border-ui-border-base flex flex-col gap-y-6 border-t px-6 py-6">
          <Text size="small" className="text-ui-fg-subtle">
            Only VoucherEngine-specific settings — code, discount type/value,
            status, campaign, and application method stay managed by this
            Promotion's own native fields above. Total usage limit is also
            native — set it on the Promotion itself. Validity window below is
            VoucherConfig's own (a Promotion has no native date range of its
            own) and can only be set once, the first time this Promotion is
            enabled.
          </Text>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-y-2">
              <Label size="small">Valid from</Label>
              <Input
                type="datetime-local"
                value={form.valid_from}
                onChange={(e) => setField("valid_from", e.target.value)}
                disabled={!isFirstEnable}
              />
              {errors.valid_from && (
                <Text size="xsmall" className="text-ui-fg-error">
                  {errors.valid_from}
                </Text>
              )}
              {!isFirstEnable && (
                <Text size="xsmall" className="text-ui-fg-subtle">
                  Locked — set once when a voucher is first enabled.
                </Text>
              )}
            </div>
            <div className="flex flex-col gap-y-2">
              <Label size="small">Valid to</Label>
              <Input
                type="datetime-local"
                value={form.valid_to}
                onChange={(e) => setField("valid_to", e.target.value)}
                disabled={!isFirstEnable}
              />
              {errors.valid_to && (
                <Text size="xsmall" className="text-ui-fg-error">
                  {errors.valid_to}
                </Text>
              )}
              {!isFirstEnable && (
                <Text size="xsmall" className="text-ui-fg-subtle">
                  Locked — set once when a voucher is first enabled.
                </Text>
              )}
            </div>
            <div className="flex flex-col gap-y-2">
              <Label size="small">Minimum order value (VND)</Label>
              <Input
                type="number"
                min={0}
                value={form.min_order_value}
                onChange={(e) => setField("min_order_value", e.target.value)}
                placeholder="No minimum"
              />
            </div>
            <div className="flex flex-col gap-y-2">
              <Label size="small">Max discount amount (VND)</Label>
              <Input
                type="number"
                min={0}
                value={form.max_discount_amount}
                onChange={(e) =>
                  setField("max_discount_amount", e.target.value)
                }
                placeholder={
                  isPercentageVoucher
                    ? "No cap"
                    : "Only applies to percentage discounts"
                }
                disabled={!isPercentageVoucher}
              />
              {errors.max_discount_amount && (
                <Text size="xsmall" className="text-ui-fg-error">
                  {errors.max_discount_amount}
                </Text>
              )}
            </div>
            <div className="flex flex-col gap-y-2">
              <Label size="small">Per-customer usage limit</Label>
              <Input
                type="number"
                min={1}
                value={form.per_user_limit}
                onChange={(e) => setField("per_user_limit", e.target.value)}
              />
              {errors.per_user_limit && (
                <Text size="xsmall" className="text-ui-fg-error">
                  {errors.per_user_limit}
                </Text>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-y-2">
            <Label size="small">Eligible products</Label>
            <Text size="xsmall" className="text-ui-fg-subtle">
              Leave empty to apply to all products.
            </Text>
            <ProductMultiSelect
              value={form.applicable_product_ids}
              onChange={(ids) => setField("applicable_product_ids", ids)}
            />
          </div>
          <div className="flex flex-col gap-y-2">
            <Label size="small">Eligible categories</Label>
            <Text size="xsmall" className="text-ui-fg-subtle">
              Leave empty to apply to all categories.
            </Text>
            <CategoryMultiSelect
              value={form.applicable_category_ids}
              onChange={(ids) => setField("applicable_category_ids", ids)}
            />
          </div>

          <div className="flex flex-col gap-y-2">
            <Label size="small">Customer segment</Label>
            <Text size="xsmall" className="text-ui-fg-subtle">
              Leave empty to apply to every customer. Otherwise, only customers
              in at least one selected group can redeem this voucher.
            </Text>
            <CustomerGroupMultiSelect
              value={form.customer_group_ids}
              onChange={(ids) => setField("customer_group_ids", ids)}
            />
          </div>

          <div className="flex gap-x-2">
            <Button
              size="small"
              onClick={handleSave}
              isLoading={enable.isPending}
            >
              Save
            </Button>
            <Button
              size="small"
              variant="secondary"
              onClick={cancelEditing}
              disabled={enable.isPending}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : !voucher || !isEnabled ? (
        <div className="border-ui-border-base border-t px-6 py-8">
          <Text size="small" className="text-ui-fg-muted">
            {voucher
              ? "VoucherEngine is disabled for this Promotion. Its previous settings and usage history are kept — turn it back on to reuse them."
              : "This Promotion is eligible for VoucherEngine but has not been enabled yet."}
          </Text>
        </div>
      ) : (
        <div>
          <Row label="Valid from">
            <Text size="small">
              {voucher.valid_from
                ? new Date(voucher.valid_from).toLocaleString()
                : "—"}
            </Text>
          </Row>
          <Row label="Valid to">
            <Text size="small">
              {voucher.valid_to
                ? new Date(voucher.valid_to).toLocaleString()
                : "—"}
            </Text>
          </Row>
          <Row label="Minimum order value">
            {voucher.min_order_value != null ? (
              <Text size="small">{formatVnd(voucher.min_order_value)}</Text>
            ) : (
              <Text size="small" className="text-ui-fg-subtle">
                No minimum
              </Text>
            )}
          </Row>
          <Row label="Max discount amount">
            {voucher.max_discount_amount != null ? (
              <Text size="small">{formatVnd(voucher.max_discount_amount)}</Text>
            ) : (
              <Text size="small" className="text-ui-fg-subtle">
                No cap on this voucher
              </Text>
            )}
          </Row>
          <Row label="Product scope">
            <ScopeValue ids={voucher.applicable_product_ids} noun="products" />
          </Row>
          <Row label="Category scope">
            <ScopeValue
              ids={voucher.applicable_category_ids}
              noun="categories"
            />
          </Row>
          <Row label="Per-customer usage limit">
            <Text size="small">{voucher.per_user_limit}</Text>
          </Row>
          <Row label="Total usage limit">
            <Text size="small">
              {voucher.usage_limit ?? "Unlimited"}
              <Text as="span" size="xsmall" className="text-ui-fg-subtle ml-1">
                (set from the Promotion's usage limit when enabled)
              </Text>
            </Text>
          </Row>
          <Row label="Usage count">
            <Text size="small">{voucher.usage_count ?? 0}</Text>
          </Row>
          <Row label="Customer segment">
            <CustomerSegmentValue
              conditions={voucher.user_segment_conditions}
            />
          </Row>
          <div className="border-ui-border-base border-t px-6 py-4">
            <Text size="xsmall" className="text-ui-fg-muted">
              Code, discount type/value, status, campaign, and total usage limit
              are managed by the native Promotion UI above.
            </Text>
          </div>
        </div>
      )}
    </Container>
  );
};

export const config = defineWidgetConfig({
  zone: "promotion.details.side.before",
});

export default PromotionDetailVoucherConfigWidget;
