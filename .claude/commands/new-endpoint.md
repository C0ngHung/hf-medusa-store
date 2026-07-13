---
description: Scaffold a Medusa REST endpoint (admin or store) under src/api/
argument-hint: <admin|store>/<route-path> [methods: GET,POST,…]
allowed-tools: Read, Write, Edit, Bash(ls:*), Bash(find:*), Grep
---
Scaffold a Medusa REST route for `$ARGUMENTS` in the backend.

Parse `$ARGUMENTS`: first token is the route path, which MUST start with `admin/`
or `store/` (e.g. `store/wishlist`, `admin/suggestion-rules/[id]`). An optional
trailing token lists HTTP methods (default `GET`).

Steps:
1. Create `hf-medusa-store/apps/backend/src/api/<path>/route.ts` with a handler per
   requested method, using the framework types:
   `import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"` and
   `export async function GET(req: MedusaRequest, res: MedusaResponse) { … }`.
   Match the style of the existing `src/api/store/custom/route.ts` and
   `src/api/admin/suggestion-rules/route.ts`.
2. For non-trivial routes, also scaffold sibling `validators.ts` (Zod schema) and
   `helpers.ts` following the `admin/suggestion-rules/` example, and remind the user
   to wire validation in `src/api/middlewares.ts`.
3. `admin/*` routes are authenticated by default; `store/*` are public unless a
   publishable key / auth is configured — note this in the summary.
4. Resolve services via `req.scope.resolve(<MODULE>_MODULE)` — never instantiate a
   service directly. Do NOT invent business logic; leave clearly-marked `// TODO`
   stubs. Print the files created and any follow-up (middleware wiring).
