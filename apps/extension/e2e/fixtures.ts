import path from "node:path";
import { fileURLToPath } from "node:url";
import { test as base, chromium, type BrowserContext, type Page } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_DIR = path.resolve(here, "..", ".output", "chrome-mv3");
const PAGES = path.join(here, "pages");

export const BACKEND = "http://127.0.0.1:3000";
export const WIF = "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm";
export const BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";

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
