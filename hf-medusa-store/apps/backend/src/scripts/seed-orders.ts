import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { DEMO_CUSTOMERS } from "./seed-customers";

/**
 * Seed a few low-volume "successful" DEMO orders — run with:
 *   npx medusa exec ./src/scripts/seed-orders.ts
 *
 * WHY: this is the REAL source of the Tier-2 top-seller ranking (SUGG-001 Tier 2
 * / SPEC A.6). The scheduled job `jobs/compute-category-top-sellers` aggregates
 * orders from the last 30 days into `category_top_seller`; without orders that
 * job produces nothing and the snapshot only exists via the synthetic
 * `seed-category-top-sellers` fixture. Seeding a handful of orders lets you:
 *   1. run the job (or wait for the cron) and watch the snapshot be built FROM orders,
 *   2. demo the cron end-to-end (temporarily set its schedule to every 2-3 min).
 *
 * Requires `seed-customers.ts` first (orders reference those demo customer ids).
 * Quantities are deliberately small so per-product counts land in the same ~1-10
 * range as the synthetic snapshot seed.
 *
 * Idempotent: deletes existing orders for the demo customers before re-inserting.
 */

// Any positive integer VND — the top-seller job aggregates quantity only and
// ignores unit_price, so this value is cosmetic (INT-01: money = integer VND).
const UNIT_PRICE = 100_000;

// email → [ [product handle, quantity], ... ]. Handles must exist in the catalog seed.
// Aggregated across orders this yields a clear ranking in the racket-complement
// categories (Strings/Grips/Bags): bg65=6 > pro-bag=4 > towel-grip=3 > vs-63/br9111=1.
const PURCHASES: Record<string, [string, number][]> = {
  "conghung@gmail.com": [
    ["yonex-bg65", 3],
    ["yonex-pro-bag-92026", 2],
    ["yonex-ac102-towel-grip", 1],
  ],
  "ngocthuc@gmail.com": [
    ["yonex-bg65", 2],
    ["yonex-pro-bag-92026", 2],
    ["victor-vbs-63", 1],
  ],
  "congson@gmail.com": [
    ["yonex-bg65", 1],
    ["yonex-ac102-towel-grip", 2],
    ["victor-br9111-bag", 1],
    ["yonex-socks-19120", 2],
  ],
};

export default async function seedOrders({ container }: ExecArgs) {
  const logger = container.resolve("logger");
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const orderModule = container.resolve(Modules.ORDER);
  const customerModule = container.resolve(Modules.CUSTOMER);
  const regionModule = container.resolve(Modules.REGION);
  const salesChannelModule = container.resolve(Modules.SALES_CHANNEL);

  // Resolve demo customers by email → id (seed-customers must have run).
  const emails = DEMO_CUSTOMERS.map((c) => c.email);
  const customers = await customerModule.listCustomers({ email: emails });
  const custIdByEmail = new Map(customers.map((c: any) => [c.email, c.id]));
  if (!custIdByEmail.size) {
    logger.warn(
      "[seed:orders] no demo customers found — run seed-customers.ts first. Aborting.",
    );
    return;
  }

  // Products by handle → { id, variant_id } (first variant).
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "variants.id"],
    pagination: { take: 1000, skip: 0 },
  });
  const byHandle = new Map(
    (products as any[]).map((p) => [
      p.handle,
      { id: p.id, variantId: p.variants?.[0]?.id ?? null },
    ]),
  );

  // Best-effort context (all optional on the order module create path).
  const [region] = await regionModule.listRegions({ name: "Vietnam" });
  const [salesChannel] = await salesChannelModule.listSalesChannels({
    name: "Default Sales Channel",
  });

  // Idempotent: remove prior orders for these demo customers.
  const custIds = [...custIdByEmail.values()];
  const existing = await orderModule.listOrders(
    { customer_id: custIds },
    { select: ["id"] },
  );
  if (existing.length) {
    await orderModule.deleteOrders(existing.map((o: any) => o.id));
    logger.info(
      `[seed:orders] removed ${existing.length} prior demo orders (idempotent).`,
    );
  }

  const orders: any[] = [];
  for (const [email, lines] of Object.entries(PURCHASES)) {
    const customerId = custIdByEmail.get(email);
    if (!customerId) {
      logger.warn(`[seed:orders] customer ${email} missing — skip its order.`);
      continue;
    }

    const items = lines
      .map(([handle, quantity]) => {
        const prod = byHandle.get(handle);
        if (!prod) {
          logger.warn(
            `[seed:orders] product "${handle}" not found — skip item.`,
          );
          return null;
        }
        return {
          title: handle,
          quantity,
          unit_price: UNIT_PRICE,
          product_id: prod.id,
          ...(prod.variantId ? { variant_id: prod.variantId } : {}),
        };
      })
      .filter(Boolean);

    if (!items.length) continue;

    orders.push({
      email,
      customer_id: customerId,
      currency_code: "vnd",
      ...(region ? { region_id: region.id } : {}),
      ...(salesChannel ? { sales_channel_id: salesChannel.id } : {}),
      status: "completed", // successful sale (semantic; job does not filter on status yet)
      items,
    });
  }

  if (orders.length) {
    await orderModule.createOrders(orders);
  }
  const totalUnits = Object.values(PURCHASES)
    .flat()
    .reduce((s, [, q]) => s + q, 0);
  logger.info(
    `[seed:orders] created ${orders.length} demo orders (${totalUnits} total units). Run 'run-topseller-job' (or the cron) to build category_top_seller from them.`,
  );
}
