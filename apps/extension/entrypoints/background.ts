import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { createInstallTokens, readBackendUrl, readUserKey, type Store } from "../lib/backend";
import { createBridge, createMessageListener } from "../lib/bridge";
import { syncWalletScripts } from "../lib/permissions";

const store: Store = {
  get: (keys) => browser.storage.local.get(keys) as Promise<Record<string, unknown>>,
  set: (items) => browser.storage.local.set(items),
};
const tokens = createInstallTokens(store, fetch);

async function headersFor(backendUrl: string): Promise<Record<string, string>> {
  const [token, userKey] = await Promise.all([tokens.get(backendUrl), readUserKey(store)]);
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (userKey) headers["X-Nansen-Key"] = userKey;
  return headers;
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
  const bridge = createBridge({
    fetchImpl: fetch,
    getBackendUrl: () => readBackendUrl(store),
    getHeaders: headersFor,
    onUnauthorized: (backendUrl) => tokens.forget(backendUrl),
  });

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
