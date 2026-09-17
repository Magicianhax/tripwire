import { describe, expect, it } from "vitest";
import { anchorOutOfView, computePopoverPosition, popoverWidth } from "../lib/ui/popover-position";

const rect = (left: number, top: number, width = 120, height = 26) => ({ left, top, width, height, right: left + width, bottom: top + height });
const desktop = { width: 1280, height: 800 };

describe("popoverWidth", () => {
  it("is 440px on wide viewports and never wider than the viewport minus 32px", () => {
    expect(popoverWidth(1280)).toBe(440);
    expect(popoverWidth(472)).toBe(440);
    expect(popoverWidth(390)).toBe(358);
  });
});

describe("computePopoverPosition", () => {
  it("opens below the anchor with an 8px gap when there is room", () => {
    const p = computePopoverPosition(rect(100, 100), { height: 400 }, desktop);
    expect(p.side).toBe("below");
    expect(p.top).toBe(134);
    expect(p.left).toBe(100);
    expect(p.width).toBe(440);
    expect(p.originY).toBe(0);
  });

  it("flips above when the space below is too short and there is more room above", () => {
    const p = computePopoverPosition(rect(100, 640), { height: 400 }, desktop);
    expect(p.side).toBe("above");
    expect(p.top).toBe(640 - 8 - 400);
    expect(p.originY).toBe(400);
  });

  it("stays below (shrinking to fit) when below still has more room than above", () => {
    const p = computePopoverPosition(rect(100, 300), { height: 600 }, desktop);
    expect(p.side).toBe("below");
    expect(p.maxHeight).toBe(800 - 16 - (326 + 8));
  });

  it("clamps horizontally to a 16px viewport margin on both edges", () => {
    expect(computePopoverPosition(rect(1200, 100), { height: 300 }, desktop).left).toBe(1280 - 16 - 440);
    expect(computePopoverPosition(rect(4, 100), { height: 300 }, desktop).left).toBe(16);
    const narrow = computePopoverPosition(rect(300, 100, 60), { height: 300 }, { width: 390, height: 844 });
    expect(narrow.left).toBe(16);
    expect(narrow.width).toBe(358);
  });

  it("caps the height at min(70vh, 640px)", () => {
    expect(computePopoverPosition(rect(100, 10), { height: 2000 }, { width: 1280, height: 1200 }).maxHeight).toBe(640);
    expect(computePopoverPosition(rect(100, 10), { height: 2000 }, desktop).maxHeight).toBe(560);
  });

  it("scales from the anchor: origin x sits on the anchor's centre, clamped to the card", () => {
    expect(computePopoverPosition(rect(100, 100, 120), { height: 300 }, desktop).originX).toBe(60);
    expect(computePopoverPosition(rect(1240, 100, 30), { height: 300 }, desktop).originX).toBe(431);
    expect(computePopoverPosition(rect(1300, 100, 30), { height: 300 }, desktop).originX).toBe(440);
  });

  it("becomes a bottom sheet under 720px when asked to", () => {
    expect(computePopoverPosition(rect(100, 100), { height: 300 }, { width: 700, height: 800 }, { sheetBelow: 720 }).sheet).toBe(true);
    expect(computePopoverPosition(rect(100, 100), { height: 300 }, { width: 720, height: 800 }, { sheetBelow: 720 }).sheet).toBe(false);
    expect(computePopoverPosition(rect(100, 100), { height: 300 }, { width: 700, height: 800 }).sheet).toBe(false);
  });
});

describe("anchorOutOfView", () => {
  it("is true only once the anchor has fully left the viewport", () => {
    expect(anchorOutOfView(rect(0, -30), desktop)).toBe(true);
    expect(anchorOutOfView(rect(0, 801), desktop)).toBe(true);
    expect(anchorOutOfView(rect(0, -20), desktop)).toBe(false);
    expect(anchorOutOfView(rect(0, 790), desktop)).toBe(false);
  });
});
