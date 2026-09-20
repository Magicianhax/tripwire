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

/**
 * The jumper.xyz report: the block screen started about 45px to the LEFT of the widget's card,
 * ended short of its right edge, and floated over the Send/Receive fields — a detached modal on
 * the page rather than a barrier over the button. It is the trade button's own card that bounds
 * it, not the viewport.
 */
describe("computeBlockRect inside the host card", () => {
  // Jumper's widget at 1440x900: a 380px card holding the action row near its bottom.
  const card = { top: 180, left: 520, width: 380, height: 560 };
  const button = { top: 660, left: 536, width: 348, height: 48 };

  it("never exceeds the card's left or right edge, whatever the 440px preference says", () => {
    const rect = computeBlockRect(button, 180, 0, { width: 1440 }, [], card);
    expect(rect.width).toBe(380);
    expect(rect.left).toBeGreaterThanOrEqual(card.left);
    expect(rect.left + rect.width).toBeLessThanOrEqual(card.left + card.width);
  });

  it("aligns to the card's left edge instead of centring on the button", () => {
    expect(computeBlockRect(button, 180, 0, { width: 1440 }, [], card).left).toBe(card.left);
  });

  it("grows upward from the button and still covers the row it guards", () => {
    const rect = computeBlockRect(button, 180, 320, { width: 1440 }, [], card);
    expect(rect.height).toBe(320);
    expect(rect.top + rect.height).toBe(button.top + button.height);
    expect(rect.left).toBeLessThanOrEqual(button.left);
    expect(rect.left + rect.width).toBeGreaterThanOrEqual(button.left + button.width);
  });

  it("keeps the 440px clamp when the card is wider, and moves right only to cover the button", () => {
    const wide = { top: 180, left: 200, width: 900, height: 560 };
    const right = { top: 660, left: 900, width: 180, height: 48 };
    const rect = computeBlockRect(right, 180, 0, { width: 1440 }, [], wide);
    expect(rect.width).toBe(440);
    expect(rect.left + rect.width).toBeGreaterThanOrEqual(right.left + right.width);
    expect(rect.left + rect.width).toBeLessThanOrEqual(wide.left + wide.width);
  });

  it("covers the extra controls it blocks without leaving the card", () => {
    const chip = { top: 716, left: 536, width: 120, height: 28 };
    const rect = computeBlockRect(button, 180, 0, { width: 1440 }, [chip], card);
    expect(rect.top + rect.height).toBe(chip.top + chip.height);
    expect(rect.left + rect.width).toBeLessThanOrEqual(card.left + card.width);
  });
});
