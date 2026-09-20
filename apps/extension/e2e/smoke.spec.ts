import type { APIRequestContext, Page } from "@playwright/test";
import path from "node:path";
import { PRESETS } from "../../../packages/core/src/rules/presets";
import { TRIPWIRE_EXTENSION_ID } from "../../../packages/core/src/constants";
import { BACKEND, BONK, expect, LENS_WALLET, test, WBTC_BASE, WIF } from "./fixtures";

const EXTENSION_ORIGIN = `chrome-extension://${TRIPWIRE_EXTENSION_ID}`;

/**
 * The compact prediction card's first screen. Reported as "cramped, and it scrolls before it
 * has said anything": the slug filled the header, the question was repeated as body text, and
 * the tiles pushed the tab strip below the fold.
 */
test("@smoke Polymarket: the compact card shows its verdict, price and tabs without scrolling", async ({ context, request }) => {
  await setPreset(request, "balanced");
  const page = await context.newPage();
  await page.route("https://polymarket.com/event/**", (route) =>
    route.fulfill({ path: path.resolve("test/fixtures/venues/polymarket.html"), contentType: "text/html; charset=utf-8" }),
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("https://polymarket.com/event/friedrich-merz-out-as-chancellor-of-germany-before-2027");
  await expect(page.locator(".tw-strip")).toBeVisible({ timeout: 20_000 });
  await page.locator(".tw-strip-details").click();
  const card = page.locator('.tw-pop[role="dialog"]');
  await expect(card).toBeVisible();
  await expect(card.locator(".tw-price-value")).toHaveText(/¢/, { timeout: 20_000 });

  // The title is the market's question, never the slug from the URL.
  const title = (await card.locator(".tw-card-title").textContent())!;
  expect(title).not.toMatch(/^[a-z0-9]+(-[a-z0-9]+){3,}$/);
  expect(title).toMatch(/\s/);

  const cardBox = (await card.boundingBox())!;
  for (const selector of [".tw-card-finding", ".tw-price-value", '[role="tablist"]']) {
    const box = (await card.locator(selector).first().boundingBox())!;
    expect(box.y + box.height, `${selector} is on the card's first screen`).toBeLessThanOrEqual(cardBox.y + cardBox.height);
  }
  expect(await card.locator(".tw-card-scroll").evaluate((el) => el.scrollTop), "nothing was scrolled to get there").toBe(0);
});

/**
 * Reported live: the Buy token changed on app.uniswap.org, the strip re-checked, and the open
 * evidence card kept the previous token's panel under the new token's address. The card follows
 * the page or it is not open at all.
 */
test("@smoke Uniswap: changing the Buy token re-targets the open evidence card", async ({ context, request }) => {
  await setPreset(request, "balanced");
  const WETH_BASE = "0x4200000000000000000000000000000000000006";
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`https://app.uniswap.org/swap?chain=base&outputCurrency=${WBTC_BASE}`);
  await expect(page.locator(".tw-strip")).toBeVisible({ timeout: 20_000 });
  await page.locator(".tw-strip-details").click();
  const card = page.locator('.tw-pop[role="dialog"]');
  await expect(card).toBeVisible();
  await expect(card.locator(".tw-addr-text")).toHaveText("0x05…2B9c", { timeout: 20_000 });

  // The venue's own token picker: the URL and the Buy field move together.
  await page.evaluate((address) => {
    history.replaceState({}, "", `/swap?chain=base&outputCurrency=${address}`);
    (window as unknown as { setBuyToken(symbol: string): void }).setBuyToken("WETH");
  }, WETH_BASE);

  // The card stays, re-pointed: the new token's address in the header, and no frame of the old
  // token's evidence under it.
  await expect(card).toBeVisible();
  await expect(card.locator(".tw-addr-text")).toHaveText("0x42…0006", { timeout: 20_000 });
});

test("@smoke Jumper: native ETH is checked under Nansen's same-chain identifier", async ({ context, request }) => {
  await setPreset(request, "balanced");
  const targets: { chain: string; tokenAddress: string }[] = [];
  await context.route(`${BACKEND}/api/guard`, async route => {
    targets.push(route.request().postDataJSON().target);
    await route.continue();
  });
  const page = await context.newPage();
  await page.goto(`https://jumper.xyz/?toChain=42161&toToken=0x${"0".repeat(40)}`);
  await expect(page.locator(".tw-strip")).toHaveAttribute("data-verdict", "CLEAR", { timeout: 20000 });
  await page.locator(".tw-strip-details").click();
  await expect(page.locator(".tw-card-symbol")).toBeVisible();
  expect(targets.length).toBeGreaterThanOrEqual(2);
  for (const target of targets) expect(target).toMatchObject({chain:"arbitrum",tokenAddress:`0x${"e".repeat(40)}`});
});

test("@smoke Dexscreener: resolves the base token and keeps its dock within the viewport", async ({ context, request }) => {
  await setPreset(request, "balanced");
  const mint = "tipp4C4Jnpft26HC9VXNjUPidojZqxXf8nzKvrKf5BS";
  let resolved = false;
  await context.route(`${BACKEND}/api/resolve-pair`, async route => {
    expect(route.request().postDataJSON()).toEqual({chain:"solana",pairAddress:"cjieb7fumhefmaefjaxqjnkvxnmvabm3dhhp8rtgbeg1"});
    resolved = true;
    await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({target:{kind:"spot",chain:"solana",tokenAddress:mint,symbol:"TIPPED"}})});
  });
  const page = await context.newPage();
  await page.setViewportSize({width:1280,height:900});
  await page.goto("https://dexscreener.com/solana/cjieb7fumhefmaefjaxqjnkvxnmvabm3dhhp8rtgbeg1");
  const dock = page.locator(".tw-dock-chip");
  await expect(dock).toHaveAttribute("data-verdict","CLEAR",{timeout:20000});
  expect(resolved).toBe(true);
  const box=(await dock.boundingBox())!;
  // The dock's bound is theme.css's own cap, `min(440px, calc(100vw - 32px))` — 440 here.
  // This read 320 while the chip happened to measure 314: Round 1.6 gave the primary dock a
  // verdict edge and `padding-left: 12px` (up from the base chip's 6px), so the same content
  // now measures 320.00006 and tripped a bound that was a snapshot, not a contract.
  expect(box.width).toBeLessThanOrEqual(Math.min(440, 1280 - 32));
  expect(box.x+box.width).toBeLessThanOrEqual(1280);
  await dock.click();
  await expect(page.locator(".tw-addr-text")).toHaveText("tipp…f5BS");
});

test("@smoke X: profile badge works without tweets and opens the full entity summary", async ({ context }) => {
  const page = await context.newPage();
  await page.route("https://x.com/VitalikButerin", route => route.fulfill({ path: path.resolve("e2e/pages/x-profile.html"), contentType: "text/html" }));
  await page.goto("https://x.com/VitalikButerin");
  const header = page.locator('.identity');
  const badge = header.getByRole("button", { name: "Nansen label for @VitalikButerin" });
  await expect(badge).toBeVisible({ timeout: 20000 });
  const check = (await header.getByRole("button", { name: "Verified account" }).boundingBox())!;
  const badgeBox = (await badge.boundingBox())!;
  expect(badgeBox.x - check.x - check.width).toBeCloseTo(4, 0);
  await badge.hover();
  const tooltip = header.locator('[role="tooltip"]');
  await expect(tooltip).toBeVisible();
  expect(await tooltip.evaluate(el => el.matches(":popover-open"))).toBe(true);
  const tipBox = (await tooltip.boundingBox())!;
  expect(tipBox.y + tipBox.height).toBeLessThan(badgeBox.y);
  expect(tipBox.x).toBeGreaterThanOrEqual(8);
  await badge.click();
  const card = page.locator(".tw-badge-card");
  await expect(card).toBeVisible();
  await expect(card.getByRole("heading", { name: "Portfolio by chain" })).toBeVisible();
  await card.getByRole("radio", { name: "Performance", exact: true }).click();
  await expect(card).toContainText("Tokens traded");
  await expect(card.locator(".tw-nansen-link")).toHaveAttribute("href", /entity=Vitalik(%20|\+)Buterin/);
  await expect(card.locator(".tw-replay-badge")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(card).toHaveCount(0);
  // Same-document account navigation must remove the old profile's badge and listeners.
  await page.evaluate(() => history.pushState({}, "", "/weatherfan"));
  await expect(header.locator(".tw-badge")).toHaveCount(0, { timeout: 6000 });
});

/** Sets the rules preset the way the popup does: a PUT carrying the pinned extension Origin. */
async function setPreset(request: APIRequestContext, preset: "balanced" | "paranoid") {
  const res = await request.put(`${BACKEND}/api/rules`, { headers: { origin: EXTENSION_ORIGIN }, data: { preset } });
  expect(res.status(), `PUT /api/rules ${preset}`).toBe(200);
}

/**
 * A rule set that blocks the recorded WIF data, for the tests that need a block screen.
 *
 * Since the recalibration the shipped presets no longer block it -- labeled wallets shedding
 * 0.6% of a day's volume is ordinary rotation, which was the whole point -- so the block screen
 * is exercised through an explicit user rule instead of through Paranoid.
 */
async function setBlockingRules(request: APIRequestContext) {
  const rules = PRESETS.balanced.map((r) => (r.id === "spot-exit-deep" ? { ...r, threshold: -0.5 } : r));
  const res = await request.put(`${BACKEND}/api/rules`, { headers: { origin: EXTENSION_ORIGIN }, data: { rules } });
  expect(res.status(), "PUT /api/rules (blocking)").toBe(200);
}

async function guardVerdict(request: APIRequestContext, tokenAddress: string): Promise<string> {
  const res = await request.post(`${BACKEND}/api/guard`, {
    headers: { origin: EXTENSION_ORIGIN },
    data: { target: { kind: "spot", chain: "solana", tokenAddress }, venue: "jupiter" },
  });
  expect(res.status()).toBe(200);
  return (await res.json()).verdict as string;
}

async function openBlockedJupiter(page: Page, request: APIRequestContext) {
  await setBlockingRules(request);
  // Precondition, straight from the backend: the recorded WIF data trips the block rule.
  expect(await guardVerdict(request, WIF)).toBe("TRIPWIRE");
  await page.goto(`https://jup.ag/swap/SOL-${WIF}`);
  await expect(page.locator(".tw-block")).toBeVisible();
}

test.afterEach(async ({ request }) => {
  await setPreset(request, "balanced");
});

test("@smoke extension loads with the pinned ID and its popup reaches the backend", async ({ context, extensionId, consoleErrors }) => {
  expect(extensionId).toBe(TRIPWIRE_EXTENSION_ID);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  // health() -> runtime.sendMessage -> background bridge -> backend -> sendResponse (A3).
  await expect(popup.locator(".tw-status")).toHaveText(/Connected ·|No Nansen key/);
  await expect(popup.locator(".tw-status")).not.toHaveText(/offline/i);
  // The redesign's own promise: a fixed box, whatever tab is showing (no page scroll).
  for (const tab of ["Protection", "Sites", "Wallets"]) {
    await popup.getByRole("tab", { name: tab }).click();
    await expect(popup.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true");
    const scrolls = await popup.evaluate(() => document.documentElement.scrollHeight > document.documentElement.clientHeight);
    expect(scrolls, `the ${tab} tab scrolls the popup`).toBe(false);
  }
  expect(consoleErrors).toEqual([]);
});

test("@smoke X: 'where is it?' finds the chip, instead of reporting an empty tab (I-1)", async ({ context }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("https://x.com/home");
  const chip = page.locator(".tw-chip");
  await expect(chip).toBeVisible({ timeout: 20_000 });

  // The popup's wire, driven from the service worker because a popup opened as a page would
  // query itself as the active tab. Before I-1 only the venue script answered, so this page —
  // whose display is a chip, not a strip — rejected and the popup said nothing was showing.
  let [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent("serviceworker");
  const answered = await worker.evaluate(async () => {
    const chrome = (globalThis as unknown as { chrome: { tabs: { query(q: object): Promise<{ id?: number }[]>; sendMessage(id: number, m: object): Promise<boolean> } } }).chrome;
    const tabs = await chrome.tabs.query({ active: true });
    for (const tab of tabs) {
      if (tab.id === undefined) continue;
      const found = await chrome.tabs.sendMessage(tab.id, { type: "tripwire:locate" }).catch(() => false);
      if (found) return true;
    }
    return false;
  });
  expect(answered, "the X content script says it found a chip to light").toBe(true);
  await expect(chip).toHaveAttribute("data-tw-locate", "");
  await expect(chip).not.toHaveAttribute("data-tw-locate", "", { timeout: 5_000 });
  await page.close();
});

test("@smoke X: the chip opens a floating evidence card on <body>, beside the chip, not inside the post", async ({ context, consoleErrors }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  // Fonts and brand logos come from the extension package, never from a third-party origin.
  const assetRequests: string[] = [];
  page.on("request", (req) => {
    if (["font", "image"].includes(req.resourceType())) assetRequests.push(req.url());
  });
  await page.goto("https://x.com/home");
  const chip = page.locator(".tw-chip");
  await expect(chip.locator(".tw-chip-key")).toHaveText(/^(TRIPWIRE|CAUTION|Clear|Unchecked)$/, { timeout: 10_000 });
  await expect(chip).toHaveCount(1); // the plain-text tweet gets no chip
  await expect(chip.locator(".tw-replay-badge")).toHaveText("Replay");
  const articleHeight = await page.locator("article").first().evaluate((el) => el.getBoundingClientRect().height);

  await chip.click();
  const card = page.locator('.tw-pop[role="dialog"]');
  await expect(card).toBeVisible();
  await expect(chip).toHaveAttribute("aria-expanded", "true");
  await expect(card).toHaveAttribute("aria-modal", "false");
  // Let the 180ms rise-in settle before measuring geometry.
  await card.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));

  // Its shadow host hangs off <body>; the tweet itself neither contains it nor grows.
  const placement = await card.evaluate((el) => {
    const host = (el.getRootNode() as ShadowRoot).host;
    return { parentIsBody: host.parentElement === document.body, insideArticle: !!host.closest("article") };
  });
  expect(placement).toEqual({ parentIsBody: true, insideArticle: false });
  expect(await page.locator("article").first().evaluate((el) => el.getBoundingClientRect().height)).toBe(articleHeight);

  // Beside the chip (below it here), inside the viewport with a 16px margin, 440px wide.
  const chipBox = (await chip.boundingBox())!;
  const cardBox = (await card.boundingBox())!;
  expect(cardBox.y).toBeGreaterThanOrEqual(chipBox.y + chipBox.height);
  expect(cardBox.x).toBeGreaterThanOrEqual(16);
  expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(1280 - 16);
  expect(Math.round(cardBox.width)).toBe(440);

  // Focus lands on the heading; evidence tabs are keyboard operable.
  await expect(card.locator("h2")).toBeFocused();
  await expect(card.getByRole("tab")).toHaveText(["Markets", "Flow", "Wallets", "Risk"]);
  await card.getByRole("tab", { name: "Flow" }).focus();
  // Manual activation (I-2): the arrow key moves focus, it does not select and it does not spend.
  await page.keyboard.press("ArrowRight");
  await expect(card.getByRole("tab", { name: "Wallets" })).toBeFocused();
  await expect(card.getByRole("tab", { name: "Wallets" })).toHaveAttribute("aria-selected", "false");
  await page.keyboard.press("Enter");
  await expect(card.getByRole("tab", { name: "Wallets" })).toHaveAttribute("aria-selected", "true");

  // Escape closes it and gives focus back to the chip.
  await page.keyboard.press("Escape");
  await expect(card).toHaveCount(0);
  await expect(chip).toHaveAttribute("aria-expanded", "false");
  await expect(chip).toBeFocused();

  // Reopen, then an outside click closes it.
  await chip.click();
  await expect(card).toBeVisible();
  await page.mouse.click(1200, 700);
  await expect(card).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  expect(assetRequests.some((u) => u.endsWith("/logos/chain-solana.svg")), "chain logo requested").toBe(true);
  expect(assetRequests.filter((u) => !u.startsWith("chrome-extension://"))).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("@smoke Jupiter: a TRIPWIRE blocks Swap but the rest of the page stays clickable", async ({ context, request, consoleErrors }) => {
  const page = await context.newPage();
  await openBlockedJupiter(page, request);

  // A real pointer click at the Swap button lands on the block screen, not the button.
  const swapBox = (await page.locator("#swap").boundingBox())!;
  await page.mouse.click(swapBox.x + swapBox.width / 2, swapBox.y + swapBox.height / 2);
  // Even a click dispatched straight at the button is swallowed by the blocker.
  await page.locator("#swap").dispatchEvent("click");
  expect(await page.evaluate(() => (window as unknown as { swapClicks: number }).swapClicks)).toBe(0);

  // A1: outside the block rectangle the venue page still takes clicks (token picker, nav).
  await page.locator("#token-picker").click({ timeout: 5_000 });
  await expect(page.locator("#picker-clicks")).toHaveText("1");
  const topElement = await page.evaluate(() => {
    const r = document.getElementById("token-picker")!.getBoundingClientRect();
    return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.id ?? null;
  });
  expect(topElement).toBe("token-picker");
  expect(consoleErrors).toEqual([]);
});

test("@smoke Jupiter: the block screen's evidence opens as a card on the Wallets tab, and Swap stays blocked", async ({ context, request, consoleErrors }) => {
  const page = await context.newPage();
  await openBlockedJupiter(page, request);
  await page.locator(".tw-block-evidence").click();
  const card = page.locator('.tw-pop[role="dialog"]');
  await expect(card).toBeVisible();
  await expect(card.getByRole("tab", { name: "Wallets" })).toHaveAttribute("aria-selected", "true");
  await page.locator("#swap").dispatchEvent("click");
  expect(await page.evaluate(() => (window as unknown as { swapClicks: number }).swapClicks)).toBe(0);
  await page.keyboard.press("Escape");
  await expect(card).toHaveCount(0);
  await expect(page.locator(".tw-block")).toBeVisible();
  await expect(page.locator(".tw-block-evidence")).toBeFocused();
  expect(consoleErrors).toEqual([]);
});

test("@smoke Jupiter: changing the token drops the old block at once and shows Checking… first", async ({ context, request, consoleErrors }) => {
  const page = await context.newPage();
  await openBlockedJupiter(page, request);

  // Sample what Tripwire shows every few ms around the token change.
  await page.evaluate(() => {
    type Sample = { t: number; path: string; block: boolean; checking: boolean };
    const w = window as unknown as { __tw: Sample[]; __twTimer: number };
    w.__tw = [];
    const sample = () => {
      const roots = [...document.querySelectorAll("tripwire-ui")].map((host) => host.shadowRoot);
      w.__tw.push({
        t: performance.now(),
        path: location.pathname,
        block: roots.some((root) => root?.querySelector(".tw-block")),
        checking: roots.some((root) => root?.querySelector('.tw-strip[data-verdict="LOADING"]')),
      });
    };
    w.__twTimer = window.setInterval(sample, 2);
  });
  const newPath = `/swap/SOL-${BONK}`;
  await page.evaluate((p) => {
    (window as unknown as { __changedAt: number }).__changedAt = performance.now();
    history.pushState({}, "", p);
  }, newPath);

  // The new token's verdict arrives (the replay data is the same, so it blocks again).
  await expect
    .poll(async () =>
      page.evaluate((p) => {
        const s = (window as unknown as { __tw: { path: string; block: boolean; checking: boolean }[] }).__tw;
        const firstChecking = s.findIndex((x) => x.path === p && x.checking);
        return firstChecking >= 0 && s.slice(firstChecking).some((x) => x.block);
      }, newPath),
    )
    .toBe(true);

  const { samples, changedAt } = await page.evaluate(() => {
    const w = window as unknown as { __tw: { t: number; path: string; block: boolean; checking: boolean }[]; __twTimer: number; __changedAt: number };
    clearInterval(w.__twTimer);
    return { samples: w.__tw, changedAt: w.__changedAt };
  });
  const after = samples.filter((s) => s.t >= changedAt && s.path === newPath);
  const firstClear = after.findIndex((s) => !s.block);
  const firstChecking = after.findIndex((s) => s.checking);
  const nextBlock = after.findIndex((s, i) => i > firstChecking && s.block);
  expect(firstClear, "old block removed").toBeGreaterThanOrEqual(0);
  // The content script notices a pushState on its next URL check (1s poll at worst); from that
  // moment the old block goes first, then Checking… follows at once -- before any new verdict.
  expect(after[firstClear]!.t - changedAt, "ms until the change was noticed").toBeLessThan(1_500);
  expect(firstChecking, "Checking… shown").toBeGreaterThanOrEqual(firstClear);
  expect(after[firstChecking]!.t - after[firstClear]!.t, "ms from old block gone to Checking…").toBeLessThan(100);
  expect(nextBlock, "new verdict after Checking…").toBeGreaterThan(firstChecking);
  // Never the old block and the loading strip at once, and no block between the change and Checking….
  expect(after.some((s) => s.block && s.checking)).toBe(false);
  expect(after.slice(firstClear, firstChecking).some((s) => s.block)).toBe(false);
  expect(consoleErrors).toEqual([]);
});

test("@smoke X: author badges appear next to the username and open the badge card", async ({ context, request, consoleErrors }) => {
  const HL_WALLET = "0x7fdafde5cfb5465924316eced2d3715494c517d1";
  const PM_WALLET = "0x1963eabad7eb7499fb049ddebb96a8fd22179bfd";
  for (const [venue, address] of [
    ["hyperliquid", HL_WALLET],
    ["polymarket", PM_WALLET],
  ] as const) {
    const res = await request.put(`${BACKEND}/api/links`, { headers: { origin: EXTENSION_ORIGIN }, data: { handle: "degenalpha", venue, address } });
    expect(res.status(), `PUT /api/links ${venue}`).toBe(200);
  }

  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("https://x.com/home");

  // The linked author gets both venue badges; the Nansen-labeled author gets the Nansen badge;
  // the unlabeled, unlinked authors get none.
  const linked = page.locator("article", { hasText: "@degenalpha" });
  await expect(linked.locator(".tw-badge")).toHaveCount(2, { timeout: 15_000 });
  const labeled = page.locator("article", { hasText: "@VitalikButerin" });
  await expect(labeled.locator(".tw-badge")).toHaveCount(1);
  const verifiedBox = (await labeled.locator('svg[aria-label="Verified account"]').boundingBox())!;
  const nansenBox = (await labeled.locator('.tw-badge[data-venue="nansen"]').boundingBox())!;
  expect(nansenBox.x - (verifiedBox.x + verifiedBox.width)).toBeCloseTo(4, 0);
  expect(Math.abs(nansenBox.y + nansenBox.height / 2 - (verifiedBox.y + verifiedBox.height / 2))).toBeLessThanOrEqual(1);
  await expect(page.locator("article", { hasText: "@weatherfan" }).locator(".tw-badge")).toHaveCount(0);

  // The badges sit inside X's username row, and the post keeps its height.
  const inHeader = await linked.locator(".tw-badge").first().evaluate((el) => {
    const host = (el.getRootNode() as ShadowRoot).host;
    return { inUserName: !!host.closest('[data-testid="User-Name"]'), after: host.previousElementSibling?.getAttribute("href") ?? null };
  });
  expect(inHeader).toEqual({ inUserName: true, after: "/degenalpha" });

  const hlBadge = linked.locator('.tw-badge[data-venue="hyperliquid"]');
  await hlBadge.hover();
  const rowHint = linked.locator('[role="tooltip"]').filter({ hasText: "Hyperliquid account for @degenalpha" });
  await expect(rowHint).toBeVisible();
  expect(await rowHint.evaluate(el=>el.matches(":popover-open"))).toBe(true);
  await hlBadge.click();
  const card = page.locator('.tw-pop[role="dialog"] .tw-badge-card');
  await expect(card).toBeVisible();
  await expect(hlBadge).toHaveAttribute("aria-expanded", "true");
  await expect(card.getByRole("tab")).toHaveText(["Hyperliquid", "Polymarket"]);
  await expect(card.getByRole("tab", { name: "Hyperliquid" })).toHaveAttribute("aria-selected", "true");
  await expect(card.getByText("Linked by you").first()).toBeVisible();
  await expect(card.locator(".tw-readouts dd").first()).not.toHaveText("—");

  // The Polymarket tab shows that wallet's open positions.
  await card.getByRole("tab", { name: "Polymarket" }).click();
  await expect(card.locator(".tw-market-rows li").first()).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(card).toHaveCount(0);
  await expect(hlBadge).toHaveAttribute("aria-expanded", "false");

  for (const venue of ["hyperliquid", "polymarket"] as const) {
    await request.fetch(`${BACKEND}/api/links`, { method: "DELETE", headers: { origin: EXTENSION_ORIGIN }, data: { handle: "degenalpha", venue } });
  }
  expect(consoleErrors).toEqual([]);
});

test("@smoke X: the evidence chart hovers, and the window control moves the flow gauges", async ({ context, request, consoleErrors }) => {
  await setPreset(request, "balanced");
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("https://x.com/home");
  const chip = page.locator(".tw-chip");
  await expect(chip.locator(".tw-chip-key")).toHaveText(/^(TRIPWIRE|CAUTION|Clear|Unchecked)$/, { timeout: 10_000 });
  await chip.click();
  const card = page.locator('.tw-pop[role="dialog"]');
  await expect(card).toBeVisible();

  // The header names the token Nansen knows, not the contract the post pasted.
  await expect(card.locator(".tw-card-symbol")).toHaveText("$WIF");
  await expect(card.locator(".tw-card-name")).toHaveText("dogwifhat");
  await expect(card.locator(".tw-addr-text")).toContainText("…");
  await expect(card.locator(".tw-nansen-link")).toHaveAttribute("href", /app\.nansen\.ai\/token-god-mode\?chain=solana/);

  // The chart is live: moving the pointer across it reads out a price and a change.
  const canvas = card.locator(".tw-chart-canvas");
  await expect(canvas).toBeVisible();
  // The card scrolls internally, and the chart sits below its fold on a 900px viewport.
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height / 2);
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height / 2);
  const tip = card.locator(".tw-chart-tip");
  await expect(tip).toBeVisible();
  await expect(tip.locator(".tw-chart-tip-price")).toContainText("$");
  await expect(tip).toContainText("%");

  // The window control drives the gauges and says the verdict did not move with it.
  const gauges = card.locator('section[aria-label="Net flow by wallet type"] .tw-section-aside');
  await expect(gauges).toHaveText("1d, log scale");
  await expect(card.locator(".tw-window-note")).toHaveText("Verdict uses 1d");
  const verdictBefore = await card.locator(".tw-card-plate").textContent();

  await card.getByRole("radio", { name: "7d" }).click();
  await expect(gauges).toHaveText("7d, log scale");
  await expect(card.locator(".tw-window-note")).toHaveText("Verdict uses 1d · viewing 7d");
  expect(await card.locator(".tw-card-plate").textContent()).toBe(verdictBefore);

  // The 24h netflow tile is a button onto the same control.
  await card.locator(".tw-tile-button", { hasText: "24h" }).click();
  await expect(gauges).toHaveText("1d, log scale");
  await expect(card.getByRole("radio", { name: "1d" })).toHaveAttribute("aria-checked", "true");

  // Keyboard: the segmented control is a radiogroup with arrow keys.
  await card.getByRole("radio", { name: "1d" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(card.getByRole("radio", { name: "7d" })).toHaveAttribute("aria-checked", "true");

  expect(consoleErrors).toEqual([]);
});

test("@smoke Jumper: the strip fits its card at any width and never scrolls the page sideways", async ({ context, request, consoleErrors }) => {
  await setPreset(request, "balanced");
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`https://jumper.xyz/?fromChain=8453&toChain=8453&toToken=${WBTC_BASE}`);

  const strip = page.locator(".tw-strip");
  await expect(strip).toBeVisible({ timeout: 15_000 });
  const anchor = page.locator(".actions");
  const button = page.locator('[data-testid="widget-transaction-button"]');
  const card = page.locator(".card");

  // The venue lays its action row out horizontally. The strip belongs above that whole row, not
  // beside the button inside it, where it would be squeezed into a narrow column.
  const stacked = await strip.evaluate((el) => {
    const host = (el.getRootNode() as ShadowRoot).host;
    const row = document.querySelector(".actions")!;
    return { beforeTheRow: host.nextElementSibling === row, insideTheRow: row.contains(host) };
  });
  expect(stacked).toEqual({ beforeTheRow: true, insideTheRow: false });
  const first = (await strip.boundingBox())!;
  expect(first.y + first.height, "the strip sits above the button").toBeLessThanOrEqual((await button.boundingBox())!.y + 1);

  const overflows = () =>
    page.evaluate(() => {
      const doc = document.documentElement;
      const cardEl = document.querySelector(".card")!;
      return { page: doc.scrollWidth - doc.clientWidth, card: cardEl.scrollWidth - cardEl.clientWidth };
    });

  for (const width of [640, 280, 416]) {
    await page.evaluate((w) => (window as unknown as { setCardWidth(w: number): void }).setCardWidth(w), width);
    await page.waitForTimeout(200); // let the ResizeObserver refit the mounted host

    const stripBox = (await strip.boundingBox())!;
    const anchorBox = (await anchor.boundingBox())!;
    const cardBox = (await card.boundingBox())!;
    // Never wider than the element it describes, and never outside the venue's own card.
    expect(Math.round(stripBox.width), `strip vs anchor at ${width}px`).toBeLessThanOrEqual(Math.round(anchorBox.width) + 1);
    expect(Math.round(stripBox.x + stripBox.width), `strip right edge at ${width}px`).toBeLessThanOrEqual(Math.round(cardBox.x + cardBox.width) + 1);
    expect(await overflows(), `no horizontal scroll at ${width}px`).toEqual({ page: 0, card: 0 });
  }

  // The full sentence stays reachable even when the pill truncates it — on the strip itself,
  // because at a tight anchor width the sentence is not drawn at all.
  const finding = strip.locator(".tw-strip-finding");
  expect(await strip.getAttribute("title")).toBe(await finding.textContent());

  // The picker replaces the trade form without changing the selected token URL.
  // Neither the strip nor its dock fallback should obstruct choosing another asset.
  await page.evaluate(() => {
    const picker = document.createElement("div");
    picker.id = "widget-token-picker";
    const search = document.createElement("input");
    search.placeholder = "Search by token or address";
    picker.append(search);
    document.body.append(picker);
  });
  await expect(strip).toHaveCount(0);
  await expect(page.locator(".tw-dock-chip")).toHaveCount(0);
  await page.locator("#widget-token-picker").evaluate(el=>el.remove());
  await expect(strip).toBeVisible();

  // Jumper's widget owns a high stacking layer. Expanded evidence must still be the topmost
  // surface at their overlap; an internal card z-index cannot escape a reset shadow host.
  await strip.getByRole("button", { name: "Details" }).click();
  const evidence = page.locator('.tw-pop[role="dialog"]');
  await expect(evidence).toBeVisible();
  const compactLayer = await evidence.evaluate((el) => {
    const host = (el.getRootNode() as ShadowRoot).host;
    const widget = document.querySelector(".card")!;
    const cardBox = el.getBoundingClientRect();
    const widgetBox = widget.getBoundingClientRect();
    const overlap = {
      left: Math.max(cardBox.left, widgetBox.left),
      top: Math.max(cardBox.top, widgetBox.top),
      right: Math.min(cardBox.right, widgetBox.right),
      bottom: Math.min(cardBox.bottom, widgetBox.bottom),
    };
    const overlaps = overlap.right > overlap.left && overlap.bottom > overlap.top;
    const topmost = overlaps ? document.elementFromPoint((overlap.left + overlap.right) / 2, (overlap.top + overlap.bottom) / 2) : null;
    const style = getComputedStyle(host);
    return {
      overlaps,
      topLayer: el.parentElement?.matches(":popover-open"),
      topmost: topmost?.tagName.toLowerCase() ?? null,
      host: { position: style.position, zIndex: style.zIndex, display: style.display, width: style.width, height: style.height },
    };
  });
  expect(compactLayer).toEqual({
    overlaps: true,
    topLayer: true,
    topmost: "tripwire-ui",
    host: { position: "relative", zIndex: "2147483001", display: "block", width: "0px", height: "0px" },
  });
  await evidence.getByRole("button", { name: "Expand card" }).click();
  await expect(evidence).toHaveAttribute("data-size", "expanded");
  const topAtCenter = await evidence.evaluate((el) => {
    const box = el.getBoundingClientRect();
    return document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)?.tagName.toLowerCase();
  });
  expect(topAtCenter).toBe("tripwire-ui");
  expect(consoleErrors).toEqual([]);
});

test("@smoke Wallet lens: markers appear where a wallet was shared, and the card opens on it", async ({ context, request, consoleErrors }) => {
  await setPreset(request, "balanced");
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("https://dexscreener.com/wallets");

  const markers = page.locator(".tw-wallet-marker");
  await expect(markers).toHaveCount(3, { timeout: 20_000 });

  // One per place a wallet was shared: the raw address, the ENS name, the explorer link.
  for (const [index, label] of [
    "Inspect wallet 0x7f…17d1 with Tripwire",
    "Inspect wallet vitalik.eth with Tripwire",
    "Inspect wallet 0xd8…6045 with Tripwire",
  ].entries()) {
    await expect(markers.nth(index)).toHaveAccessibleName(label);
  }

  // The transaction hash, the bare `0x`, `docs.ethereum.org`, and both form fields: untouched.
  const clean = await page.evaluate(() => ({
    noise: document.querySelector("#noise")!.querySelectorAll("[data-tripwire-wallet]").length,
    typing: document.querySelector("#typing")!.querySelectorAll("[data-tripwire-wallet]").length,
    text: document.querySelector("#raw p")!.textContent,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(clean.noise).toBe(0);
  expect(clean.typing).toBe(0);
  // Splitting a text node must leave the sentence exactly as the page wrote it.
  expect(clean.text).toBe(`kept buying: ${LENS_WALLET} and never flinched`);
  expect(clean.overflow, "a marker never makes the host page scroll sideways").toBeLessThanOrEqual(0);

  // The card opens beside the marker, on <body>, with the wallet's own identity.
  const marker = page.getByRole("button", { name: /Inspect wallet 0x7f/ });
  await marker.click();
  const card = page.locator('.tw-pop[role="dialog"]');
  await expect(card).toBeVisible();
  await expect(card.locator(".tw-card-title")).toHaveText("0x7f…17d1", { timeout: 15_000 });
  await expect(card.getByRole("tab", { name: "Overview" })).toBeVisible();
  await expect(card.locator(".tw-card-footer")).not.toContainText("credits");

  // Hyperliquid shows the recorded position, and Polymarket its own tab.
  await card.getByRole("tab", { name: "Hyperliquid" }).click();
  const hl = card.getByRole("tabpanel").filter({ hasText: "Open positions" });
  await expect(hl).toContainText("Account value");
  await expect(hl.locator("table.tw-table tbody tr").first()).toBeVisible();
  await expect(card.getByRole("tab", { name: "Polymarket" })).toBeVisible();

  // Escape closes it and gives focus back to the marker that opened it.
  await page.keyboard.press("Escape");
  await expect(card).toHaveCount(0);
  await expect(marker).toHaveAttribute("aria-expanded", "false");

  // The ENS name resolves through the backend, not in the page.
  await page.getByRole("button", { name: /Inspect wallet vitalik\.eth/ }).click();
  await expect(page.locator(".tw-card-title")).toHaveText("vitalik.eth", { timeout: 15_000 });
  await expect(page.locator(".tw-addr-text")).toHaveText("0x7f…17d1");

  expect(consoleErrors).toEqual([]);
});

test("@smoke Strips say what is actually wrong, and wrap rather than clip", async ({ context, request, consoleErrors }) => {
  await setPreset(request, "balanced");
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });

  // 1. A destination outside coverage names the chain instead of reporting a failure.
  await page.goto("https://jumper.xyz/?fromChain=1&toChain=20000000000001&toToken=bitcoin");
  const strip = page.locator(".tw-strip");
  await expect(strip.locator(".tw-strip-finding")).toHaveText("No onchain data for Bitcoin", { timeout: 20_000 });
  await expect(strip).toHaveAttribute("data-verdict", "UNCHECKED");
  // Never a block: the Swap button still works.
  await expect(page.locator(".tw-block")).toHaveCount(0);

  // 2. Jumper's current Sui chain id is long; name it instead of clamping a numeric fallback.
  await page.goto("https://jumper.xyz/?fromChain=1&toChain=9270000000000000&toToken=sui");
  await expect(strip.locator(".tw-strip-finding")).toHaveText("No onchain data for Sui", { timeout: 20_000 });
  await expect(strip).toHaveAttribute("data-verdict", "UNCHECKED");
  await expect(page.locator(".tw-block")).toHaveCount(0);

  // 3. Uniswap's default page names no token in its URL, and its Buy slot is empty — so the
  // answer is about the token, not the network. (Round 1.4.9: this used to read "Select a
  // network to check ETH", which was wrong twice over — ETH was the Sell side, and the page
  // was showing a network.)
  await page.goto("https://app.uniswap.org/swap");
  await expect(strip.locator(".tw-strip-finding")).toHaveText("Select a token to see its onchain activity", { timeout: 20_000 });
  await expect(strip).toHaveAttribute("data-verdict", "UNCHECKED");

  // 3b. That reason is long, and it wraps to two lines instead of being cut off mid-word.
  const wrap = await strip.locator(".tw-strip-finding").evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      text: el.textContent ?? "",
      title: el.closest(".tw-strip")?.getAttribute("title") ?? "",
      clamp: style.webkitLineClamp,
      whiteSpace: style.whiteSpace,
      lines: Math.round(el.scrollHeight / parseFloat(style.lineHeight)),
      clippedSideways: el.scrollWidth > el.clientWidth + 1,
    };
  });
  expect(wrap.clamp).toBe("2");
  expect(wrap.whiteSpace).toBe("normal");
  expect(wrap.title).toBe(wrap.text);
  expect(wrap.lines, "the concise reason fits within the strip").toBeLessThanOrEqual(2);
  expect(wrap.clippedSideways, "the reason wraps rather than running off the side").toBe(false);
  // And the host page still never scrolls sideways because of us.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

  // 4. A ticker with no chain anywhere on the page must not be guarded on a guessed chain —
  // and must not be turned into an instruction either. Tripwire states its own limit.
  await page.evaluate(() => (window as unknown as { setBuyToken(s: string): void }).setBuyToken("WIF"));
  await expect(strip.locator(".tw-strip-finding")).toHaveText("Tripwire can't tell which network WIF is on", { timeout: 20_000 });
  await expect(page).toHaveURL("https://app.uniswap.org/swap");

  // 5. Round 1.4.9, the reported defect: a token chosen through the picker writes NOTHING to
  // the URL, and the only place its chain exists is the badge's own test id. Reading it turns a
  // wrong instruction into a real lookup on the chain the page is showing. (Replay's search
  // fixture holds two WIF contracts on Robinhood Chain, so the honest answer here is the
  // ambiguity — never "couldn't find WIF", which the data would contradict.)
  await page.evaluate(() => (window as unknown as { setBuyToken(s: string, c: number): void }).setBuyToken("WIF", 4663));
  await expect(strip.locator(".tw-strip-finding")).toHaveText("More than one WIF on Robinhood Chain — Tripwire can't tell which", { timeout: 20_000 });
  await expect(strip).toHaveAttribute("data-verdict", "UNCHECKED");
  await expect(page).toHaveURL("https://app.uniswap.org/swap");
  await expect(page.locator(".tw-block")).toHaveCount(0);

  // 6. A badge naming a chain Tripwire has no data for is a coverage answer, not a prompt.
  await page.evaluate(() => (window as unknown as { setBuyToken(s: string, c: number): void }).setBuyToken("UNI", 130));
  await expect(strip.locator(".tw-strip-finding")).toHaveText("No onchain data for UNI on Unichain", { timeout: 20_000 });

  // 7. Mid-render — label up, badge not yet — is neutral "Checking…", never a verdict about a
  // row that is still being drawn.
  await page.evaluate(() => (window as unknown as { setBuyTokenWithoutBadge(s: string): void }).setBuyTokenWithoutBadge("PEPE"));
  await expect(strip.locator(".tw-strip-finding")).toHaveText("Checking…", { timeout: 20_000 });
  await expect(strip).toHaveAttribute("data-verdict", "LOADING");

  expect(consoleErrors).toEqual([]);
});

test("@smoke the card is on screen before its data, with a skeleton per section", async ({ context, request, consoleErrors }) => {
  await setPreset(request, "balanced");
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 1000 });

  // Hold the panel call open, so the frame between the click and the data is observable at all.
  // The route goes on the *context*, not the page: the content script never fetches the backend
  // itself — the background service worker does, on its behalf.
  let release: (() => void) | null = null;
  const held = new Promise<void>((resolve) => (release = resolve));
  await context.route(`${BACKEND}/api/post-intel`, async (route) => {
    const body = route.request().postDataJSON() as { mode?: string };
    if (body?.mode === "panel") await held;
    await route.continue();
  });

  await page.goto("https://x.com/home");
  const chip = page.locator(".tw-chip");
  await expect(chip.locator(".tw-chip-key")).toHaveText(/\w/, { timeout: 20_000 });

  await chip.click();
  const card = page.locator('.tw-pop[role="dialog"] .tw-card');
  // The card is up while the panel request is still hanging: that is the whole point.
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("aria-busy", "true");
  // It already names the target the click knew about. The chip's own check resolved the mint
  // to its ticker before the click (Round 1.1.5), so the first frame says $WIF rather than a
  // base58 string it would replace a second later. The pill is the spinner, not a verdict word.
  await expect(card.locator(".tw-card-symbol")).toHaveText("$WIF");
  await expect(card.locator(".tw-card-plate")).toHaveText("Checking");
  // Every section reserves the height its content will take.
  const skeletons = card.locator(".tw-skeleton");
  expect(await skeletons.count()).toBeGreaterThan(1);
  const reserved = await card.locator(".tw-skeleton-row").first().evaluate((el) => el.getBoundingClientRect().height);
  expect(reserved).toBeGreaterThan(10);

  release!();
  // Then the real card, in the same element, with no second mount -- and the header keeps the
  // name it already had rather than changing it under the reader.
  await expect(card.locator(".tw-card-finding")).toHaveText(/\w/, { timeout: 20_000 });
  await expect(card.locator(".tw-card-symbol")).toHaveText("$WIF");
  await expect(card).not.toHaveAttribute("aria-busy", "true");
  await expect(card.locator(".tw-skeleton")).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});

test("@smoke the perp card expands, and its Traders tab loads from fixtures", async ({ context, request, consoleErrors }) => {
  await setPreset(request, "balanced");
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("https://app.hyperliquid.xyz/trade/ETH");

  // Tier 1 with an anchor: the strip sits above the order form's action, with a Details link.
  const strip = page.locator(".tw-strip");
  await expect(strip).toBeVisible({ timeout: 20_000 });
  await strip.locator(".tw-strip-details").click();

  const pop = page.locator('.tw-pop[role="dialog"]');
  await expect(pop).toBeVisible();
  await expect(pop).toHaveAttribute("data-size", "compact");
  await expect(pop).toHaveAttribute("aria-modal", "false");

  // Positioning is the first tab, and its free sections fill in: the cross-venue table.
  const venues = pop.locator(".tw-venue-table tbody tr");
  await expect(venues).toHaveCount(5, { timeout: 20_000 });
  // Every venue answered from its fixture, each under its own contract name. The rows are
  // ordered by open interest, which is data, so only the set is asserted here.
  expect((await pop.locator(".tw-venue-symbol").allTextContents()).sort()).toEqual(["ETH", "ETH-USD", "ETH-USDT-SWAP", "ETHUSDT", "ETHUSDT"]);
  for (const row of await venues.all()) {
    await expect(row.locator("td").first()).toHaveText(/%/);
  }
  // Hyperliquid and dYdX pay hourly; nothing may print their rate as if it were 8-hourly.
  const intervals = await pop.locator(".tw-venue-interval").allTextContents();
  expect(intervals.filter((t) => t === "1h").length).toBe(2);
  expect(intervals.filter((t) => t === "8h").length).toBe(3);

  // Expand: same card, centred, modal, on a backdrop.
  await pop.getByRole("button", { name: "Expand card" }).click();
  await expect(pop).toHaveAttribute("data-size", "expanded");
  await expect(pop).toHaveAttribute("aria-modal", "true");
  await expect(page.locator(".tw-pop-backdrop")).toBeVisible();
  const box = (await pop.boundingBox())!;
  expect(box.width).toBeGreaterThan(900);
  expect(box.height).toBeGreaterThan(600);

  // The Traders tab states its price before it is pressed, then loads its own rows.
  const traders = pop.getByRole("tab", { name: /Traders/ });
  await expect(traders.locator(".tw-tab-cost")).toHaveText("11 credits");
  await traders.click();
  const leaderboard = pop.locator('[role="tabpanel"]:not([hidden]) table').first();
  await expect(leaderboard.locator("tbody tr").first()).toBeVisible({ timeout: 20_000 });
  expect(await leaderboard.locator("tbody tr").count()).toBeGreaterThan(4);
  // Usage accounting belongs to the dashboard, not the floating card.
  await expect(pop.locator(".tw-card-footer")).not.toContainText("credits");

  // Collapse returns the card to its anchor rather than closing it.
  await pop.getByRole("button", { name: "Collapse card" }).click();
  await expect(pop).toHaveAttribute("data-size", "compact");
  await expect(page.locator(".tw-pop-backdrop")).toHaveCount(0);
  await expect(pop).toBeVisible();

  expect(consoleErrors).toEqual([]);
});
