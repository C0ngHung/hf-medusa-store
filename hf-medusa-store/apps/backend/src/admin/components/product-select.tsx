import { useEffect, useRef, useState } from "react";
import { Input, Text, clx } from "@medusajs/ui";
import { XMark } from "@medusajs/icons";
import { useProductSearch, useProductTitles } from "../lib/use-products";

type Props = {
  value?: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
};

/**
 * Async product picker. Resolves an id → title for display and lets the admin
 * search by name instead of pasting raw product ids. Layout uses inline styles
 * (admin extensions don't compile arbitrary Tailwind), controls use @medusajs/ui.
 */
export const ProductSelect = ({
  value,
  onChange,
  placeholder = "Search product…",
  disabled,
}: Props) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  const { data: results = [], isFetching } = useProductSearch(
    open ? query : "",
  );
  const { data: titles = {} } = useProductTitles(value ? [value] : []);
  const selected = value ? titles[value] : undefined;

  // Close on outside click.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (value && !open) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flex: 1,
            minWidth: 0,
          }}
        >
          {selected?.thumbnail && (
            <img
              src={selected.thumbnail}
              alt=""
              style={{
                width: 24,
                height: 24,
                borderRadius: 4,
                objectFit: "cover",
              }}
            />
          )}
          <Text
            size="small"
            className="truncate"
            title={selected?.title ?? value}
          >
            {selected?.title ?? value}
          </Text>
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={() => onChange(null)}
            style={{ display: "flex", cursor: "pointer" }}
            aria-label="Clear"
          >
            <XMark />
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <Input
        autoFocus={open}
        disabled={disabled}
        placeholder={placeholder}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
      />
      {open && (
        <div
          style={{
            position: "absolute",
            zIndex: 50,
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            maxHeight: 260,
            overflowY: "auto",
            borderRadius: 8,
            border: "1px solid var(--border-base, #e5e7eb)",
            background: "var(--bg-base, #fff)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          }}
        >
          {isFetching && (
            <div style={{ padding: 12 }}>
              <Text size="small" className="text-ui-fg-muted">
                Searching…
              </Text>
            </div>
          )}
          {!isFetching && results.length === 0 && (
            <div style={{ padding: 12 }}>
              <Text size="small" className="text-ui-fg-muted">
                No products found
              </Text>
            </div>
          )}
          {results.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onChange(p.id);
                setOpen(false);
                setQuery("");
              }}
              className={clx(
                "hover:bg-ui-bg-base-hover",
                "flex w-full items-center gap-2 text-left",
              )}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "8px 12px",
                cursor: "pointer",
                background: "transparent",
                border: "none",
              }}
            >
              {p.thumbnail && (
                <img
                  src={p.thumbnail}
                  alt=""
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 4,
                    objectFit: "cover",
                  }}
                />
              )}
              <span style={{ minWidth: 0 }}>
                <Text size="small" className="truncate">
                  {p.title}
                </Text>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProductSelect;
