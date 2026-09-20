import { useCallback, useEffect, useState } from "react";
import { presetChangeNeedsConfirm } from "@tripwire/core";
import { browser } from "wxt/browser";
import { getRules, health, setPreset } from "../../lib/api";
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

const DEFAULT_BACKEND_URL = "http://127.0.0.1:3000";
const BACKEND_URL_RE = /^http:\/\/(127\.0\.0\.1|localhost):\d{1,5}$/;

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
      const stored = (await browser.storage.local.get("backendUrl")) as { backendUrl?: string };
      const url = stored.backendUrl && stored.backendUrl.length > 0 ? stored.backendUrl : DEFAULT_BACKEND_URL;
      if (cancelled) return;
      setBackendUrl(url);
      setBackendUrlDraft(url);
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

      {settingsOpen ? (
        <div className="tw-settings">
          <label htmlFor="tw-backend-url">Backend URL</label>
          <input id="tw-backend-url" type="text" inputMode="url" spellCheck={false} value={backendUrlDraft} onChange={(e) => void saveBackendUrl(e.target.value)} />
          {backendUrlError ? <p className="tw-hint">{backendUrlError}</p> : null}
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

      <PopupFoot backendUrl={backendUrl} />
    </div>
  );
}
