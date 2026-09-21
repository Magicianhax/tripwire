import { useCallback, useEffect, useState } from "react";
import { presetChangeNeedsConfirm } from "@tripwire/core";
import { browser } from "wxt/browser";
import { getRules, health, setPreset } from "../../lib/api";
import { BACKEND_URL_RE, DEFAULT_BACKEND_URL } from "../../lib/backend";
import type { KeySource, RulesResponse } from "../../lib/api-types";
import { listEnabledSites, removeSite, requestSite } from "../../lib/permissions";
import { forgetWallets, readRecent, type RecentWallet } from "../../lib/recent-wallets";
import { Tabs } from "../../lib/ui/Tabs";
import { LOCATE_MESSAGE } from "../venues.content/locate";
import { hereFrom, type Here } from "./here";
import { ProtectionTab, type Preset } from "./ProtectionTab";
import { PopupFoot, PopupHead } from "./shell";
import { SitesTab } from "./SitesTab";
import { popupStatus } from "./status";
import { WalletsTab } from "./WalletsTab";


/** Said when the active tab's content script has nothing mounted — or is not there at all.
 * Both are the same fact for the user, and neither is worth two different sentences. */
const NOTHING_MOUNTED = "Tripwire isn't showing anything on this tab.";

const hostOf = (origin: string) => {
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
};

/**
 * The toolbar popup: a pinned header, three tabs and a pinned footer inside a fixed 420px box.
 *
 * Nothing here spends a Nansen credit. Opening it makes exactly two reads of the *local*
 * backend — health and rules — and changing tab makes none: every panel is
 * already in the DOM and none of them fetches on show.
 */
export default function App() {
  const [healthState, setHealthState] = useState<{ ok: true; keySource: KeySource; replay: boolean } | { ok: false } | null>(null);
  const [allowance, setAllowance] = useState<{ used: number; cap: number } | null>(null);
  const [userKey, setUserKey] = useState("");
  const [userKeySaved, setUserKeySaved] = useState(false);
  const [installToken, setInstallToken] = useState<string | null>(null);
  // The server-confirmed rules: what "weaker" is measured against. null until loaded.
  const [rules, setRulesState] = useState<RulesResponse | null>(null);
  const [preset, setPresetState] = useState<Preset | "custom" | null>(null);
  const [pendingPreset, setPendingPreset] = useState<Preset | null>(null);
  const [saving, setSaving] = useState(false);
  const [presetError, setPresetError] = useState("");
  const [backendUrl, setBackendUrl] = useState(DEFAULT_BACKEND_URL);
  const [backendUrlDraft, setBackendUrlDraft] = useState(DEFAULT_BACKEND_URL);
  const [backendUrlError, setBackendUrlError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [locateNote, setLocateNote] = useState("");
  const [sites, setSites] = useState<string[] | null>(null);
  const [tabUrl, setTabUrl] = useState<string | undefined>(undefined);
  const [recent, setRecent] = useState<RecentWallet[]>([]);
  const [siteError, setSiteError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = (await browser.storage.local.get(["backendUrl", "nansenKey", "installTokens"])) as {
        backendUrl?: string;
        nansenKey?: string;
        installTokens?: Record<string, string>;
      };
      const url = stored.backendUrl && BACKEND_URL_RE.test(stored.backendUrl) ? stored.backendUrl : DEFAULT_BACKEND_URL;
      if (cancelled) return;
      setBackendUrl(url);
      setBackendUrlDraft(url);
      setUserKey(stored.nansenKey ?? "");
      setInstallToken(stored.installTokens?.[url] ?? null);
      setUserKeySaved(Boolean(stored.nansenKey));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await health();
      if (cancelled) return;
      setHealthState(result.ok ? { ok: true, keySource: result.data.keySource, replay: result.data.replay } : { ok: false });
      // The health call is what mints the install token on first run, so the one read at open
      // can predate it; read it again now the call has settled.
      const { backendUrl: storedUrl, installTokens } = (await browser.storage.local.get(["backendUrl", "installTokens"])) as {
        backendUrl?: string;
        installTokens?: Record<string, string>;
      };
      if (cancelled) return;
      const url = storedUrl && BACKEND_URL_RE.test(storedUrl) ? storedUrl : DEFAULT_BACKEND_URL;
      setInstallToken(installTokens?.[url] ?? null);
      // An older backend may not report an allowance; show nothing rather than a wrong number.
      if (result.ok && Number.isFinite(result.data.creditsToday) && Number.isFinite(result.data.cap)) {
        setAllowance({ used: result.data.creditsToday, cap: result.data.cap });
      }
    })();
    (async () => {
      const result = await getRules();
      if (cancelled) return;
      if (result.ok) {
        setRulesState(result.data);
        setPresetState(result.data.preset);
      } else {
        setPresetError("Couldn't load rules. Is the backend running?");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshSites = useCallback(async () => {
    setSites(await listEnabledSites());
  }, []);

  useEffect(() => {
    void refreshSites();
    void readRecent().then(setRecent);
    (async () => {
      try {
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        setTabUrl(tab?.url);
      } catch {
        setTabUrl(undefined);
      }
    })();
  }, [refreshSites]);

  const here: Here = hereFrom(tabUrl, sites);

  /** Stronger or same preset: save straight away. Weaker: ask inline first (never
   * window.confirm), matching /rules. The server logs every downgrade either way. */
  function choosePreset(next: Preset) {
    setPresetError("");
    if (presetChangeNeedsConfirm(rules, next)) {
      setPendingPreset(next);
      return;
    }
    setPendingPreset(null);
    void savePreset(next);
  }

  async function savePreset(next: Preset) {
    const previous = preset;
    setPendingPreset(null);
    setSaving(true);
    setPresetState(next); // optimistic
    const result = await setPreset(next);
    setSaving(false);
    if (result.ok) {
      setRulesState(result.data);
      setPresetState(result.data.preset);
      return;
    }
    setPresetState(previous); // roll back
    setPresetError(result.status === 0 ? "Preset not saved: backend offline." : `Preset not saved: ${result.error || "request failed"}.`);
  }

  async function saveBackendUrl(next: string) {
    setBackendUrlDraft(next);
    if (!BACKEND_URL_RE.test(next)) {
      setBackendUrlError("Use http://127.0.0.1:<port> or http://localhost:<port>");
      return;
    }
    setBackendUrlError("");
    setBackendUrl(next);
    await browser.storage.local.set({ backendUrl: next });
  }

  async function resetBackendUrl() {
    setBackendUrlError("");
    setBackendUrl(DEFAULT_BACKEND_URL);
    setBackendUrlDraft(DEFAULT_BACKEND_URL);
    await browser.storage.local.remove("backendUrl");
  }

  /** The user's own key stays in this browser profile and is sent per request; never stored by
   * the backend. An empty field removes it. */
  async function saveUserKey() {
    const key = userKey.trim();
    if (key) await browser.storage.local.set({ nansenKey: key });
    else await browser.storage.local.remove("nansenKey");
    setUserKeySaved(Boolean(key));
  }

  const limitReached = !userKeySaved && allowance !== null && allowance.cap > 0 && allowance.used >= allowance.cap;
  const selfHosted = backendUrl !== DEFAULT_BACKEND_URL;

  /**
   * "Show me where it is" — the answer for a user who cannot find the verdict on a dense page.
   * Asks the active tab's content scripts to light whatever they have mounted: the venue strip,
   * an X post's chip, a wallet-lens marker. Only the one that found something answers, so the
   * first reply is a real find; a tab where nothing is mounted (or no content script runs at
   * all) never answers, the message rejects, and that is the same honest answer.
   */
  async function locate() {
    setLocateNote("");
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      const found = tab?.id === undefined ? false : await browser.tabs.sendMessage(tab.id, { type: LOCATE_MESSAGE });
      setLocateNote(found ? "Highlighted on the page." : NOTHING_MOUNTED);
    } catch {
      setLocateNote(NOTHING_MOUNTED);
    }
  }

  async function enableHere() {
    if (!here.origin) return;
    setSiteError("");
    const granted = await requestSite(here.origin).catch(() => false);
    if (!granted) {
      setSiteError(`${hostOf(here.origin)} wasn't enabled: the browser declined the permission.`);
      return;
    }
    await refreshSites();
  }

  async function disableSite(site: string) {
    setSiteError("");
    if (!(await removeSite(site).catch(() => false))) {
      setSiteError(`${hostOf(site)} couldn't be turned off. Remove it from the browser's extension settings.`);
      return;
    }
    await refreshSites();
  }

  return (
    <div className="tw-popup">
      <PopupHead status={popupStatus(healthState)} settingsOpen={settingsOpen} onToggleSettings={() => setSettingsOpen((open) => !open)} />

      {limitReached && !settingsOpen ? (
        <div className="tw-limit" role="status">
          <p>You've used today's free checks. They reset at midnight UTC.</p>
          <button type="button" className="tw-link-button" onClick={() => setSettingsOpen(true)}>
            Use your own Nansen key
          </button>
        </div>
      ) : null}

      {settingsOpen ? (
        <div className="tw-settings">
          <label htmlFor="tw-user-key">Your Nansen API key (optional)</label>
          <div className="tw-settings-row">
            <input
              id="tw-user-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="Only needed past the daily limit"
              value={userKey}
              onChange={(e) => {
                setUserKey(e.target.value);
                setUserKeySaved(false);
              }}
            />
            <button type="button" className="tw-link-button" onClick={() => void saveUserKey()}>
              {userKey.trim() ? "Save" : "Remove"}
            </button>
          </div>
          <p className="tw-note">
            {userKeySaved ? "Using your key: checks spend your Nansen credits, with no daily limit." : "Stays in this browser. Sent with each check, never stored by Tripwire."}
          </p>
          {allowance && !userKeySaved && !selfHosted ? (
            <p className="tw-note">
              {allowance.used.toLocaleString()} of {allowance.cap.toLocaleString()} free credits used today
            </p>
          ) : null}

          <details className="tw-advanced" open={selfHosted}>
            <summary>Advanced: self-hosted backend</summary>
            <label htmlFor="tw-backend-url">Backend URL</label>
            <div className="tw-settings-row">
              <input id="tw-backend-url" type="text" inputMode="url" spellCheck={false} value={backendUrlDraft} onChange={(e) => void saveBackendUrl(e.target.value)} />
              {selfHosted ? (
                <button type="button" className="tw-link-button" onClick={() => void resetBackendUrl()}>
                  Reset
                </button>
              ) : null}
            </div>
            {backendUrlError ? <p className="tw-hint">{backendUrlError}</p> : null}
          </details>
        </div>
      ) : null}

      <Tabs
        label="Tripwire"
        tabs={[
          {
            id: "protection",
            label: "Protection",
            content: (
              <ProtectionTab
                preset={preset}
                pending={pendingPreset}
                busy={saving}
                error={presetError}
                onChoose={choosePreset}
                onConfirm={() => {
                  if (pendingPreset) void savePreset(pendingPreset);
                }}
                onCancel={() => setPendingPreset(null)}
                here={here}
                locateNote={locateNote}
                onLocate={() => void locate()}
              />
            ),
          },
          {
            id: "sites",
            label: "Sites",
            content: <SitesTab here={here} sites={sites} error={siteError} onEnable={() => void enableHere()} onDisable={(site) => void disableSite(site)} />,
          },
          {
            id: "wallets",
            label: "Wallets",
            content: <WalletsTab recent={recent} onClear={() => void forgetWallets().then(() => readRecent()).then(setRecent)} />,
          },
        ]}
      />

      <PopupFoot backendUrl={backendUrl} token={selfHosted ? null : installToken} />
    </div>
  );
}
