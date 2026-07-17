import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { z } from "zod";
import { createRequire } from "module";
import { readdirSync, readFileSync, existsSync } from "fs";
import path from "path";

/**
 * GET /docs/openapi — AUTO-GENERATED OpenAPI 3.1 spec for this repo's CUSTOM API
 * routes, built at request time. Nothing to maintain by hand: add a route file
 * under src/api and it shows up here on the next dev-server reload.
 *
 * How it works (see docs/team/API_DOCS.md):
 *  1. Walk `src/api/**` for `route.ts` files (excluding this `docs/` folder).
 *  2. Path = folder path with `[x]` → `{x}`; methods = the exported GET/POST/…
 *     handler names (read from the file text).
 *  3. Request bodies + typed query params are derived from a sibling
 *     `validators.ts` (zod) via `z.toJSONSchema` — `require`d through Medusa's
 *     loader so transitive imports resolve. Best-effort: a route with no
 *     validator, or one that fails to load, still lists its path + method.
 *
 * Public (no auth): /docs is not under /admin or /store, so no auth runs.
 * The core Medusa API is served separately at /docs/openapi/core.
 */

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

const nodeRequire = createRequire(__filename);

/** Recursively collect every `route.ts`/`route.js` dir under `root`. */
function findRouteDirs(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: import("fs").Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        // Skip the docs UI folder itself.
        if (full === path.join(root, "docs")) continue;
        walk(full);
      } else if (e.name === "route.ts" || e.name === "route.js") {
        out.push(dir);
      }
    }
  };
  walk(root);
  return out;
}

/** `.../src/api/store/carts/[id]/voucher` → `/store/carts/{id}/voucher`. */
function toApiPath(routeDir: string, apiRoot: string): string {
  const rel = path.relative(apiRoot, routeDir).split(path.sep).join("/");
  return "/" + rel.replace(/\[([^\]]+)\]/g, "{$1}");
}

/** Read exported HTTP handler names from a route file's source text. */
function detectMethods(routeFile: string): HttpMethod[] {
  let text = "";
  try {
    text = readFileSync(routeFile, "utf8");
  } catch {
    return [];
  }
  const re =
    /export\s+(?:const|async\s+function|function)\s+(GET|POST|PUT|PATCH|DELETE)\b/g;
  const found = new Set<HttpMethod>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) found.add(m[1].toLowerCase() as HttpMethod);
  return HTTP_METHODS.filter((x) => found.has(x));
}

/** Best-effort query-param names, read from `req.query.x` + `{ a, b } = req.query`. */
function detectQueryParams(routeFile: string): string[] {
  let text = "";
  try {
    text = readFileSync(routeFile, "utf8");
  } catch {
    return [];
  }
  const names = new Set<string>();
  let m: RegExpExecArray | null;
  const dot = /req\.query\.(\w+)/g;
  while ((m = dot.exec(text))) names.add(m[1]);
  const destructure = /\{([^}]+)\}\s*=\s*req\.query/g;
  while ((m = destructure.exec(text))) {
    for (const part of m[1].split(",")) {
      const name = part.split(/[:=]/)[0].trim();
      if (/^\w+$/.test(name)) names.add(name);
    }
  }
  return [...names];
}

/** A value is a zod schema if it exposes `.parse`. */
function isZodSchema(v: unknown): v is z.ZodType {
  return !!v && typeof (v as { parse?: unknown }).parse === "function";
}

/** Convert a zod schema to an OpenAPI-ready JSON Schema (drop the `$schema` key).
 * `unrepresentable: "any"` makes zod emit `{}` for things it can't express in
 * JSON Schema (e.g. `z.coerce.date()`) instead of throwing and losing the whole
 * body. */
function zodToOpenApi(schema: z.ZodType): Record<string, unknown> | null {
  try {
    const json = z.toJSONSchema(schema, {
      io: "input",
      unrepresentable: "any",
    }) as Record<string, unknown>;
    delete json["$schema"];
    return json;
  } catch {
    return null;
  }
}

/** Load a route's `validators.ts` exports through Medusa's loader. Looks in the
 * route folder, then its parent — Medusa convention puts one `validators.ts` next
 * to the collection route and shares it with the `[id]/route.ts` (which imports
 * `../validators`). */
function loadValidators(routeDir: string): Record<string, unknown> {
  for (const dir of [routeDir, path.dirname(routeDir)]) {
    const file = path.join(dir, "validators.ts");
    if (!existsSync(file)) continue;
    try {
      return nodeRequire(file) as Record<string, unknown>;
    } catch {
      return {}; // transitive-import failure etc. — degrade to no body
    }
  }
  return {};
}

/** Pick the validator export whose name matches one of `patterns`, in order.
 * `exclude` drops candidates by name (e.g. keep `*Query*`/`*Remove*` schemas out
 * of the request-body pick — a Query schema also matches `/apply/i`). */
function pickSchema(
  validators: Record<string, unknown>,
  patterns: RegExp[],
  exclude?: RegExp,
): z.ZodType | null {
  for (const re of patterns) {
    for (const [name, val] of Object.entries(validators)) {
      if (exclude && exclude.test(name)) continue;
      if (re.test(name) && isZodSchema(val)) return val;
    }
  }
  return null;
}

function buildSpec(apiRoot: string) {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const routeDir of findRouteDirs(apiRoot)) {
    const routeFile = existsSync(path.join(routeDir, "route.ts"))
      ? path.join(routeDir, "route.ts")
      : path.join(routeDir, "route.js");
    const apiPath = toApiPath(routeDir, apiRoot);
    const methods = detectMethods(routeFile);
    if (methods.length === 0) continue;

    const segments = apiPath.split("/").filter(Boolean);
    const area = segments[0] ?? "root"; // admin | store
    const tag = `${area} · ${segments[1] ?? ""}`.trim();
    const isAdmin = area === "admin";

    const validators = loadValidators(routeDir);
    const pathParams = [...apiPath.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);

    const item: Record<string, unknown> = {};
    for (const method of methods) {
      const op: Record<string, unknown> = {
        tags: [tag],
        summary: `${method.toUpperCase()} ${apiPath}`,
        parameters: [
          ...pathParams.map((name) => ({
            in: "path",
            name,
            required: true,
            schema: { type: "string" },
          })),
        ],
        responses: { "200": { description: "OK" } },
      };
      if (isAdmin) op["x-authenticated"] = true;

      // Typed query params from a *Query* validator, else best-effort names.
      const querySchema = pickSchema(validators, [/query/i]);
      const queryJson = querySchema ? zodToOpenApi(querySchema) : null;
      const params = op.parameters as Record<string, unknown>[];
      if (queryJson && queryJson.properties) {
        for (const [name, sch] of Object.entries(
          queryJson.properties as Record<string, unknown>,
        )) {
          params.push({ in: "query", name, schema: sch });
        }
      } else if (method === "get") {
        for (const name of detectQueryParams(routeFile)) {
          params.push({ in: "query", name, schema: { type: "string" } });
        }
      }

      // Request body from a Create/Apply/Post (POST) or Update (PUT/PATCH) schema.
      if (method === "post" || method === "put" || method === "patch") {
        const bodySchema =
          method === "post"
            ? pickSchema(
                validators,
                [/create/i, /apply/i, /post/i, /^add/i],
                /query|remove/i,
              )
            : pickSchema(validators, [/update/i], /query|remove/i);
        const bodyJson = bodySchema ? zodToOpenApi(bodySchema) : null;
        if (bodyJson) {
          op.requestBody = {
            required: true,
            content: { "application/json": { schema: bodyJson } },
          };
        }
      }

      item[method] = op;
    }
    paths[apiPath] = item;
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "hf-medusa-store — Custom API (auto-generated)",
      version: "1.0.0",
      description:
        "Auto-discovered from src/api/ at request time. Paths & methods are read " +
        "from the route files; request bodies & typed query params come from each " +
        "route's zod `validators.ts`. Add a route → it appears here on reload. " +
        "The Medusa core API is on the other definition (/docs/openapi/core).",
    },
    servers: [{ url: "/" }, { url: "http://localhost:9009" }],
    components: {
      securitySchemes: {
        adminBearer: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        publishableKey: {
          type: "apiKey",
          in: "header",
          name: "x-publishable-api-key",
        },
      },
    },
    paths,
  };
}

export const GET = async (_req: MedusaRequest, res: MedusaResponse) => {
  // Rebuilt each request so newly-added routes show up without extra steps
  // (the dev server already restarts on file change, clearing require cache).
  const apiRoot = path.join(process.cwd(), "src", "api");
  res.json(buildSpec(apiRoot));
};
