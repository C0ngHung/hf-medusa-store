"use client"

import { useEffect, useRef, useState } from "react"
import { HttpTypes } from "@medusajs/types"
import { Badge, Heading, Input, Text } from "@modules/common/components/ui"
import React from "react"

import { applyPromotions } from "@lib/data/cart"
import { applyVoucher, removeVoucher } from "@lib/data/voucher"
import { convertToLocale } from "@lib/util/money"
import Trash from "@modules/common/icons/trash"
import type {
  VoucherAutoRemoveNotice,
  VoucherCartMetadata,
} from "@modules/voucher/types"
import ErrorMessage from "../error-message"
import SuccessMessage from "../success-message"
import { SubmitButton } from "../submit-button"
import ReplaceConfirmModal from "./replace-confirm-modal"
import AvailableVouchersModal from "./available-vouchers-modal"

/**
 * Vietnamese-first fallbacks (SRS i18n: VI primary, EN fallback only when no
 * VI message exists). Used ONLY when there is no backend `customer_message`
 * to render verbatim (a thrown transport/network error, never a well-formed
 * `{ok:false, error}` result) — never as a replacement for a real backend
 * message. Both strings are reused VERBATIM from the backend's own catalog
 * (`workflows/voucher-engine/lib/errors.ts`) for the closest matching
 * scenario, so the frontend isn't inventing new customer-facing copy:
 * `GENERIC_ERROR_VI` = the catch-all `toErrorEnvelope` 500 case, for genuine
 * operation failures (network, remove); `INVALID_CODE_VI` =
 * `VOUCHER_NOT_FOUND`'s message, verbatim, for the final combined
 * voucher+generic-promotion failure — `applyPromotions` throws via
 * `medusaError` either way (invalid code or transport failure), but "the
 * code doesn't work as either type" is by far the more likely cause and the
 * more useful thing to tell the customer than a generic retry message.
 */
const GENERIC_ERROR_VI = "Có lỗi xảy ra, bạn thử lại sau ít phút nhé!"
const INVALID_CODE_VI = "Mã giảm giá không đúng. Bạn kiểm tra lại giúp nhé!"
// Apply's success envelope (`ApplyVoucherResult`) has no customer-facing
// message field at all — this is the one place the frontend must originate
// copy, so it's Vietnamese first per SRS i18n.
const APPLY_SUCCESS_VI = "Áp dụng mã giảm giá thành công."
// Defensive fallback only — remove's success envelope DOES provide this
// exact string as `RemoveVoucherResult.message` (`remove-voucher.ts`),
// which is read and rendered verbatim; this constant only covers the
// (currently never observed) case where that field is empty.
const REMOVE_SUCCESS_VI = "Đã gỡ mã giảm giá."
// Frontend-originated (no backend round-trip for this — see the
// "alreadyActive" short-circuit in attemptVoucherApply below), phrased to
// match the tone of the backend's own VOUCHER_REPLACE_REQUIRED message
// ("Bạn đang dùng mã {current_code}. Thay bằng mã mới chứ?") rather than
// inventing unrelated wording.
const alreadyActiveVi = (code: string) => `Bạn đang dùng mã ${code} rồi.`

/**
 * DiscountCode — the single, unified customer-facing discount-code module
 * (`docs/voucher-engine-ui/REQUIREMENTS.md` §0, `UX-FLOW.md` D3/D4).
 *
 * Handles BOTH Medusa's generic promotion codes (unchanged behavior, via
 * `applyPromotions`'s full-array-replace) AND VoucherEngine vouchers (via the
 * dedicated `/store/carts/:id/voucher` endpoints) through one input, one
 * Apply button, and one applied-codes list. There is no second,
 * voucher-specific input anywhere in this component.
 *
 * VoucherEngine's discount is carried by an ephemeral, cart-specific Medusa
 * Promotion (SPEC Decision G) that DOES appear in `cart.promotions` — it is
 * filtered out of the rows rendered here (identified via
 * `cart.metadata.voucher.ephemeral_promotion_id`) and rendered instead as a
 * dedicated voucher row sourced from `cart.metadata.voucher`, using the
 * HUMAN voucher code, never the ephemeral entry's own internal code.
 */

type DiscountCodeProps = {
  cart: HttpTypes.StoreCart
}

type DisplayedVoucher = {
  code: string
  discount_type: "percentage" | "fixed_amount"
  discount_value: number
  discount_amount: number
  discount_capped: boolean
}

function readVoucherMetadata(
  cart: HttpTypes.StoreCart,
): VoucherCartMetadata | null {
  const metadata = cart.metadata as Record<string, unknown> | null | undefined
  return (metadata?.voucher as VoucherCartMetadata | undefined) ?? null
}

/** `cart.metadata.voucher_notice` — see `VoucherAutoRemoveNotice`'s doc comment. */
function readVoucherNotice(
  cart: HttpTypes.StoreCart,
): VoucherAutoRemoveNotice | null {
  const metadata = cart.metadata as Record<string, unknown> | null | undefined
  return (
    (metadata?.voucher_notice as VoucherAutoRemoveNotice | undefined) ?? null
  )
}

function toDisplayedVoucher(meta: VoucherCartMetadata): DisplayedVoucher {
  return {
    code: meta.code,
    discount_type: meta.discount_type,
    discount_value: meta.discount_value,
    discount_amount: meta.discount_amount,
    discount_capped: meta.discount_capped,
  }
}

/** Outcome of trying VoucherEngine's apply endpoint (UX-FLOW.md §1a). */
type VoucherApplyAttempt =
  | { kind: "success" }
  | { kind: "alreadyActive" }
  | { kind: "replaceRequired" }
  | { kind: "notFound" }
  | { kind: "rejected"; message: string }

const DiscountCode: React.FC<DiscountCodeProps> = ({ cart }) => {
  const currencyCode = cart.currency_code
  const { promotions: allPromotions = [] } = cart

  const voucherMeta = readVoucherMetadata(cart)
  const voucherPromotionId = voucherMeta?.ephemeral_promotion_id

  // VoucherEngine's ephemeral, cart-specific Promotion (SPEC Decision G) must
  // never surface in this GENERIC promotions list — it gets its own row
  // below, sourced from cart.metadata.voucher. It MUST still be preserved
  // whenever this component resubmits the full `promo_codes` array
  // (`applyPromotions` is a full-array-replace call), otherwise
  // adding/removing an unrelated generic code would silently detach the
  // active voucher — see `applyGenericCode`/`removeGenericCode` below, which
  // always build their arrays from `allPromotions` (unfiltered), never
  // `displayedPromotions`.
  const displayedPromotions = allPromotions.filter(
    (promotion) => promotion.id !== voucherPromotionId,
  )

  const [activeVoucher, setActiveVoucher] = useState<DisplayedVoucher | null>(
    () => (voucherMeta ? toDisplayedVoucher(voucherMeta) : null),
  )
  const [capExplanation, setCapExplanation] = useState<string | null>(null)
  const [phase, setPhase] = useState<
    "idle" | "applying" | "removingVoucher" | "removingGeneric"
  >("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [voucherNotice, setVoucherNotice] = useState<string | null>(null)
  const [replaceConfirm, setReplaceConfirm] = useState<{
    pendingCode: string
    message: string
  } | null>(null)
  const [isVouchersModalOpen, setIsVouchersModalOpen] = useState(false)

  // Dedup key for the last auto-remove notice actually shown (see
  // `readVoucherNotice`'s doc comment) — prevents re-showing the same notice
  // on every unrelated re-render once `cart.metadata.voucher_notice` is set,
  // since the backend never clears that key.
  const shownNoticeRef = useRef<string | null>(null)

  // Suppresses the very next resync pass right after OUR OWN voucher
  // apply/remove succeeds: the upcoming `cart.metadata.voucher` prop update
  // (arriving via the mutation's own `revalidateTag("carts")`) only confirms
  // what we already applied locally. Without this, that prop update would
  // immediately wipe a just-shown `cap_explanation` — the persisted metadata
  // snapshot never carries that string (see `modules/voucher/types.ts`), so a
  // naive resync-on-every-prop-change would blank the cap banner right after
  // showing it.
  const skipNextResync = useRef(false)

  // Hydrates the voucher row from `cart.metadata.voucher` (D1/D2) on every
  // prop change that ISN'T an echo of our own action — covers first paint,
  // page reload, and any out-of-band change (cart-change auto-revalidation,
  // another tab). Generic-promotion rows don't need this: they're derived
  // fresh from `cart.promotions` on every render already.
  useEffect(() => {
    if (phase !== "idle") {
      return
    }
    if (skipNextResync.current) {
      skipNextResync.current = false
      return
    }
    const meta = readVoucherMetadata(cart)
    const hadActiveVoucher = activeVoucher !== null
    setActiveVoucher(meta ? toDisplayedVoucher(meta) : null)
    setCapExplanation(null)

    // Auto-remove notice (SPEC §11.3 step 3b): only surface it on the LIVE
    // transition (a voucher we were showing disappeared on this same prop
    // update) and only once per notice — see `shownNoticeRef`'s doc comment
    // and `VoucherAutoRemoveNotice`'s KNOWN GAP note for why this doesn't
    // retroactively surface a notice from before the page was loaded.
    if (hadActiveVoucher && !meta) {
      const notice = readVoucherNotice(cart)
      if (notice) {
        const signature = `${notice.voucher_code}:${notice.reason_code}`
        if (shownNoticeRef.current !== signature) {
          shownNoticeRef.current = signature
          setVoucherNotice(notice.customer_message)
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.metadata])

  /** Tries VoucherEngine's apply endpoint. Never falls back itself — the caller (`submitCode`) decides on `notFound`. */
  const attemptVoucherApply = async (
    code: string,
    replace?: boolean,
  ): Promise<VoucherApplyAttempt> => {
    // Re-applying the SAME voucher that's already active: the backend can't
    // tell "same code" apart from "different code" (`check-active-voucher.ts`
    // throws VOUCHER_REPLACE_REQUIRED whenever any voucher is active,
    // regardless of what the new code is), so without this check the
    // customer would see "Replace mã X với mã X?" — confusing, not a real
    // replace. Comparing against `activeVoucher` (already-hydrated local
    // state) needs no backend round-trip and isn't voucher business
    // validation (V1–V8) — it's just a string match on what's already
    // displayed, so this doesn't violate "UI must not duplicate business
    // validation". Skipped for `replace === true` (an explicit replace-
    // confirm call, where `code` is `replaceConfirm.pendingCode` — by
    // construction never equal to the currently-active code once this
    // check exists).
    if (
      !replace &&
      activeVoucher &&
      code.trim().toUpperCase() === activeVoucher.code
    ) {
      setErrorMessage(null)
      setSuccessMessage(alreadyActiveVi(activeVoucher.code))
      return { kind: "alreadyActive" }
    }
    try {
      const result = await applyVoucher(code, replace)
      if (result.ok) {
        skipNextResync.current = true
        setActiveVoucher({
          code: result.data.voucher_details.code,
          discount_type: result.data.voucher_details.type,
          discount_value: result.data.voucher_details.value,
          discount_amount: result.data.discount_amount,
          discount_capped: result.data.discount_capped,
        })
        setCapExplanation(result.data.cap_explanation)
        setReplaceConfirm(null)
        setSuccessMessage(APPLY_SUCCESS_VI)
        setVoucherNotice(null)
        return { kind: "success" }
      }
      const err = result.error
      if (err.code === "VOUCHER_REPLACE_REQUIRED") {
        setReplaceConfirm({ pendingCode: code, message: err.customer_message })
        return { kind: "replaceRequired" }
      }
      // `err.code === "VOUCHER_NOT_FOUND"` is the normal case (a well-formed
      // VoucherEngine rejection). `!err.customer_message` covers a DIFFERENT
      // failure shape: a code that never reached VoucherEngine's own error
      // catalog at all because it was rejected by `ApplyVoucherSchema`'s zod
      // validation first (e.g. under 6 chars, non-alphanumeric — a very
      // plausible "wrong code"). That response is Medusa's native
      // `{type, message}` shape with NO `customer_message` field — verified
      // live: `curl .../voucher -d '{"code":"abc"}'` → `{"type":"invalid_data",
      // "message":"Invalid request: ..."}`. Treating it as "not found" is
      // correct either way: the code isn't a usable voucher, so it should get
      // the same shot at the generic-promotion fallback (UX-FLOW.md §1a) —
      // and it guarantees `attempt.message` is never undefined downstream.
      if (err.code === "VOUCHER_NOT_FOUND" || !err.customer_message) {
        return { kind: "notFound" }
      }
      // Any other VoucherEngine rejection (expired, min order not met, no
      // eligible items, segment, stacking conflict, rate-limited) means the
      // code IS a real voucher (or a real cooldown), just not currently
      // applicable — never fall back to the generic-promotion path for these
      // (UX-FLOW.md §1a step 4). Always the backend's own `customer_message`
      // (VI) verbatim — never invented client-side (SRS i18n).
      return { kind: "rejected", message: err.customer_message }
    } catch {
      // Thrown = a genuine transport/network failure (voucherFetch only
      // throws for those — see lib/data/voucher.ts), not a well-formed
      // backend rejection. No backend customer_message exists here, so per
      // SRS i18n this is the one case that gets an invented fallback — VI,
      // never the raw exception text.
      return { kind: "rejected", message: GENERIC_ERROR_VI }
    }
  }

  const applyGenericCode = async (
    code: string,
  ): Promise<{ ok: boolean; message?: string }> => {
    const codes = allPromotions
      .filter((p) => p.code !== undefined)
      .map((p) => p.code!)
    codes.push(code)
    try {
      await applyPromotions(codes)
      setSuccessMessage(APPLY_SUCCESS_VI)
      setVoucherNotice(null)
      return { ok: true }
    } catch {
      // `applyPromotions` throws via `medusaError` (`lib/util/medusa-error.ts`),
      // which surfaces the core Medusa error's own (English) message — not a
      // VoucherEngine `customer_message`. Since this is the "neither a voucher
      // nor a valid generic code" final failure (UX-FLOW.md §1a step 4 /
      // task requirement 3), show one clear VI message instead of raw
      // English/technical text.
      return { ok: false, message: INVALID_CODE_VI }
    }
  }

  const removeGenericCode = async (
    code: string,
  ): Promise<{ ok: boolean; message?: string }> => {
    const remainingCodes = allPromotions
      .filter((p) => p.code !== code && p.code !== undefined)
      .map((p) => p.code!)
    try {
      await applyPromotions(remainingCodes)
      return { ok: true }
    } catch {
      return { ok: false, message: GENERIC_ERROR_VI }
    }
  }

  /**
   * Single-input routing rule (UX-FLOW.md §1a) — the ONE entry point both the
   * manual input form and the Available-vouchers modal call. Always tries
   * VoucherEngine first; only a `VOUCHER_NOT_FOUND` falls back to the
   * existing generic-promotion apply call. Kept isolated in this one function
   * so it can be swapped for a future combined backend endpoint without
   * touching the rest of the component.
   */
  const submitCode = async (
    code: string,
    replace?: boolean,
  ): Promise<{ ok: boolean; message?: string }> => {
    const attempt = await attemptVoucherApply(code, replace)
    switch (attempt.kind) {
      case "success":
        return { ok: true }
      case "alreadyActive":
        // Not an error — the "already applied" message is already set.
        return { ok: true }
      case "replaceRequired":
        // Not an error — ReplaceConfirmModal takes over from here.
        return { ok: true }
      case "rejected":
        return { ok: false, message: attempt.message }
      case "notFound":
        return applyGenericCode(code)
    }
  }

  const handleApplySubmit = async (formData: FormData) => {
    const code = formData.get("code")
    if (!code) {
      return
    }
    setErrorMessage(null)
    setSuccessMessage(null)
    setPhase("applying")
    const result = await submitCode(code.toString())
    setPhase("idle")
    if (!result.ok) {
      // Defensive: every known failure path already sets a real VI message
      // (backend `customer_message` or one of the constants above), but a
      // failure must never render as silence — always show something.
      setErrorMessage(result.message ?? GENERIC_ERROR_VI)
    }
    const input = document.getElementById(
      "discount-input",
    ) as HTMLInputElement | null
    if (input) {
      input.value = ""
    }
  }

  const handleListApply = async (
    code: string,
  ): Promise<{ ok: boolean; message?: string }> => {
    setErrorMessage(null)
    setSuccessMessage(null)
    setPhase("applying")
    const result = await submitCode(code)
    setPhase("idle")
    if (result.ok) {
      setIsVouchersModalOpen(false)
    }
    return result
  }

  const handleRemoveVoucher = async () => {
    setPhase("removingVoucher")
    setErrorMessage(null)
    setSuccessMessage(null)
    try {
      const result = await removeVoucher()
      if (result.ok) {
        skipNextResync.current = true
        setActiveVoucher(null)
        setCapExplanation(null)
        setVoucherNotice(null)
        // Backend-provided (`remove-voucher.ts`'s `RemoveVoucherResult.message`)
        // — render verbatim, `REMOVE_SUCCESS_VI` is only a defensive fallback.
        setSuccessMessage(result.data.message || REMOVE_SUCCESS_VI)
      } else {
        // Backend `customer_message` (VI) verbatim — never invented client-side.
        setErrorMessage(result.error.customer_message)
      }
    } catch {
      // Thrown = transport/network failure, not a well-formed backend
      // rejection (see the matching comment in `attemptVoucherApply`).
      setErrorMessage(GENERIC_ERROR_VI)
    } finally {
      setPhase("idle")
    }
  }

  const handleRemoveGeneric = async (code: string) => {
    setPhase("removingGeneric")
    setErrorMessage(null)
    setSuccessMessage(null)
    try {
      const result = await removeGenericCode(code)
      if (!result.ok) {
        setErrorMessage(result.message ?? GENERIC_ERROR_VI)
      }
    } catch {
      setErrorMessage(GENERIC_ERROR_VI)
    } finally {
      setPhase("idle")
    }
  }

  const handleReplaceConfirm = async () => {
    if (!replaceConfirm) {
      return
    }
    setErrorMessage(null)
    setSuccessMessage(null)
    setPhase("applying")
    const attempt = await attemptVoucherApply(replaceConfirm.pendingCode, true)
    setPhase("idle")
    // "success" already set successMessage/cleared replaceConfirm inside
    // attemptVoucherApply. Every OTHER outcome is a failure to complete the
    // confirmed replace and must close the modal + show a message — this is
    // NOT `submitCode`'s normal routing (no silent fall-back to a generic
    // promotion apply here: the customer already confirmed replacing with
    // THIS specific voucher code, so "notFound" means that code is invalid,
    // not "try it as a promo code"). Checking `!== "success"` (not just
    // `=== "rejected"`) is deliberate: `attemptVoucherApply` can also return
    // "notFound" (any response with no `customer_message`, e.g. a code that
    // failed schema validation) or, defensively, "replaceRequired" again —
    // leaving either of those unhandled is exactly the bug where the modal
    // never closes and nothing is shown.
    if (attempt.kind !== "success") {
      setReplaceConfirm(null)
      setErrorMessage(
        attempt.kind === "rejected" ? attempt.message : INVALID_CODE_VI,
      )
    }
  }

  const isBusy = phase !== "idle"

  return (
    <div
      className="w-full bg-white flex flex-col gap-y-3"
      data-testid="discount-code"
    >
      <Heading level="h3" className="txt-medium">
        Promotion code
      </Heading>

      <form action={handleApplySubmit} className="w-full">
        <div className="flex w-full gap-x-2">
          <Input
            className="size-full"
            id="discount-input"
            name="code"
            type="text"
            placeholder="Enter promotion or voucher code"
            disabled={isBusy}
            data-testid="discount-input"
          />
          <SubmitButton variant="secondary" data-testid="discount-apply-button">
            Apply
          </SubmitButton>
        </div>
        <ErrorMessage
          error={errorMessage}
          data-testid="discount-error-message"
        />
        <SuccessMessage
          message={successMessage}
          data-testid="discount-success-message"
        />
      </form>

      {voucherNotice && (
        <div
          className="bg-neutral-100 border rounded-md p-3 text-ui-fg-subtle text-small-regular"
          data-testid="voucher-auto-remove-notice"
        >
          {voucherNotice}
        </div>
      )}

      {(displayedPromotions.length > 0 || activeVoucher) && (
        <div className="w-full flex flex-col gap-y-2">
          <Heading className="txt-medium">Applied codes:</Heading>

          {displayedPromotions.map((promotion) => (
            <div
              key={promotion.id}
              className="flex items-center justify-between w-full max-w-full"
              data-testid="discount-row"
            >
              <Text className="flex gap-x-1 items-baseline txt-small-plus w-4/5 pr-1">
                <span className="truncate" data-testid="discount-code-value">
                  <Badge color={promotion.is_automatic ? "green" : "grey"}>
                    {promotion.code}
                  </Badge>{" "}
                  (
                  {promotion.application_method?.value !== undefined &&
                    promotion.application_method.currency_code !==
                      undefined && (
                      <>
                        {promotion.application_method.type === "percentage"
                          ? `${promotion.application_method.value}%`
                          : convertToLocale({
                              amount: +promotion.application_method.value,
                              currency_code:
                                promotion.application_method.currency_code,
                            })}
                      </>
                    )}
                  )
                </span>
              </Text>
              {!promotion.is_automatic && (
                <button
                  className="flex items-center disabled:opacity-50"
                  onClick={() => {
                    if (!promotion.code) {
                      return
                    }
                    handleRemoveGeneric(promotion.code)
                  }}
                  disabled={isBusy}
                  data-testid="remove-discount-button"
                >
                  <Trash size={14} />
                  <span className="sr-only">Remove</span>
                </button>
              )}
            </div>
          ))}

          {activeVoucher && (
            <div className="flex flex-col gap-y-2">
              <div
                className="flex items-center justify-between w-full max-w-full"
                data-testid="voucher-applied-row"
              >
                <Text className="flex gap-x-1 items-baseline txt-small-plus w-4/5 pr-1">
                  <Badge color="green" data-testid="voucher-code-badge">
                    {activeVoucher.code}
                  </Badge>{" "}
                  <span data-testid="voucher-savings">
                    You saved{" "}
                    {convertToLocale({
                      amount: activeVoucher.discount_amount,
                      currency_code: currencyCode,
                    })}
                  </span>
                </Text>
                <button
                  type="button"
                  className="flex items-center disabled:opacity-50"
                  onClick={handleRemoveVoucher}
                  disabled={isBusy}
                  data-testid="voucher-remove-button"
                >
                  <Trash size={14} />
                  <span className="sr-only">Remove</span>
                </button>
              </div>

              {activeVoucher.discount_capped && capExplanation && (
                <div
                  className="bg-neutral-100 border rounded-md p-3 text-ui-fg-subtle text-small-regular"
                  data-testid="voucher-cap-explanation"
                >
                  {capExplanation}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        className="txt-small text-ui-fg-interactive hover:text-ui-fg-interactive-hover text-left"
        onClick={() => setIsVouchersModalOpen(true)}
        disabled={isBusy}
        data-testid="available-vouchers-trigger"
      >
        Available vouchers
      </button>

      <ReplaceConfirmModal
        isOpen={!!replaceConfirm}
        message={replaceConfirm?.message ?? ""}
        isConfirming={phase === "applying"}
        onConfirm={handleReplaceConfirm}
        onCancel={() => setReplaceConfirm(null)}
      />

      <AvailableVouchersModal
        isOpen={isVouchersModalOpen}
        close={() => setIsVouchersModalOpen(false)}
        currencyCode={currencyCode}
        cartId={cart.id}
        onApply={handleListApply}
      />
    </div>
  )
}

export default DiscountCode
