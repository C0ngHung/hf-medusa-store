"use server"

import { revalidateTag } from "next/cache"
import { MEDUSA_BACKEND_URL } from "@lib/config"
import { getLocaleHeader } from "@lib/util/get-locale-header"
import type {
  ApplyVoucherResult,
  AvailableVoucher,
  RemoveVoucherResult,
  VoucherActionResult,
  VoucherErrorEnvelope,
} from "@modules/voucher/types"
import { getAuthHeaders, getCacheTag, getCartId } from "./cookies"

/**
 * VoucherEngine server actions (VOUCH-001/004, SPEC Decisions E/F). These call
 * VoucherEngine's custom module routes with a plain `fetch`, NOT
 * `sdk.client.fetch` — verified against the installed
 * `@medusajs/js-sdk` `client.js` (`normalizeResponse`): on a non-2xx response
 * the SDK's `FetchError` keeps ONLY `jsonError.message` (the English,
 * logs-only string) and discards `code`/`customer_message`/`details`/
 * `request_id` before throwing. The VoucherEngine UI contract (D9,
 * `docs/voucher-engine-ui/UX-FLOW.md`) requires displaying the Vietnamese
 * `customer_message` verbatim, never the English `message`, so these calls
 * read the full error envelope themselves instead of going through the
 * shared SDK client's error path. Re-verified against the currently-installed
 * SDK (2026-07-16, code review follow-up): `FetchError` still only carries
 * `message`/`statusText`/`status` — this tradeoff still holds. The ONE thing
 * bypassing `sdk.client.fetch` genuinely loses is the `x-medusa-locale`
 * header `lib/config.ts` auto-injects for every other data module — added
 * back explicitly below via `getLocaleHeader()` instead of switching clients.
 *
 * API-level failures (4xx/5xx with an error envelope) are returned as data
 * (`VoucherActionResult`), never thrown: a thrown custom `Error` subclass
 * does not survive the Server Action boundary as itself (Next.js flattens it
 * to a generic `Error`, dropping `instanceof` and any custom fields) in
 * either dev or production builds, which would silently break `err.code`
 * branching on the client. `throw` is reserved for genuine transport
 * failures (no cart id, network error) that aren't part of the VoucherEngine
 * API contract.
 */

const FALLBACK_ERROR_ENVELOPE: VoucherErrorEnvelope = {
  type: "server_error",
  code: "UNKNOWN_ERROR",
  message: "unknown error",
  customer_message: "Có lỗi xảy ra, bạn thử lại sau ít phút nhé!",
}

async function voucherFetch<T>(
  path: string,
  init: { method: "GET" | "POST" | "DELETE"; body?: unknown },
): Promise<VoucherActionResult<T>> {
  // Mirrors the locale-header injection every other storefront data module
  // gets "for free" via the patched `sdk.client.fetch` (`lib/config.ts`) —
  // this file bypasses that client (see header comment) so it must add the
  // header itself. Best-effort: never let a locale lookup failure break the
  // request; omit the header entirely (rather than send a literal "null")
  // when no locale cookie is set.
  let locale: string | null = null
  try {
    locale = (await getLocaleHeader())["x-medusa-locale"]
  } catch {}

  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
    ...(locale ? { "x-medusa-locale": locale } : {}),
    ...(process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
      ? {
          "x-publishable-api-key":
            process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
        }
      : {}),
    ...(await getAuthHeaders()),
  }

  const res = await fetch(`${MEDUSA_BACKEND_URL}${path}`, {
    method: init.method,
    headers,
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    cache: "no-store",
  })

  const json = await res.json().catch(() => null)

  if (!res.ok) {
    return {
      ok: false,
      error: (json as VoucherErrorEnvelope) ?? FALLBACK_ERROR_ENVELOPE,
    }
  }

  return { ok: true, data: json as T }
}

async function revalidateCartTags() {
  const cartCacheTag = await getCacheTag("carts")
  revalidateTag(cartCacheTag)

  const fulfillmentCacheTag = await getCacheTag("fulfillment")
  revalidateTag(fulfillmentCacheTag)
}

/**
 * `POST /store/carts/:id/voucher` (VOUCH-001, Decision E). `replace` maps to
 * the `?replace=true` query flag confirming a swap of the currently-active
 * voucher — never a body field.
 */
export async function applyVoucher(
  code: string,
  replace?: boolean,
): Promise<VoucherActionResult<ApplyVoucherResult>> {
  const cartId = await getCartId()
  if (!cartId) {
    throw new Error("No existing cart found")
  }

  const query = replace ? "?replace=true" : ""
  const result = await voucherFetch<ApplyVoucherResult>(
    `/store/carts/${cartId}/voucher${query}`,
    { method: "POST", body: { code } },
  )

  if (result.ok) {
    await revalidateCartTags()
  }
  return result
}

/**
 * `DELETE /store/carts/:id/voucher` (VOUCH-004). Idempotent 200 no-op when no
 * voucher is active — not an error.
 */
export async function removeVoucher(): Promise<
  VoucherActionResult<RemoveVoucherResult>
> {
  const cartId = await getCartId()
  if (!cartId) {
    throw new Error("No existing cart found")
  }

  const result = await voucherFetch<RemoveVoucherResult>(
    `/store/carts/${cartId}/voucher`,
    { method: "DELETE" },
  )

  if (result.ok) {
    await revalidateCartTags()
  }
  return result
}

/**
 * `GET /store/customers/me/vouchers` ("Voucher khả dụng", Decision F).
 * Degrades to an empty list on any transport failure — an unavailable list
 * must never break the cart page.
 */
export async function fetchAvailableVouchers(): Promise<AvailableVoucher[]> {
  try {
    const result = await voucherFetch<{ vouchers: AvailableVoucher[] }>(
      "/store/customers/me/vouchers",
      { method: "GET" },
    )
    return result.ok ? (result.data.vouchers ?? []) : []
  } catch {
    return []
  }
}
