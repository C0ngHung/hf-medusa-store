import { MedusaContainer } from "@medusajs/framework";
import {
  ContainerRegistrationKeys,
  ModuleRegistrationName,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils";
import {
  createApiKeysWorkflow,
  createInventoryLevelsWorkflow,
  createProductCategoriesWorkflow,
  createProductsWorkflow,
  createPromotionsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createShippingOptionsWorkflow,
  createStockLocationsWorkflow,
  createStoresWorkflow,
  createTaxRegionsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
} from "@medusajs/medusa/core-flows";
import { S3_IMAGES } from "../data/product-images.generated";
import { FREE_SHIPPING_THRESHOLD } from "../modules/suggestive-selling/constants";
import seedSuggestiveSelling from "../scripts/seed-suggestive-selling";
import seedTierPromo from "../scripts/seed-tier-promo";
import seedCustomers from "../scripts/seed-customers";
import seedOrders from "../scripts/seed-orders";
import computeCategoryTopSellers from "../jobs/compute-category-top-sellers";
import { DEFAULT_CAP_PCT } from "../modules/voucher-engine/constants";
import { VOUCHER_ENGINE_MODULE } from "../modules/voucher-engine";
import { attachVoucherConfigWorkflow } from "../workflows/voucher-engine/admin/attach-voucher-config";

/**
 * Badminton catalog seed (VND).
 *
 * Init data for the team: run once on a fresh DB after migrations so everyone
 * has ready-to-use products. Categories match the SuggestiveSelling
 * CategoryComplementMapping (Rackets → Strings/Grips/Bags; Shoes → Socks/Insoles;
 * Shuttlecocks → Tubes), so the Tier-2 seed can resolve them afterwards.
 *
 * Run:  npx medusa exec ./src/migration-scripts/initial-data-seed.ts
 *   (or pnpm --filter @dtc/backend seed)
 * The script also chains SuggestiveSelling, VoucherEngine, demo Promotion,
 * customer, order, and top-seller seeds.
 *
 * Idempotent guard: skips entirely if a Default Sales Channel already exists.
 * All money is VND (integer, no minor units — SRS INT-01).
 */

const CATEGORY_NAMES = [
  "Rackets",
  "Strings",
  "Grips",
  "Bags",
  "Shoes",
  "Socks",
  "Insoles",
  "Shuttlecocks",
  "Tubes",
] as const;

// Mock image placeholder for products without real photos yet.
const mockImg = (handle: string) =>
  `https://placehold.co/800x800/png?text=${encodeURIComponent(handle)}`;

// Brand inferred from the handle prefix → product metadata.brand. Powers CR-03
// (same-brand accessories, SUGG-004), read via readBrand() in the cart engine.
// Keep in sync with scripts/backfill-product-brands.ts (which backfills existing
// data). Returns null for unbranded/generic products.
const brandOf = (handle: string): string | null => {
  const h = handle.toLowerCase();
  if (h.startsWith("yonex-")) return "Yonex";
  if (h.startsWith("victor-")) return "Victor";
  if (h.startsWith("lining-")) return "Li-Ning";
  return null;
};

// Real product photos (S3) live in ../data/product-images.generated.ts —
// regenerated from the DB after uploads. Missing products fall back to mockImg.

type ProductSeed = {
  title: string;
  handle: string;
  category: (typeof CATEGORY_NAMES)[number];
  description: string;
  weight: number;
  variants: { title: string; sku: string; price: number }[];
  optionTitle: string;
};

// Single-variant helper (most accessories/rackets have one SKU).
function single(
  title: string,
  handle: string,
  sku: string,
  category: ProductSeed["category"],
  price: number,
  description: string,
  weight = 200,
): ProductSeed {
  return {
    title,
    handle,
    category,
    description,
    weight,
    optionTitle: "Default",
    variants: [{ title: "Default", sku, price }],
  };
}

// Sized helper (shoes come in multiple sizes → multi-variant, no default).
function sized(
  title: string,
  handle: string,
  skuBase: string,
  category: ProductSeed["category"],
  price: number,
  description: string,
  sizes: string[],
  weight = 700,
): ProductSeed {
  return {
    title,
    handle,
    category,
    description,
    weight,
    optionTitle: "Size",
    variants: sizes.map((s) => ({ title: s, sku: `${skuBase}-${s}`, price })),
  };
}

const PRODUCTS: ProductSeed[] = [
  // ── Vợt (Rackets) ──
  single(
    "Yonex Astrox 99 Pro",
    "yonex-astrox-99-pro",
    "RKT-AX99PRO",
    "Rackets",
    4_500_000,
    "Vợt tấn công đầu nặng, cây vợt tín nhiệm của Kento Momota.",
    90,
  ),
  single(
    "Li-Ning Axforce 80",
    "lining-axforce-80",
    "RKT-AXF80",
    "Rackets",
    3_200_000,
    "Vợt công thủ toàn diện, khung khí động học.",
    88,
  ),
  single(
    "Victor Thruster Ryuga II",
    "victor-thruster-ryuga-2",
    "RKT-TKRYUGA2",
    "Rackets",
    3_800_000,
    "Vợt tấn công tốc độ cao, đầu nặng vừa.",
    89,
  ),
  single(
    "Yonex Nanoflare 800",
    "yonex-nanoflare-800",
    "RKT-NF800",
    "Rackets",
    4_100_000,
    "Vợt phòng thủ - tốc độ, đầu nhẹ vụt nhanh.",
    83,
  ),

  // ── Dây cước (Strings) ──
  single(
    "Yonex BG65",
    "yonex-bg65",
    "STR-BG65",
    "Strings",
    120_000,
    "Dây cước bền phổ thông, phù hợp người mới.",
    20,
  ),
  single(
    "Yonex BG80 Power",
    "yonex-bg80-power",
    "STR-BG80P",
    "Strings",
    150_000,
    "Dây cước lực đánh mạnh, âm thanh giòn.",
    20,
  ),
  single(
    "Li-Ning No.1",
    "lining-no1-string",
    "STR-LNNO1",
    "Strings",
    130_000,
    "Dây cước cân bằng lực và độ bền.",
    20,
  ),

  // ── Quấn cán (Grips) ──
  single(
    "Yonex AC102 Towel Grip",
    "yonex-ac102-towel-grip",
    "GRP-AC102",
    "Grips",
    90_000,
    "Quấn cán khăn thấm mồ hôi tốt.",
    30,
  ),
  single(
    "Yonex Super Grap AC104",
    "yonex-super-grap-ac104",
    "GRP-AC104",
    "Grips",
    110_000,
    "Quấn cán mỏng bám tay, cuộn 3 cái.",
    30,
  ),
  single(
    "Victor GR262",
    "victor-gr262-grip",
    "GRP-GR262",
    "Grips",
    70_000,
    "Quấn cán cơ bản, giá tốt.",
    30,
  ),

  // ── Bao/Túi (Bags) ──
  single(
    "Yonex Pro Racket Bag 92026",
    "yonex-pro-bag-92026",
    "BAG-92026",
    "Bags",
    1_800_000,
    "Túi vợt cao cấp 6 ngăn, giữ nhiệt.",
    1500,
  ),
  single(
    "Victor BR9213",
    "victor-br9213-bag",
    "BAG-BR9213",
    "Bags",
    1_200_000,
    "Túi vợt 2 ngăn tiện dụng.",
    1300,
  ),

  // ── Giày (Shoes) — đa size ──
  sized(
    "Yonex Power Cushion 65Z3",
    "yonex-pc-65z3",
    "SHO-65Z3",
    "Shoes",
    2_200_000,
    "Giày cầu lông đế êm, chống trơn.",
    ["40", "41", "42", "43"],
  ),
  sized(
    "Victor A970",
    "victor-a970",
    "SHO-A970",
    "Shoes",
    1_900_000,
    "Giày ổn định, ôm chân.",
    ["40", "41", "42", "43"],
  ),
  sized(
    "Li-Ning Ranger",
    "lining-ranger",
    "SHO-RANGER",
    "Shoes",
    1_600_000,
    "Giày phổ thông nhẹ.",
    ["40", "41", "42"],
  ),

  // ── Tất (Socks) ──
  single(
    "Yonex Sport Socks 19120",
    "yonex-socks-19120",
    "SOC-19120",
    "Socks",
    120_000,
    "Tất thể thao dày, thấm hút.",
    50,
  ),
  single(
    "Victor SK155",
    "victor-sk155-socks",
    "SOC-SK155",
    "Socks",
    90_000,
    "Tất cổ ngắn thoáng khí.",
    50,
  ),

  // ── Lót giày (Insoles) ──
  single(
    "Yonex Power Cushion Insole",
    "yonex-pc-insole",
    "INS-PC01",
    "Insoles",
    350_000,
    "Lót giày giảm chấn Power Cushion.",
    80,
  ),

  // ── Cầu lông (Shuttlecocks) — 5 quả cầu đơn, mỗi loại có combo 3 ống tương ứng ──
  single(
    "Yonex Mavis 350",
    "yonex-mavis-350",
    "SHU-MAVIS350",
    "Shuttlecocks",
    350_000,
    "Cầu nhựa bền, tập luyện, 1 ống 6 quả.",
    120,
  ),
  single(
    "Yonex Aerosensa 30",
    "yonex-as30",
    "SHU-AS30",
    "Shuttlecocks",
    850_000,
    "Cầu lông vũ thi đấu, 1 ống 12 quả.",
    130,
  ),
  single(
    "Yonex Aerosensa 50",
    "yonex-as50",
    "SHU-AS50",
    "Shuttlecocks",
    980_000,
    "Cầu lông vũ thi đấu cao cấp, 1 ống 12 quả.",
    130,
  ),
  single(
    "Yonex Mavis 2000",
    "yonex-mavis-2000",
    "SHU-MAVIS2000",
    "Shuttlecocks",
    420_000,
    "Cầu nhựa cao cấp, độ bền cao, 1 ống 6 quả.",
    120,
  ),
  single(
    "Li-Ning A+62",
    "lining-a62",
    "SHU-LNA62",
    "Shuttlecocks",
    620_000,
    "Cầu lông vũ tập luyện - thi đấu, 1 ống 12 quả.",
    130,
  ),

  // ── Ống cầu (Tubes) — mỗi loại: bản 1 ống (single, consumable của CR-04) + combo 3 ống (bulk) ──
  // 1 ống (single): bỏ vào giỏ qty 1 → CR-04 gợi combo 3 ống cùng loại.
  single(
    "Yonex Mavis 350 - 1 ống",
    "yonex-mavis-350-1tube",
    "TUB-MAVIS350X1",
    "Tubes",
    350_000,
    "1 ống cầu Mavis 350 (6 quả).",
    120,
  ),
  single(
    "Yonex Aerosensa 30 - 1 ống",
    "yonex-as30-1tube",
    "TUB-AS30X1",
    "Tubes",
    850_000,
    "1 ống cầu Aerosensa 30 (12 quả).",
    130,
  ),
  single(
    "Yonex Aerosensa 50 - 1 ống",
    "yonex-as50-1tube",
    "TUB-AS50X1",
    "Tubes",
    980_000,
    "1 ống cầu Aerosensa 50 (12 quả).",
    130,
  ),
  single(
    "Yonex Mavis 2000 - 1 ống",
    "yonex-mavis-2000-1tube",
    "TUB-MAVIS2000X1",
    "Tubes",
    420_000,
    "1 ống cầu Mavis 2000 (6 quả).",
    120,
  ),
  single(
    "Li-Ning A+62 - 1 ống",
    "lining-a62-1tube",
    "TUB-LNA62X1",
    "Tubes",
    620_000,
    "1 ống cầu Li-Ning A+62 (12 quả).",
    130,
  ),

  // combo 3 ống (bulk): thứ CR-04 gợi ý khi có bản 1 ống trong giỏ.
  single(
    "Yonex Mavis 350 - Combo 3 ống",
    "yonex-mavis-350-3tube",
    "TUB-MAVIS350X3",
    "Tubes",
    990_000,
    "Combo 3 ống cầu Mavis 350, giá tốt hơn/ống.",
    360,
  ),
  single(
    "Yonex Aerosensa 30 - Combo 3 ống",
    "yonex-as30-3tube",
    "TUB-AS30X3",
    "Tubes",
    2_400_000,
    "Combo 3 ống cầu Aerosensa 30, giá tốt hơn/ống.",
    380,
  ),
  single(
    "Yonex Aerosensa 50 - Combo 3 ống",
    "yonex-as50-3tube",
    "TUB-AS50X3",
    "Tubes",
    2_760_000,
    "Combo 3 ống cầu Aerosensa 50, giá tốt hơn/ống.",
    380,
  ),
  single(
    "Yonex Mavis 2000 - Combo 3 ống",
    "yonex-mavis-2000-3tube",
    "TUB-MAVIS2000X3",
    "Tubes",
    1_180_000,
    "Combo 3 ống cầu Mavis 2000, giá tốt hơn/ống.",
    360,
  ),
  single(
    "Li-Ning A+62 - Combo 3 ống",
    "lining-a62-3tube",
    "TUB-LNA62X3",
    "Tubes",
    1_740_000,
    "Combo 3 ống cầu Li-Ning A+62, giá tốt hơn/ống.",
    380,
  ),

  // ── Bổ sung để demo đầy đủ kịch bản gợi ý (Tier-1, CR-03 same-brand, CR-04 bulk) ──
  // Vợt thêm — có Tier-1 rule riêng + phục vụ CR-03 (giỏ toàn Yonex / toàn Victor).
  single(
    "Yonex Astrox 88D Pro",
    "yonex-astrox-88d-pro",
    "RKT-AX88DPRO",
    "Rackets",
    4_300_000,
    "Vợt đôi công đầu nặng, kiểm soát tốt.",
    89,
  ),
  single(
    "Victor Auraspeed 90K",
    "victor-auraspeed-90k",
    "RKT-AS90K",
    "Rackets",
    3_600_000,
    "Vợt tốc độ khung mỏng, ra đòn nhanh.",
    86,
  ),

  // Dây cước thêm (một Yonex, một Victor) — mở rộng Tier-2 & CR-01.
  single(
    "Yonex Aerobite",
    "yonex-aerobite",
    "STR-AEROBITE",
    "Strings",
    190_000,
    "Dây lai hybrid tăng độ xoáy.",
    20,
  ),
  single(
    "Victor VBS-63",
    "victor-vbs-63",
    "STR-VBS63",
    "Strings",
    140_000,
    "Dây cước êm, kiểm soát tốt.",
    20,
  ),

  // Quấn cán Yonex thêm — CR-03 same-brand Yonex.
  single(
    "Yonex AC105 Grip",
    "yonex-ac105-grip",
    "GRP-AC105",
    "Grips",
    100_000,
    "Quấn cán bám, thấm hút.",
    30,
  ),

  // Túi Victor — để giỏ toàn Victor có đủ vợt/dây/cán/túi cho CR-03.
  single(
    "Victor BR9111 Bag",
    "victor-br9111-bag",
    "BAG-BR9111",
    "Bags",
    1_100_000,
    "Túi vợt Victor 2 ngăn.",
    1300,
  ),
];

type VoucherSeed = {
  code: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  minOrderValue?: number | null;
  maxDiscountAmount?: number | null;
  categoryScope?: (typeof CATEGORY_NAMES)[number] | null;
  perUserLimit: number;
  usageLimit?: number | null;
  validOffset?: "past" | "future" | "active";
};

type AutoPromotionSeed = {
  code: string;
  discountPercent: number;
  productHandle: string;
  status: "active" | "inactive";
  note: string;
};

const VOUCHER_SEEDS: VoucherSeed[] = [
  {
    code: "SAVE10",
    discountType: "percentage",
    discountValue: 10,
    perUserLimit: 10,
  },
  {
    code: "OLD10",
    discountType: "percentage",
    discountValue: 10,
    perUserLimit: 10,
    validOffset: "past",
  },
  {
    code: "ONCE10",
    discountType: "percentage",
    discountValue: 10,
    perUserLimit: 1,
  },
  {
    code: "MEGA20",
    discountType: "percentage",
    discountValue: 20,
    perUserLimit: 10,
  },
  {
    code: "MEGA40",
    discountType: "percentage",
    discountValue: 40,
    maxDiscountAmount: 500_000,
    perUserLimit: 10,
  },
  {
    code: "MEGA50",
    discountType: "percentage",
    discountValue: 50,
    perUserLimit: 10,
  },
  {
    code: "FIX100K",
    discountType: "fixed",
    discountValue: 100_000,
    perUserLimit: 10,
  },
  {
    code: "RACKET20",
    discountType: "percentage",
    discountValue: 20,
    categoryScope: "Rackets",
    perUserLimit: 10,
  },
  {
    code: "SHUTTLE20",
    discountType: "percentage",
    discountValue: 20,
    minOrderValue: 200_000,
    categoryScope: "Shuttlecocks",
    perUserLimit: 10,
  },
];

const AUTO_PROMOTION_SEEDS: AutoPromotionSeed[] = [
  {
    code: "AUTO20_RACKET",
    discountPercent: 20,
    productHandle: "yonex-astrox-99-pro",
    status: "active",
    note: "Default active fixture for T-VOUCH-07.",
  },
  {
    code: "AUTO40_RACKET",
    discountPercent: 40,
    productHandle: "yonex-astrox-99-pro",
    status: "inactive",
    note: "Inactive by default. Activate only after disabling AUTO20_RACKET for T-VOUCH-08.",
  },
  {
    code: "AUTO30_STRING",
    discountPercent: 30,
    productHandle: "yonex-bg80-power",
    status: "inactive",
    note: "Inactive by default. Activate together with AUTO40_RACKET for T-VOUCH-08.",
  },
  {
    code: "AUTO50_SUGGESTED",
    discountPercent: 50,
    productHandle: "yonex-bg65",
    status: "inactive",
    note: "Inactive by default. Activate only for T-VOUCH-09.",
  },
];

function voucherWindow(offset: VoucherSeed["validOffset"] = "active") {
  const now = new Date();
  const validFrom = new Date(now);
  const validTo = new Date(now);

  if (offset === "past") {
    validFrom.setMonth(validFrom.getMonth() - 2);
    validTo.setMonth(validTo.getMonth() - 1);
    return { validFrom, validTo };
  }

  if (offset === "future") {
    validFrom.setMonth(validFrom.getMonth() + 1);
    validTo.setMonth(validTo.getMonth() + 13);
    return { validFrom, validTo };
  }

  validFrom.setDate(validFrom.getDate() - 1);
  validTo.setFullYear(validTo.getFullYear() + 1);
  return { validFrom, validTo };
}

async function seedVoucherAndPromotionFixtures(
  container: MedusaContainer,
  categoryIdByName: Map<string, string>,
  productIdByHandle: Map<string, string>,
) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const promotionModule: any = container.resolve(Modules.PROMOTION);
  const voucherEngine: any = container.resolve(VOUCHER_ENGINE_MODULE);

  const seededCodes = [
    ...VOUCHER_SEEDS.map((v) => v.code),
    ...AUTO_PROMOTION_SEEDS.map((p) => p.code),
  ];

  const existingPromotions = await promotionModule.listPromotions(
    { code: seededCodes },
    { select: ["id"] },
  );
  if (existingPromotions.length) {
    await promotionModule.deletePromotions(
      existingPromotions.map((promotion: any) => promotion.id),
    );
  }

  const existingVouchers = await voucherEngine.listVoucherConfigs(
    { code: VOUCHER_SEEDS.map((v) => v.code) },
    { select: ["id"] },
  );
  if (existingVouchers.length) {
    await voucherEngine.deleteVoucherConfigs(
      existingVouchers.map((voucher: any) => voucher.id),
    );
  }

  const existingCap = await voucherEngine.listDiscountCapConfigs(
    {},
    { select: ["id"] },
  );
  if (existingCap.length) {
    await voucherEngine.deleteDiscountCapConfigs(
      existingCap.map((cap: any) => cap.id),
    );
  }
  await voucherEngine.createDiscountCapConfigs({
    max_discount_percentage: DEFAULT_CAP_PCT,
    is_active: true,
    updated_by: "initial-data-seed",
  });

  for (const voucher of VOUCHER_SEEDS) {
    const { validFrom, validTo } = voucherWindow(voucher.validOffset);
    const categoryId = voucher.categoryScope
      ? categoryIdByName.get(voucher.categoryScope)
      : undefined;

    if (voucher.categoryScope && !categoryId) {
      logger.warn(
        `[seed:voucher] category "${voucher.categoryScope}" not found — ${voucher.code} seeded unscoped.`,
      );
    }

    const { result } = await createPromotionsWorkflow(container).run({
      input: {
        promotionsData: [
          {
            code: voucher.code,
            type: "standard" as const,
            status: "active" as const,
            is_automatic: false,
            limit: voucher.usageLimit ?? null,
            application_method: {
              type: voucher.discountType,
              target_type: voucher.categoryScope ? "items" : "order",
              allocation: "across",
              value: voucher.discountValue,
              currency_code: "vnd",
            },
          },
        ],
      },
    });

    await attachVoucherConfigWorkflow(container).run({
      input: {
        promotion_id: result[0].id,
        min_order_value: voucher.minOrderValue ?? null,
        max_discount_amount: voucher.maxDiscountAmount ?? null,
        applicable_product_ids: null,
        applicable_category_ids: categoryId ? [categoryId] : null,
        per_user_limit: voucher.perUserLimit,
        user_segment_conditions: null,
        valid_from: validFrom,
        valid_to: validTo,
      },
    });
  }

  for (const promotion of AUTO_PROMOTION_SEEDS) {
    const productId = productIdByHandle.get(promotion.productHandle);
    if (!productId) {
      logger.warn(
        `[seed:promotion] product "${promotion.productHandle}" not found — skip ${promotion.code}.`,
      );
      continue;
    }

    await createPromotionsWorkflow(container).run({
      input: {
        promotionsData: [
          {
            code: promotion.code,
            type: "standard" as const,
            status: promotion.status,
            is_automatic: true,
            application_method: {
              type: "percentage" as const,
              target_type: "items" as const,
              allocation: "across" as const,
              value: promotion.discountPercent,
              currency_code: "vnd",
              target_rules: [
                {
                  attribute: "items.product_id",
                  operator: "eq",
                  values: [productId],
                },
              ],
            },
          },
        ],
      },
    });
    logger.info(
      `[seed:promotion] ${promotion.code} (${promotion.status}) — ${promotion.note}`,
    );
  }

  logger.info(
    `[seed:voucher] created ${VOUCHER_SEEDS.length} VoucherEngine vouchers, ${AUTO_PROMOTION_SEEDS.length} automatic Promotion fixtures, and global cap ${DEFAULT_CAP_PCT} bp.`,
  );
}

export default async function initial_data_seed({
  container,
}: {
  container: MedusaContainer;
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const link = container.resolve(ContainerRegistrationKeys.LINK);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const salesChannelModule = container.resolve(Modules.SALES_CHANNEL);
  const fulfillmentModuleService = container.resolve(
    ModuleRegistrationName.FULFILLMENT,
  );

  // Idempotent guard — don't double-seed.
  const already = await salesChannelModule.listSalesChannels({
    name: "Default Sales Channel",
  });
  if (already.length) {
    logger.warn(
      "[seed] Default Sales Channel already exists — DB looks seeded. Skipping.",
    );
    return;
  }

  const countries = ["vn"];

  logger.info("[seed] store + sales channel...");
  const {
    result: [defaultSalesChannel],
  } = await createSalesChannelsWorkflow(container).run({
    input: {
      salesChannelsData: [
        { name: "Default Sales Channel", description: "HF Badminton" },
      ],
    },
  });

  const {
    result: [publishableApiKey],
  } = await createApiKeysWorkflow(container).run({
    input: {
      api_keys: [
        {
          title: "Default Publishable API Key",
          type: "publishable",
          created_by: "",
        },
      ],
    },
  });
  await linkSalesChannelsToApiKeyWorkflow(container).run({
    input: { id: publishableApiKey.id, add: [defaultSalesChannel.id] },
  });

  await createStoresWorkflow(container).run({
    input: {
      stores: [
        {
          name: "HF Badminton Store",
          supported_currencies: [{ currency_code: "vnd", is_default: true }],
          default_sales_channel_id: defaultSalesChannel.id,
        },
      ],
    },
  });

  logger.info("[seed] region + tax (Vietnam / VND)...");
  const { result: regionResult } = await createRegionsWorkflow(container).run({
    input: {
      regions: [
        {
          name: "Vietnam",
          currency_code: "vnd",
          countries,
          payment_providers: ["pp_system_default"],
        },
      ],
    },
  });
  const region = regionResult[0];
  await createTaxRegionsWorkflow(container).run({
    input: countries.map((country_code) => ({
      country_code,
      provider_id: "tp_system",
    })),
  });

  logger.info("[seed] stock location + fulfillment...");
  const { result: stockLocationResult } = await createStockLocationsWorkflow(
    container,
  ).run({
    input: {
      locations: [
        {
          name: "HCMC Warehouse",
          address: {
            city: "Ho Chi Minh City",
            country_code: "VN",
            address_1: "",
          },
        },
      ],
    },
  });
  const stockLocation = stockLocationResult[0];

  await link.create({
    [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
    [Modules.FULFILLMENT]: { fulfillment_provider_id: "manual_manual" },
  });

  const { data: shippingProfileResult } = await query.graph({
    entity: "shipping_profile",
    fields: ["id"],
  });
  const shippingProfile = shippingProfileResult[0];

  const fulfillmentSet = await fulfillmentModuleService.createFulfillmentSets({
    name: "Vietnam delivery",
    type: "shipping",
    service_zones: [
      { name: "Vietnam", geo_zones: [{ country_code: "vn", type: "country" }] },
    ],
  });
  await link.create({
    [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
    [Modules.FULFILLMENT]: { fulfillment_set_id: fulfillmentSet.id },
  });

  await createShippingOptionsWorkflow(container).run({
    input: [
      {
        name: "Standard Shipping",
        price_type: "flat",
        provider_id: "manual_manual",
        service_zone_id: fulfillmentSet.service_zones[0].id,
        shipping_profile_id: shippingProfile.id,
        type: {
          label: "Standard",
          description: "Giao 2-3 ngày.",
          code: "standard",
        },
        prices: [
          { currency_code: "vnd", amount: 30_000 },
          { region_id: region.id, amount: 30_000 },
          // OI-04: free standard shipping once the cart subtotal reaches the
          // FREE_SHIPPING_THRESHOLD (single-sourced with the CR-02 nudge). The
          // item_total price rule zeroes the flat rate above the threshold; the
          // storefront ShippingPriceNudge reads exactly this rule.
          {
            currency_code: "vnd",
            amount: 0,
            rules: [
              {
                attribute: "item_total",
                operator: "gte",
                value: FREE_SHIPPING_THRESHOLD,
              },
            ],
          },
          {
            region_id: region.id,
            amount: 0,
            rules: [
              {
                attribute: "item_total",
                operator: "gte",
                value: FREE_SHIPPING_THRESHOLD,
              },
            ],
          },
        ],
        rules: [
          { attribute: "enabled_in_store", value: "true", operator: "eq" },
          { attribute: "is_return", value: "false", operator: "eq" },
        ],
      },
      {
        name: "Express Shipping",
        price_type: "flat",
        provider_id: "manual_manual",
        service_zone_id: fulfillmentSet.service_zones[0].id,
        shipping_profile_id: shippingProfile.id,
        type: {
          label: "Express",
          description: "Giao trong 24h.",
          code: "express",
        },
        prices: [
          { currency_code: "vnd", amount: 60_000 },
          { region_id: region.id, amount: 60_000 },
          // OI-04: above the free-shipping threshold only the standard portion
          // (30.000₫) is waived — the customer still pays the express premium
          // (60.000₫ − 30.000₫ = 30.000₫). Adjustable independently later.
          {
            currency_code: "vnd",
            amount: 30_000,
            rules: [
              {
                attribute: "item_total",
                operator: "gte",
                value: FREE_SHIPPING_THRESHOLD,
              },
            ],
          },
          {
            region_id: region.id,
            amount: 30_000,
            rules: [
              {
                attribute: "item_total",
                operator: "gte",
                value: FREE_SHIPPING_THRESHOLD,
              },
            ],
          },
        ],
        rules: [
          { attribute: "enabled_in_store", value: "true", operator: "eq" },
          { attribute: "is_return", value: "false", operator: "eq" },
        ],
      },
    ],
  });

  await linkSalesChannelsToStockLocationWorkflow(container).run({
    input: { id: stockLocation.id, add: [defaultSalesChannel.id] },
  });

  logger.info("[seed] categories...");
  const { result: categoryResult } = await createProductCategoriesWorkflow(
    container,
  ).run({
    input: {
      product_categories: CATEGORY_NAMES.map((name) => ({
        name,
        is_active: true,
      })),
    },
  });
  const catId = (name: string) =>
    categoryResult.find((c) => c.name === name)!.id;

  logger.info(`[seed] ${PRODUCTS.length} products...`);
  await createProductsWorkflow(container).run({
    input: {
      products: PRODUCTS.map((p) => ({
        title: p.title,
        handle: p.handle,
        description: p.description,
        weight: p.weight,
        status: ProductStatus.PUBLISHED,
        // CR-03 brand (SUGG-004); omitted when generic/unbranded.
        ...(brandOf(p.handle)
          ? { metadata: { brand: brandOf(p.handle) } }
          : {}),
        shipping_profile_id: shippingProfile.id,
        thumbnail: S3_IMAGES[p.handle]?.thumbnail ?? mockImg(p.handle),
        images: (S3_IMAGES[p.handle]?.images ?? [mockImg(p.handle)]).map(
          (url) => ({ url }),
        ),
        category_ids: [catId(p.category)],
        options: [
          { title: p.optionTitle, values: p.variants.map((v) => v.title) },
        ],
        variants: p.variants.map((v) => ({
          title: v.title,
          sku: v.sku,
          manage_inventory: true,
          options: { [p.optionTitle]: v.title },
          prices: [{ amount: v.price, currency_code: "vnd" }],
        })),
        sales_channels: [{ id: defaultSalesChannel.id }],
      })),
    },
  });

  logger.info("[seed] inventory levels...");
  const { data: inventoryItems } = await query.graph({
    entity: "inventory_item",
    fields: ["id"],
  });
  await createInventoryLevelsWorkflow(container).run({
    input: {
      inventory_levels: inventoryItems.map((item) => ({
        location_id: stockLocation.id,
        stocked_quantity: 1000,
        inventory_item_id: item.id,
      })),
    },
  });

  logger.info(
    `[seed] Catalog done. ${CATEGORY_NAMES.length} categories, ${PRODUCTS.length} products (VND).`,
  );

  const { data: seededProducts } = await query.graph({
    entity: "product",
    fields: ["id", "handle"],
  });
  const categoryIdByName = new Map(
    categoryResult.map((category) => [category.name, category.id]),
  );
  const productIdByHandle = new Map(
    seededProducts
      .filter((product: any) => product.handle)
      .map((product: any) => [product.handle, product.id]),
  );

  // Chain every downstream seed so ONE `db:migrate` leaves a fully demo-ready DB.
  // Ordered by dependency — each step is idempotent, so re-running migrate is safe:
  //   1. suggestive     — rules / complement maps / bulk mappings (needs catalog)
  //   2. voucher        — canonical Promotions + VoucherConfig + automatic promo fixtures
  //   2b. tier promo    — automatic "5M → 5% off order" Medusa Promotion (EC-08)
  //   3. customers      — login-capable demo accounts (see DEMO_SCENARIOS.md)
  //   4. orders         — demo orders for those customers (needs customers + products)
  //   5. top-seller job — aggregate those orders → category_top_seller snapshot
  //      (SUGG-001 Tier 2 / SPEC A.6). Runs the REAL job so the Tier-2 ranking is
  //      order-derived; `seed-category-top-sellers.ts` stays a synthetic cold-start
  //      fallback for a DB with no orders.
  logger.info(
    "[seed] chaining module seeds (suggestive → voucher/promotion → tier promo → customers → orders → top-sellers)...",
  );
  // The seeds are authored as `medusa exec` scripts (ExecArgs = { container, args }).
  const execArgs = { container, args: [] as string[] };
  await seedSuggestiveSelling(execArgs);
  await seedVoucherAndPromotionFixtures(
    container,
    categoryIdByName,
    productIdByHandle,
  );
  await seedTierPromo(execArgs);
  await seedCustomers(execArgs);
  await seedOrders(execArgs);
  await computeCategoryTopSellers(container);
}
