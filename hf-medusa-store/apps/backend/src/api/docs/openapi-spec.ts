/**
 * Hand-authored OpenAPI 3.1 spec for THIS repo's custom API routes
 * (VoucherEngine + SuggestiveSelling). Medusa v2 ships no OAS generator, and the
 * hosted API reference (https://docs.medusajs.com/api) only documents the core
 * Store/Admin API — the team's custom endpoints under `src/api/` are not in it.
 * This file catalogs them so `GET /docs` can render a Swagger UI over the lot.
 *
 * Keep this in sync when adding/changing a route under `src/api/`. It is NOT
 * auto-generated — it is the single place the custom API surface is described.
 */

// Shared response schema for the voucher error envelope (API_CONTRACT §8).
const voucherErrorEnvelope = {
  type: "object",
  properties: {
    code: { type: "string", example: "VOUCHER_NOT_FOUND" },
    customer_message: { type: "string", example: "Mã giảm giá không tồn tại." },
    request_id: { type: "string" },
  },
};

export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "hf-medusa-store — Custom API",
    version: "1.0.0",
    description:
      "Custom endpoints for the VoucherEngine and SuggestiveSelling modules on " +
      "Medusa 2.16.\n\n" +
      "**Core Medusa Store/Admin API** (products, carts, orders, auth, …) is NOT " +
      "listed here — see the hosted reference: " +
      "[Store API](https://docs.medusajs.com/api/store) · " +
      "[Admin API](https://docs.medusajs.com/api/admin).\n\n" +
      "**Auth:** `/admin/*` needs an admin session/JWT (Authorize → adminBearer). " +
      "`/store/*` needs the publishable API key header (Authorize → publishableKey); " +
      "customer-scoped behavior additionally reads the customer JWT when present.",
  },
  servers: [
    { url: "/", description: "Same origin as this docs page" },
    {
      url: "http://localhost:9000",
      description: "Local backend (default port)",
    },
  ],
  tags: [
    {
      name: "Admin · Vouchers",
      description: "Voucher config CRUD + analytics (SRS §6.4)",
    },
    {
      name: "Admin · Suggestion Rules",
      description: "Tier-1 manual suggestion rules (SRS §6.1)",
    },
    {
      name: "Admin · Mappings & Analytics",
      description: "Tier-2 mappings, top-sellers, event feed",
    },
    {
      name: "Store · Voucher",
      description: "Apply/remove voucher, my-vouchers (API_CONTRACT §1.3)",
    },
    {
      name: "Store · Suggestions",
      description: "Product/cart suggestions, one-tap add, analytics",
    },
    { name: "Health", description: "Starter health-check stubs" },
  ],
  components: {
    securitySchemes: {
      adminBearer: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description:
          "Admin JWT (from POST /auth/user/emailpass). Used by /admin/*.",
      },
      publishableKey: {
        type: "apiKey",
        in: "header",
        name: "x-publishable-api-key",
        description: "Publishable API key. Required by /store/*.",
      },
      customerBearer: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description:
          "Optional customer JWT (from POST /auth/customer/emailpass).",
      },
    },
    schemas: {
      CreateVoucher: {
        type: "object",
        required: ["discount_type", "discount_value", "valid_from", "valid_to"],
        properties: {
          code: {
            type: "string",
            description:
              "Optional, auto-generated when omitted. Alphanumeric, min 6, stored UPPERCASE.",
            example: "SUMMER20",
          },
          discount_type: {
            type: "string",
            enum: ["percentage", "fixed_amount"],
          },
          discount_value: {
            type: "integer",
            minimum: 1,
            description:
              "Basis-points for percentage (2000 = 20%), raw VND for fixed_amount. INT-01.",
            example: 2000,
          },
          min_order_value: { type: "integer", minimum: 0, nullable: true },
          max_discount_amount: { type: "integer", minimum: 0, nullable: true },
          applicable_product_ids: {
            type: "array",
            items: { type: "string" },
            nullable: true,
          },
          applicable_category_ids: {
            type: "array",
            items: { type: "string" },
            nullable: true,
          },
          stackable_with_promotions: { type: "boolean", default: true },
          per_user_limit: { type: "integer", minimum: 1, default: 1 },
          usage_limit: { type: "integer", minimum: 1, nullable: true },
          user_segment_conditions: {
            type: "object",
            additionalProperties: true,
            nullable: true,
          },
          valid_from: { type: "string", format: "date-time" },
          valid_to: { type: "string", format: "date-time" },
          is_active: { type: "boolean", default: true },
        },
      },
      RuleItem: {
        type: "object",
        required: ["suggested_product_id"],
        properties: {
          suggested_product_id: { type: "string" },
          display_order: { type: "integer", default: 0 },
          custom_label: { type: "string", nullable: true },
        },
      },
      CartCondition: {
        type: "object",
        required: ["condition_type"],
        properties: {
          condition_type: {
            type: "string",
            enum: [
              "category_missing",
              "threshold_near",
              "brand_match",
              "consumable_upsell",
            ],
          },
          condition_params: {
            type: "object",
            additionalProperties: true,
            nullable: true,
          },
        },
      },
      CreateSuggestionRule: {
        type: "object",
        required: ["name", "type"],
        properties: {
          name: { type: "string" },
          type: { type: "string", enum: ["product", "cart"] },
          tier: {
            type: "string",
            enum: ["manual", "category", "behavioral"],
            default: "manual",
          },
          source_product_ids: {
            type: "array",
            items: { type: "string" },
            default: [],
          },
          priority: { type: "integer", default: 0 },
          is_active: { type: "boolean", default: true },
          valid_from: { type: "string", format: "date-time", nullable: true },
          valid_to: { type: "string", format: "date-time", nullable: true },
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/RuleItem" },
            default: [],
          },
          conditions: {
            type: "array",
            items: { $ref: "#/components/schemas/CartCondition" },
            default: [],
          },
        },
      },
      CreateComplementMapping: {
        type: "object",
        required: ["source_category_id", "complement_category_id"],
        properties: {
          source_category_id: { type: "string" },
          complement_category_id: { type: "string" },
          display_order: { type: "integer", default: 0 },
          is_active: { type: "boolean", default: true },
        },
      },
      CreateBulkMapping: {
        type: "object",
        required: ["single_product_id", "bulk_product_id"],
        properties: {
          single_product_id: { type: "string" },
          bulk_product_id: { type: "string" },
          unit_multiplier: { type: "integer", minimum: 1, nullable: true },
          is_active: { type: "boolean", default: true },
        },
      },
      ApplyVoucher: {
        type: "object",
        required: ["code"],
        additionalProperties: false,
        properties: {
          code: {
            type: "string",
            description: "Alphanumeric, min 6. SEC-03.",
            example: "SUMMER20",
          },
        },
      },
      SuggestedItemAdd: {
        type: "object",
        required: ["product_id", "attribution"],
        properties: {
          product_id: { type: "string" },
          variant_id: { type: "string" },
          quantity: { type: "integer", minimum: 1, maximum: 99, default: 1 },
          slot: { type: "integer", minimum: 0 },
          attribution: {
            type: "object",
            required: ["source_context"],
            properties: {
              rule_id: { type: "string", nullable: true },
              source_context: {
                type: "string",
                enum: ["product_view", "cart"],
              },
              source_product_id: { type: "string", nullable: true },
            },
          },
        },
      },
      SuggestionEventsBatch: {
        type: "object",
        properties: {
          events: {
            type: "array",
            maxItems: 10,
            items: {
              type: "object",
              required: ["action", "source_context", "suggested_product_id"],
              properties: {
                action: {
                  type: "string",
                  enum: ["impression", "tap", "add_to_cart", "dismiss"],
                },
                source_context: {
                  type: "string",
                  enum: ["product_view", "cart"],
                },
                suggested_product_id: { type: "string" },
                rule_id: { type: "string", nullable: true },
                source_product_id: { type: "string", nullable: true },
                session_id: { type: "string", nullable: true },
                tier: { type: "string", nullable: true },
                slot: { type: "integer", nullable: true },
              },
            },
          },
        },
      },
    },
  },
  paths: {
    // ────────────────────────── Admin · Vouchers ──────────────────────────
    "/admin/vouchers": {
      get: {
        tags: ["Admin · Vouchers"],
        summary: "List vouchers",
        security: [{ adminBearer: [] }],
        parameters: [
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 50, maximum: 200 },
          },
          {
            name: "offset",
            in: "query",
            schema: { type: "integer", default: 0 },
          },
        ],
        responses: {
          "200": {
            description: "Voucher config rows",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    vouchers: { type: "array", items: { type: "object" } },
                    count: { type: "integer" },
                    limit: { type: "integer" },
                    offset: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["Admin · Vouchers"],
        summary: "Create a voucher",
        security: [{ adminBearer: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateVoucher" },
            },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { voucher: { type: "object" } },
                },
              },
            },
          },
        },
      },
    },
    "/admin/vouchers/{id}/analytics": {
      get: {
        tags: ["Admin · Vouchers"],
        summary: "Voucher redemption analytics",
        security: [{ adminBearer: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Analytics",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { analytics: { type: "object" } },
                },
              },
            },
          },
        },
      },
    },
    // ─────────────────────── Admin · Suggestion Rules ──────────────────────
    "/admin/suggestion-rules": {
      get: {
        tags: ["Admin · Suggestion Rules"],
        summary: "List suggestion rules",
        security: [{ adminBearer: [] }],
        parameters: [
          {
            name: "type",
            in: "query",
            schema: { type: "string", enum: ["product", "cart"] },
          },
          { name: "is_active", in: "query", schema: { type: "boolean" } },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 50 },
          },
          {
            name: "offset",
            in: "query",
            schema: { type: "integer", default: 0 },
          },
        ],
        responses: { "200": { description: "Rules list" } },
      },
      post: {
        tags: ["Admin · Suggestion Rules"],
        summary: "Create a suggestion rule (with nested items/conditions)",
        security: [{ adminBearer: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateSuggestionRule" },
            },
          },
        },
        responses: { "201": { description: "Created" } },
      },
    },
    "/admin/suggestion-rules/{id}": {
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" } },
      ],
      get: {
        tags: ["Admin · Suggestion Rules"],
        summary: "Get one rule with children",
        security: [{ adminBearer: [] }],
        responses: { "200": { description: "Rule" } },
      },
      put: {
        tags: ["Admin · Suggestion Rules"],
        summary: "Update a rule (items/conditions replace existing)",
        security: [{ adminBearer: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                allOf: [{ $ref: "#/components/schemas/CreateSuggestionRule" }],
                description: "All fields optional on update.",
              },
            },
          },
        },
        responses: { "200": { description: "Updated" } },
      },
      delete: {
        tags: ["Admin · Suggestion Rules"],
        summary: "Soft-delete a rule",
        security: [{ adminBearer: [] }],
        responses: { "200": { description: "Deleted" } },
      },
    },
    // ─────────────────── Admin · Mappings & Analytics ──────────────────────
    "/admin/suggestion-events": {
      get: {
        tags: ["Admin · Mappings & Analytics"],
        summary: "Read-only suggestion analytics feed",
        security: [{ adminBearer: [] }],
        parameters: [
          {
            name: "source_context",
            in: "query",
            schema: { type: "string", enum: ["product_view", "cart"] },
          },
          {
            name: "action",
            in: "query",
            schema: {
              type: "string",
              enum: ["impression", "tap", "add_to_cart", "dismiss"],
            },
          },
          { name: "tier", in: "query", schema: { type: "string" } },
          {
            name: "suggested_product_id",
            in: "query",
            schema: { type: "string" },
          },
          {
            name: "source_product_id",
            in: "query",
            schema: { type: "string" },
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 100 },
          },
          {
            name: "offset",
            in: "query",
            schema: { type: "integer", default: 0 },
          },
        ],
        responses: { "200": { description: "Events" } },
      },
    },
    "/admin/category-top-sellers": {
      get: {
        tags: ["Admin · Mappings & Analytics"],
        summary: "Read-only Tier-2 top-seller ranking snapshot",
        security: [{ adminBearer: [] }],
        parameters: [
          { name: "category_id", in: "query", schema: { type: "string" } },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 200 },
          },
          {
            name: "offset",
            in: "query",
            schema: { type: "integer", default: 0 },
          },
        ],
        responses: { "200": { description: "Top sellers" } },
      },
    },
    "/admin/category-complement-mappings": {
      get: {
        tags: ["Admin · Mappings & Analytics"],
        summary: "List Tier-2 complement mappings",
        security: [{ adminBearer: [] }],
        parameters: [
          {
            name: "source_category_id",
            in: "query",
            schema: { type: "string" },
          },
          { name: "is_active", in: "query", schema: { type: "boolean" } },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 100 },
          },
          {
            name: "offset",
            in: "query",
            schema: { type: "integer", default: 0 },
          },
        ],
        responses: { "200": { description: "Mappings" } },
      },
      post: {
        tags: ["Admin · Mappings & Analytics"],
        summary: "Create a complement mapping",
        security: [{ adminBearer: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateComplementMapping" },
            },
          },
        },
        responses: { "201": { description: "Created" } },
      },
    },
    "/admin/category-complement-mappings/{id}": {
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" } },
      ],
      get: {
        tags: ["Admin · Mappings & Analytics"],
        summary: "Get one complement mapping",
        security: [{ adminBearer: [] }],
        responses: { "200": { description: "Mapping" } },
      },
      put: {
        tags: ["Admin · Mappings & Analytics"],
        summary: "Update a complement mapping",
        security: [{ adminBearer: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                allOf: [
                  { $ref: "#/components/schemas/CreateComplementMapping" },
                ],
                description: "All fields optional on update.",
              },
            },
          },
        },
        responses: { "200": { description: "Updated" } },
      },
      delete: {
        tags: ["Admin · Mappings & Analytics"],
        summary: "Soft-delete a complement mapping",
        security: [{ adminBearer: [] }],
        responses: { "200": { description: "Deleted" } },
      },
    },
    "/admin/product-bulk-mappings": {
      get: {
        tags: ["Admin · Mappings & Analytics"],
        summary: "List single→bulk product mappings (CR-04)",
        security: [{ adminBearer: [] }],
        parameters: [
          {
            name: "single_product_id",
            in: "query",
            schema: { type: "string" },
          },
          { name: "is_active", in: "query", schema: { type: "boolean" } },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 50 },
          },
          {
            name: "offset",
            in: "query",
            schema: { type: "integer", default: 0 },
          },
        ],
        responses: { "200": { description: "Mappings" } },
      },
      post: {
        tags: ["Admin · Mappings & Analytics"],
        summary: "Create a bulk mapping",
        security: [{ adminBearer: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateBulkMapping" },
            },
          },
        },
        responses: { "201": { description: "Created" } },
      },
    },
    "/admin/product-bulk-mappings/{id}": {
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" } },
      ],
      get: {
        tags: ["Admin · Mappings & Analytics"],
        summary: "Get one bulk mapping",
        security: [{ adminBearer: [] }],
        responses: { "200": { description: "Mapping" } },
      },
      put: {
        tags: ["Admin · Mappings & Analytics"],
        summary: "Update a bulk mapping",
        security: [{ adminBearer: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                allOf: [{ $ref: "#/components/schemas/CreateBulkMapping" }],
                description: "All fields optional on update.",
              },
            },
          },
        },
        responses: { "200": { description: "Updated" } },
      },
      delete: {
        tags: ["Admin · Mappings & Analytics"],
        summary: "Soft-delete a bulk mapping",
        security: [{ adminBearer: [] }],
        responses: { "200": { description: "Deleted" } },
      },
    },
    // ───────────────────────────── Store · Voucher ─────────────────────────
    "/store/carts/{id}/voucher": {
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "string" },
          description: "Cart id",
        },
      ],
      post: {
        tags: ["Store · Voucher"],
        summary: "Apply a voucher to a cart",
        description:
          "Rate-limited by customer_id + IP (5 fails / 15 min → 429, 30-min cooldown). " +
          "Server-side pricing only — the client sends only the code.",
        security: [{ publishableKey: [], customerBearer: [] }],
        parameters: [
          {
            name: "replace",
            in: "query",
            schema: { type: "string", enum: ["true", "false"] },
            description:
              "Set true to replace an already-active voucher (else 409 VOUCHER_REPLACE_REQUIRED).",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ApplyVoucher" },
            },
          },
        },
        responses: {
          "200": {
            description: "Applied — authoritative recomputed cart total",
          },
          "409": {
            description: "Replace required",
            content: { "application/json": { schema: voucherErrorEnvelope } },
          },
          "422": {
            description: "Validation failed (inactive / min-order / scope / …)",
            content: { "application/json": { schema: voucherErrorEnvelope } },
          },
          "429": {
            description: "Rate-limited (brute-force cooldown)",
            content: { "application/json": { schema: voucherErrorEnvelope } },
          },
        },
      },
      delete: {
        tags: ["Store · Voucher"],
        summary: "Remove the voucher from a cart (idempotent)",
        security: [{ publishableKey: [], customerBearer: [] }],
        responses: { "200": { description: "Removed / no-op" } },
      },
    },
    "/store/customers/me/vouchers": {
      get: {
        tags: ["Store · Voucher"],
        summary: "My vouchers (active + currently-valid list)",
        description:
          "Auth-optional (guests get the same public list). With ?cart_id= each voucher " +
          "also gets eligible/ineligible_reason (V5 min-order + V6 scope) against that cart.",
        security: [{ publishableKey: [], customerBearer: [] }],
        parameters: [
          {
            name: "cart_id",
            in: "query",
            schema: { type: "string" },
            description: "Optional — adds per-voucher eligibility.",
          },
        ],
        responses: {
          "200": {
            description: "Vouchers",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    vouchers: { type: "array", items: { type: "object" } },
                  },
                },
              },
            },
          },
        },
      },
    },
    // ─────────────────────────── Store · Suggestions ───────────────────────
    "/store/products/{id}/suggestions": {
      get: {
        tags: ["Store · Suggestions"],
        summary: "Product-detail suggestions (SUGG-001)",
        description:
          "Degrades to 200 {suggestions:[]} on any internal failure (never 5xx).",
        security: [{ publishableKey: [], customerBearer: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Product id",
          },
          { name: "cart_id", in: "query", schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer" } },
          {
            name: "x-session-id",
            in: "header",
            schema: { type: "string" },
            description: "Dismissal/analytics scope.",
          },
        ],
        responses: {
          "200": {
            description: "Suggestions",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    suggestions: { type: "array", items: { type: "object" } },
                    count: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/store/carts/{id}/suggestions": {
      get: {
        tags: ["Store · Suggestions"],
        summary: "Cart 'You Might Also Need' (SUGG-004)",
        description:
          "threshold_info is non-null only when CR-02 fired and ≥1 suggestion exists. Degrades to 200 empty on failure.",
        security: [{ publishableKey: [], customerBearer: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Cart id",
          },
          { name: "limit", in: "query", schema: { type: "integer" } },
          { name: "x-session-id", in: "header", schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Suggestions + threshold info",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    suggestions: { type: "array", items: { type: "object" } },
                    count: { type: "integer" },
                    threshold_info: { type: "object", nullable: true },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/store/carts/{id}/suggested-items": {
      post: {
        tags: ["Store · Suggestions"],
        summary: "One-tap add a suggested item to the cart (SUGG-003)",
        description:
          "Idempotency-Key header dedupes replays (generated server-side if omitted).",
        security: [{ publishableKey: [], customerBearer: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Cart id",
          },
          { name: "Idempotency-Key", in: "header", schema: { type: "string" } },
          { name: "x-session-id", in: "header", schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SuggestedItemAdd" },
            },
          },
        },
        responses: {
          "200": { description: "Added — updated cart" },
          "400": { description: "Invalid request body" },
          "409": { description: "Stock conflict (out of stock)" },
        },
      },
    },
    "/store/suggestion-events": {
      post: {
        tags: ["Store · Suggestions"],
        summary: "Batch analytics tracking (SUGG-006, fire-and-forget)",
        description:
          "Always 202. Malformed events are rejected individually; batches over 10 are truncated.",
        security: [{ publishableKey: [], customerBearer: [] }],
        parameters: [
          { name: "x-session-id", in: "header", schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SuggestionEventsBatch" },
            },
          },
        },
        responses: {
          "202": {
            description: "Accepted",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    accepted: { type: "integer" },
                    rejected: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      },
    },
    // ───────────────────────────────── Health ──────────────────────────────
    "/admin/custom": {
      get: {
        tags: ["Health"],
        summary: "Admin health-check stub",
        security: [{ adminBearer: [] }],
        responses: { "200": { description: "OK" } },
      },
    },
    "/store/custom": {
      get: {
        tags: ["Health"],
        summary: "Store health-check stub",
        security: [{ publishableKey: [] }],
        responses: { "200": { description: "OK" } },
      },
    },
  },
} as const;
