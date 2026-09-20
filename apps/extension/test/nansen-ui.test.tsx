// @vitest-environment happy-dom
import fs from "node:fs";
import path from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it } from "vitest";
import type { HitDto } from "../lib/api-types";
import { BlockScreen } from "../lib/ui/BlockScreen";
import { Chip } from "../lib/ui/Chip";
import { countFrame, splitFigure } from "../lib/ui/CountIn";
import { Dock } from "../lib/ui/Dock";
import { monogram, TokenLogo } from "../lib/ui/Logo";
import { PanelFooter } from "../lib/ui/panel-parts";
import { Strip } from "../lib/ui/Strip";
import { WalletLabel } from "../lib/ui/WalletLabel";

function mount(node: React.ReactNode): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(node));
  return { container, root };
}

describe("verdict icons", () => {
  it("UNCHECKED and checking never show CLEAR's shield", () => {
    for (const node of [
      <Chip verdict="UNCHECKED" symbol="WIF" headline="offline" expanded={false} onClick={() => {}} />,
      <Chip verdict="LOADING" symbol="WIF" headline="" expanded={false} onClick={() => {}} />,
      <Strip verdict="UNCHECKED" text="Pick a market" />,
      <Strip verdict="LOADING" text="Checking…" />,
      <Dock collapsed verdict="UNCHECKED" headline="Pick a market" onToggleCollapsed={() => {}}>
        {null}
      </Dock>,
    ]) {
      const { container, root } = mount(node);
      expect(container.querySelector(".lucide-shield-check")).toBeNull();
      root.unmount();
    }
    const clear = mount(<Chip verdict="CLEAR" symbol="WIF" headline="No flags" expanded={false} onClick={() => {}} />);
    expect(clear.container.querySelector(".tw-plate .lucide-shield-check")).not.toBeNull();
    clear.root.unmount();
  });

  it("icons are decorative", () => {
    const { container, root } = mount(<Chip verdict="TRIPWIRE" symbol="WIF" headline="x" expanded={false} onClick={() => {}} replay />);
    const icons = [...container.querySelectorAll("svg")];
    expect(icons.length).toBeGreaterThanOrEqual(2);
    for (const svg of icons) expect(svg.getAttribute("aria-hidden")).toBe("true");
    root.unmount();
  });
});

describe("bundled logos", () => {
  it("chip, strip, dock, block screen and footer show logos from the extension package", () => {
    const hits = [{ ruleId: "r", signalId: "distribution_pct", action: "block", text: "t", label: "Labeled wallets sold 4.2% of 24h volume", value: -4.2, evidence: [] }] as unknown as HitDto[];
    const cases: [string, React.ReactNode][] = [
      ["logos/chain-solana.svg", <Chip verdict="CLEAR" symbol="WIF" headline="x" expanded={false} onClick={() => {}} chain="solana" />],
      ["logos/jupiter.svg", <Strip verdict="CAUTION" text="x" venue="jupiter" />],
      [
        "logos/raydium.png",
        <Dock collapsed verdict="CLEAR" headline="x" onToggleCollapsed={() => {}} venue="raydium">
          {null}
        </Dock>,
      ],
      ["logos/hyperliquid.png", <BlockScreen hits={hits} phrase="trade anyway" onEvidence={() => {}} onOverride={() => {}} autoFocus={false} venue="hyperliquid" />],
      ["logos/nansen.svg", <PanelFooter endpointCount={2} errors={[]} />],
    ];
    for (const [file, node] of cases) {
      const { container, root } = mount(node);
      const srcs = [...container.querySelectorAll("img")].map((i) => i.getAttribute("src"));
      expect(srcs, file).toContain(`/${file}`);
      for (const src of srcs) expect(src, file).not.toMatch(/^https?:/);
      root.unmount();
    }
  });

  it("the block screen names its venue for assistive tech; the footer credits Nansen in text", () => {
    const block = mount(<BlockScreen hits={[]} phrase="trade anyway" onEvidence={() => {}} onOverride={() => {}} autoFocus={false} venue="jupiter" />);
    expect(block.container.querySelector("img")?.getAttribute("alt")).toBe("Jupiter");
    block.root.unmount();
    const footer = mount(<PanelFooter endpointCount={2} errors={[]} />);
    expect(footer.container.textContent?.replace(/\s+/g, " ")).toContain("Powered by Nansen");
    expect(footer.container.textContent).toContain("2 endpoints");
    footer.root.unmount();
  });
});

describe("TokenLogo", () => {
  // Nansen's `logo` is a third-party CDN URL. Requesting it would tell that host which token
  // the user is looking at, on every card, so the mark is drawn from the symbol instead.
  it("never requests a remote image, whatever URL it is handed", () => {
    for (const url of ["https://cdn.example/wif.png", "http://cdn.example/wif.png", "javascript:alert(1)", null, undefined]) {
      const { container, root } = mount(<TokenLogo url={url} symbol="$WIF" />);
      expect(container.querySelector("img"), String(url)).toBeNull();
      expect(container.textContent).toBe("WI");
      root.unmount();
    }
  });

  it("builds the monogram from letters and digits only", () => {
    const { container, root } = mount(<TokenLogo symbol="EKpQ…zcjm" />);
    expect(container.textContent).toBe("EK");
    root.unmount();
    expect(monogram("")).toBe("?");
  });
});

describe("WalletLabel", () => {
  it("links a labelled wallet to its exact Nansen address and omits links without an address", () => {
    const address = "0x7fdafde5cfb5465924316eced2d3715494c517d1";
    const linked = mount(<WalletLabel label="Token Millionaire" address={address} chain="base" />);
    const link = linked.container.querySelector("a")!;
    const url = new URL(link.href);
    expect(url.origin).toBe("https://app.nansen.ai");
    expect(url.pathname).toBe("/profiler");
    expect(url.searchParams.get("address")).toBe(address);
    expect(url.searchParams.get("chain")).toBe("base");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(linked.container.querySelector('[role="tooltip"]')?.textContent).toContain("View on Nansen");
    linked.root.unmount();
    const unknown = mount(<WalletLabel label="Token Millionaire" address="" />);
    expect(unknown.container.querySelector("a")).toBeNull();
    unknown.root.unmount();
  });
  it("shows Nansen's label without emoji, with the kind as data and an icon", () => {
    const { container, root } = mount(<WalletLabel label="🤓 Smart HL Perps Trader [0x25554a]" address="0x25554a00" />);
    expect(container.textContent).toBe("Smart HL Perps Trader [0x25554a]");
    expect(container.querySelector(".tw-wallet")?.getAttribute("data-kind")).toBe("smart-trader");
    expect(container.querySelector("svg")).not.toBeNull();
    root.unmount();
  });

  it("falls back to the short address in mono for an unlabeled or emoji-only label", () => {
    for (const label of [null, "🐳"]) {
      const { container, root } = mount(<WalletLabel label={label} address="EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm" />);
      expect(container.querySelector(".tw-mono")?.textContent).toBe("EKpQ…zcjm");
      root.unmount();
    }
  });
});

describe("count-in", () => {
  it("finds the first figure and draws intermediate frames in its own format", () => {
    expect(splitFigure("Fresh wallets are 100% of buying")).toEqual({ before: "Fresh wallets are ", figure: "100%", after: " of buying" });
    expect(splitFigure("No flags on this token")).toBeNull();
    expect(countFrame("100%", 0.5)).toBe("50%");
    expect(countFrame("+$576K", 0.5)).toBe("+$288K");
    expect(countFrame("−$9.39K", 0)).toBe("−$0.00K");
    expect(countFrame("1,200", 1)).toBe("1,200");
  });
});

describe("no glyph or emoji icons in UI source", () => {
  const roots = ["lib/ui", "entrypoints", "../web/app"].map((p) => path.resolve(__dirname, "..", p));
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : /\.(tsx|css)$/.test(e.name) ? [path.join(dir, e.name)] : []));
  const files = roots.flatMap(walk);

  it("uses Lucide instead of arrow, cross, bullet and check glyphs or pictographs", () => {
    expect(files.length).toBeGreaterThan(20);
    const glyphs = new RegExp("[\\u2715\\u00D7\\u2190-\\u2193\\u25B2\\u25BC\\u25CF\\u25C6\\u25A0\\u2713\\u2714\\u2717\\u26A0]|\\p{Extended_Pictographic}", "u");
    for (const file of files) expect(fs.readFileSync(file, "utf8"), file).not.toMatch(glyphs);
  });
});
