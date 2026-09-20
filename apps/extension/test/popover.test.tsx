// @vitest-environment happy-dom
import { act, useContext } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Popover, PopoverContext, type PopoverCloseReason } from "../lib/ui/Popover";
import { Tabs } from "../lib/ui/Tabs";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) act(() => r.unmount());
  document.body.replaceChildren();
});

function render(node: React.ReactNode): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(node));
  return { container, root };
}

function Heading({ text }: { text: string }) {
  const pop = useContext(PopoverContext);
  return (
    <h2 id={pop?.headingId} tabIndex={-1}>
      {text}
    </h2>
  );
}

function trigger(): HTMLButtonElement {
  const button = document.createElement("button");
  button.textContent = "chip";
  document.body.append(button);
  return button;
}

describe("Popover", () => {
  it("is a non-modal dialog labelled by its heading, and focus moves to the heading on open", () => {
    const anchor = trigger();
    const { container } = render(
      <Popover anchor={anchor} onClose={() => {}}>
        <Heading text="$WIF" />
      </Popover>,
    );
    const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.getAttribute("aria-modal")).toBe("false");
    const heading = container.querySelector("h2") as HTMLElement;
    expect(dialog.getAttribute("aria-labelledby")).toBe(heading.id);
    expect(heading.id).not.toBe("");
    expect(document.activeElement).toBe(heading);
  });

  it("closes on Escape and returns focus to the trigger once removed", () => {
    const anchor = trigger();
    const reasons: PopoverCloseReason[] = [];
    let root!: Root;
    const onClose = vi.fn((reason: PopoverCloseReason) => {
      reasons.push(reason);
      root.render(null);
    });
    ({ root } = render(
      <Popover anchor={anchor} onClose={onClose} returnFocus={() => anchor}>
        <Heading text="$WIF" />
      </Popover>,
    ));
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(reasons).toEqual(["escape"]);
    expect(document.activeElement).toBe(anchor);
  });

  it("closes on a pointerdown outside, but not inside the card or on its own anchor", () => {
    const anchor = trigger();
    const outside = document.createElement("div");
    document.body.append(outside);
    const onClose = vi.fn();
    const { container } = render(
      <Popover anchor={anchor} onClose={onClose}>
        <Heading text="$WIF" />
        <p className="inside">body</p>
      </Popover>,
    );
    act(() => {
      container.querySelector(".inside")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true }));
      anchor.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true }));
    });
    expect(onClose).not.toHaveBeenCalled();
    act(() => {
      outside.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true }));
    });
    expect(onClose).toHaveBeenCalledWith("outside");
  });

  it("the close button inside the card closes through the context and returns focus", () => {
    const anchor = trigger();
    let root!: Root;
    const onClose = vi.fn(() => root.render(null));
    function CloseButton() {
      const pop = useContext(PopoverContext);
      return (
        <button type="button" className="close" onClick={() => pop?.close("close-button")}>
          Close
        </button>
      );
    }
    let container!: HTMLDivElement;
    ({ root, container } = render(
      <Popover anchor={anchor} onClose={onClose} returnFocus={() => anchor}>
        <Heading text="$WIF" />
        <CloseButton />
      </Popover>,
    ));
    act(() => (container.querySelector(".close") as HTMLButtonElement).click());
    expect(onClose).toHaveBeenCalledWith("close-button");
    expect(document.activeElement).toBe(anchor);
  });

  it("an outside click does not pull focus back to the trigger", () => {
    const anchor = trigger();
    const other = document.createElement("input");
    document.body.append(other);
    let root!: Root;
    const onClose = vi.fn(() => root.render(null));
    ({ root } = render(
      <Popover anchor={anchor} onClose={onClose} returnFocus={() => anchor}>
        <Heading text="$WIF" />
      </Popover>,
    ));
    act(() => {
      other.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true }));
      other.focus();
    });
    expect(onClose).toHaveBeenCalledWith("outside");
    expect(document.activeElement).toBe(other);
  });

  it("only one popover is open at a time: opening a second closes the first", () => {
    const first = vi.fn();
    const second = vi.fn();
    render(
      <Popover anchor={trigger()} onClose={first}>
        <Heading text="one" />
      </Popover>,
    );
    render(
      <Popover anchor={trigger()} onClose={second}>
        <Heading text="two" />
      </Popover>,
    );
    expect(first).toHaveBeenCalledWith("replaced");
    expect(second).not.toHaveBeenCalled();
  });

  it("stops keystrokes inside the card from reaching host-page hotkeys", () => {
    const hotkey = vi.fn();
    document.addEventListener("keydown", hotkey);
    const { container } = render(
      <Popover anchor={trigger()} onClose={() => {}}>
        <Heading text="$WIF" />
      </Popover>,
    );
    act(() => {
      container.querySelector("h2")!.dispatchEvent(new KeyboardEvent("keydown", { key: "j", bubbles: true }));
    });
    expect(hotkey).not.toHaveBeenCalled();
    document.removeEventListener("keydown", hotkey);
  });
});

describe("Tabs", () => {
  const tabs = [
    { id: "flow", label: "Flow", content: <p>flow panel</p> },
    { id: "wallets", label: "Wallets", content: <p>wallets panel</p> },
    { id: "risk", label: "Risk", content: <p>risk panel</p> },
  ];

  it("renders a real tablist with one selected tab controlling a visible tabpanel", () => {
    const { container } = render(<Tabs label="Evidence" tabs={tabs} />);
    const list = container.querySelector('[role="tablist"]') as HTMLElement;
    expect(list.getAttribute("aria-label")).toBe("Evidence");
    const tabEls = [...container.querySelectorAll<HTMLElement>('[role="tab"]')];
    expect(tabEls.map((t) => t.getAttribute("aria-selected"))).toEqual(["true", "false", "false"]);
    expect(tabEls.map((t) => t.tabIndex)).toEqual([0, -1, -1]);
    const panels = [...container.querySelectorAll<HTMLElement>('[role="tabpanel"]')];
    expect(panels).toHaveLength(3);
    expect(panels[0]!.id).toBe(tabEls[0]!.getAttribute("aria-controls"));
    expect(panels[0]!.getAttribute("aria-labelledby")).toBe(tabEls[0]!.id);
    expect(panels.map((p) => p.hidden)).toEqual([false, true, true]);
  });

  // Manual activation (I-2). This test used to pin the opposite — selection following the arrow
  // key — which on the expanded spot strip was a credit per keypress.
  it("moves focus only with arrow keys (wrapping), Home and End; the selection stays put", () => {
    const onSelect = vi.fn();
    const { container } = render(<Tabs label="Evidence" tabs={tabs} onSelect={onSelect} />);
    const tabEls = () => [...container.querySelectorAll<HTMLElement>('[role="tab"]')];
    const press = (key: string) =>
      act(() => {
        (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
      });
    act(() => tabEls()[0]!.focus());
    onSelect.mockClear();
    press("ArrowRight");
    expect(document.activeElement).toBe(tabEls()[1]);
    expect(tabEls()[1]!.getAttribute("aria-selected")).toBe("false");
    expect(tabEls()[0]!.getAttribute("aria-selected")).toBe("true");
    // The roving tab stop follows focus, so Tab leaves and re-enters where the user left off.
    expect(tabEls().map((t) => t.tabIndex)).toEqual([-1, 0, -1]);
    press("ArrowRight");
    press("ArrowRight");
    expect(document.activeElement).toBe(tabEls()[0]);
    press("ArrowLeft");
    expect(document.activeElement).toBe(tabEls()[2]);
    press("Home");
    expect(document.activeElement).toBe(tabEls()[0]);
    press("End");
    expect(document.activeElement).toBe(tabEls()[2]);
    // Six keypresses across the whole strip and nothing has been selected or loaded.
    expect(onSelect).not.toHaveBeenCalled();
    expect([...container.querySelectorAll<HTMLElement>('[role="tabpanel"]')].map((p) => p.hidden)).toEqual([false, true, true]);
  });

  it("commits the focused tab on Enter and on Space, and only then", () => {
    const onSelect = vi.fn();
    const { container } = render(<Tabs label="Evidence" tabs={tabs} onSelect={onSelect} />);
    const tabEls = () => [...container.querySelectorAll<HTMLElement>('[role="tab"]')];
    const press = (key: string) =>
      act(() => {
        (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
      });
    act(() => tabEls()[0]!.focus());
    onSelect.mockClear();
    press("ArrowRight");
    press("Enter");
    expect(tabEls()[1]!.getAttribute("aria-selected")).toBe("true");
    expect(onSelect.mock.calls.map((c) => c[0])).toEqual(["wallets"]);
    press("ArrowRight");
    press(" ");
    expect(tabEls()[2]!.getAttribute("aria-selected")).toBe("true");
    expect(onSelect.mock.calls.map((c) => c[0])).toEqual(["wallets", "risk"]);
  });

  it("opens on the requested initial tab", () => {
    const { container } = render(<Tabs label="Evidence" tabs={tabs} initial="wallets" />);
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Wallets");
  });
});
