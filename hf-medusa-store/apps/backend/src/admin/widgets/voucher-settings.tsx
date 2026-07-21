import { useEffect, useState } from "react";
import { defineWidgetConfig } from "@medusajs/admin-sdk";
import type {
  AdminPromotion,
  DetailWidgetProps,
} from "@medusajs/framework/types";
import {
  Alert,
  Button,
  Container,
  Heading,
  Input,
  Label,
  Prompt,
  Switch,
  Text,
  toast,
} from "@medusajs/ui";
import {
  useAttachVoucher,
  useDeleteVoucher,
  useUpdateVoucherFields,
  useVoucherByPromotion,
  type VoucherOnlyFields,
} from "../lib/api";
import type { VoucherConfig } from "../lib/types";
import { CategoryMultiSelect } from "../components/category-multi-select";
import { ProductMultiSelect } from "../components/product-multi-select";

type FormState = {
  min_order_value: string;
  max_discount_amount: string;
  per_user_limit: string;
  stackable_with_promotions: boolean;
  applicable_product_ids: string[];
  applicable_category_ids: string[];
};

const EMPTY_FORM: FormState = {
  min_order_value: "",
  max_discount_amount: "",
  per_user_limit: "1",
  stackable_with_promotions: true,
  applicable_product_ids: [],
  applicable_category_ids: [],
};

function toFormState(v: VoucherConfig): FormState {
  return {
    min_order_value: v.min_order_value != null ? String(v.min_order_value) : "",
    max_discount_amount:
      v.max_discount_amount != null ? String(v.max_discount_amount) : "",
    per_user_limit: String(v.per_user_limit ?? 1),
    stackable_with_promotions: v.stackable_with_promotions,
    applicable_product_ids: v.applicable_product_ids ?? [],
    applicable_category_ids: v.applicable_category_ids ?? [],
  };
}

function toPayload(form: FormState): VoucherOnlyFields {
  return {
    min_order_value: form.min_order_value.trim()
      ? Number(form.min_order_value)
      : null,
    max_discount_amount: form.max_discount_amount.trim()
      ? Number(form.max_discount_amount)
      : null,
    per_user_limit: form.per_user_limit.trim()
      ? Number(form.per_user_limit)
      : undefined,
    stackable_with_promotions: form.stackable_with_promotions,
    applicable_product_ids:
      form.applicable_product_ids.length > 0
        ? form.applicable_product_ids
        : null,
    applicable_category_ids:
      form.applicable_category_ids.length > 0
        ? form.applicable_category_ids
        : null,
  };
}

/**
 * Task 7 — "Voucher settings" widget on the native Promotion detail page
 * (zone `promotion.details.side.after`). Lets an admin turn the Promotion
 * they just created via Medusa's own wizard into a VoucherEngine voucher
 * (or edit/disable one already attached) right here, instead of a separate
 * form. Wraps the existing attach-mode POST (Task 4) / PUT (Task 5) /
 * DELETE (Task 5) `/admin/vouchers*` endpoints — never the full create-mode
 * body: `discount_type`/`discount_value`/`code`/the validity window live on
 * the Promotion itself (SPEC Decision H/I), only the voucher-only fields
 * (cap, min order, per-user limit, scope, stacking) are edited here.
 */
const VoucherSettingsWidget = ({ data }: DetailWidgetProps<AdminPromotion>) => {
  // Buy X Get Y / free-shipping promotions and automatic promotions can
  // never be a voucher (a voucher is always customer-entered, `standard`,
  // non-automatic — SPEC).
  const isEligible = data.type === "standard" && data.is_automatic !== true;

  const { data: voucherList, isLoading } = useVoucherByPromotion(
    isEligible ? data.id : undefined,
  );
  const voucher = voucherList?.vouchers?.[0] ?? null;

  const [enabling, setEnabling] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  // Keep the form in sync whenever the fetched voucher changes (initial
  // load, or after a save round-trips through the query invalidation).
  useEffect(() => {
    if (voucher) setForm(toFormState(voucher));
  }, [voucher]);

  const attachVoucher = useAttachVoucher();
  const updateVoucher = useUpdateVoucherFields(voucher?.id ?? "");
  const deleteVoucher = useDeleteVoucher();

  if (!isEligible) {
    return (
      <Container>
        <Text size="small" className="text-ui-fg-subtle">
          Loại promotion này không dùng làm voucher được.
        </Text>
      </Container>
    );
  }

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const handleAttach = async () => {
    try {
      const { voucher: created } = await attachVoucher.mutateAsync({
        promotion_id: data.id,
        ...toPayload(form),
      });
      toast.success(`Voucher ${created.code} enabled for this promotion`);
      setEnabling(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to enable voucher");
    }
  };

  const handleSave = async () => {
    if (!voucher) return;
    try {
      await updateVoucher.mutateAsync(toPayload(form));
      toast.success("Voucher settings saved");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save voucher settings");
    }
  };

  const handleDisable = async () => {
    if (!voucher) return;
    try {
      await deleteVoucher.mutateAsync(voucher.id);
      toast.success("Voucher disabled");
      setConfirmDisable(false);
      setForm(EMPTY_FORM);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to disable voucher");
    }
  };

  const showForm = !!voucher || enabling;

  return (
    <Container className="flex flex-col gap-y-4 p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">Voucher settings</Heading>
      </div>

      <div className="border-ui-border-base flex flex-col gap-y-4 border-t px-6 py-4">
        {voucher && (
          <Alert variant="warning">
            Promotion này là voucher — không bao giờ tự áp vào giỏ; giảm giá đi
            qua Voucher Engine (credit line).
          </Alert>
        )}

        {isLoading ? (
          <Text size="small" className="text-ui-fg-muted">
            Loading…
          </Text>
        ) : !showForm ? (
          <Button size="small" onClick={() => setEnabling(true)}>
            Enable as voucher
          </Button>
        ) : (
          <div className="flex flex-col gap-y-4">
            {voucher && (
              <Text size="small" className="text-ui-fg-subtle">
                Usage: {voucher.usage_count ?? 0} / {voucher.usage_limit ?? "∞"}
              </Text>
            )}

            <div className="flex flex-col gap-y-2">
              <Label size="small">Max discount amount (VND)</Label>
              <Input
                type="number"
                placeholder="No cap on this voucher"
                value={form.max_discount_amount}
                onChange={(e) =>
                  setField("max_discount_amount", e.target.value)
                }
              />
            </div>

            <div className="flex flex-col gap-y-2">
              <Label size="small">Minimum order value (VND)</Label>
              <Input
                type="number"
                placeholder="No minimum"
                value={form.min_order_value}
                onChange={(e) => setField("min_order_value", e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-y-2">
              <Label size="small">Per-customer usage limit</Label>
              <Input
                type="number"
                value={form.per_user_limit}
                onChange={(e) => setField("per_user_limit", e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label size="small">Stackable with other promotions</Label>
              <Switch
                checked={form.stackable_with_promotions}
                onCheckedChange={(v) =>
                  setField("stackable_with_promotions", v)
                }
              />
            </div>

            <div className="flex flex-col gap-y-2">
              <Label size="small">Applicable categories</Label>
              <Text size="small" className="text-ui-fg-subtle">
                Leave empty to apply to all categories.
              </Text>
              <CategoryMultiSelect
                value={form.applicable_category_ids}
                onChange={(ids) => setField("applicable_category_ids", ids)}
              />
            </div>

            <div className="flex flex-col gap-y-2">
              <Label size="small">Applicable products</Label>
              <Text size="small" className="text-ui-fg-subtle">
                Leave empty to apply to all products.
              </Text>
              <ProductMultiSelect
                value={form.applicable_product_ids}
                onChange={(ids) => setField("applicable_product_ids", ids)}
              />
            </div>

            <div className="flex items-center justify-between gap-x-2">
              {voucher ? (
                <>
                  <Button
                    size="small"
                    variant="danger"
                    onClick={() => setConfirmDisable(true)}
                  >
                    Disable voucher
                  </Button>
                  <Button
                    size="small"
                    onClick={handleSave}
                    isLoading={updateVoucher.isPending}
                  >
                    Save
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    size="small"
                    variant="secondary"
                    onClick={() => {
                      setEnabling(false);
                      setForm(EMPTY_FORM);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="small"
                    onClick={handleAttach}
                    isLoading={attachVoucher.isPending}
                  >
                    Enable as voucher
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <Prompt open={confirmDisable} onOpenChange={setConfirmDisable}>
        <Prompt.Content>
          <Prompt.Header>
            <Prompt.Title>Disable voucher</Prompt.Title>
            <Prompt.Description>
              Promotion sẽ không còn dùng được như voucher nữa. Hành động này
              không thể hoàn tác.
            </Prompt.Description>
          </Prompt.Header>
          <Prompt.Footer>
            <Prompt.Cancel>Cancel</Prompt.Cancel>
            <Prompt.Action onClick={handleDisable}>Disable</Prompt.Action>
          </Prompt.Footer>
        </Prompt.Content>
      </Prompt>
    </Container>
  );
};

export const config = defineWidgetConfig({
  zone: "promotion.details.side.after",
});

export default VoucherSettingsWidget;
