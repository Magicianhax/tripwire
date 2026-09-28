import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser } from "@playwright/test";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NARROW_WIDTH, TIGHT_WIDTH } from "../lib/ui/fit";
import { Strip } from "../lib/ui/Strip";

/**
 * What the strip actually does at a given anchor width, measured in Chromium with the real CSS.
 *
 * The reported bug: on fomo's 346px trade card the strip rendered "rule: < -2% of volu…" — the
 * rule clause clipped mid-word and the finding pushed out entirely. `.tw-strip-rule` is
 * `flex-shrink: 0`, so above NARROW_WIDTH it takes whatever it needs and the finding loses,
 * which is backwards: the finding is the verdict, the rule is a footnote that the card repeats.
 *
 * These tests pin the rule the thresholds exist to enforce (theme.css, "a narrow anchor takes
 * things away, in order, and never stacks"), at real widths rather than by eye.
 */

const THEME = fs.readFileSync(path.resolve(__dirname, "../lib/ui/theme.css"), "utf8");
/** The live case: fomo's trade card submit button measured 346px wide (2026-09-28). */
const FOMO_WIDTH = 346;

let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

type Fit = { clipped: string[]; ruleShown: boolean; findingShown: boolean; findingWidth: number; rows: number };

/** Mounts the strip at `width` the way `applyAnchorBox` does (host attributes + max-width). */
async function fitAt(width: number): Promise<Fit> {
  const markup = renderToStaticMarkup(
    <Strip verdict="CAUTION" text="Smart Money is selling into this" rule="rule: < -2% of volume" venue="fomo" onDetails={() => {}} />,
  );
  const attrs = `${width < NARROW_WIDTH ? " data-narrow" : ""}${width < TIGHT_WIDTH ? " data-tight" : ""}`;
  const page = await browser.newPage();
  try {
    await page.setContent(
      `<body style="margin:0;background:#06080B"><div id="host"${attrs} style="--tw-fit-width:${width}px">` +
        `<template shadowrootmode="open"><style>:host{all:initial !important}</style><style>${THEME}</style>${markup}</template></div></body>`,
    );
    return await page.evaluate(() => {
      const root = document.getElementById("host")!.shadowRoot!;
      const strip = root.querySelector(".tw-strip") as HTMLElement;
      const visible = (el: Element | null) => !!el && (el as HTMLElement).offsetParent !== null && el.getBoundingClientRect().width > 0;
      // Clipping happens at the strip, which is `overflow: hidden`, so measure each part against
      // the strip's own edges rather than against its own box: a `flex-shrink: 0` element keeps
      // its full width and simply hangs outside, which is exactly the reported bug.
      const edge = strip.getBoundingClientRect();
      const clipped = [...root.querySelectorAll<HTMLElement>(".tw-strip-finding, .tw-strip-rule, .tw-strip-details")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && (r.right > edge.right + 1 || r.left < edge.left - 1 || el.scrollWidth > el.clientWidth + 1);
        })
        .map((el) => el.className);
      return {
        clipped,
        ruleShown: visible(root.querySelector(".tw-strip-rule")),
        findingShown: visible(root.querySelector(".tw-strip-finding")),
        findingWidth: Math.round(root.querySelector(".tw-strip-finding")?.getBoundingClientRect().width ?? 0),
        rows: Math.round(strip.getBoundingClientRect().height / 32),
      };
    });
  } finally {
    await page.close();
  }
}

describe("the strip at a real anchor width", () => {
  it("gives the finding a readable share at fomo's 346px trade card, not a 38px stub", async () => {
    const fit = await fitAt(FOMO_WIDTH);
    expect(fit.ruleShown).toBe(false);
    // 146px measured, against 38px before the threshold moved: enough for two clamped lines.
    expect(fit.findingWidth).toBeGreaterThan(140);
  });

  it("never stacks past two rows", async () => {
    for (const width of [FOMO_WIDTH, 300, 280]) {
      expect((await fitAt(width)).rows, `${width}px`).toBeLessThanOrEqual(2);
    }
  });

  it("shows the rule only once the anchor can hold both it and a sentence", async () => {
    const wide = await fitAt(560);
    expect(wide.ruleShown).toBe(true);
    expect(wide.findingWidth).toBeGreaterThan(150);
    expect(wide.clipped).toEqual([]);
  });

  it("drops the sentence, not into extra rows, when the anchor is tighter still", async () => {
    const tight = await fitAt(240);
    expect(tight.findingShown).toBe(false);
    expect(tight.rows).toBe(1);
  });
});
