import { useEffect, useState } from "react";
import {
  Button,
  Container,
  Heading,
  Input,
  Label,
  Text,
  toast,
} from "@medusajs/ui";
import { useDiscountCapConfig, useUpsertDiscountCapConfig } from "../lib/api";

const MIN_BPS = 0;
const MAX_BPS = 10000;

function formatDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Integer basis points, 0–10000 — mirrors UpsertDiscountCapConfigSchema server-side. */
function validate(raw: string): string | null {
  if (!raw.trim()) return "Value is required";
  const n = Number(raw);
  if (!Number.isInteger(n)) return "Must be a whole number (basis points)";
  if (n < MIN_BPS || n > MAX_BPS) return "Must be between 0 and 10000";
  return null;
}

/**
 * Global discount cap config (SRS §5.2/§5.3; Rebuild Phase 3B). Folded into
 * the existing standalone Vouchers page rather than a new location — it's a
 * Promotion-agnostic global singleton, so it doesn't fit as a per-Promotion
 * widget (deferred to a later phase, see rebuild-decisions.md).
 */
export const DiscountCapConfigSection = () => {
  const { data, isLoading, isError, refetch } = useDiscountCapConfig();
  const upsert = useUpsertDiscountCapConfig();

  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Sync the input from the fetched value once loaded — after that the user's
  // own typing takes over until they save (a fresh save re-syncs via `data`
  // updating post-invalidation).
  useEffect(() => {
    if (data?.discount_cap_config) {
      setValue(String(data.discount_cap_config.max_discount_percentage));
    }
  }, [data?.discount_cap_config.max_discount_percentage]);

  const handleSave = async () => {
    const fieldError = validate(value);
    if (fieldError) {
      setError(fieldError);
      return;
    }
    setError(null);

    try {
      const { discount_cap_config } = await upsert.mutateAsync({
        max_discount_percentage: Number(value),
      });
      toast.success(
        `Global discount cap saved (${discount_cap_config.max_discount_percentage / 100}%)`,
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save the discount cap");
    }
  };

  return (
    <Container className="p-0">
      <div className="flex flex-col gap-y-1 px-6 py-4">
        <Heading level="h2">Global discount cap</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Store-wide ceiling on combined item-promotion + voucher discount (SRS
          §5.3, VOUCH-003). Trims only the voucher, never the item promotion.
        </Text>
      </div>

      <div className="border-ui-border-base border-t px-6 py-6">
        {isLoading ? (
          <Text size="small" className="text-ui-fg-muted">
            Loading…
          </Text>
        ) : isError ? (
          <div className="flex flex-col items-start gap-y-3">
            <Text size="small" className="text-ui-fg-error">
              Failed to load the discount cap.
            </Text>
            <Button size="small" variant="secondary" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-y-4">
            <div className="flex flex-col gap-y-2 sm:max-w-xs">
              <Label size="small">
                Max discount percentage{" "}
                <span className="text-ui-fg-subtle">
                  (basis points, e.g. 5000 = 50%)
                </span>
              </Label>
              <Input
                type="number"
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setError(null);
                }}
              />
              {error && (
                <Text size="small" className="text-ui-fg-error">
                  {error}
                </Text>
              )}
            </div>

            <div className="flex items-center gap-x-4">
              <Button
                size="small"
                onClick={handleSave}
                isLoading={upsert.isPending}
              >
                Save
              </Button>
              {data?.discount_cap_config.id === null && (
                <Text size="small" className="text-ui-fg-subtle">
                  No active row yet — this is the effective default.
                </Text>
              )}
            </div>

            <div className="flex flex-col gap-y-1">
              <Text size="small" className="text-ui-fg-subtle">
                Last updated:{" "}
                {formatDate(data?.discount_cap_config.updated_at ?? null)}
                {data?.discount_cap_config.updated_by
                  ? ` by ${data.discount_cap_config.updated_by}`
                  : ""}
              </Text>
            </div>
          </div>
        )}
      </div>
    </Container>
  );
};

export default DiscountCapConfigSection;
