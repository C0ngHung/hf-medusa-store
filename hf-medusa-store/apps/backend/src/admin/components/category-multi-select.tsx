import { Badge } from "@medusajs/ui";
import { XMarkMini } from "@medusajs/icons";
import { CategorySelect } from "./category-select";
import { useCategoryNames } from "../lib/use-categories";

type Props = {
  value: string[];
  onChange: (ids: string[]) => void;
};

/**
 * Pick multiple product categories by name. Selected ids render as removable
 * chips (name-resolved); the picker below appends one at a time. Keeps raw
 * `pcat_…` ids out of the admin's face.
 */
export const CategoryMultiSelect = ({ value, onChange }: Props) => {
  const { data: names = {} } = useCategoryNames(value);

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
      <CategorySelect
        value={null}
        placeholder="Add category…"
        onChange={(id) => {
          if (id && !value.includes(id)) onChange([...value, id]);
        }}
      />
    </div>
  );
};

export default CategoryMultiSelect;
