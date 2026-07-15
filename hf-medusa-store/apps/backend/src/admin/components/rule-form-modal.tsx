import { useEffect, useState } from "react";
import {
  Badge,
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
import { Plus, Trash } from "@medusajs/icons";
import { ProductSelect } from "./product-select";
import { CategoryMultiSelect } from "./category-multi-select";
import {
  CONDITION_TYPES,
  type CartSuggestionCondition,
  type ConditionType,
  type RuleTier,
  type RuleType,
  type SuggestionRule,
  type SuggestionRuleItem,
} from "../lib/types";
import { useCreateRule, useUpdateRule, type RulePayload } from "../lib/api";

type Props = {
  open: boolean;
  onClose: () => void;
  rule?: SuggestionRule | null;
  /** default type for a fresh rule when created from a filtered tab */
  defaultType?: RuleType;
};

type ItemDraft = SuggestionRuleItem;

/**
 * A cart condition, held as structured fields instead of raw JSON so admins pick
 * categories by name (no `pcat_…` ids). Only the fields relevant to the chosen
 * condition_type are read when building condition_params (see condToParams).
 */
type CondDraft = {
  condition_type: ConditionType;
  source_category_ids: string[]; // category_missing
  accessory_category_ids: string[]; // brand_match
  consumable_category_ids: string[]; // consumable_upsell (optional scope)
  max_quantity: string; // consumable_upsell
  percentage: string; // threshold_near (fraction, e.g. 0.15)
  badge_text: string; // threshold_near
};

const emptyCond = (
  condition_type: ConditionType = "category_missing",
): CondDraft => ({
  condition_type,
  source_category_ids: [],
  accessory_category_ids: [],
  consumable_category_ids: [],
  max_quantity: "",
  percentage: "",
  badge_text: "",
});

/** Existing condition_params → structured draft (edit path). */
const condFromParams = (c: CartSuggestionCondition): CondDraft => {
  const p = (c.condition_params ?? {}) as Record<string, any>;
  const arr = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);
  return {
    condition_type: c.condition_type,
    source_category_ids: arr(p.source_category_ids),
    accessory_category_ids: arr(p.accessory_category_ids),
    consumable_category_ids: arr(p.consumable_category_ids),
    max_quantity: p.max_quantity != null ? String(p.max_quantity) : "",
    percentage: p.percentage != null ? String(p.percentage) : "",
    badge_text: typeof p.badge_text === "string" ? p.badge_text : "",
  };
};

/** Structured draft → condition_params for the API (submit path). */
const condToParams = (c: CondDraft): Record<string, unknown> => {
  switch (c.condition_type) {
    case "category_missing":
      return { source_category_ids: c.source_category_ids };
    case "brand_match":
      return { accessory_category_ids: c.accessory_category_ids };
    case "consumable_upsell": {
      const p: Record<string, unknown> = {};
      if (c.max_quantity.trim())
        p.max_quantity = parseInt(c.max_quantity, 10) || 0;
      if (c.consumable_category_ids.length)
        p.consumable_category_ids = c.consumable_category_ids;
      return p;
    }
    case "threshold_near": {
      const p: Record<string, unknown> = {};
      if (c.percentage.trim()) p.percentage = Number(c.percentage);
      if (c.badge_text.trim()) p.badge_text = c.badge_text.trim();
      return p;
    }
    default:
      return {};
  }
};

const toDatetimeLocal = (v?: string | null) => {
  if (!v) return "";
  // strip seconds/zone for the datetime-local input
  return new Date(v).toISOString().slice(0, 16);
};

export const RuleFormModal = ({
  open,
  onClose,
  rule,
  defaultType = "product",
}: Props) => {
  const isEdit = !!rule;
  const create = useCreateRule();
  const update = useUpdateRule(rule?.id ?? "");

  const [name, setName] = useState("");
  const [type, setType] = useState<RuleType>(defaultType);
  const [tier, setTier] = useState<RuleTier>("manual");
  const [priority, setPriority] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [sources, setSources] = useState<(string | null)[]>([]);
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [conditions, setConditions] = useState<CondDraft[]>([]);

  // Hydrate form when the modal opens (create → blank, edit → from rule).
  useEffect(() => {
    if (!open) return;
    if (rule) {
      setName(rule.name);
      setType(rule.type);
      setTier(rule.tier);
      setPriority(String(rule.priority ?? 0));
      setIsActive(rule.is_active);
      setValidFrom(toDatetimeLocal(rule.valid_from));
      setValidTo(toDatetimeLocal(rule.valid_to));
      setSources((rule.sources ?? []).map((s) => s.source_product_id));
      setItems(
        (rule.items ?? [])
          .slice()
          .sort((a, b) => a.display_order - b.display_order)
          .map((i) => ({
            suggested_product_id: i.suggested_product_id,
            display_order: i.display_order,
            custom_label: i.custom_label ?? "",
          })),
      );
      setConditions((rule.conditions ?? []).map(condFromParams));
    } else {
      setName("");
      setType(defaultType);
      setTier("manual");
      setPriority("0");
      setIsActive(true);
      setValidFrom("");
      setValidTo("");
      setSources([]);
      setItems([]);
      setConditions([]);
    }
  }, [open, rule, defaultType]);

  const submitting = create.isPending || update.isPending;

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }

    // Build condition_params from the structured fields per condition_type.
    const parsedConditions = conditions.map((c) => ({
      condition_type: c.condition_type,
      condition_params: condToParams(c),
    }));

    const cleanItems = items
      .filter((i) => i.suggested_product_id)
      .map((i, idx) => ({
        suggested_product_id: i.suggested_product_id,
        display_order: Number.isFinite(i.display_order) ? i.display_order : idx,
        custom_label: i.custom_label?.trim() ? i.custom_label.trim() : null,
      }));

    const payload: RulePayload = {
      name: name.trim(),
      type,
      tier,
      priority: parseInt(priority, 10) || 0,
      is_active: isActive,
      valid_from: validFrom ? new Date(validFrom).toISOString() : null,
      valid_to: validTo ? new Date(validTo).toISOString() : null,
      source_product_ids: sources.filter((s): s is string => !!s),
      items: type === "product" ? cleanItems : [],
      conditions: type === "cart" ? parsedConditions : [],
    };

    try {
      if (isEdit) {
        await update.mutateAsync(payload);
        toast.success("Rule updated");
      } else {
        await create.mutateAsync(payload);
        toast.success("Rule created");
      }
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save rule");
    }
  };

  return (
    <FocusModal open={open} onOpenChange={(v) => !v && onClose()}>
      <FocusModal.Content>
        <FocusModal.Header>
          <Button size="small" onClick={handleSubmit} isLoading={submitting}>
            {isEdit ? "Save changes" : "Create rule"}
          </Button>
        </FocusModal.Header>
        <FocusModal.Body className="flex flex-col items-center overflow-y-auto py-8">
          <div className="flex w-full max-w-2xl flex-col gap-y-6 px-4">
            <div>
              <Heading level="h2">
                {isEdit ? "Edit suggestion rule" : "New suggestion rule"}
              </Heading>
              <Text className="text-ui-fg-subtle" size="small">
                {type === "product"
                  ? "Product-page rule (curated Tier-1 items shown on a product's page)."
                  : "Cart-page rule (condition-driven suggestions in the cart)."}
              </Text>
            </div>

            {/* Basic fields */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Name" className="col-span-2">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Nanoflare 800 — Complete setup"
                />
              </Field>

              <Field label="Type">
                <Select
                  value={type}
                  onValueChange={(v) => setType(v as RuleType)}
                >
                  <Select.Trigger>
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="product">product</Select.Item>
                    <Select.Item value="cart">cart</Select.Item>
                  </Select.Content>
                </Select>
              </Field>

              <Field label="Tier">
                <div className="flex h-8 items-center gap-2">
                  <Badge size="2xsmall">{tier}</Badge>
                  {tier === "manual" ? (
                    <Text size="xsmall" className="text-ui-fg-muted">
                      Manual curation (Tier-1)
                    </Text>
                  ) : (
                    <Text size="xsmall" className="text-ui-fg-error">
                      Not consumed by the engine — only “manual” rules render.
                    </Text>
                  )}
                </div>
              </Field>

              <Field label="Priority">
                <Input
                  type="number"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                />
              </Field>

              <Field label="Active">
                <div className="flex h-8 items-center">
                  <Switch checked={isActive} onCheckedChange={setIsActive} />
                </div>
              </Field>

              <Field label="Valid from (optional)">
                <Input
                  type="datetime-local"
                  value={validFrom}
                  onChange={(e) => setValidFrom(e.target.value)}
                />
              </Field>

              <Field label="Valid to (optional)">
                <Input
                  type="datetime-local"
                  value={validTo}
                  onChange={(e) => setValidTo(e.target.value)}
                />
              </Field>
            </div>

            {/* Sources — which products trigger this rule (product rules) */}
            {type === "product" && (
              <Section
                title="Trigger products"
                hint="Products whose page shows these suggestions."
                onAdd={() => setSources((s) => [...s, null])}
              >
                {sources.length === 0 && <Empty />}
                {sources.map((src, idx) => (
                  <Row
                    key={idx}
                    onRemove={() =>
                      setSources((s) => s.filter((_, i) => i !== idx))
                    }
                  >
                    <div className="flex-1">
                      <ProductSelect
                        value={src}
                        onChange={(id) =>
                          setSources((s) =>
                            s.map((v, i) => (i === idx ? id : v)),
                          )
                        }
                      />
                    </div>
                  </Row>
                ))}
              </Section>
            )}

            {/* Items — curated suggested products (product rules only;
                cart rules derive suggestions from conditions, not curated items) */}
            {type === "product" && (
              <Section
                title="Suggested items"
                hint="Products to suggest, in display order. First item can carry a label (e.g. Best Match)."
                onAdd={() =>
                  setItems((it) => [
                    ...it,
                    {
                      suggested_product_id: "",
                      display_order: it.length,
                      custom_label: "",
                    },
                  ])
                }
              >
                {items.length === 0 && <Empty />}
                {items.map((item, idx) => (
                  <Row
                    key={idx}
                    onRemove={() =>
                      setItems((it) => it.filter((_, i) => i !== idx))
                    }
                  >
                    <div className="flex-1">
                      <ProductSelect
                        value={item.suggested_product_id || null}
                        onChange={(id) =>
                          setItems((it) =>
                            it.map((v, i) =>
                              i === idx
                                ? { ...v, suggested_product_id: id ?? "" }
                                : v,
                            ),
                          )
                        }
                      />
                    </div>
                    <div style={{ width: 80 }}>
                      <Input
                        type="number"
                        value={String(item.display_order)}
                        title="Display order"
                        onChange={(e) =>
                          setItems((it) =>
                            it.map((v, i) =>
                              i === idx
                                ? {
                                    ...v,
                                    display_order: Number(e.target.value),
                                  }
                                : v,
                            ),
                          )
                        }
                      />
                    </div>
                    <div style={{ width: 140 }}>
                      <Input
                        placeholder="Label"
                        value={item.custom_label ?? ""}
                        onChange={(e) =>
                          setItems((it) =>
                            it.map((v, i) =>
                              i === idx
                                ? { ...v, custom_label: e.target.value }
                                : v,
                            ),
                          )
                        }
                      />
                    </div>
                  </Row>
                ))}
              </Section>
            )}

            {/* Conditions — cart rules only */}
            {type === "cart" && (
              <Section
                title="Conditions"
                hint="Cart conditions that trigger this rule (ANDed together)."
                onAdd={() => setConditions((c) => [...c, emptyCond()])}
              >
                {conditions.length === 0 && <Empty />}
                {conditions.map((cond, idx) => {
                  const patch = (p: Partial<CondDraft>) =>
                    setConditions((c) =>
                      c.map((x, i) => (i === idx ? { ...x, ...p } : x)),
                    );
                  return (
                    <div
                      key={idx}
                      className="bg-ui-bg-subtle flex flex-col gap-3 rounded-lg p-3"
                    >
                      <Row
                        onRemove={() =>
                          setConditions((c) => c.filter((_, i) => i !== idx))
                        }
                      >
                        <div className="flex-1">
                          <Select
                            value={cond.condition_type}
                            onValueChange={(v) =>
                              patch({ condition_type: v as ConditionType })
                            }
                          >
                            <Select.Trigger>
                              <Select.Value />
                            </Select.Trigger>
                            <Select.Content>
                              {CONDITION_TYPES.map((ct) => (
                                <Select.Item key={ct} value={ct}>
                                  {ct}
                                </Select.Item>
                              ))}
                            </Select.Content>
                          </Select>
                        </div>
                      </Row>

                      {cond.condition_type === "category_missing" && (
                        <Field label="Source categories (cart has one of these but is missing a complement)">
                          <CategoryMultiSelect
                            value={cond.source_category_ids}
                            onChange={(ids) =>
                              patch({ source_category_ids: ids })
                            }
                          />
                        </Field>
                      )}

                      {cond.condition_type === "brand_match" && (
                        <Field label="Accessory categories to suggest">
                          <CategoryMultiSelect
                            value={cond.accessory_category_ids}
                            onChange={(ids) =>
                              patch({ accessory_category_ids: ids })
                            }
                          />
                        </Field>
                      )}

                      {cond.condition_type === "consumable_upsell" && (
                        <>
                          <Field label="Max quantity (fires when a consumable line is at or below this)">
                            <Input
                              type="number"
                              placeholder="1"
                              value={cond.max_quantity}
                              onChange={(e) =>
                                patch({ max_quantity: e.target.value })
                              }
                            />
                          </Field>
                          <Field label="Limit to categories (optional — leave empty for all consumables)">
                            <CategoryMultiSelect
                              value={cond.consumable_category_ids}
                              onChange={(ids) =>
                                patch({ consumable_category_ids: ids })
                              }
                            />
                          </Field>
                        </>
                      )}

                      {cond.condition_type === "threshold_near" && (
                        <>
                          <Field label="Percentage below threshold (fraction, e.g. 0.15 = within 15%)">
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="0.15"
                              value={cond.percentage}
                              onChange={(e) =>
                                patch({ percentage: e.target.value })
                              }
                            />
                          </Field>
                          <Field label="Badge text (optional)">
                            <Input
                              placeholder="Add for FREE shipping!"
                              value={cond.badge_text}
                              onChange={(e) =>
                                patch({ badge_text: e.target.value })
                              }
                            />
                          </Field>
                        </>
                      )}
                    </div>
                  );
                })}
              </Section>
            )}
          </div>
        </FocusModal.Body>
      </FocusModal.Content>
    </FocusModal>
  );
};

/* ---- small layout helpers ---- */

const Field = ({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={className}>
    <Label size="small" className="mb-1 block">
      {label}
    </Label>
    {children}
  </div>
);

const Section = ({
  title,
  hint,
  onAdd,
  children,
}: {
  title: string;
  hint?: string;
  onAdd: () => void;
  children: React.ReactNode;
}) => (
  <div className="border-ui-border-base flex flex-col gap-2 rounded-lg border p-4">
    <div className="flex items-center justify-between">
      <div>
        <Text weight="plus" size="small">
          {title}
        </Text>
        {hint && (
          <Text size="xsmall" className="text-ui-fg-muted">
            {hint}
          </Text>
        )}
      </div>
      <Button variant="secondary" size="small" type="button" onClick={onAdd}>
        <Plus /> Add
      </Button>
    </div>
    <div className="flex flex-col gap-2">{children}</div>
  </div>
);

const Row = ({
  children,
  onRemove,
}: {
  children: React.ReactNode;
  onRemove: () => void;
}) => (
  <div className="flex items-start gap-2">
    {children}
    <Button
      variant="transparent"
      size="small"
      type="button"
      onClick={onRemove}
      aria-label="Remove"
    >
      <Trash />
    </Button>
  </div>
);

const Empty = () => (
  <Text size="small" className="text-ui-fg-muted">
    None yet.
  </Text>
);

export default RuleFormModal;
