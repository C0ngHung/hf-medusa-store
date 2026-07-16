import { Badge } from "@medusajs/ui";
import { XMarkMini } from "@medusajs/icons";
import { ProductSelect } from "./product-select";
import { useProductTitles } from "../lib/use-products";

type Props = {
  value: string[];
  onChange: (ids: string[]) => void;
};

/**
 * Pick multiple products by title. Selected ids render as removable chips
 * (title-resolved); the picker below appends one at a time. Same shape as
 * CategoryMultiSelect — keeps raw `prod_…` ids out of the admin's face.
 */
export const ProductMultiSelect = ({ value, onChange }: Props) => {
  const { data: titles = {} } = useProductTitles(value);

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((id) => (
            <Badge key={id} size="2xsmall" className="flex items-center gap-1">
              {titles[id]?.title ?? id}
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
      <ProductSelect
        value={null}
        placeholder="Add product…"
        onChange={(id) => {
          if (id && !value.includes(id)) onChange([...value, id]);
        }}
      />
    </div>
  );
};

export default ProductMultiSelect;
