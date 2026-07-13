import { model } from "@medusajs/framework/utils";

/**
 * SuggestionEvent — SRS §5.1 (SUGG-006 analytics), SPEC A.1 / A.11.
 *
 * Write-heavy, append-only. Deliberately decoupled: rule_id and the *_id fields
 * are plain text (no FK relations) so an analytics write never fails on rule/
 * product integrity, and rows survive rule soft-deletes. Indexed on created_at
 * for time-range analytics queries (SRS recommends partitioning by created_at).
 *
 * `tier` (SPEC A.1 addition, SF-08 reporting) records which suggestion tier the
 * event belongs to — `manual` (Tier 1), `category` (Tier 2) or `behavioral`
 * (Tier 3). Storing it as free text (not an enum) keeps the analytics table
 * forward-compatible: Tier 3 Behavioral is Phase 2, but the data model must
 * already accept `tier='behavioral'` today (SUGG-001) without a schema change.
 * `slot` (SPEC A.1 / A.11) is the 1-based display position of the suggestion,
 * used to measure per-slot funnel performance. Both nullable — a legacy/partial
 * event without them is still recorded.
 */
const SuggestionEvent = model
  .define("suggestion_event", {
    id: model.id().primaryKey(),
    rule_id: model.text().nullable(),
    source_context: model.enum(["product_view", "cart"]),
    source_product_id: model.text().nullable(),
    suggested_product_id: model.text(),
    customer_id: model.text().nullable(),
    session_id: model.text().nullable(),
    action: model.enum(["impression", "tap", "add_to_cart", "dismiss"]),
    tier: model.text().nullable(),
    slot: model.number().nullable(),
  })
  .indexes([{ on: ["created_at"] }]);

export default SuggestionEvent;
