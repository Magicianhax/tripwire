import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { createBridge, createMessageListener } from "../lib/bridge";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:3000";

async function getBackendUrl(): Promise<string> {
  const stored = (await browser.storage.local.get("backendUrl")) as { backendUrl?: string };
  return stored.backendUrl && stored.backendUrl.length > 0 ? stored.backendUrl : DEFAULT_BACKEND_URL;
}

async function setBadge(status: number): Promise<void> {
  if (status === 0) {
    await browser.action.setBadgeBackgroundColor({ color: "#FFD400" });
    await browser.action.setBadgeText({ text: "!" });
    if (browser.action.setBadgeTextColor) {
      await browser.action.setBadgeTextColor({ color: "#0B0B0B" });
    }
  } else {
    await browser.action.setBadgeText({ text: "" });
  }
}

export default defineBackground(() => {
  const bridge = createBridge({ fetchImpl: fetch, getBackendUrl });

  browser.runtime.onMessage.addListener(
    createMessageListener({
      handle: bridge.handle,
      runtimeId: browser.runtime.id,
      onResponse: (response) => void setBadge(response.status),
    }),
  );
});
