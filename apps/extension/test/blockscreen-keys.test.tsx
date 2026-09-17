// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { BlockScreen } from "../lib/ui/BlockScreen";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("BlockScreen keyboard isolation (D5)", () => {
  it("keystrokes typed into the override input never reach the venue's document hotkeys", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<BlockScreen hits={[]} phrase="I AM EXIT LIQUIDITY" onEvidence={() => {}} onOverride={() => {}} autoFocus={false} />));

    const hotkey = vi.fn();
    for (const type of ["keydown", "keyup", "keypress"]) document.addEventListener(type, hotkey);
    const input = container.querySelector("input")!;
    for (const type of ["keydown", "keyup", "keypress"]) {
      act(() => {
        input.dispatchEvent(new KeyboardEvent(type, { key: "b", bubbles: true, composed: true }));
      });
    }
    expect(hotkey).not.toHaveBeenCalled();

    // Keys outside the block screen still reach the page.
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "b", bubbles: true }));
    });
    expect(hotkey).toHaveBeenCalledTimes(1);

    for (const type of ["keydown", "keyup", "keypress"]) document.removeEventListener(type, hotkey);
    act(() => root.unmount());
    container.remove();
  });
});
