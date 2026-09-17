// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyAnchorBox, availableWidth, fitToAnchor, liftOutOfRow, NARROW_WIDTH } from "../lib/ui/fit";
import { Chip } from "../lib/ui/Chip";
import { Dock } from "../lib/ui/Dock";
import { Strip } from "../lib/ui/Strip";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let roots: Root[] = [];
function render(node: React.ReactNode): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(node));
  return container;
}
afterEach(() => {
  act(() => roots.forEach((r) => r.unmount()));
  roots = [];
  document.body.replaceChildren();
});

/** An anchor of a fixed width, the way a venue's own Swap button measures. */
function anchorOf(width: number): HTMLElement {
  const el = document.createElement("button");
  el.getBoundingClientRect = () => ({ width, height: 40, top: 0, left: 0, right: width, bottom: 40, x: 0, y: 0, toJSON: () => ({}) });
  document.body.append(el);
  return el;
}

const LONG = "Tripwire couldn't check this: Nansen flow data unavailable for this token on base";

describe("a mounted surface never outgrows the anchor it describes", () => {
  it("pins the host to a narrow anchor's width and marks it narrow", () => {
    const host = document.createElement("div");
    applyAnchorBox(host, { width: 280 });
    expect(host.style.getPropertyValue("--tw-fit-width")).toBe("280px");
    expect(host.dataset.narrow).toBe("");
  });

  it("pins the host to a wide anchor's width without the narrow treatment", () => {
    const host = document.createElement("div");
    applyAnchorBox(host, { width: 640 });
    expect(host.style.getPropertyValue("--tw-fit-width")).toBe("640px");
    expect(host.dataset.narrow).toBeUndefined();
  });

  it("falls back to the parent's box when the anchor has no measurable width", () => {
    const host = document.createElement("div");
    applyAnchorBox(host, { width: 0 });
    expect(host.style.getPropertyValue("--tw-fit-width")).toBe("100%");
    applyAnchorBox(host, null);
    expect(host.style.getPropertyValue("--tw-fit-width")).toBe("100%");
  });

  it("switches the narrow flag exactly at the breakpoint", () => {
    const host = document.createElement("div");
    applyAnchorBox(host, { width: NARROW_WIDTH - 1 });
    expect(host.dataset.narrow).toBe("");
    applyAnchorBox(host, { width: NARROW_WIDTH });
    expect(host.dataset.narrow).toBeUndefined();
  });

  it("publishes the width as a custom property, which WXT's `all: initial` reset cannot erase", () => {
    const host = document.createElement("div");
    applyAnchorBox(host, { width: 280 });
    expect(host.style.getPropertyValue("--tw-fit-width")).toBe("280px");
    applyAnchorBox(host, null);
    expect(host.style.getPropertyValue("--tw-fit-width")).toBe("100%");
  });

  it("takes the narrowest content box on the way up, not the anchor's own inflated width", () => {
    // The shape from the report: a card that is 280px wide inside, holding an action group
    // that has already been stretched to 417px by the surface we are about to bound.
    const card = document.createElement("div");
    const actions = document.createElement("div");
    const anchor = document.createElement("button");
    actions.append(anchor);
    card.append(actions);
    document.body.append(card);
    card.style.padding = "0 16px";
    Object.defineProperty(card, "clientWidth", { value: 312, configurable: true });
    Object.defineProperty(actions, "clientWidth", { value: 417, configurable: true });
    Object.defineProperty(document.body, "clientWidth", { value: 1280, configurable: true });
    anchor.getBoundingClientRect = () => ({ width: 417, height: 40, top: 0, left: 0, right: 417, bottom: 40, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;

    // 312 padding-box minus the card's 16px gutters: the width the venue actually offers.
    expect(availableWidth(anchor)).toBe(280);
  });

  it("measures on bind and re-measures when the anchor resizes", () => {
    const observed: Element[] = [];
    let trigger: (() => void) | null = null;
    const disconnect = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(cb: () => void) {
          trigger = cb;
        }
        observe(el: Element) {
          observed.push(el);
        }
        disconnect = disconnect;
      },
    );
    try {
      const anchor = anchorOf(640);
      const host = document.createElement("div");
      const stop = fitToAnchor(host, anchor);
      expect(host.style.getPropertyValue("--tw-fit-width")).toBe("640px");
      expect(observed[0]).toBe(anchor);

      // The venue's card collapses (a responsive breakpoint, a sidebar opening).
      anchor.getBoundingClientRect = () => ({ width: 280, height: 40, top: 0, left: 0, right: 280, bottom: 40, x: 0, y: 0, toJSON: () => ({}) });
      trigger!();
      expect(host.style.getPropertyValue("--tw-fit-width")).toBe("280px");
      expect(host.dataset.narrow).toBe("");

      stop();
      expect(disconnect).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("survives an engine without ResizeObserver", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    try {
      const host = document.createElement("div");
      expect(() => fitToAnchor(host, anchorOf(400))()).not.toThrow();
      expect(host.style.getPropertyValue("--tw-fit-width")).toBe("400px");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("long findings truncate instead of stretching their surface", () => {
  it("the strip keeps the full sentence reachable as a tooltip", () => {
    const c = render(<Strip verdict="UNCHECKED" text={LONG} venue="jupiter" />);
    const finding = c.querySelector(".tw-strip-finding") as HTMLElement;
    expect(finding.textContent).toBe(LONG);
    expect(finding.getAttribute("title")).toBe(LONG);
  });

  it("the chip does too", () => {
    const c = render(<Chip verdict="UNCHECKED" symbol="WBTC" chain="base" headline={LONG} expanded={false} onClick={() => {}} />);
    const value = c.querySelector(".tw-chip-value") as HTMLElement;
    expect(value.getAttribute("title")).toBe(LONG);
  });

  it("and so does the dock chip", () => {
    const c = render(
      <Dock collapsed verdict="UNCHECKED" headline={LONG} onToggleCollapsed={() => {}} venue="jumper">
        {null}
      </Dock>,
    );
    expect(c.querySelector(".tw-dock-chip .tw-chip-value")?.getAttribute("title")).toBe(LONG);
  });
});

describe("a strip goes above the action row, never beside the button in it", () => {
  /** `display` is what liftOutOfRow reads, and happy-dom does not lay anything out. */
  const box = (display: string, extra: Partial<CSSStyleDeclaration> = {}) => {
    const el = document.createElement("div");
    Object.assign(el.style, { display, ...extra });
    return el;
  };

  it("lifts out of a horizontal flex row, so the strip spans the whole row", () => {
    const card = box("block");
    const row = box("flex", { flexDirection: "row" });
    const button = document.createElement("button");
    row.append(button);
    card.append(row);
    document.body.append(card);
    expect(liftOutOfRow(button)).toBe(row);
  });

  it("stays on the button when its container already stacks", () => {
    for (const display of ["block", "flow-root", "grid"]) {
      const parent = box(display);
      const button = document.createElement("button");
      parent.append(button);
      document.body.append(parent);
      expect(liftOutOfRow(button), display).toBe(button);
    }
    const column = box("flex", { flexDirection: "column" });
    const stacked = document.createElement("button");
    column.append(stacked);
    document.body.append(column);
    expect(liftOutOfRow(stacked)).toBe(stacked);
  });

  it("lifts through nested rows but stops before the body, and never climbs forever", () => {
    let el: HTMLElement = document.body;
    const rows: HTMLElement[] = [];
    for (let i = 0; i < 6; i++) {
      const row = box("flex", { flexDirection: "row" });
      el.append(row);
      rows.push(row);
      el = row;
    }
    const button = document.createElement("button");
    el.append(button);
    const lifted = liftOutOfRow(button);
    expect(rows).toContain(lifted);
    expect(lifted).not.toBe(document.body);
  });

  it("treats a multi-column grid as a row too", () => {
    const grid = box("grid", { gridTemplateColumns: "1fr auto" });
    const button = document.createElement("button");
    grid.append(button);
    document.body.append(grid);
    expect(liftOutOfRow(button)).toBe(grid);
  });
});
