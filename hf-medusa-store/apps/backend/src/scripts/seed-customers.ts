import { ExecArgs } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { createCustomerAccountWorkflow } from "@medusajs/medusa/core-flows";

/**
 * Seed a few login-capable DEMO customer accounts — run with:
 *   npx medusa exec ./src/scripts/seed-customers.ts
 *
 * WHY: the top-seller pipeline (SUGG-001 Tier 2 / SPEC A.6) derives its ranking
 * from real orders, and orders need a customer. This creates stable demo
 * customers whose ids `seed-orders.ts` reuses, and whose credentials also let a
 * human log in via Postman (POST /auth/customer/emailpass) to exercise the
 * authenticated suggestion paths (e.g. the 30-day purchase-history filter, 2.3.4).
 *
 * Credentials are LOCAL DEV FIXTURES, not secrets (same posture as the committed
 * Postman admin password). Emails use the reserved `.test` TLD. Accounts are
 * documented in ONBOARDING.md at the repo root.
 *
 * Idempotent: guarded by email — skips any customer that already has an account.
 */

export const DEMO_PASSWORD = "supersecret";

export const DEMO_CUSTOMERS = [
  {
    email: "conghung@gmail.com",
    first_name: "Cong",
    last_name: "Hung",
  },
  {
    email: "ngocthuc@gmail.com",
    first_name: "Ngoc",
    last_name: "Thuc",
  },
  {
    email: "congson@gmail.com",
    first_name: "Cong",
    last_name: "Son",
  },
];

export default async function seedCustomers({ container }: ExecArgs) {
  const logger = container.resolve("logger");
  const auth = container.resolve(Modules.AUTH);
  const customerModule = container.resolve(Modules.CUSTOMER);

  let created = 0;
  for (const c of DEMO_CUSTOMERS) {
    // Idempotency guard — skip if a real account already exists for this email.
    const existing = await customerModule.listCustomers({ email: c.email });
    if (existing.some((x: any) => x.has_account)) {
      logger.info(`[seed:customers] ${c.email} already has an account — skip.`);
      continue;
    }

    // 1. Create the emailpass auth identity (no HTTP). Does NOT throw on
    //    duplicate — returns { success, authIdentity, error }.
    const reg = await auth.register("emailpass", {
      body: { email: c.email, password: DEMO_PASSWORD },
    });
    if (!reg.success || !reg.authIdentity) {
      logger.error(
        `[seed:customers] register failed for ${c.email}: ${reg.error}`,
      );
      continue;
    }

    // 2. Create the customer + link it to the identity (sets app_metadata.customer_id
    //    so emailpass login resolves to this customer).
    const { result: customer } = await createCustomerAccountWorkflow(
      container,
    ).run({
      input: {
        authIdentityId: reg.authIdentity.id,
        customerData: {
          email: c.email,
          first_name: c.first_name,
          last_name: c.last_name,
        },
      },
    });

    created++;
    logger.info(`[seed:customers] created ${customer.id} (${c.email}).`);
  }

  logger.info(
    `[seed:customers] done — ${created} new / ${DEMO_CUSTOMERS.length} demo customers (password: ${DEMO_PASSWORD}).`,
  );
}
