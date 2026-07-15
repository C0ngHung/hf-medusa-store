import { Modules } from "@medusajs/framework/utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import jwt from "jsonwebtoken";

/**
 * Bootstrap an authenticated admin for HTTP integration tests (SEC-04).
 *
 * Canonical Medusa v2 approach: create the user + emailpass auth identity via the
 * User/Auth modules, then mint a session JWT directly with the project's
 * jwtSecret (bypasses the password-login round-trip, which needs the provider's
 * hashing). Returns admin auth headers to pass on each request.
 */
export async function createAdminUser(
  container: MedusaContainer,
): Promise<{ headers: { authorization: string } }> {
  const email = "admin.voucher@test.local";
  const userModule: any = container.resolve(Modules.USER);
  const authModule: any = container.resolve(Modules.AUTH);

  const user = await userModule.createUsers({
    email,
    first_name: "Voucher",
    last_name: "Admin",
  });

  const authIdentity = await authModule.createAuthIdentities({
    provider_identities: [
      {
        provider: "emailpass",
        entity_id: email,
        provider_metadata: { password: "supersecret-123" },
      },
    ],
    app_metadata: { user_id: user.id },
  });

  const token = jwt.sign(
    {
      actor_id: user.id,
      actor_type: "user",
      auth_identity_id: authIdentity.id,
    },
    process.env.JWT_SECRET || "supersecret",
    { expiresIn: "1d" },
  );

  return { headers: { authorization: `Bearer ${token}` } };
}
