import { useEffect, useRef, useState } from "react";
import { Input, Text } from "@medusajs/ui";
import { XMark } from "@medusajs/icons";
import {
  useCustomerGroupNames,
  useCustomerGroupSearch,
} from "../lib/use-customer-groups";

type Props = {
  value?: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
};

/**
 * Async customer-group picker. Same shape as CategorySelect but resolves
 * against /admin/customer-groups. Layout uses inline styles (admin
 * extensions don't compile arbitrary Tailwind).
 */
export const CustomerGroupSelect = ({
  value,
  onChange,
  placeholder = "Tìm nhóm khách hàng…",
  disabled,
}: Props) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  const { data: results = [], isFetching } = useCustomerGroupSearch(
    open ? query : "",
  );
  const { data: names = {} } = useCustomerGroupNames(value ? [value] : []);
  const selected = value ? names[value] : undefined;

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
        <Text size="small" className="truncate" title={selected?.name ?? value}>
          {selected?.name ?? value}
        </Text>
        {!disabled && (
          <button
            type="button"
            onClick={() => onChange(null)}
            style={{ display: "flex", cursor: "pointer", marginLeft: "auto" }}
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
                Đang tìm…
              </Text>
            </div>
          )}
          {!isFetching && results.length === 0 && (
            <div style={{ padding: 12 }}>
              <Text size="small" className="text-ui-fg-muted">
                Không tìm thấy nhóm khách hàng nào
              </Text>
            </div>
          )}
          {results.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => {
                onChange(g.id);
                setOpen(false);
                setQuery("");
              }}
              className="hover:bg-ui-bg-base-hover"
              style={{
                display: "block",
                width: "100%",
                padding: "8px 12px",
                textAlign: "left",
                cursor: "pointer",
                background: "transparent",
                border: "none",
              }}
            >
              <Text size="small" className="truncate">
                {g.name}
              </Text>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default CustomerGroupSelect;
