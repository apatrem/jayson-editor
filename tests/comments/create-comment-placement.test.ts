import { describe, expect, it } from "vitest";
import { computePopupPlacement } from "../../src/comments/CreateComment";

const VIEWPORT = { width: 1000, height: 800 };
const POPUP = { width: 352, height: 200 };

describe("computePopupPlacement", () => {
  it("places the popup just below the selection by default", () => {
    const anchor = { left: 100, top: 200, bottom: 220 };
    const { left, top } = computePopupPlacement(anchor, POPUP, VIEWPORT);
    expect(left).toBe(100); // aligned to selection left
    expect(top).toBe(228); // bottom + 8px gap
  });

  it("clamps to the right viewport edge when the popup would overflow", () => {
    const anchor = { left: 900, top: 200, bottom: 220 };
    const { left } = computePopupPlacement(anchor, POPUP, VIEWPORT);
    // 1000 - 352 - 8 margin
    expect(left).toBe(640);
  });

  it("never positions left of the viewport margin", () => {
    const anchor = { left: -50, top: 200, bottom: 220 };
    const { left } = computePopupPlacement(anchor, POPUP, VIEWPORT);
    expect(left).toBe(8);
  });

  it("flips above the selection when there's no room below", () => {
    const anchor = { left: 100, top: 700, bottom: 760 };
    const { top } = computePopupPlacement(anchor, POPUP, VIEWPORT);
    // below (768) + height (200) overflows 800 → place above: 700 - 200 - 8
    expect(top).toBe(492);
  });
});
