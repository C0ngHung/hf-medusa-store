import { Modules } from "@medusajs/framework/utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import jwt from "jsonwebtoken";

/**
 * Bootstrap an authenticated STORE customer for HTTP integration tests.
 * `/store/customers/me*` is gated by a core Medusa middleware
 * (`ALL /store/customers/me*` -> `authenticate("customer", ["session","bearer"])`,
 * see `@medusajs/medusa/dist/api/store/customers/middlewares.js`) — every
 * request under that path needs a valid customer bearer token, no exceptions.
 *
 * Same approach as `create-admin-user.ts`: create the Customer + emailpass
 * auth identity via the Customer/Auth modules, then mint a session JWT
 * directly with the project's jwt secret (bypasses the password-login
 * round-trip, which needs the provider's hashing).
 */
export async function createStoreCustomer(
  container: MedusaContainer,
): Promise<{ headers: { authorization: string } }> {
  const email = "customer.voucher@test.local";
  const customerModule: any = container.resolve(Modules.CUSTOMER);
  const authModule: any = container.resolve(Modules.AUTH);

  const customer = await customerModule.createCustomers({ email });

  const authIdentity = await authModule.createAuthIdentities({
    provider_identities: [
      {
        provider: "emailpass",
        entity_id: email,
        provider_metadata: { password: "supersecret-123" },
      },
    ],
    app_metadata: { customer_id: customer.id },
  });

  const token = jwt.sign(
    {
      actor_id: customer.id,
      actor_type: "customer",
      auth_identity_id: authIdentity.id,
    },
    process.env.JWT_SECRET || "supersecret",
    { expiresIn: "1d" },
  );

  return { headers: { authorization: `Bearer ${token}` } };
}
