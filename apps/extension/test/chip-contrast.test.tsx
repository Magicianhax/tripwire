import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser } from "@playwright/test";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Verdict } from "@tripwire/core";
import type { HitDto } from "../lib/api-types";
import { BlockScreen } from "../lib/ui/BlockScreen";
import { Chip } from "../lib/ui/Chip";
import { Dock } from "../lib/ui/Dock";
import { HitList, SegmentRow } from "../lib/ui/panel-parts";
import { Strip } from "../lib/ui/Strip";

/**
 * Real-cascade contrast check. The unreadable chip text on X was a cascade bug (a :host-scoped
 * button reset outranked the chip's colour, so the value inherited the host reset's black on the
 * dark chip), which no token table can catch. This renders the components into a shadow root
 * the way WXT does (`:host { all: initial !important }` first, then theme.css) in Chromium, on
 * a dark and a light host page, and measures each text element's computed colour against the
 * background actually painted behind it.
 */

const THEME = fs.readFileSync(path.resolve(__dirname, "../lib/ui/theme.css"), "utf8");
const VERDICTS: (Verdict | "LOADING")[] = ["TRIPWIRE", "CAUTION", "CLEAR", "UNCHECKED", "LOADING"];

let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

type Measure = { selector: string; text: string; color: string; background: string; ratio: number };

/** Mounts `markup` in a shadow root on a page whose body is `hostBg`, then measures every
 * element matching `selector`. Backgrounds are composited up the tree (through the shadow
 * host) onto the page colour. */
async function measure(markup: string, selector: string, hostBg: string): Promise<Measure[]> {
  const page = await browser.newPage();
  try {
    // Declarative shadow DOM: the page parses the shadow root itself, no script-side HTML injection.
    await page.setContent(
      `<body style="margin:0;background:${hostBg};color:${hostBg === "#ffffff" ? "#0f1419" : "#e7e9ea"}"><div id="host"><template shadowrootmode="open"><style>:host{all:initial !important}</style><style>${THEME}</style><div>${markup}</div></template></div></body>`,
    );
    return await page.evaluate(
      ({ selector }) => {
        const root = document.getElementById("host")!.shadowRoot!;
        const parse = (c: string) => {
          const m = c.match(/rgba?\(([^)]+)\)/);
          if (!m) return [0, 0, 0, 0];
          const p = m[1]!.split(/[\s,/]+/).filter(Boolean).map(Number);
          return [p[0]!, p[1]!, p[2]!, p[3] ?? 1];
        };
        const over = (top: number[], under: number[]) => {
          const a = top[3]!;
          return [0, 1, 2].map((i) => top[i]! * a + under[i]! * (1 - a)).concat(1);
        };
        const lum = (c: number[]) => {
          const ch = c.slice(0, 3).map((v) => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
        };
        const backgroundOf = (el: Element) => {
          const layers: number[][] = [];
          let node: Node | null = el;
          while (node) {
            if (node instanceof Element) layers.push(parse(getComputedStyle(node).backgroundColor));
            node = node instanceof ShadowRoot ? node.host : node.parentNode;
          }
          return layers.reverse().reduce((acc, layer) => over(layer, acc), [255, 255, 255, 1]);
        };
        return [...root.querySelectorAll(selector)].map((el) => {
          const bg = backgroundOf(el);
          const fg = over(parse(getComputedStyle(el).color), bg);
          const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
          return {
            selector,
            text: (el.textContent ?? "").trim(),
            color: getComputedStyle(el).color,
            background: `rgb(${bg.slice(0, 3).map(Math.round).join(",")})`,
            ratio: (a! + 0.05) / (b! + 0.05),
          };
        });
      },
      { selector },
    );
  } finally {
    await page.close();
  }
}

const HOSTS = [
  ["dark X", "#000000"],
  ["light X", "#ffffff"],
] as const;

describe("rendered text contrast (Chromium, real cascade)", () => {
  for (const [hostName, hostBg] of HOSTS) {
    it(`chip value text is readable for every verdict on ${hostName}`, async () => {
      const markup = VERDICTS.map((v) =>
        renderToStaticMarkup(<Chip verdict={v} symbol="WIF" headline="Fresh wallets are 100% of buying" expanded={false} onClick={() => {}} chain="solana" replay />),
      ).join("");
      const results = await measure(markup, ".tw-chip-value", hostBg);
      expect(results).toHaveLength(VERDICTS.length);
      for (const r of results) expect(r.ratio, `${r.text}: ${r.color} on ${r.background}`).toBeGreaterThanOrEqual(4.5);
    }, 30_000);

    it(`verdict pill words and replay tag are readable on ${hostName}`, async () => {
      const markup = VERDICTS.map((v) => renderToStaticMarkup(<Chip verdict={v} symbol="WIF" headline="x" expanded={false} onClick={() => {}} replay />)).join("");
      const results = [...(await measure(markup, ".tw-plate", hostBg)), ...(await measure(markup, ".tw-replay-badge", hostBg))];
      expect(results.length).toBe(VERDICTS.length * 2);
      for (const r of results) expect(r.ratio, `${r.selector} ${r.text}: ${r.color} on ${r.background}`).toBeGreaterThanOrEqual(4.5);
    }, 30_000);
  }

  it("strip, dock, block screen and lit rows keep every text colour at 4.5:1 or more", async () => {
    const hits: HitDto[] = [
      { ruleId: "r1", signalId: "fresh_buy_share", action: "block", text: "Fresh wallets", label: "Fresh wallets are 82% of buying", value: 82, evidence: [], op: ">", threshold: 70 },
      { ruleId: "r2", signalId: "exit_pressure", action: "warn", text: "Exit", label: "Labeled wallets sold $9.4K", value: -9400, evidence: [], op: "<", threshold: -1000 },
    ] as HitDto[];
    const markup = [
      renderToStaticMarkup(<Strip verdict="CAUTION" text="Smart Money sold $401" rule="rule: < −$100" onDetails={() => {}} venue="jupiter" />),
      renderToStaticMarkup(<Strip verdict="UNCHECKED" text="Tripwire couldn't check this" venue="jupiter" />),
      renderToStaticMarkup(
        <Dock collapsed verdict="CLEAR" headline="No flags on this token" onToggleCollapsed={() => {}} venue="raydium">
          {null}
        </Dock>,
      ).replace(/position:\s*fixed/g, ""),
      renderToStaticMarkup(<BlockScreen hits={hits} phrase="trade anyway" onEvidence={() => {}} onOverride={() => {}} autoFocus={false} error="Override not recorded: backend offline. Still blocked." />),
      renderToStaticMarkup(
        <div className="tw-pop" style={{ position: "static" }}>
          <HitList hits={hits} />
          <SegmentRow label="Fresh wallets" value={576_000} max={1_000_000} lit="warning" />
          <SegmentRow label="Whales" value={-8_600} max={1_000_000} lit="caution" />
          <SegmentRow label="Smart Traders" value={-401} max={1_000_000} />
          <SegmentRow label="Top PnL" value={311} max={1_000_000} />
        </div>,
      ),
    ].join("");
    const selectors = [
      ".tw-strip-finding",
      ".tw-strip-rule",
      ".tw-strip-details",
      ".tw-dock-chip .tw-chip-value",
      ".tw-block-heading",
      ".tw-block-sub",
      ".tw-hit-finding",
      ".tw-hit-rule",
      ".tw-block-evidence",
      ".tw-block-safe",
      ".tw-block-prompt",
      ".tw-block-override-btn",
      ".tw-block-error",
      ".tw-seg-label",
      ".tw-seg-value",
    ];
    for (const selector of selectors) {
      const results = await measure(markup, selector, "#000000");
      expect(results.length, selector).toBeGreaterThan(0);
      for (const r of results) expect(r.ratio, `${selector} "${r.text}": ${r.color} on ${r.background}`).toBeGreaterThanOrEqual(4.5);
    }
  }, 60_000);
});
