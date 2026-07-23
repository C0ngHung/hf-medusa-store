"use client"

import { useEffect, useState } from "react"
import { convertToLocale } from "@lib/util/money"
import { fetchAvailableVouchers } from "@lib/data/voucher"
import ErrorMessage from "@modules/checkout/components/error-message"
import Modal from "@modules/common/components/modal"
import { Badge, Button, Heading, Text } from "@modules/common/components/ui"
import type { AvailableVoucher } from "@modules/voucher/types"

// Duplicated (not imported) deliberately — importing from "./index" here
// would be a circular import, since index.tsx imports this file.
const GENERIC_ERROR_VI = "Có lỗi xảy ra, bạn thử lại sau ít phút nhé!"

type ApplyResult = { ok: boolean; message?: string }

type AvailableVouchersModalProps = {
  isOpen: boolean
  close: () => void
  currencyCode: string
  /** Passed to `fetchAvailableVouchers` so the backend can compute per-voucher
   * `eligible`/`ineligible_reason` against this cart's current contents. */
  cartId?: string
  onApply: (code: string) => Promise<ApplyResult>
}

/**
 * "Available vouchers" list (UX-FLOW.md D6 — labeled "available", never "my
 * vouchers": there is no per-customer targeting model in the backend).
 *
 * FIXED 2026-07-21: `fetchAvailableVouchers()` now calls the public
 * `GET /store/vouchers` route instead of `GET /store/customers/me/vouchers`.
 * The latter is NOT public for guests — core Medusa applies a blanket
 * `authenticate("customer", ["session","bearer"])` middleware to the
 * wildcard path `/store/customers/me*`
 * (`@medusajs/medusa/dist/api/store/customers/middlewares.js`), which caught
 * that route too regardless of what its own handler did (verified
 * empirically: an unauthenticated request returned `401`, not a 200 with
 * vouchers). `/store/vouchers` lives outside that prefix specifically so a
 * guest can reach it and see every unrestricted (non-segment-gated) voucher;
 * an authenticated customer additionally sees vouchers gated to a Customer
 * Group they belong to — see that backend route's own header comment.
 *
 * `fetchAvailableVouchers()` (`lib/data/voucher.ts`) still catches any
 * transport failure and resolves to `[]`, so an unrelated network error still
 * degrades to the ordinary empty-list state ("Hiện chưa có voucher nào khả
 * dụng.") below rather than an error — that part is unchanged.
 */
const AvailableVouchersModal: React.FC<AvailableVouchersModalProps> = ({
  isOpen,
  close,
  currencyCode,
  cartId,
  onApply,
}) => {
  const [vouchers, setVouchers] = useState<AvailableVoucher[] | null>(null)
  const [pendingCode, setPendingCode] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) {
      return
    }
    let cancelled = false
    setVouchers(null)
    setErrorMessage(null)
    fetchAvailableVouchers(cartId).then(({ vouchers }) => {
      if (!cancelled) {
        setVouchers(vouchers)
      }
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, cartId])

  const handleApply = async (code: string) => {
    setPendingCode(code)
    setErrorMessage(null)
    const result = await onApply(code)
    setPendingCode(null)
    if (!result.ok) {
      // Defensive fallback — a failure must never render as silence.
      setErrorMessage(result.message ?? GENERIC_ERROR_VI)
    }
  }

  return (
    <Modal isOpen={isOpen} close={close} data-testid="available-vouchers-modal">
      <Modal.Title>
        <Heading className="mb-2">Voucher khả dụng</Heading>
      </Modal.Title>
      <Modal.Body>
        <div className="flex flex-col gap-y-3 w-full">
          {vouchers === null && (
            <Text className="text-ui-fg-subtle">Đang tải...</Text>
          )}
          {vouchers?.length === 0 && (
            <Text className="text-ui-fg-subtle">
              Hiện chưa có voucher nào khả dụng.
            </Text>
          )}
          {/* 2026-07-22 fix: unbounded list overflowed the modal's own
           * max-h-[75vh] with no scrollbar (Modal's Dialog.Panel caps total
           * height but neither it nor this body added overflow handling) —
           * capped + scrollable here instead so the title/trigger stay
           * fixed and only the list itself scrolls. */}
          <div className="flex flex-col gap-y-3 w-full max-h-[50vh] overflow-y-auto pr-1">
            {vouchers?.map((voucher) => {
              // `eligible` is only present when this list was fetched with a
              // cart id (see `cartId` prop) — `undefined` means "not computed",
              // never treated as ineligible.
              const isIneligible = voucher.eligible === false
              return (
                <div
                  key={voucher.code}
                  className="flex items-center justify-between gap-x-4 border rounded-md p-3"
                  data-testid="available-voucher-row"
                >
                  <div className="flex flex-col text-left min-w-0 flex-1">
                    <Text className="txt-small-plus flex items-center gap-x-2">
                      {voucher.code}
                      {!isIneligible &&
                        voucher.estimated_savings != null &&
                        voucher.estimated_savings > 0 && (
                          <Badge
                            color="green"
                            data-testid="available-voucher-savings-badge"
                          >
                            Tiết kiệm{" "}
                            {convertToLocale({
                              amount: voucher.estimated_savings,
                              currency_code: currencyCode,
                            })}
                          </Badge>
                        )}
                    </Text>
                    <Text className="text-ui-fg-subtle text-small-regular">
                      {voucher.description}
                    </Text>
                    {isIneligible ? (
                      <Text
                        className="text-ui-fg-error text-small-regular"
                        data-testid="available-voucher-ineligible-reason"
                      >
                        {voucher.ineligible_reason}
                      </Text>
                    ) : (
                      (voucher.min_order ||
                        voucher.applicable_categories.length > 0) && (
                        <Text className="text-ui-fg-subtle text-small-regular">
                          {voucher.min_order
                            ? `Đơn tối thiểu ${convertToLocale({
                                amount: voucher.min_order,
                                currency_code: currencyCode,
                              })}`
                            : null}
                          {voucher.min_order &&
                            voucher.applicable_categories.length > 0 &&
                            " · "}
                          {voucher.applicable_categories.length > 0
                            ? `Áp dụng cho: ${voucher.applicable_categories.join(", ")}`
                            : null}
                        </Text>
                      )
                    )}
                  </div>
                  <Button
                    variant="secondary"
                    size="small"
                    className="shrink-0"
                    isLoading={pendingCode === voucher.code}
                    disabled={pendingCode !== null || isIneligible}
                    onClick={() => handleApply(voucher.code)}
                    data-testid="available-voucher-apply-button"
                  >
                    Áp dụng
                  </Button>
                </div>
              )
            })}
          </div>
          <ErrorMessage
            error={errorMessage}
            data-testid="available-vouchers-error"
          />
        </div>
      </Modal.Body>
    </Modal>
  )
}

export default AvailableVouchersModal
