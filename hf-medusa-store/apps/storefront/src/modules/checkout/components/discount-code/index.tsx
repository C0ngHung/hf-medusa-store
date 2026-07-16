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
  VoucherCartMetadata,
  VoucherNoticeMetadata,
} from "@modules/voucher/types"
import ErrorMessage from "../error-message"
import { SubmitButton } from "../submit-button"
import ReplaceConfirmModal from "./replace-confirm-modal"
import AvailableVouchersModal from "./available-vouchers-modal"

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

function toDisplayedVoucher(meta: VoucherCartMetadata): DisplayedVoucher {
  return {
    code: meta.code,
    discount_type: meta.discount_type,
    discount_value: meta.discount_value,
    discount_amount: meta.discount_amount,
    discount_capped: meta.discount_capped,
  }
}

function readVoucherNotice(
  cart: HttpTypes.StoreCart,
): VoucherNoticeMetadata | null {
  const metadata = cart.metadata as Record<string, unknown> | null | undefined
  return (metadata?.voucher_notice as VoucherNoticeMetadata | undefined) ?? null
}

/** Outcome of trying VoucherEngine's apply endpoint (UX-FLOW.md §1a). */
type VoucherApplyAttempt =
  | { kind: "success" }
  | { kind: "replaceRequired" }
  | { kind: "notFound"; message: string }
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
  const [autoRemoveNotice, setAutoRemoveNotice] =
    useState<VoucherNoticeMetadata | null>(() => readVoucherNotice(cart))
  const [phase, setPhase] = useState<
    "idle" | "applying" | "removingVoucher" | "removingGeneric"
  >("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [replaceConfirm, setReplaceConfirm] = useState<{
    pendingCode: string
    message: string
  } | null>(null)
  const [isVouchersModalOpen, setIsVouchersModalOpen] = useState(false)

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
    setActiveVoucher(meta ? toDisplayedVoucher(meta) : null)
    setCapExplanation(null)
    setAutoRemoveNotice(readVoucherNotice(cart))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.metadata])

  /** Tries VoucherEngine's apply endpoint. Never falls back itself — the caller (`submitCode`) decides on `notFound`. */
  const attemptVoucherApply = async (
    code: string,
    replace?: boolean,
  ): Promise<VoucherApplyAttempt> => {
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
        setAutoRemoveNotice(null)
        return { kind: "success" }
      }
      const err = result.error
      if (err.code === "VOUCHER_REPLACE_REQUIRED") {
        setReplaceConfirm({ pendingCode: code, message: err.customer_message })
        return { kind: "replaceRequired" }
      }
      if (err.code === "VOUCHER_NOT_FOUND") {
        return { kind: "notFound", message: err.customer_message }
      }
      // Any other VoucherEngine rejection (expired, min order not met, no
      // eligible items, segment, stacking conflict) means the code IS a
      // real voucher, just not currently applicable — never fall back to
      // the generic-promotion path for these (UX-FLOW.md §1a step 4).
      return { kind: "rejected", message: err.customer_message }
    } catch (err) {
      return {
        kind: "rejected",
        message: err instanceof Error ? err.message : String(err),
      }
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
      return { ok: true }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) }
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
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) }
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
    setPhase("applying")
    const result = await submitCode(code.toString())
    setPhase("idle")
    if (!result.ok) {
      setErrorMessage(result.message ?? null)
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
    try {
      const result = await removeVoucher()
      if (result.ok) {
        skipNextResync.current = true
        setActiveVoucher(null)
        setCapExplanation(null)
        setAutoRemoveNotice(null)
      } else {
        setErrorMessage(result.error.customer_message)
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setPhase("idle")
    }
  }

  const handleRemoveGeneric = async (code: string) => {
    setPhase("removingGeneric")
    setErrorMessage(null)
    try {
      const result = await removeGenericCode(code)
      if (!result.ok) {
        setErrorMessage(result.message ?? null)
      }
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e))
    } finally {
      setPhase("idle")
    }
  }

  const handleReplaceConfirm = async () => {
    if (!replaceConfirm) {
      return
    }
    setPhase("applying")
    const attempt = await attemptVoucherApply(replaceConfirm.pendingCode, true)
    setPhase("idle")
    if (attempt.kind === "rejected" || attempt.kind === "notFound") {
      setReplaceConfirm(null)
      setErrorMessage(attempt.message)
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

      {autoRemoveNotice && (
        <div
          className="bg-amber-50 border border-amber-200 rounded-md p-3 text-ui-fg-subtle text-small-regular flex items-start justify-between gap-x-2"
          data-testid="voucher-auto-remove-notice"
        >
          <span>{autoRemoveNotice.customer_message}</span>
          <button
            type="button"
            className="txt-small text-ui-fg-interactive shrink-0"
            onClick={() => setAutoRemoveNotice(null)}
            data-testid="voucher-auto-remove-notice-dismiss"
          >
            Đã hiểu
          </button>
        </div>
      )}

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
      </form>

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
        onApply={handleListApply}
      />
    </div>
  )
}

export default DiscountCode
