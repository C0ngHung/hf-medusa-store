"use client"

import Modal from "@modules/common/components/modal"
import { Button, Heading, Text } from "@modules/common/components/ui"

type ReplaceConfirmModalProps = {
  isOpen: boolean
  /** `customer_message` verbatim (already server-filled with `{current_code}`, D9) — never authored client-side. */
  message: string
  isConfirming: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** VOUCH-001 replace-confirmation (SPEC §11.1 replace note, UX-FLOW.md §5.5). */
const ReplaceConfirmModal: React.FC<ReplaceConfirmModalProps> = ({
  isOpen,
  message,
  isConfirming,
  onConfirm,
  onCancel,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      close={onCancel}
      size="small"
      data-testid="replace-voucher-modal"
    >
      <Modal.Title>
        <Heading className="mb-2">Thay mã giảm giá?</Heading>
      </Modal.Title>
      <Modal.Body>
        <Text data-testid="replace-voucher-message">{message}</Text>
      </Modal.Body>
      <Modal.Footer>
        <Button
          variant="secondary"
          onClick={onCancel}
          disabled={isConfirming}
          data-testid="replace-voucher-cancel"
        >
          Huỷ
        </Button>
        <Button
          onClick={onConfirm}
          isLoading={isConfirming}
          data-testid="replace-voucher-confirm"
        >
          Thay mã
        </Button>
      </Modal.Footer>
    </Modal>
  )
}

export default ReplaceConfirmModal
