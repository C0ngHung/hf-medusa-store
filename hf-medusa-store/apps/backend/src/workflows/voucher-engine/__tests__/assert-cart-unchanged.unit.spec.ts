import { isCartUnchanged } from "../lib/assert-cart-unchanged";

describe("isCartUnchanged (unit, EC-04)", () => {
  it("returns true when the marker still matches", () => {
    expect(
      isCartUnchanged("2026-07-16T00:00:00Z", "2026-07-16T00:00:00Z"),
    ).toBe(true);
  });

  it("returns false when the cart was mutated concurrently", () => {
    expect(
      isCartUnchanged("2026-07-16T00:05:00Z", "2026-07-16T00:00:00Z"),
    ).toBe(false);
  });

  it("returns false when the cart could not be re-read", () => {
    expect(isCartUnchanged(undefined, "2026-07-16T00:00:00Z")).toBe(false);
  });

  it("returns true for the same instant even when one side is a Date instance and the other a string (query.graph vs. workflow-marshalled value)", () => {
    const instant = "2026-07-16T06:52:53.757Z";
    expect(isCartUnchanged(new Date(instant), instant)).toBe(true);
    expect(isCartUnchanged(instant, new Date(instant))).toBe(true);
  });

  it("returns false for different instants regardless of Date/string mix", () => {
    expect(
      isCartUnchanged(
        new Date("2026-07-16T06:52:53.757Z"),
        "2026-07-16T06:52:59.106Z",
      ),
    ).toBe(false);
  });
});
