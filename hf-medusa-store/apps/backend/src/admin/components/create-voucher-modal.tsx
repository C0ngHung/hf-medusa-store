import { useState } from "react";
import {
  Button,
  FocusModal,
  Heading,
  Input,
  Label,
  Select,
  Switch,
  Text,
  toast,
} from "@medusajs/ui";
import { CreateVoucherPayload, useCreateVoucher } from "../lib/api";
import {
  VOUCHER_DISCOUNT_TYPES,
  VoucherConfig,
  VoucherDiscountType,
} from "../lib/types";
import { CategoryMultiSelect } from "./category-multi-select";
import { ProductMultiSelect } from "./product-multi-select";

/** yyyy-mm-dd, `days` from today — sane defaults for the date inputs. */
function dateInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

type FormState = {
  code: string;
  discount_type: VoucherDiscountType;
  discount_value: string;
  min_order_value: string;
  max_discount_amount: string;
  applicable_product_ids: string[];
  applicable_category_ids: string[];
  stackable_with_promotions: boolean;
  per_user_limit: string;
  usage_limit: string;
  valid_from: string;
  valid_to: string;
  is_active: boolean;
};

const INITIAL_FORM: FormState = {
  code: "",
  discount_type: "percentage",
  discount_value: "",
  min_order_value: "",
  max_discount_amount: "",
  applicable_product_ids: [],
  applicable_category_ids: [],
  stackable_with_promotions: true,
  per_user_limit: "1",
  usage_limit: "",
  valid_from: dateInDays(0),
  valid_to: dateInDays(30),
  is_active: true,
};

/** Required-field checks only — everything else (format, ranges, window
 * ordering) is enforced server-side by CreateVoucherSchema and surfaced via
 * the API error toast, so it isn't duplicated here. */
function validate(form: FormState): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.discount_value.trim()) {
    errors.discount_value = "Discount value is required";
  }
  if (!form.valid_from) errors.valid_from = "Start date is required";
  if (!form.valid_to) errors.valid_to = "End date is required";
  return errors;
}

type Props = {
  open: boolean;
  onClose: () => void;
  /** Fired after a successful create, with the (possibly auto-generated) code. */
  onCreated: (voucher: VoucherConfig) => void;
};

export const CreateVoucherModal = ({ open, onClose, onCreated }: Props) => {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const createVoucher = useCreateVoucher();

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined as unknown as string }));
  };

  const reset = () => {
    setForm(INITIAL_FORM);
    setErrors({});
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      reset();
      onClose();
    }
  };

  const handleSubmit = async () => {
    const fieldErrors = validate(form);
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return;
    }

    const payload: CreateVoucherPayload = {
      code: form.code.trim() || undefined,
      discount_type: form.discount_type,
      discount_value: Number(form.discount_value),
      min_order_value: form.min_order_value.trim()
        ? Number(form.min_order_value)
        : null,
      max_discount_amount: form.max_discount_amount.trim()
        ? Number(form.max_discount_amount)
        : null,
      applicable_product_ids:
        form.applicable_product_ids.length > 0
          ? form.applicable_product_ids
          : null,
      applicable_category_ids:
        form.applicable_category_ids.length > 0
          ? form.applicable_category_ids
          : null,
      stackable_with_promotions: form.stackable_with_promotions,
      per_user_limit: form.per_user_limit.trim()
        ? Number(form.per_user_limit)
        : undefined,
      usage_limit: form.usage_limit.trim() ? Number(form.usage_limit) : null,
      valid_from: form.valid_from,
      valid_to: form.valid_to,
      is_active: form.is_active,
    };

    try {
      const { voucher } = await createVoucher.mutateAsync(payload);
      toast.success(`Voucher ${voucher.code} created`);
      reset();
      onCreated(voucher);
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to create voucher");
    }
  };

  return (
    <FocusModal open={open} onOpenChange={handleOpenChange}>
      <FocusModal.Content>
        <div className="flex h-full flex-col overflow-hidden">
          <FocusModal.Header>
            <div className="flex items-center justify-end gap-x-2">
              <FocusModal.Close asChild>
                <Button
                  size="small"
                  variant="secondary"
                  disabled={createVoucher.isPending}
                >
                  Cancel
                </Button>
              </FocusModal.Close>
              <Button
                size="small"
                onClick={handleSubmit}
                isLoading={createVoucher.isPending}
              >
                Create voucher
              </Button>
            </div>
          </FocusModal.Header>

          <FocusModal.Body className="flex-1 overflow-auto">
            <div className="mx-auto flex max-w-2xl flex-col gap-y-6 px-6 py-8">
              <div className="flex flex-col gap-y-1">
                <Heading level="h2">Create voucher</Heading>
                <Text size="small" className="text-ui-fg-subtle">
                  Create a new VoucherEngine voucher. Leave the code blank to
                  auto-generate one.
                </Text>
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <div className="col-span-2 flex flex-col gap-y-2 sm:col-span-1">
                  <Label size="small">Code (optional)</Label>
                  <Input
                    placeholder="Auto-generated if left blank"
                    value={form.code}
                    onChange={(e) => setField("code", e.target.value)}
                  />
                </div>

                <div className="col-span-2 flex flex-col gap-y-2 sm:col-span-1">
                  <Label size="small">Discount type *</Label>
                  <Select
                    value={form.discount_type}
                    onValueChange={(v) =>
                      setField("discount_type", v as VoucherDiscountType)
                    }
                  >
                    <Select.Trigger>
                      <Select.Value />
                    </Select.Trigger>
                    <Select.Content>
                      {VOUCHER_DISCOUNT_TYPES.map((t) => (
                        <Select.Item key={t} value={t}>
                          {t === "percentage" ? "Percentage" : "Fixed amount"}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select>
                </div>

                <div className="col-span-2 flex flex-col gap-y-2 sm:col-span-1">
                  <Label size="small">
                    Discount value *{" "}
                    <span className="text-ui-fg-subtle">
                      {form.discount_type === "percentage"
                        ? "(basis points, e.g. 2000 = 20%)"
                        : "(VND)"}
                    </span>
                  </Label>
                  <Input
                    type="number"
                    value={form.discount_value}
                    onChange={(e) => setField("discount_value", e.target.value)}
                  />
                  {errors.discount_value && (
                    <Text size="small" className="text-ui-fg-error">
                      {errors.discount_value}
                    </Text>
                  )}
                </div>

                <div className="col-span-2 flex flex-col gap-y-2 sm:col-span-1">
                  <Label size="small">Per-customer usage limit</Label>
                  <Input
                    type="number"
                    value={form.per_user_limit}
                    onChange={(e) => setField("per_user_limit", e.target.value)}
                  />
                </div>

                <div className="col-span-2 flex flex-col gap-y-2 sm:col-span-1">
                  <Label size="small">Minimum order value (VND)</Label>
                  <Input
                    type="number"
                    placeholder="No minimum"
                    value={form.min_order_value}
                    onChange={(e) =>
                      setField("min_order_value", e.target.value)
                    }
                  />
                </div>

                <div className="col-span-2 flex flex-col gap-y-2 sm:col-span-1">
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

                <div className="col-span-2 flex flex-col gap-y-2 sm:col-span-1">
                  <Label size="small">Total usage limit</Label>
                  <Input
                    type="number"
                    placeholder="Unlimited"
                    value={form.usage_limit}
                    onChange={(e) => setField("usage_limit", e.target.value)}
                  />
                </div>

                <div className="col-span-2 flex flex-col gap-y-2 sm:col-span-1">
                  <Label size="small">Start date *</Label>
                  <Input
                    type="date"
                    value={form.valid_from}
                    onChange={(e) => setField("valid_from", e.target.value)}
                  />
                  {errors.valid_from && (
                    <Text size="small" className="text-ui-fg-error">
                      {errors.valid_from}
                    </Text>
                  )}
                </div>

                <div className="col-span-2 flex flex-col gap-y-2 sm:col-span-1">
                  <Label size="small">End date *</Label>
                  <Input
                    type="date"
                    value={form.valid_to}
                    onChange={(e) => setField("valid_to", e.target.value)}
                  />
                  {errors.valid_to && (
                    <Text size="small" className="text-ui-fg-error">
                      {errors.valid_to}
                    </Text>
                  )}
                </div>

                <div className="col-span-2 flex flex-col gap-y-2">
                  <Label size="small">Applicable categories</Label>
                  <Text size="small" className="text-ui-fg-subtle">
                    Leave empty to apply to all categories.
                  </Text>
                  <CategoryMultiSelect
                    value={form.applicable_category_ids}
                    onChange={(ids) => setField("applicable_category_ids", ids)}
                  />
                </div>

                <div className="col-span-2 flex flex-col gap-y-2">
                  <Label size="small">Applicable products</Label>
                  <Text size="small" className="text-ui-fg-subtle">
                    Leave empty to apply to all products.
                  </Text>
                  <ProductMultiSelect
                    value={form.applicable_product_ids}
                    onChange={(ids) => setField("applicable_product_ids", ids)}
                  />
                </div>

                <div className="col-span-2 flex items-center justify-between sm:col-span-1">
                  <Label size="small">Stackable with other promotions</Label>
                  <Switch
                    checked={form.stackable_with_promotions}
                    onCheckedChange={(v) =>
                      setField("stackable_with_promotions", v)
                    }
                  />
                </div>

                <div className="col-span-2 flex items-center justify-between sm:col-span-1">
                  <Label size="small">Active</Label>
                  <Switch
                    checked={form.is_active}
                    onCheckedChange={(v) => setField("is_active", v)}
                  />
                </div>
              </div>
            </div>
          </FocusModal.Body>
        </div>
      </FocusModal.Content>
    </FocusModal>
  );
};

export default CreateVoucherModal;
