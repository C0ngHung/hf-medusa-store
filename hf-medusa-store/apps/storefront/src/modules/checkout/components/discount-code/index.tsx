"use client"

import { useEffect, useRef, useState } from "react"
import { HttpTypes } from "@medusajs/types"
import { toast } from "@medusajs/ui"
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
 * dedicated `/store/carts/:id/voucher` endpoints) through one input and one
 * Apply button. The applied-codes area renders 3 visually distinct groups so
 * a customer can always tell what's what (2026-07-22 fix):
 *  1. Auto-applied promotions (`is_automatic: true`, grey badge, no remove
 *     button — the customer never chose these, they're merchant-configured).
 *  2. Other applied codes (`is_automatic: false`, a generic code the customer
 *     entered that ISN'T the VoucherEngine voucher — a plain Medusa
 *     Promotion code, still supported unchanged).
 *  3. The VoucherEngine voucher itself (green badge, its own section) —
 *     sourced from `cart.metadata.voucher`, never from `cart.promotions`.
 *
 * VoucherEngine's discount is carried by raw `LineItemAdjustment` rows
 * (Decision-4 carrier rewrite, 2026-07-20), NOT by a Promotion — it NEVER
 * appears in `cart.promotions` at all anymore, so there is nothing to filter
 * out of that array for that reason (the old `ephemeral_promotion_id`-based
 * filter here was dead code after that rewrite; removed). `cart.promotions`
 * is still defensively filtered, as a belt-and-suspenders guard against any
 * future architecture change, to drop any entry whose `code` happens to
 * match the active voucher's code.
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

function formatVnd(amount: number): string {
  return `${new Intl.NumberFormat("vi-VN").format(amount)}₫`
}

function formatCapPercent(globalCapBps: number): string {
  const pct = globalCapBps / 100
  return Number.isInteger(pct) ? String(pct) : pct.toFixed(2)
}

/**
 * Actual VND discount a Promotion (automatic or manual generic code) gave
 * this cart — summed straight from `items[].adjustments`/
 * `shipping_methods[].adjustments` (`amount`, `retrieveCart`'s default
 * `fields` now requests these). Bug-bash fix (2026-07-21): the row used to
 * only show the Promotion's CONFIGURED percentage/value
 * (`application_method.value`), which is not what the customer actually
 * saved (e.g. a percentage promotion only applies to eligible items, or a
 * fixed-amount one is floor-capped at the eligible subtotal) — SRS VOUCH-003
 * requires the customer be able to see the automatic-promotion amount
 * plainly enough to reconcile it against the voucher's own cap explanation.
 */
function sumPromotionAdjustments(
  cart: HttpTypes.StoreCart,
  promotionId?: string,
): number {
  if (!promotionId) {
    return 0
  }
  const fromItems = (cart.items ?? []).reduce(
    (sum, item) =>
      sum +
      (item.adjustments ?? [])
        .filter((adjustment) => adjustment.promotion_id === promotionId)
        .reduce((s, adjustment) => s + (adjustment.amount ?? 0), 0),
    0,
  )
  const fromShipping = (cart.shipping_methods ?? []).reduce(
    (sum, method) =>
      sum +
      (method.adjustments ?? [])
        .filter((adjustment) => adjustment.promotion_id === promotionId)
        .reduce((s, adjustment) => s + (adjustment.amount ?? 0), 0),
    0,
  )
  return fromItems + fromShipping
}

/**
 * Reconstructs the EXACT Vietnamese cap-explanation sentence the backend
 * builds server-side (`modules/voucher-engine/lib/calculate-discount.ts`'s
 * `buildCapExplanation`), from the numeric fields `cart.metadata.voucher`
 * ALWAYS carries (`voucher_discount_after_voucher_cap`, `discount_amount`,
 * `cap_percentage_bps`) — unlike the apply-response's own pre-built
 * `cap_explanation` string, which only exists in that one response and is
 * NOT persisted to metadata (see `VoucherCartMetadata`'s doc comment). This
 * is what lets the resync effect below rebuild the explanation on EVERY cart
 * change (including one this component didn't cause, e.g. adding a
 * suggested item elsewhere) instead of blanking it — 2026-07-22 fix. Only
 * call when `meta.discount_capped` is true.
 */
function buildCapExplanationVi(meta: VoucherCartMetadata): string {
  return `Giảm giá đã được điều chỉnh từ ${formatVnd(
    meta.voucher_discount_after_voucher_cap,
  )} xuống ${formatVnd(meta.discount_amount)} theo chính sách giảm tối đa ${formatCapPercent(
    meta.cap_percentage_bps,
  )}%.`
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
  // Medusa can return `cart.promotions` containing `null` entries (a
  // promotion whose linked entity failed to resolve, e.g. removed/expired
  // between the cart snapshot and this render) — filtered out here, once, so
  // every downstream consumer (`autoPromotions`, `manualPromotions`,
  // `applyGenericCode`, `removeGenericCode`) can assume non-null elements.
  const allPromotions = (cart.promotions ?? []).filter(
    (promotion): promotion is NonNullable<typeof promotion> =>
      promotion != null,
  )

  const voucherMeta = readVoucherMetadata(cart)

  const [activeVoucher, setActiveVoucher] = useState<DisplayedVoucher | null>(
    () => (voucherMeta ? toDisplayedVoucher(voucherMeta) : null),
  )

  // 2026-07-22 fix: the voucher no longer rides on a Promotion at all
  // (Decision-4 carrier rewrite — raw LineItemAdjustments, `promotion_id:
  // null`), so it never appears in `cart.promotions`; there is nothing to
  // filter out of that array for that reason anymore (the old
  // `ephemeral_promotion_id`-based filter here was dead code, since that
  // field no longer exists in the real metadata payload — see
  // `modules/voucher/types.ts`). Kept only as a defensive belt-and-suspenders
  // guard (matching by code, not a since-removed id) — `StoreCartPromotion`
  // (the store-facing DTO `cart.promotions` actually uses) has no `status`
  // field to additionally filter an "inactive" entry by; Medusa's own
  // promotion engine only ever attaches currently-appliable promotions to a
  // cart in the first place, so there's nothing to defend against there.
  //
  // Split into 3 visually distinct groups so a customer can always tell
  // auto-applied promotions apart from a code they entered themselves apart
  // from the real voucher (2026-07-22 — previously all shared one "Applied
  // codes" list with the SAME green badge as the voucher, indistinguishable).
  const autoPromotions = allPromotions.filter(
    (promotion) => promotion.is_automatic,
  )
  const manualPromotions = allPromotions.filter(
    (promotion) =>
      !promotion.is_automatic && promotion.code !== activeVoucher?.code,
  )

  const [capExplanation, setCapExplanation] = useState<string | null>(null)
  const [phase, setPhase] = useState<
    "idle" | "applying" | "removingVoucher" | "removingGeneric"
  >("idle")
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
  // what we already applied locally, so re-running the hydration below would
  // be redundant (not harmful anymore — see the resync fix just below, which
  // now derives the SAME cap explanation from metadata either way — but
  // still skipped to avoid a pointless extra state update).
  const skipNextResync = useRef(false)

  // Hydrates the voucher row from `cart.metadata.voucher` (D1/D2) on every
  // prop change that ISN'T an echo of our own action — covers first paint,
  // page reload, and any out-of-band change (cart-change auto-revalidation,
  // another tab, e.g. adding a suggested item). Generic-promotion rows don't
  // need this: they're derived fresh from `cart.promotions` on every render
  // already.
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
    // 2026-07-22 fix: this used to unconditionally null the cap banner on
    // EVERY resync, including one triggered by an unrelated cart change (e.g.
    // a suggested item added elsewhere) that still leaves the voucher
    // capped — wiping a still-accurate explanation. `cart.metadata.voucher`
    // always carries the raw numbers needed to rebuild the exact same
    // sentence (see `buildCapExplanationVi`), so derive it fresh here instead
    // of discarding it.
    setCapExplanation(
      meta && meta.discount_capped ? buildCapExplanationVi(meta) : null,
    )

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
          toast.warning(notice.customer_message)
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
      toast.info(alreadyActiveVi(activeVoucher.code))
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
        setVoucherNotice(null)
        toast.success(APPLY_SUCCESS_VI, {
          description: result.data.cap_explanation ?? undefined,
        })
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
      toast.error(err.customer_message)
      return { kind: "rejected", message: err.customer_message }
    } catch {
      // Thrown = a genuine transport/network failure (voucherFetch only
      // throws for those — see lib/data/voucher.ts), not a well-formed
      // backend rejection. No backend customer_message exists here, so per
      // SRS i18n this is the one case that gets an invented fallback — VI,
      // never the raw exception text.
      toast.error(GENERIC_ERROR_VI)
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
      const updatedCart = await applyPromotions(codes)
      // Medusa's `updateCartPromotionsWorkflow` only THROWS for a code that
      // matches no Promotion record at all — a code that exists but is
      // currently unappliable (inactive/disabled, expired, not yet started,
      // not eligible for this cart) is silently dropped ("skipped") and the
      // call still resolves successfully (verified:
      // `get-promotion-codes-to-apply.js` only throws when
      // `!validPromoCodes.has(code)`; an existing-but-skipped code never
      // reaches that branch). Without this membership check, entering such a
      // code showed a false "success" toast even though nothing was actually
      // applied to the cart.
      const applied = (updatedCart.promotions ?? []).some(
        (promotion) => promotion?.code === code,
      )
      if (!applied) {
        toast.error(INVALID_CODE_VI)
        return { ok: false, message: INVALID_CODE_VI }
      }
      setVoucherNotice(null)
      toast.success(APPLY_SUCCESS_VI)
      return { ok: true }
    } catch {
      // `applyPromotions` throws via `medusaError` (`lib/util/medusa-error.ts`),
      // which surfaces the core Medusa error's own (English) message — not a
      // VoucherEngine `customer_message`. Since this is the "neither a voucher
      // nor a valid generic code" final failure (UX-FLOW.md §1a step 4 /
      // task requirement 3), show one clear VI message instead of raw
      // English/technical text.
      toast.error(INVALID_CODE_VI)
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
      toast.success(REMOVE_SUCCESS_VI)
      return { ok: true }
    } catch {
      toast.error(GENERIC_ERROR_VI)
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
    setPhase("applying")
    await submitCode(code.toString())
    setPhase("idle")
    // Every outcome already surfaced via toast inside submitCode/attemptVoucherApply/
    // applyGenericCode — nothing further to show here (2026-07-22: the inline
    // notification under this input was removed in favor of toast).
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
    try {
      const result = await removeVoucher()
      if (result.ok) {
        skipNextResync.current = true
        setActiveVoucher(null)
        setCapExplanation(null)
        setVoucherNotice(null)
        // Backend-provided (`remove-voucher.ts`'s `RemoveVoucherResult.message`)
        // — render verbatim, `REMOVE_SUCCESS_VI` is only a defensive fallback.
        toast.success(result.data.message || REMOVE_SUCCESS_VI)
      } else {
        // Backend `customer_message` (VI) verbatim — never invented client-side.
        toast.error(result.error.customer_message)
      }
    } catch {
      // Thrown = transport/network failure, not a well-formed backend
      // rejection (see the matching comment in `attemptVoucherApply`).
      toast.error(GENERIC_ERROR_VI)
    } finally {
      setPhase("idle")
    }
  }

  const handleRemoveGeneric = async (code: string) => {
    setPhase("removingGeneric")
    await removeGenericCode(code)
    // Every outcome already toasted inside removeGenericCode.
    setPhase("idle")
  }

  const handleReplaceConfirm = async () => {
    if (!replaceConfirm) {
      return
    }
    setPhase("applying")
    const attempt = await attemptVoucherApply(replaceConfirm.pendingCode, true)
    setPhase("idle")
    // "success" already toasted/cleared replaceConfirm inside
    // attemptVoucherApply. Every OTHER outcome is a failure to complete the
    // confirmed replace and must close the modal — this is NOT `submitCode`'s
    // normal routing (no silent fall-back to a generic promotion apply here:
    // the customer already confirmed replacing with THIS specific voucher
    // code, so "notFound" means that code is invalid, not "try it as a promo
    // code"). Checking `!== "success"` (not just `=== "rejected"`) is
    // deliberate: `attemptVoucherApply` can also return "notFound" (any
    // response with no `customer_message`, e.g. a code that failed schema
    // validation) or, defensively, "replaceRequired" again — leaving either
    // of those unhandled is exactly the bug where the modal never closes.
    if (attempt.kind !== "success") {
      setReplaceConfirm(null)
      // "rejected" already toasted inside attemptVoucherApply — avoid a
      // duplicate toast for that one outcome.
      if (attempt.kind !== "rejected") {
        toast.error(INVALID_CODE_VI)
      }
    }
  }

  const isBusy = phase !== "idle"

  return (
    <div
      className="w-full bg-white flex flex-col gap-y-3"
      data-testid="discount-code"
    >
      <Heading level="h3" className="txt-medium">
        Mã giảm giá / voucher
      </Heading>

      <form action={handleApplySubmit} className="w-full">
        <div className="flex w-full gap-x-2">
          <Input
            className="size-full"
            id="discount-input"
            name="code"
            type="text"
            placeholder="Nhập mã giảm giá hoặc mã voucher"
            disabled={isBusy}
            data-testid="discount-input"
          />
          <SubmitButton variant="secondary" data-testid="discount-apply-button">
            Áp dụng
          </SubmitButton>
        </div>
      </form>

      {voucherNotice && (
        <div
          className="bg-neutral-100 border rounded-md p-3 text-ui-fg-subtle text-small-regular"
          data-testid="voucher-auto-remove-notice"
        >
          {voucherNotice}
        </div>
      )}

      {(autoPromotions.length > 0 ||
        manualPromotions.length > 0 ||
        activeVoucher) && (
        <div className="w-full flex flex-col gap-y-3">
          {autoPromotions.length > 0 && (
            <div className="flex flex-col gap-y-2">
              <Text className="txt-medium text-ui-fg-subtle">
                Khuyến mãi tự động áp dụng:
              </Text>
              {autoPromotions.map((promotion) => {
                // Bug-bash fallback (2026-07-21): a native automatic
                // Promotion has no requirement to carry a `code` — an empty
                // badge would otherwise render for one that doesn't.
                const label = promotion.code || "Khuyến mãi tự động"
                const savedAmount = sumPromotionAdjustments(cart, promotion.id)
                return (
                  <div
                    key={promotion.id}
                    className="flex items-center justify-between gap-x-2 w-full max-w-full"
                    data-testid="auto-promotion-row"
                  >
                    <Badge
                      color="grey"
                      className="shrink-0 max-w-[60%] truncate"
                      data-testid="auto-promotion-code-value"
                    >
                      {label}
                    </Badge>
                    {savedAmount > 0 && (
                      <Text
                        className="txt-small-plus text-ui-fg-subtle shrink-0"
                        data-testid="auto-promotion-savings"
                      >
                        Đã giảm{" "}
                        {convertToLocale({
                          amount: savedAmount,
                          currency_code: currencyCode,
                        })}
                      </Text>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {manualPromotions.length > 0 && (
            <div className="flex flex-col gap-y-2">
              <Text className="txt-medium text-ui-fg-subtle">
                Mã đã áp dụng:
              </Text>
              {manualPromotions.map((promotion) => (
                <div
                  key={promotion.id}
                  className="flex items-center justify-between w-full max-w-full"
                  data-testid="discount-row"
                >
                  <Text className="flex gap-x-1 items-baseline txt-small-plus w-4/5 pr-1">
                    <span
                      className="truncate"
                      data-testid="discount-code-value"
                    >
                      <Badge color="blue">{promotion.code}</Badge> (
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
                    <span className="sr-only">Xoá</span>
                  </button>
                </div>
              ))}
            </div>
          )}

          {activeVoucher && (
            <div className="flex flex-col gap-y-2">
              <Text className="txt-medium text-ui-fg-subtle">Voucher:</Text>
              <div
                className="flex items-center justify-between w-full max-w-full"
                data-testid="voucher-applied-row"
              >
                <Text className="flex gap-x-1 items-baseline txt-small-plus w-4/5 pr-1">
                  <Badge color="green" data-testid="voucher-code-badge">
                    {activeVoucher.code}
                  </Badge>{" "}
                  <span data-testid="voucher-savings">
                    Bạn tiết kiệm được{" "}
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
                  <span className="sr-only">Xoá</span>
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
        Xem voucher khả dụng
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
