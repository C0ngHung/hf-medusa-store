"use client"

import { useEffect, useState } from "react"
import { convertToLocale } from "@lib/util/money"
import { fetchAvailableVouchers } from "@lib/data/voucher"
import ErrorMessage from "@modules/checkout/components/error-message"
import Modal from "@modules/common/components/modal"
import { Button, Heading, Text } from "@modules/common/components/ui"
import type { AvailableVoucher } from "@modules/voucher/types"

type ApplyResult = { ok: boolean; message?: string }

type AvailableVouchersModalProps = {
  isOpen: boolean
  close: () => void
  currencyCode: string
  onApply: (code: string) => Promise<ApplyResult>
}

/**
 * "Available vouchers" list (UX-FLOW.md D6 — labeled "available", never "my
 * vouchers": there is no per-customer targeting model in the backend).
 *
 * `GET /store/customers/me/vouchers` is currently NOT public for guests: core
 * Medusa applies a blanket `authenticate("customer", ["session","bearer"])`
 * middleware to the wildcard path `/store/customers/me*`
 * (`@medusajs/medusa/dist/api/store/customers/middlewares.js`), which catches
 * this custom route too regardless of what its own handler does — verified
 * empirically against the running backend: an unauthenticated request to this
 * route returns `401 Unauthorized`, not a 200 with vouchers. This contradicts
 * an earlier (incorrect) claim that the route was unauthenticated/public.
 *
 * This component doesn't special-case that 401 — `fetchAvailableVouchers()`
 * (`lib/data/voucher.ts`) catches any failure and resolves to `[]`, so a
 * guest simply sees the ordinary empty-list state ("No vouchers available
 * right now.") below, not an error. Whether the route should be made truly
 * public or should stay customer-gated (with a real sign-in-to-view state) is
 * an open product/backend decision — see
 * `docs/voucher-engine-ui/REQUIREMENTS.md` §2.
 */
const AvailableVouchersModal: React.FC<AvailableVouchersModalProps> = ({
  isOpen,
  close,
  currencyCode,
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
    fetchAvailableVouchers().then((result) => {
      if (!cancelled) {
        setVouchers(result)
      }
    })
    return () => {
      cancelled = true
    }
  }, [isOpen])

  const handleApply = async (code: string) => {
    setPendingCode(code)
    setErrorMessage(null)
    const result = await onApply(code)
    setPendingCode(null)
    if (!result.ok && result.message) {
      setErrorMessage(result.message)
    }
  }

  return (
    <Modal isOpen={isOpen} close={close} data-testid="available-vouchers-modal">
      <Modal.Title>
        <Heading className="mb-2">Available vouchers</Heading>
      </Modal.Title>
      <Modal.Body>
        <div className="flex flex-col gap-y-3 w-full">
          {vouchers === null && (
            <Text className="text-ui-fg-subtle">Loading...</Text>
          )}
          {vouchers?.length === 0 && (
            <Text className="text-ui-fg-subtle">
              No vouchers available right now.
            </Text>
          )}
          {vouchers?.map((voucher) => (
            <div
              key={voucher.code}
              className="flex items-center justify-between gap-x-4 border rounded-md p-3"
              data-testid="available-voucher-row"
            >
              <div className="flex flex-col text-left">
                <Text className="txt-small-plus">{voucher.code}</Text>
                <Text className="text-ui-fg-subtle text-small-regular">
                  {voucher.description}
                </Text>
                {(voucher.min_order ||
                  voucher.applicable_categories.length > 0) && (
                  <Text className="text-ui-fg-subtle text-small-regular">
                    {voucher.min_order
                      ? `Min. order ${convertToLocale({
                          amount: voucher.min_order,
                          currency_code: currencyCode,
                        })}`
                      : null}
                    {voucher.min_order &&
                      voucher.applicable_categories.length > 0 &&
                      " · "}
                    {voucher.applicable_categories.length > 0
                      ? `Applies to: ${voucher.applicable_categories.join(", ")}`
                      : null}
                  </Text>
                )}
              </div>
              <Button
                variant="secondary"
                size="small"
                isLoading={pendingCode === voucher.code}
                disabled={pendingCode !== null}
                onClick={() => handleApply(voucher.code)}
                data-testid="available-voucher-apply-button"
              >
                Apply
              </Button>
            </div>
          ))}
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
