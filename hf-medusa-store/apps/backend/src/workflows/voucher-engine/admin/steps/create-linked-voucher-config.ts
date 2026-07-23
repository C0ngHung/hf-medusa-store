/**
 * SUPERSEDED (Admin unified model, cart-code/Enable-Disable redesign) — this
 * create-only step has been replaced by
 * `upsert-linked-voucher-config.ts`'s `upsertLinkedVoucherConfigStep`, which
 * handles create, reactivate (Disable -> re-Enable), and update-in-place
 * through the same idempotent operation. Nothing in this codebase imports
 * from this file anymore (verify with a repo-wide grep before assuming
 * otherwise in a future session).
 *
 * Kept as a dead stub rather than deleted: this environment's permission
 * system denies file deletion (same constraint recorded for the earlier
 * superseded `admin/steps/create-voucher.ts`, see
 * `.claude/progress/voucher-engine-rebuild-progress.md`). Remove this file
 * outright in a session/environment where deletion is possible.
 */
export {};
