import type { APIRequestContext, Page } from "@playwright/test";
import { TRIPWIRE_EXTENSION_ID } from "../../../packages/core/src/constants";
import { BACKEND, BONK, expect, test, WIF } from "./fixtures";

const EXTENSION_ORIGIN = `chrome-extension://${TRIPWIRE_EXTENSION_ID}`;

/** Sets the rules preset the way the popup does: a PUT carrying the pinned extension Origin. */
async function setPreset(request: APIRequestContext, preset: "balanced" | "paranoid") {
  const res = await request.put(`${BACKEND}/api/rules`, { headers: { origin: EXTENSION_ORIGIN }, data: { preset } });
  expect(res.status(), `PUT /api/rules ${preset}`).toBe(200);
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
  await setPreset(request, "paranoid");
  // Precondition, straight from the backend: the recorded WIF data trips a paranoid block rule.
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
  await expect(popup.locator(".tw-status")).toHaveText(/Backend connected|No Nansen key/);
  await expect(popup.locator(".tw-status")).not.toHaveText(/offline/i);
  expect(consoleErrors).toEqual([]);
});

test("@smoke X: the contract-address tweet gets a verdict chip, and clicking it opens the panel", async ({ context, consoleErrors }) => {
  const page = await context.newPage();
  await page.goto("https://x.com/home");
  const chip = page.locator(".tw-chip");
  await expect(chip.locator(".tw-chip-key")).toHaveText(/^(TRIPWIRE|CAUTION|Clear|Unchecked)$/, { timeout: 10_000 });
  await expect(chip).toHaveCount(1); // the plain-text tweet gets no chip
  await expect(chip.locator(".tw-replay-badge")).toHaveText("Replay");

  await chip.click();
  await expect(page.locator(".tw-panel")).toBeVisible();
  await expect(chip).toHaveAttribute("aria-expanded", "true");
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
