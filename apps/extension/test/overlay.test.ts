// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { computeBlockRect } from "../lib/adapters/overlay";

describe("computeBlockRect", () => {
  const button = { top: 500, left: 40, width: 320, height: 48 };

  it("grows a short anchor upward to the 180px minimum, bottom edge pinned", () => {
    expect(computeBlockRect(button)).toEqual({ top: 368, left: 40, width: 320, height: 180 });
  });

  it("grows further upward to fit measured content taller than the minimum", () => {
    const rect = computeBlockRect(button, 180, 262);
    expect(rect).toEqual({ top: 286, left: 40, width: 320, height: 262 });
    expect(rect.top + rect.height).toBe(button.top + button.height);
  });

  it("keeps the anchor's own height when it's taller than both", () => {
    expect(computeBlockRect({ ...button, height: 300 }, 180, 220)).toEqual({ top: 500, left: 40, width: 320, height: 300 });
  });

  it("rounds a fractional content height up so the last line isn't clipped", () => {
    expect(computeBlockRect(button, 180, 200.2).height).toBe(201);
  });
});

describe("computeBlockRect: the extra controls a session also blocks (Round 1.4.9)", () => {
  // pump.fun's live geometry: the primary sits at y=390 h=40, the quick-buy chips at y=442 and
  // the quick-sell chips at y=473, both BELOW it -- so a block that only grew upward left three
  // one-click trades visible and looking clickable underneath it.
  const primary = { top: 390, left: 1572, width: 316, height: 40 };
  const chips = [
    { top: 442, left: 1572, width: 101, height: 25 },
    { top: 442, left: 1787, width: 101, height: 25 },
    { top: 473, left: 1572, width: 101, height: 25 },
  ];

  it("covers every blocked control, not just the anchor", () => {
    const rect = computeBlockRect(primary, undefined, 180, undefined, chips);
    expect(rect.top).toBeLessThanOrEqual(primary.top);
    expect(rect.top + rect.height).toBeGreaterThanOrEqual(473 + 25);
    expect(rect.left).toBeLessThanOrEqual(1572);
    expect(rect.left + rect.width).toBeGreaterThanOrEqual(1787 + 101);
  });

  it("is unchanged when the venue has no extra controls", () => {
    expect(computeBlockRect(primary, undefined, 180, undefined, [])).toEqual(computeBlockRect(primary, undefined, 180));
  });

  it("reads live DOMRects, whose values are prototype accessors and vanish when spread", () => {
    // The first cut of this did `{ ...anchorRect }` on a live DOMRect, which yields `{}`: every
    // bound went NaN and the block rendered at the page's top-left corner at its natural size.
    const rect = computeBlockRect(new DOMRect(1572, 390, 316, 40), undefined, 180, { width: 1600 }, [new DOMRect(1572, 473, 101, 25)]);
    for (const value of Object.values(rect)) expect(Number.isFinite(value)).toBe(true);
    expect(rect.top + rect.height).toBe(498);
  });

  it("still grows upward rather than downward past what it covers", () => {
    const rect = computeBlockRect(primary, undefined, 400, undefined, chips);
    expect(rect.top + rect.height).toBe(473 + 25);
  });
});
