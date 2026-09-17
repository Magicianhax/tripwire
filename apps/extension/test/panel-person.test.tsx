// @vitest-environment happy-dom
// Task 11: minimal test for Panel's optional `person` prop (the X content script's "Nansen
// label" line). Kept in its own file rather than test/ui.test.tsx (Task 10's file, which had
// unrelated in-flight changes at the time this was written) to keep this task's diff isolated.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it } from "vitest";
import type { PersonIntelResponse, PostIntelResponse, SpotPanel } from "../lib/api-types";
import { Panel } from "../lib/ui/Panel";

function mountNode(node: React.ReactNode): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(node);
  });
  return { container, root };
}

const spotPanel: SpotPanel = {
  flow: null,
  flowTimeframe: "1d",
  sincePost: null,
  netflow: null,
  indicators: null,
  marketCapUsd: null,
  topBuyers: null,
  topSellers: null,
  candles: null,
  postTimeIso: null,
  errors: [],
};

const data: PostIntelResponse = {
  verdict: "CLEAR",
  hits: [],
  unavailable: [],
  signals: [],
  panel: spotPanel,
  rulesPreset: "balanced",
};

const person: PersonIntelResponse = {
  entity: "Whale Alpha",
  tags: ["market maker"],
  holding: { valueUsd: 125_000, symbol: "WIF" },
  topHoldings: [],
  matchedBy: "handle",
};

describe("Panel person prop", () => {
  it("renders a Nansen label line when an entity matched", () => {
    const { container, root } = mountNode(<Panel data={data} title="$WIF" onClose={() => {}} person={person} />);

    expect(container.textContent).toContain("Nansen label: Whale Alpha (market maker)");
    expect(container.textContent).toContain("holds");
    expect(container.textContent).toContain("WIF");

    root.unmount();
  });

  it("renders nothing when person is omitted", () => {
    const { container, root } = mountNode(<Panel data={data} title="$WIF" onClose={() => {}} />);

    expect(container.querySelector(".tw-person")).toBeNull();

    root.unmount();
  });

  it("renders nothing when person.entity is null (no match)", () => {
    const { container, root } = mountNode(
      <Panel data={data} title="$WIF" onClose={() => {}} person={{ ...person, entity: null }} />,
    );

    expect(container.querySelector(".tw-person")).toBeNull();

    root.unmount();
  });
});
