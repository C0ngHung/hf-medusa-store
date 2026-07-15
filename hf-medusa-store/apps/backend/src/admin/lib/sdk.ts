import Medusa from "@medusajs/js-sdk";

/**
 * Shared Medusa JS SDK client for admin dashboard extensions.
 * The admin app is served from the backend origin, so a relative baseUrl + the
 * existing admin session cookie is all we need. Use `sdk.client.fetch(...)` for
 * our custom `/admin/*` config endpoints and `sdk.admin.*` for core resources
 * (e.g. product search in the product picker).
 */
export const sdk = new Medusa({
  baseUrl: import.meta.env.VITE_MEDUSA_BACKEND_URL || "/",
  auth: { type: "session" },
});
