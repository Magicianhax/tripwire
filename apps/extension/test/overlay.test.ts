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
