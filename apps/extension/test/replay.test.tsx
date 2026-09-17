// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { HealthResponse, PostIntelResponse } from "../lib/api-types";
import type { ApiResult } from "../lib/api-result";
import { createReplayFlag } from "../lib/replay";
import { BlockScreen } from "../lib/ui/BlockScreen";
import { Chip } from "../lib/ui/Chip";
import { Dock } from "../lib/ui/Dock";
import { Panel } from "../lib/ui/Panel";
import { Strip } from "../lib/ui/Strip";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function badgeText(node: ReactNode): string | null {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(node));
  const text = container.querySelector(".tw-replay-badge")?.textContent ?? null;
  act(() => root.unmount());
  container.remove();
  return text;
}

const data: PostIntelResponse = {
  verdict: "CLEAR",
  hits: [],
  unavailable: [],
  signals: [],
  panel: {
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
  },
  rulesPreset: "balanced",
};

describe("Replay watermark", () => {
  const cases: [string, (replay: boolean) => ReactNode][] = [
    ["Chip", (replay) => <Chip verdict="CLEAR" symbol="WIF" headline="ok" onClick={() => {}} expanded={false} replay={replay} />],
    ["Strip", (replay) => <Strip verdict="CLEAR" text="ok" replay={replay} />],
    ["BlockScreen", (replay) => <BlockScreen hits={[]} phrase="X" onEvidence={() => {}} onOverride={() => {}} autoFocus={false} replay={replay} />],
    ["Dock (collapsed)", (replay) => <Dock collapsed verdict="CLEAR" headline="No flags" onToggleCollapsed={() => {}} replay={replay}>{null}</Dock>],
    ["Dock (expanded)", (replay) => <Dock collapsed={false} onToggleCollapsed={() => {}} replay={replay}>{null}</Dock>],
    ["Panel", (replay) => <Panel data={data} title="$WIF" onClose={() => {}} replay={replay} />],
  ];

  for (const [name, render] of cases) {
    it(`${name} shows Replay only in replay mode`, () => {
      expect(badgeText(render(true))).toBe("Replay");
      expect(badgeText(render(false))).toBeNull();
    });
  }
});

describe("createReplayFlag", () => {
  const healthy = (replay: boolean): ApiResult<HealthResponse> => ({
    ok: true,
    data: { ok: true, keySource: "env", replay, creditsToday: 0, cap: 3000 },
  });

  it("asks the backend once per session and caches the answer", async () => {
    const health = vi.fn(async () => healthy(true));
    const getReplay = createReplayFlag(health);
    expect(await getReplay()).toBe(true);
    expect(await getReplay()).toBe(true);
    expect(health).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failed health check", async () => {
    const health = vi
      .fn<() => Promise<ApiResult<HealthResponse>>>()
      .mockResolvedValueOnce({ ok: false, status: 0, error: "backend_unreachable" })
      .mockResolvedValueOnce(healthy(true));
    const getReplay = createReplayFlag(health);
    expect(await getReplay()).toBe(false);
    expect(await getReplay()).toBe(true);
    expect(health).toHaveBeenCalledTimes(2);
  });
});
