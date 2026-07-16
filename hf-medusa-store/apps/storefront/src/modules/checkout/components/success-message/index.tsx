/** Success-feedback sibling to `../error-message` — same shape, green instead of red. */
const SuccessMessage = ({
  message,
  "data-testid": dataTestid,
}: {
  message?: string | null
  "data-testid"?: string
}) => {
  if (!message) {
    return null
  }

  return (
    <div
      className="pt-2 text-green-600 text-small-regular"
      data-testid={dataTestid}
    >
      <span>{message}</span>
    </div>
  )
}

export default SuccessMessage
