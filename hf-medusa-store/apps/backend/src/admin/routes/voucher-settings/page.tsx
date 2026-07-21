import { defineRouteConfig } from "@medusajs/admin-sdk";
import { CogSixTooth } from "@medusajs/icons";
import { Heading, Text } from "@medusajs/ui";
import { DiscountCapConfigSection } from "../../components/discount-cap-config-section";

/**
 * UI-4 — global VoucherEngine settings (SRS §5.2/§5.3; Rebuild Phase 3B).
 *
 * `DiscountCapConfig` is a store-wide singleton, not tied to any one
 * Promotion or voucher — it does not belong on Promotion Detail (that's
 * UI-2A/UI-3's territory, VoucherConfig-scoped) or on a per-voucher surface.
 * This is a plain top-level admin route (no `nested` — verified
 * `NESTED_ROUTE_POSITIONS` in `@medusajs/admin-shared` does not include a
 * Settings anchor, so a clean nested-under-Settings placement isn't
 * available; a top-level sidebar entry is the supported mechanism, same
 * convention as the legacy `/vouchers` page and every other custom route in
 * this admin).
 *
 * Reuses `DiscountCapConfigSection` as-is (`GET`/`POST
 * /admin/discount-cap-config`, unchanged) — this route only supplies the
 * page-level header giving it its own global-settings context, matching the
 * page-header + Container-section convention already used elsewhere in this
 * admin (e.g. the legacy Vouchers page's own H1 above its sections).
 */
const VoucherSettingsPage = () => {
  return (
    <div className="flex flex-col gap-y-4">
      <div className="flex flex-col gap-y-1 px-1">
        <Heading level="h1">Voucher settings</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Store-wide VoucherEngine configuration. Applies to every voucher — not
          specific to any one Promotion.
        </Text>
      </div>

      <DiscountCapConfigSection />
    </div>
  );
};

export const config = defineRouteConfig({
  label: "Voucher settings",
  icon: CogSixTooth,
});

export default VoucherSettingsPage;
