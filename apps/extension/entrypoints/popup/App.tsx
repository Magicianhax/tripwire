import { useEffect, useState } from "react";
import { presetChangeNeedsConfirm } from "@tripwire/core";
import { browser } from "wxt/browser";
import { getRules, health, setPreset } from "../../lib/api";
import type { KeySource, RulesResponse } from "../../lib/api-types";
import { popupStatus } from "./status";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:3000";
const BACKEND_URL_RE = /^http:\/\/(127\.0\.0\.1|localhost):\d{1,5}$/;
const PRESETS = ["degen", "balanced", "paranoid"] as const;
type Preset = (typeof PRESETS)[number];
const PRESET_LABELS: Record<Preset, string> = { degen: "Degen", balanced: "Balanced", paranoid: "Paranoid" };

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

  const { text: statusText, state: statusState } = popupStatus(healthState);

  return (
    <div className="tw-popup">
      <header className="tw-popup-head">
        <h1 className="tw-wordmark">TRIPWIRE</h1>
        <p className="tw-status" data-state={statusState} role="status" aria-live="polite">
          {statusText}
        </p>
      </header>

      <p className="tw-field-label" id="tw-preset-label">
        Rules preset
      </p>
      <div className="tw-segmented" role="group" aria-labelledby="tw-preset-label" aria-busy={rules === null || saving}>
        {PRESETS.map((p) => (
          <button key={p} type="button" aria-pressed={preset === p} disabled={rules === null || saving} onClick={() => choosePreset(p)}>
            {PRESET_LABELS[p]}
          </button>
        ))}
      </div>
      {pendingPreset ? (
        <div className="tw-confirm-row" role="alert">
          <p className="tw-confirm-text">Switch to {PRESET_LABELS[pendingPreset]}? This lowers or removes blocks.</p>
          <div className="tw-confirm-actions">
            <button type="button" className="tw-button-danger" onClick={() => void savePreset(pendingPreset)}>
              Confirm
            </button>
            <button type="button" className="tw-button-quiet" onClick={() => setPendingPreset(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {presetError ? (
        <p className="tw-field-hint" role="status">
          {presetError}
        </p>
      ) : null}

      <ul className="tw-links">
        <li>
          <a href={`${backendUrl}/rules`} target="_blank" rel="noopener noreferrer">
            Rules
          </a>
        </li>
        <li>
          <a href={`${backendUrl}/ledger`} target="_blank" rel="noopener noreferrer">
            Ledger
          </a>
        </li>
        <li>
          <a href={`${backendUrl}/history`} target="_blank" rel="noopener noreferrer">
            History
          </a>
        </li>
      </ul>

      <div className="tw-field">
        <label htmlFor="tw-backend-url">Backend URL</label>
        <input
          id="tw-backend-url"
          type="text"
          inputMode="url"
          spellCheck={false}
          value={backendUrlDraft}
          onChange={(e) => saveBackendUrl(e.target.value)}
        />
        <p className="tw-field-hint">{backendUrlError}</p>
      </div>
    </div>
  );
}
