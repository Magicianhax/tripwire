// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createAnchorBinding } from "../lib/adapters/anchor-binding";
import { installBlocker } from "../lib/adapters/blocker";
import { decideDisplay, nextAction, type DisplayMode } from "../entrypoints/venues.content/display-state";

describe("decideDisplay", () => {
  it("tier 1, TRIPWIRE, no anchor -> dock (fallback: nothing to block yet)", () => {
    expect(decideDisplay({ tier: 1, verdict: "TRIPWIRE", anchorPresent: false, unlocked: false })).toBe("dock");
  });

  it("tier 1, TRIPWIRE, anchor present, not unlocked -> block", () => {
    expect(decideDisplay({ tier: 1, verdict: "TRIPWIRE", anchorPresent: true, unlocked: false })).toBe("block");
  });

  it("tier 1, TRIPWIRE, anchor present, unlocked -> strip (not block)", () => {
    expect(decideDisplay({ tier: 1, verdict: "TRIPWIRE", anchorPresent: true, unlocked: true })).toBe("strip");
  });

  it("tier 1, CAUTION, anchor present -> strip", () => {
    expect(decideDisplay({ tier: 1, verdict: "CAUTION", anchorPresent: true, unlocked: false })).toBe("strip");
  });

  it("tier 1, CLEAR, anchor present -> strip", () => {
    expect(decideDisplay({ tier: 1, verdict: "CLEAR", anchorPresent: true, unlocked: false })).toBe("strip");
  });

  it("UNCHECKED never produces block, even with an anchor present", () => {
    expect(decideDisplay({ tier: 1, verdict: "UNCHECKED", anchorPresent: true, unlocked: false })).toBe("strip");
    expect(decideDisplay({ tier: 1, verdict: "UNCHECKED", anchorPresent: false, unlocked: false })).toBe("dock");
  });

  it("tier 2 always dock, regardless of verdict or anchor presence", () => {
    expect(decideDisplay({ tier: 2, verdict: "TRIPWIRE", anchorPresent: true, unlocked: false })).toBe("dock");
    expect(decideDisplay({ tier: 2, verdict: "CLEAR", anchorPresent: false, unlocked: false })).toBe("dock");
  });
});

describe("nextAction", () => {
  it("dock -> dock (still no anchor) -> none", () => {
    expect(nextAction("dock", "dock")).toBe("none");
  });

  it("block -> block (same mode) -> rebind", () => {
    expect(nextAction("block", "block")).toBe("rebind");
  });

  it("strip -> strip (same mode) -> rebind", () => {
    expect(nextAction("strip", "strip")).toBe("rebind");
  });

  it("dock -> block (anchor appeared) -> switch", () => {
    expect(nextAction("dock", "block")).toBe("switch");
  });

  it("dock -> strip (anchor appeared, non-TRIPWIRE) -> switch", () => {
    expect(nextAction("dock", "strip")).toBe("switch");
  });

  it("block -> dock (anchor lost entirely) -> switch", () => {
    expect(nextAction("block", "dock")).toBe("switch");
  });

  it("block -> strip (unlocked while still anchored) -> switch", () => {
    expect(nextAction("block", "strip")).toBe("switch");
  });

  it("strip -> block (verdict escalated to TRIPWIRE while anchored) -> switch", () => {
    expect(nextAction("strip", "block")).toBe("switch");
  });

  it("null -> anything (first render) -> switch", () => {
    const modes: DisplayMode[] = ["block", "strip", "dock"];
    for (const m of modes) expect(nextAction(null, m)).toBe("switch");
  });
});

describe("integration: Dock fallback -> anchor appears -> the new button is blocked", () => {
  it("stays dock while no anchor is found, then binds and blocks once the SPA mounts the button", () => {
    // Approximates resyncAnchor()'s actual logic (runner.tsx), minus the ContentScriptContext/
    // mountReact machinery: only decideDisplay + nextAction + a real createAnchorBinding +
    // a real installBlocker.
    let anchorEl: HTMLButtonElement | null = null; // starts absent, like a page still loading its swap form
    let prevDisplay: DisplayMode | null = "dock"; // as render_() would have left it on first render
    let binding: ReturnType<typeof createAnchorBinding> | null = null;
    let release: (() => void) | null = null;

    function tick(): void {
      let anchorPresent: boolean;
      if (binding) {
        binding.sync();
        anchorPresent = binding.anchor != null;
      } else {
        anchorPresent = anchorEl != null;
      }

      const decision = decideDisplay({ tier: 1, verdict: "TRIPWIRE", anchorPresent, unlocked: false });
      const action = nextAction(prevDisplay, decision);

      if (action === "switch" && decision === "block") {
        binding = createAnchorBinding({
          find: () => anchorEl,
          onBind: (a) => {
            release = installBlocker(a).release;
          },
          onUnbind: () => {
            release?.();
            release = null;
          },
        });
        binding.sync();
      }
      prevDisplay = decision;
    }

    // Tick with still no anchor: stays in the dock fallback, no binding created.
    tick();
    expect(prevDisplay).toBe("dock");
    expect(binding).toBeNull();

    // The venue's SPA finishes mounting the swap form.
    anchorEl = document.createElement("button");
    anchorEl.textContent = "Swap";
    document.body.appendChild(anchorEl);

    // Next tick: the anchor is found -> switches to "block" and binds the blocker to it.
    tick();
    expect(prevDisplay).toBe("block");

    let clicked = false;
    anchorEl.addEventListener("click", () => {
      clicked = true;
    });
    anchorEl.click();
    expect(clicked).toBe(false); // blocked

    // A further tick with the same node is a no-op (rebind, but sync() finds nothing to do).
    tick();
    expect(prevDisplay).toBe("block");
    anchorEl.click();
    expect(clicked).toBe(false); // still blocked
  });
});
