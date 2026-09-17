// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { installBlocker } from "../lib/adapters/blocker";

function makeAnchor(): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.textContent = "Swap";
  document.body.appendChild(btn);
  return btn;
}

describe("installBlocker", () => {
  it("prevents a click on the anchor from reaching a later (bubble-phase) listener while blocked", () => {
    const anchor = makeAnchor();
    let clicked = false;
    anchor.addEventListener("click", () => {
      clicked = true;
    });

    const blocker = installBlocker(anchor);
    anchor.click();

    expect(clicked).toBe(false);
    blocker.release();
  });

  it("allows the click through once released (unlocked)", () => {
    const anchor = makeAnchor();
    let clicked = false;
    anchor.addEventListener("click", () => {
      clicked = true;
    });

    const blocker = installBlocker(anchor);
    blocker.release();
    anchor.click();

    expect(clicked).toBe(true);
  });

  it("prevents the default action (e.g. a submit) via preventDefault", () => {
    const anchor = makeAnchor();
    installBlocker(anchor);

    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    anchor.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("blocks Enter and Space keydowns on the anchor while blocked", () => {
    const anchor = makeAnchor();
    let activated = false;
    anchor.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") activated = true;
    });

    const blocker = installBlocker(anchor);
    anchor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    anchor.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));

    expect(activated).toBe(false);
    blocker.release();
  });

  it("does not block unrelated keys (e.g. Tab)", () => {
    const anchor = makeAnchor();
    let tabbed = false;
    anchor.addEventListener("keydown", (e) => {
      if (e.key === "Tab") tabbed = true;
    });

    installBlocker(anchor);
    anchor.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));

    expect(tabbed).toBe(true);
  });

  it("stops installing new blocks after release, even if called again on the same anchor", () => {
    const anchor = makeAnchor();
    let clicked = 0;
    anchor.addEventListener("click", () => {
      clicked += 1;
    });

    const blocker = installBlocker(anchor);
    blocker.release();
    blocker.release(); // idempotent: removeEventListener on an already-removed listener is a no-op

    anchor.click();
    expect(clicked).toBe(1);
  });
});
