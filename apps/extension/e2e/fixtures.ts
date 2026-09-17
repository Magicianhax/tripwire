import path from "node:path";
import { fileURLToPath } from "node:url";
import { test as base, chromium, type BrowserContext, type Page } from "@playwright/test";
import { E2E_PORT } from "./port";

const here = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_DIR = path.resolve(here, "..", ".output", "chrome-mv3");
const PAGES = path.join(here, "pages");

export const BACKEND = `http://127.0.0.1:${E2E_PORT}`;
export const WIF = "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm";
export const BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
/** Base WBTC, the token from the jumper.xyz report. */
export const WBTC_BASE = "0x0555E30da8f98308EdB960aa94C0Db47230d2B9c";
/** The wallet every wallet-lens fixture was recorded against, and the one replay resolves
 * every ENS name to. */
export const LENS_WALLET = "0x7fdafde5cfb5465924316eced2d3715494c517d1";

type Fixtures = {
  context: BrowserContext;
  extensionId: string;
  /** Console errors and uncaught page errors seen on every page of the context. */
  consoleErrors: string[];
};

export const test = base.extend<Fixtures>({
  // The bundled Chromium (channel "chromium") is the build that honours --load-extension,
  // including headless. X and Jupiter are served from local fixtures, so the content scripts
  // run on their real URLs with no network.
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      args: [`--disable-extensions-except=${EXTENSION_DIR}`, `--load-extension=${EXTENSION_DIR}`],
    });
    await context.route("https://x.com/**", (route) =>
      route.fulfill({ path: path.join(PAGES, "x-timeline.html"), contentType: "text/html; charset=utf-8" }),
    );
    await context.route("https://jup.ag/**", (route) =>
      route.fulfill({ path: path.join(PAGES, "jupiter.html"), contentType: "text/html; charset=utf-8" }),
    );
    await context.route("https://jumper.xyz/**", (route) =>
      route.fulfill({ path: path.join(PAGES, "jumper.html"), contentType: "text/html; charset=utf-8" }),
    );
    await context.route("https://app.uniswap.org/**", (route) =>
      route.fulfill({ path: path.join(PAGES, "uniswap.html"), contentType: "text/html; charset=utf-8" }),
    );
    // The perp venue: a trade page whose order form the adapter reads, for the perp card.
    await context.route("https://app.hyperliquid.xyz/**", (route) =>
      route.fulfill({ path: path.join(PAGES, "hyperliquid.html"), contentType: "text/html; charset=utf-8" }),
    );
    // A page of wallet mentions, for the wallet lens. Served on a host the manifest already
    // covers, so the run exercises the content script without granting an optional permission.
    await context.route("https://dexscreener.com/**", (route) =>
      route.fulfill({ path: path.join(PAGES, "wallets.html"), contentType: "text/html; charset=utf-8" }),
    );
    // Point the extension at the e2e backend before any page can call it (the popup's
    // "Backend URL" setting, stored where the background bridge reads it).
    let [worker] = context.serviceWorkers();
    worker ??= await context.waitForEvent("serviceworker");
    await worker.evaluate(async (backendUrl) => {
      await (globalThis as unknown as { chrome: { storage: { local: { set(v: object): Promise<void> } } } }).chrome.storage.local.set({ backendUrl });
    }, BACKEND);
    await use(context);
    await context.close();
  },

  extensionId: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    worker ??= await context.waitForEvent("serviceworker");
    await use(new URL(worker.url()).host);
  },

  consoleErrors: async ({ context }, use) => {
    const errors: string[] = [];
    const watch = (page: Page) => {
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(`${page.url()}: ${msg.text()}`);
      });
      page.on("pageerror", (err) => errors.push(`${page.url()}: ${err.message}`));
    };
    context.pages().forEach(watch);
    context.on("page", watch);
    await use(errors);
  },
});

export { expect } from "@playwright/test";
