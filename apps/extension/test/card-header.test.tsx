// @vitest-environment happy-dom
/**
 * What the card's header says, and what it must not say.
 *
 * Reported on a Polymarket event: the header read
 * `will-united-russia-er-gain-the-most-seats-in-the-next-russian-parliamentary-election` while
 * the market's actual question sat below it as body text. A slug is an identifier; the question
 * is the thing the reader is betting on, so the question is the title and the slug is only the
 * fallback for a card whose question has not arrived yet.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Target } from "@tripwire/core";
import type { GuardResponse, PredictionMarket, PredictionPanel } from "../lib/api-types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../lib/token-logo", () => ({ tokenLogoDataUrl: async () => null }));

const { Panel } = await import("../lib/ui/Panel");
const { Popover } = await import("../lib/ui/Popover");

const SLUG = "will-united-russia-er-gain-the-most-seats-in-the-next-russian-parliamentary-election";
const QUESTION = "Will United Russia (ER) gain the most seats in the next Russian parliamentary election?";
const target: Target = { kind: "prediction", slug: SLUG, outcomeLabel: "Yes" };

const market = (over: Partial<PredictionMarket> = {}): PredictionMarket =>
  ({
    id: "1",
    question: QUESTION,
    slug: SLUG,
    state: "live",
    outcomes: ["Yes", "No"],
    outcomePrices: [0.82, 0.18],
    yesPrice: 0.82,
    yesPriceSource: "book",
    bestBid: 0.81,
    bestAsk: 0.83,
    spread: 0.02,
    lastTradePrice: 0.82,
    oneDayPriceChange: 0.01,
    oneWeekPriceChange: null,
    liquidityUsd: 1_000,
    volumeUsd: 2_000,
    volume24hUsd: 300,
    volume1wkUsd: 900,
    endDate: "2026-12-01T16:00:00Z",
    endDateIso: "2026-12-01",
    startDateIso: "2026-01-01",
    negRisk: false,
    clobTokenIds: null,
    description: null,
    groupItemTitle: null,
    eventTitle: null,
    eventSlug: "which-party-will-gain-most-seats",
    active: true,
    closed: false,
    acceptingOrders: true,
    umaResolutionStatuses: null,
    pricedAtIso: new Date().toISOString(),
    ...over,
  }) as PredictionMarket;

const panel = (over: Partial<PredictionPanel> = {}): PredictionPanel => ({
  market: market(),
  holders: null,
  sides: null,
  recordsChecked: null,
  recordsCap: 10,
  trades: null,
  historical: false,
  outcomeIndex: 0,
  targetOutcome: "Yes",
  unknownOutcome: null,
  options: null,
  optionsTotal: null,
  eventSlug: "which-party-will-gain-most-seats",
  errors: [],
  ...over,
});

const guard = (over: Partial<PredictionPanel> = {}): GuardResponse => ({
  target,
  verdict: "CLEAR",
  hits: [],
  unavailable: [],
  signals: [],
  panel: panel(over),
  rulesPreset: "balanced",
});

let roots: Root[] = [];
function render(node: React.ReactNode): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(node));
  return container;
}

beforeEach(() => document.body.replaceChildren());
afterEach(() => {
  act(() => roots.forEach((r) => r.unmount()));
  roots = [];
  document.body.replaceChildren();
});

describe("the prediction card's header", () => {
  it("titles the card with the market's question, and never with the slug", () => {
    const c = render(<Panel data={guard()} title={SLUG} target={target} onClose={() => {}} />);
    const title = c.querySelector<HTMLElement>(".tw-card-title")!;
    expect(title.textContent).toContain("Will United Russia (ER) gain the most seats");
    expect(c.textContent).not.toContain(SLUG);
  });

  it("carries the full question in a title attribute, because the heading clamps to two lines", () => {
    const c = render(<Panel data={guard()} title={SLUG} target={target} onClose={() => {}} />);
    const title = c.querySelector<HTMLElement>(".tw-card-title")!;
    expect(title.getAttribute("title")).toBe(QUESTION);
    expect(title.hasAttribute("data-clamp")).toBe(true);
  });

  it("states the question once: the header carries it, the body does not repeat it", () => {
    const c = render(<Panel data={guard()} title={SLUG} target={target} onClose={() => {}} />);
    const occurrences = (c.textContent ?? "").split("Will United Russia (ER) gain the most seats").length - 1;
    expect(occurrences).toBe(1);
  });

  it("falls back to the slug while no question is known, and does not clamp a short title", () => {
    const c = render(<Panel data={null} title={SLUG} target={target} onClose={() => {}} />);
    const title = c.querySelector<HTMLElement>(".tw-card-title")!;
    expect(title.textContent).toContain(SLUG);

    const spot = render(<Panel data={null} title="$WIF" target={{ kind: "spot", chain: "solana", tokenAddress: "abc" }} onClose={() => {}} />);
    expect(spot.querySelector(".tw-card-title")!.hasAttribute("data-clamp")).toBe(false);
  });

  it("keeps the market's own label inside its event beside the question", () => {
    const c = render(<Panel data={{ ...guard(), panel: panel({ market: market({ groupItemTitle: "United Russia" }) }) }} title={SLUG} target={target} onClose={() => {}} />);
    expect(c.querySelector(".tw-card-heading")!.textContent).toContain("United Russia");
  });
});

describe("the card's size control", () => {
  it("says what the press will do without drawing anything over the header", () => {
    let size: "compact" | "expanded" = "compact";
    const node = () => (
      <Popover anchor={null} onClose={() => {}} size={size} onToggleSize={() => {}}>
        <Panel data={guard()} title={SLUG} target={target} onClose={() => {}} />
      </Popover>
    );
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    act(() => root.render(node()));

    const toggle = container.querySelector<HTMLButtonElement>(".tw-card-size")!;
    expect(toggle.getAttribute("aria-label")).toBe("Expand card");
    // No tooltip bubble in the header at all: there is nothing that can cover the title, and
    // nothing for the card's own overflow to clip.
    expect(container.querySelector(".tw-card-header [role='tooltip']")).toBeNull();
    expect(toggle.hasAttribute("aria-labelledby")).toBe(false);

    size = "expanded";
    act(() => root.render(node()));
    expect(container.querySelector<HTMLButtonElement>(".tw-card-size")!.getAttribute("aria-label")).toBe("Collapse card");
  });
});
