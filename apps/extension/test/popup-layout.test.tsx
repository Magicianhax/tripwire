import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ProtectionTab } from "../entrypoints/popup/ProtectionTab";
import { SitesTab } from "../entrypoints/popup/SitesTab";
import { WalletsTab } from "../entrypoints/popup/WalletsTab";
import { PopupFoot, PopupHead } from "../entrypoints/popup/shell";
import type { RecentWallet } from "../lib/recent-wallets";

/**
 * The popup as Chromium actually lays it out, at the width Chrome gives it.
 *
 * The user's report was "a big scroll" in "a black box that doesn't match the theme", so the
 * things worth measuring are the ones a token table cannot answer: does the document scroll, is
 * the scrolling region the one that was meant to scroll, is every colour readable on the surface
 * actually painted behind it, and is anything below the 11px floor or the 24px target floor.
 */

vi.hoisted(() => {
  (globalThis as { chrome?: unknown }).chrome = { runtime: { getURL: (p: string) => p } };
});

const STYLE = fs.readFileSync(path.resolve(__dirname, "../entrypoints/popup/style.css"), "utf8");
const POPUP_WIDTH = 420;
/** Chrome's popup maximum is 800x600; the redesign's own budget is tighter. */
const MAX_HEIGHT = 560;

const RECENT: RecentWallet[] = Array.from({ length: 10 }, (_, i) => ({
  query: `0x7fdafde5cfb5465924316eced2d3715494c517d${i}`,
  address: `0x7fdafde5cfb5465924316eced2d3715494c517d${i}`,
  label: i === 0 ? "vitalik.eth" : null,
  chain: ["ethereum", "arbitrum", "base", "solana"][i % 4]!,
  seenAt: Date.now() - i * 900_000,
}));

const HERE = { host: "jup.ag", origin: "https://jup.ag", state: "builtin" } as const;

function markup(tab: "protection" | "sites" | "wallets"): string {
  const panel =
    tab === "protection" ? (
      <ProtectionTab
        preset="balanced"
        pending={null}
        busy={false}
        error=""
        onChoose={() => {}}
        onConfirm={() => {}}
        onCancel={() => {}}
        here={HERE}
        locateNote="Highlighted on the page."
        onLocate={() => {}}
        counters={{ callsToday: 7, creditsToday: 42, totalCalls: 616 }}
      />
    ) : tab === "sites" ? (
      <SitesTab here={{ host: "app.pendle.finance", origin: "https://app.pendle.finance", state: "off" }} sites={["https://debank.com", "https://etherscan.io"]} error="" onEnable={() => {}} onDisable={() => {}} />
    ) : (
      <WalletsTab recent={RECENT} onClear={() => {}} />
    );
  return renderToStaticMarkup(
    // The same wrapper main.tsx mounts into: the chain of definite heights runs through it.
    <div id="root">
    <div className="tw-popup">
      <PopupHead status={{ text: "Connected · key via Nansen CLI", state: "connected" }} settingsOpen={false} onToggleSettings={() => {}} />
      <div className="tw-tabs">
        <div className="tw-tablist" role="tablist" aria-label="Tripwire">
          {["Protection", "Sites", "Wallets"].map((label) => (
            <button key={label} type="button" role="tab" className="tw-tab" aria-selected={label.toLowerCase() === tab}>
              {label}
            </button>
          ))}
        </div>
        <div className="tw-tabpanel" role="tabpanel">
          {panel}
        </div>
      </div>
      <PopupFoot backendUrl="http://127.0.0.1:3000" />
    </div>
    </div>,
  );
}

let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

async function open(tab: "protection" | "sites" | "wallets"): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: POPUP_WIDTH, height: MAX_HEIGHT } });
  await page.setContent(`<!doctype html><html><head><style>${STYLE}</style></head><body>${markup(tab)}</body></html>`);
  return page;
}

const TABS = ["protection", "sites", "wallets"] as const;

describe("popup layout in Chromium", () => {
  for (const tab of TABS) {
    it(`fits ${POPUP_WIDTH}px with no page scroll on the ${tab} tab`, async () => {
      const page = await open(tab);
      try {
        const box = await page.evaluate(() => ({
          width: document.body.getBoundingClientRect().width,
          scrollHeight: document.documentElement.scrollHeight,
          clientHeight: document.documentElement.clientHeight,
          bodyScroll: document.body.scrollHeight - document.body.clientHeight,
        }));
        expect(box.width).toBe(POPUP_WIDTH);
        expect(box.scrollHeight).toBeLessThanOrEqual(box.clientHeight);
        expect(box.bodyScroll).toBeLessThanOrEqual(0);
      } finally {
        await page.close();
      }
    });

    it(`keeps the header and footer still while the ${tab} panel scrolls`, async () => {
      const page = await open(tab);
      try {
        const before = await page.evaluate(() => ({
          head: document.querySelector(".tw-popup-head")!.getBoundingClientRect().top,
          foot: document.querySelector(".tw-popup-foot")!.getBoundingClientRect().bottom,
        }));
        await page.evaluate(() => {
          const panel = document.querySelector<HTMLElement>(".tw-tabpanel")!;
          panel.scrollTop = 9999;
          window.scrollTo(0, 9999);
        });
        const after = await page.evaluate(() => ({
          head: document.querySelector(".tw-popup-head")!.getBoundingClientRect().top,
          foot: document.querySelector(".tw-popup-foot")!.getBoundingClientRect().bottom,
          overflow: getComputedStyle(document.querySelector(".tw-tabpanel")!).overflowY,
        }));
        expect(after.head).toBe(before.head);
        expect(after.foot).toBe(before.foot);
        expect(after.overflow).toBe("auto");
      } finally {
        await page.close();
      }
    });

    it(`keeps every text colour at 4.5:1 or more on the ${tab} tab`, async () => {
      const page = await open(tab);
      try {
        const bad = await page.evaluate(() => {
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
          const lum = (c: number[]) =>
            0.2126 * [c[0]!, c[1]!, c[2]!].map((v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4))[0]! +
            0.7152 * [c[0]!, c[1]!, c[2]!].map((v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4))[1]! +
            0.0722 * [c[0]!, c[1]!, c[2]!].map((v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4))[2]!;
          const backgroundOf = (el: Element) => {
            const layers: number[][] = [];
            let node: Node | null = el;
            while (node) {
              if (node instanceof Element) layers.push(parse(getComputedStyle(node).backgroundColor));
              node = node.parentNode;
            }
            return layers.reverse().reduce((acc, layer) => over(layer, acc), [255, 255, 255, 1]);
          };
          const out: { text: string; color: string; ratio: number }[] = [];
          for (const el of document.querySelectorAll<HTMLElement>("body *")) {
            const own = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim().length > 0);
            if (!own || el.offsetParent === null) continue;
            const bg = backgroundOf(el);
            const fg = over(parse(getComputedStyle(el).color), bg);
            const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
            const ratio = (a! + 0.05) / (b! + 0.05);
            if (ratio < 4.5) out.push({ text: (el.textContent ?? "").trim().slice(0, 40), color: getComputedStyle(el).color, ratio: Math.round(ratio * 100) / 100 });
          }
          return out;
        });
        expect(bad).toEqual([]);
      } finally {
        await page.close();
      }
    });

    it(`keeps text at 11px and controls at 24px on the ${tab} tab`, async () => {
      const page = await open(tab);
      try {
        const found = await page.evaluate(() => {
          const small: string[] = [];
          const tiny: string[] = [];
          for (const el of document.querySelectorAll<HTMLElement>("body *")) {
            if (el.offsetParent === null) continue;
            const own = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim().length > 0);
            if (own && parseFloat(getComputedStyle(el).fontSize) < 11) small.push(`${el.className}: ${getComputedStyle(el).fontSize}`);
            if (el.matches("button, a, input, [role='tab']")) {
              const box = el.getBoundingClientRect();
              if (box.height > 0 && box.height < 24) tiny.push(`${el.className || el.tagName}: ${Math.round(box.height)}px`);
            }
          }
          return { small, tiny };
        });
        expect(found.small).toEqual([]);
        expect(found.tiny).toEqual([]);
      } finally {
        await page.close();
      }
    });
  }

  it("puts the action for the current site above the fold on the Sites tab", async () => {
    const page = await open("sites");
    try {
      const visible = await page.evaluate(() => {
        const panel = document.querySelector<HTMLElement>(".tw-tabpanel")!.getBoundingClientRect();
        const button = document.querySelector<HTMLElement>(".tw-button-primary")!.getBoundingClientRect();
        return button.bottom <= panel.bottom && button.top >= panel.top;
      });
      expect(visible, "enabling the current site is reachable without scrolling").toBe(true);
    } finally {
      await page.close();
    }
  });

  it("lets only the recent-wallets region scroll inside the Wallets panel", async () => {
    const page = await open("wallets");
    try {
      const region = await page.evaluate(() => {
        const el = document.querySelector<HTMLElement>(".tw-recent-scroll")!;
        const style = getComputedStyle(el);
        return { overflowY: style.overflowY, overscroll: style.overscrollBehaviorY, maxHeight: parseFloat(style.maxHeight) };
      });
      expect(region.overflowY).toBe("auto");
      expect(region.overscroll).toBe("contain");
      expect(region.maxHeight).toBeLessThanOrEqual(240);
    } finally {
      await page.close();
    }
  });
});
