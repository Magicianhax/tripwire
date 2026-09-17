import { useEffect, useState } from "react";
import { browser } from "wxt/browser";
import { getRules, health, setPreset } from "../../lib/api";
import type { KeySource } from "../../lib/api-types";
import { popupStatus } from "./status";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:3000";
const BACKEND_URL_RE = /^http:\/\/(127\.0\.0\.1|localhost):\d{1,5}$/;
const PRESETS = ["degen", "balanced", "paranoid"] as const;
type Preset = (typeof PRESETS)[number];
const PRESET_LABELS: Record<Preset, string> = { degen: "Degen", balanced: "Balanced", paranoid: "Paranoid" };

export default function App() {
  const [healthState, setHealthState] = useState<{ ok: true; keySource: KeySource } | { ok: false } | null>(null);
  const [preset, setPresetState] = useState<Preset | "custom" | null>(null);
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
      setHealthState(result.ok ? { ok: true, keySource: result.data.keySource } : { ok: false });
    })();
    (async () => {
      const result = await getRules();
      if (cancelled) return;
      if (result.ok) setPresetState(result.data.preset);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function choosePreset(next: Preset) {
    setPresetState(next);
    const result = await setPreset(next);
    if (result.ok) setPresetState(result.data.preset);
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
      <h1 className="tw-wordmark">TRIPWIRE</h1>
      <p className="tw-status" data-state={statusState} role="status" aria-live="polite">
        {statusText}
      </p>

      <div className="tw-segmented" role="group" aria-label="Rules preset">
        {PRESETS.map((p) => (
          <button key={p} type="button" aria-pressed={preset === p} onClick={() => choosePreset(p)}>
            {PRESET_LABELS[p]}
          </button>
        ))}
      </div>

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
