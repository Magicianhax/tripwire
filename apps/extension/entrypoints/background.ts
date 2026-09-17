import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { createBridge, createMessageListener } from "../lib/bridge";
import { syncWalletScripts } from "../lib/permissions";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:3000";

async function getBackendUrl(): Promise<string> {
  const stored = (await browser.storage.local.get("backendUrl")) as { backendUrl?: string };
  return stored.backendUrl && stored.backendUrl.length > 0 ? stored.backendUrl : DEFAULT_BACKEND_URL;
}

async function setBadge(status: number): Promise<void> {
  if (status === 0) {
    await browser.action.setBadgeBackgroundColor({ color: "#FFB020" });
    await browser.action.setBadgeText({ text: "!" });
    if (browser.action.setBadgeTextColor) {
      await browser.action.setBadgeTextColor({ color: "#0A1020" });
    }
  } else {
    await browser.action.setBadgeText({ text: "" });
  }
}

export default defineBackground(() => {
  const bridge = createBridge({ fetchImpl: fetch, getBackendUrl });

  // Keep the wallet content script registered for exactly the sites the user has granted. This
  // runs on install, on every browser start, and whenever a permission is added or revoked —
  // including from Chrome's own extension settings, which never tells the extension directly.
  const sync = () => void syncWalletScripts().catch(() => {});
  sync();
  browser.runtime.onInstalled.addListener(sync);
  browser.runtime.onStartup.addListener(sync);
  browser.permissions.onAdded.addListener(sync);
  browser.permissions.onRemoved.addListener(sync);

  browser.runtime.onMessage.addListener(
    createMessageListener({
      handle: bridge.handle,
      runtimeId: browser.runtime.id,
      onResponse: (response) => void setBadge(response.status),
    }),
  );
});
