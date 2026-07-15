/**
 * buildAutoRemoveNotice — auto-removal notification builder unit tests
 * (SPEC §11.3 step 3b / §8.4; tasks 3.5.9, 3.5.10). Pins the reason mapping and
 * the filled Vietnamese message the storefront reads from
 * `cart.metadata.voucher_notice` after an async auto-removal.
 */
import {
  buildAutoRemoveNotice,
  VOUCHER_NOTICE_METADATA_KEY,
} from "../lib/auto-remove-notice";

describe("buildAutoRemoveNotice (tasks 3.5.9/3.5.10, SPEC §11.3 step 3b)", () => {
  it("3.5.9 — min-order failure yields the min-order reason + a filled VI message", () => {
    const notice = buildAutoRemoveNotice({
      voucher_code: "SAVE10",
      failure_code: "VOUCHER_MIN_ORDER_NOT_MET",
    });

    expect(notice.code).toBe("VOUCHER_AUTO_REMOVED");
    expect(notice.reason_code).toBe("VOUCHER_MIN_ORDER_NOT_MET");
    expect(notice.voucher_code).toBe("SAVE10");
    expect(notice.reason_vi).toBe("giỏ hàng không còn đạt giá trị tối thiểu");
    // Template placeholders both filled — no leftover {code}/{reason}.
    expect(notice.customer_message).toBe(
      "Mã giảm giá SAVE10 đã được tự động xóa vì giỏ hàng không còn đạt giá trị tối thiểu.",
    );
    expect(notice.customer_message).not.toMatch(/\{code\}|\{reason\}/);
  });

  it("3.5.10 — no-eligible-items failure yields the no-eligible reason", () => {
    const notice = buildAutoRemoveNotice({
      voucher_code: "SHUTTLE20",
      failure_code: "VOUCHER_NO_ELIGIBLE_ITEMS",
    });

    expect(notice.reason_code).toBe("VOUCHER_NO_ELIGIBLE_ITEMS");
    expect(notice.reason_vi).toBe("giỏ hàng không còn sản phẩm phù hợp");
    expect(notice.customer_message).toBe(
      "Mã giảm giá SHUTTLE20 đã được tự động xóa vì giỏ hàng không còn sản phẩm phù hợp.",
    );
  });

  it("maps the other revalidation-subset failures (V1/V2/V8) to their own phrases", () => {
    expect(
      buildAutoRemoveNotice({
        voucher_code: "X",
        failure_code: "VOUCHER_EXPIRED",
      }).reason_vi,
    ).toBe("mã đã hết hạn");
    expect(
      buildAutoRemoveNotice({
        voucher_code: "X",
        failure_code: "VOUCHER_INACTIVE",
      }).reason_vi,
    ).toBe("mã không còn hiệu lực");
    expect(
      buildAutoRemoveNotice({
        voucher_code: "X",
        failure_code: "VOUCHER_STACKING_CONFLICT",
      }).reason_vi,
    ).toBe("mã không dùng chung với ưu đãi hiện có");
  });

  it("falls back to a generic reason when the failure code is missing/unknown (defensive)", () => {
    const notice = buildAutoRemoveNotice({ voucher_code: "MYSTERY" });
    expect(notice.reason_code).toBe("VOUCHER_AUTO_REMOVED");
    expect(notice.reason_vi).toBe(
      "giỏ hàng không còn đáp ứng điều kiện của mã",
    );
    expect(notice.customer_message).toContain("MYSTERY");
    expect(notice.customer_message).not.toMatch(/\{code\}|\{reason\}/);
  });

  it("exposes the storefront metadata key for the async notice", () => {
    expect(VOUCHER_NOTICE_METADATA_KEY).toBe("voucher_notice");
  });
});
