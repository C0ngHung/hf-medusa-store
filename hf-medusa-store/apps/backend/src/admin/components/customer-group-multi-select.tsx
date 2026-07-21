import { Badge } from "@medusajs/ui";
import { XMarkMini } from "@medusajs/icons";
import { CustomerGroupSelect } from "./customer-group-select";
import { useCustomerGroupNames } from "../lib/use-customer-groups";

type Props = {
  value: string[];
  onChange: (ids: string[]) => void;
};

/**
 * Pick multiple Customer Groups by name — the structured replacement for the
 * old free-text `user_segment_conditions` JSON input (bug-bash finding,
 * 2026-07-21: admins had no way to know the expected shape and could enter
 * valid-but-meaningless JSON). `resolveCustomerSegment`
 * (`workflows/voucher-engine/lib/customer-segment.ts`) is the only runtime
 * consumer of this field and reads exactly `{ customer_group_ids: string[] }`
 * — this control writes that shape directly, so there is no schema to get
 * wrong. Same chips-plus-picker shape as `CategoryMultiSelect`.
 */
export const CustomerGroupMultiSelect = ({ value, onChange }: Props) => {
  const { data: names = {} } = useCustomerGroupNames(value);

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((id) => (
            <Badge key={id} size="2xsmall" className="flex items-center gap-1">
              {names[id]?.name ?? id}
              <button
                type="button"
                aria-label="Remove"
                style={{ display: "flex", cursor: "pointer" }}
                onClick={() => onChange(value.filter((v) => v !== id))}
              >
                <XMarkMini />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <CustomerGroupSelect
        value={null}
        placeholder="Thêm nhóm khách hàng…"
        onChange={(id) => {
          if (id && !value.includes(id)) onChange([...value, id]);
        }}
      />
    </div>
  );
};

export default CustomerGroupMultiSelect;
