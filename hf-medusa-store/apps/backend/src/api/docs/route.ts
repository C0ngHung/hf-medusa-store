import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";

/**
 * GET /docs — Swagger UI over this repo's APIs. Assets load from the unpkg CDN
 * (dev-only convenience; no new runtime dependency). Two specs are offered via
 * the top-bar "Select a definition" dropdown:
 *   - /docs/openapi       → hand-authored custom routes (see ./openapi-spec.ts)
 *   - /docs/openapi/core  → generated Medusa core API (see ./openapi/core/route.ts)
 *
 * Public (no auth): not under /admin or /store, so no auth middleware runs.
 * NOTE: this is a developer aid — do not expose it on a public production host.
 */
const SWAGGER_UI_VERSION = "5.17.14";

const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>hf-medusa-store — API docs</title>
    <link
      rel="stylesheet"
      href="https://unpkg.com/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui.css"
    />
    <style>
      body { margin: 0; background: #fafafa; }
      /* Keep the top bar visible — it hosts the "Select a definition" dropdown
         that switches between the Custom and Core specs. */
      .swagger-ui .topbar { background: #1b1b2f; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui-bundle.js" crossorigin></script>
    <script src="https://unpkg.com/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui-standalone-preset.js" crossorigin></script>
    <script>
      window.onload = function () {
        window.ui = SwaggerUIBundle({
          urls: [
            { name: "Custom API (auto-generated)", url: "/docs/openapi" },
            { name: "Medusa Core API (admin + store)", url: "/docs/openapi/core" },
          ],
          "urls.primaryName": "Custom API (auto-generated)",
          dom_id: "#swagger-ui",
          deepLinking: true,
          presets: [
            SwaggerUIBundle.presets.apis,
            SwaggerUIStandalonePreset,
          ],
          layout: "StandaloneLayout",
          tryItOutEnabled: true,
        });
      };
    </script>
  </body>
</html>`;

export const GET = async (_req: MedusaRequest, res: MedusaResponse) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
};
