"use client";

import { useState } from "react";
import type { PresetName, Rule, TargetKind } from "@tripwire/core";
import type { RulesState } from "@/lib/store";
import { displayValue, splitSentence, storedThreshold } from "./rule-text";
import { isWeakerPreset, weakensRules } from "./weaken";

const PRESET_NAMES: PresetName[] = ["degen", "balanced", "paranoid"];
const PRESET_LABEL: Record<PresetName, string> = { degen: "Degen", balanced: "Balanced", paranoid: "Paranoid" };

const GROUPS: { kind: TargetKind; label: string }[] = [
  { kind: "spot", label: "Spot" },
  { kind: "perp", label: "Perps" },
  { kind: "prediction", label: "Prediction markets" },
];

type Status = { kind: "idle" | "saving" | "saved" | "error"; message?: string };
type PutBody = { preset: PresetName } | { rules: Rule[] };

/** Inline "are you sure" row for a change that lowers or removes blocks. No window.confirm:
 * a native dialog can't be styled and is trivially auto-accepted by a framing page's script. */
function WeakenConfirm({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="tw-confirm-row" role="alert">
      <p className="tw-confirm-text">Weaken protection? This lowers or removes blocks.</p>
      <button type="button" className="tw-button tw-button-danger" onClick={onConfirm}>
        Confirm
      </button>
      <button type="button" className="tw-button tw-button-quiet" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

export function RulesEditor({ initial }: { initial: RulesState }) {
  const [rules, setRules] = useState<Rule[]>(initial.rules);
  const [preset, setPreset] = useState<RulesState["preset"]>(initial.preset);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // The last state the server confirmed: what "weaker" is measured against.
  const [savedRules, setSavedRules] = useState<Rule[]>(initial.rules);
  const [pendingWeaken, setPendingWeaken] = useState<PutBody | null>(null);

  /** Saves straight away, unless the change lowers protection: then asks inline first. */
  function requestPut(body: PutBody) {
    const weaker = "preset" in body ? isWeakerPreset(preset, body.preset, savedRules) : weakensRules(savedRules, body.rules);
    if (weaker) {
      setPendingWeaken(body);
      return;
    }
    setPendingWeaken(null);
    void putRules(body);
  }

  async function putRules(body: PutBody) {
    setStatus({ kind: "saving" });
    try {
      const res = await fetch("/api/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setStatus({ kind: "error", message: (data?.message as string) ?? (data?.error as string) ?? `Save failed (${res.status})` });
        return;
      }
      const data = (await res.json()) as RulesState;
      setRules(data.rules);
      setSavedRules(data.rules);
      setPreset(data.preset);
      setStatus({ kind: "saved" });
    } catch {
      setStatus({ kind: "error", message: "Network error — is the backend running?" });
    }
  }

  function updateRule(id: string, patch: Partial<Rule>) {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  const saving = status.kind === "saving";

  return (
    <>
      <section className="tw-section">
        <h1 className="tw-display">Rules</h1>
      </section>

      <section className="tw-section">
        <div className="tw-segmented" role="group" aria-label="Rule preset">
          {PRESET_NAMES.map((name) => (
            <button
              key={name}
              type="button"
              className="tw-segment"
              aria-pressed={preset === name}
              onClick={() => requestPut({ preset: name })}
              disabled={saving}
            >
              {PRESET_LABEL[name]}
            </button>
          ))}
          {preset === "custom" && (
            <button type="button" className="tw-segment" aria-pressed="true" disabled>
              Custom
            </button>
          )}
        </div>
        {pendingWeaken && "preset" in pendingWeaken ? (
          <WeakenConfirm
            onConfirm={() => {
              setPendingWeaken(null);
              void putRules(pendingWeaken);
            }}
            onCancel={() => setPendingWeaken(null)}
          />
        ) : null}
      </section>

      {GROUPS.map((g) => {
        const groupRules = rules.filter((r) => r.kind === g.kind);
        if (groupRules.length === 0) return null;
        return (
          <section className="tw-section tw-rule-group" key={g.kind}>
            <h2 className="tw-h2">{g.label}</h2>
            {groupRules.map((rule) => {
              const { before, after, isUsd } = splitSentence(rule.text);
              const shownValue = displayValue(rule);
              const inputId = `rule-${rule.id}`;
              return (
                <div className="tw-rule-row" key={rule.id}>
                  <label className="tw-rule-toggle" htmlFor={`${inputId}-enabled`}>
                    <input
                      id={`${inputId}-enabled`}
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={(e) => updateRule(rule.id, { enabled: e.target.checked })}
                    />
                    On
                  </label>
                  <span className="tw-rule-sentence">
                    {before}
                    {isUsd && "$"}
                    <input
                      id={inputId}
                      className="tw-input-number"
                      type="number"
                      step="1"
                      min="0"
                      value={shownValue}
                      onChange={(e) => {
                        const parsed = Number(e.target.value);
                        if (!Number.isFinite(parsed)) return;
                        updateRule(rule.id, { threshold: storedThreshold(rule.signal, parsed) });
                      }}
                      aria-label={`Threshold for: ${rule.text}`}
                    />
                    {after}
                  </span>
                  <select
                    className="tw-rule-select"
                    value={rule.action}
                    onChange={(e) => updateRule(rule.id, { action: e.target.value as Rule["action"] })}
                    aria-label={`Action for: ${rule.text}`}
                  >
                    <option value="warn">warn</option>
                    <option value="block">block</option>
                  </select>
                </div>
              );
            })}
          </section>
        );
      })}

      <div className="tw-save-row">
        <button type="button" className="tw-button" onClick={() => requestPut({ rules })} disabled={saving}>
          Save
        </button>
        <p
          className="tw-status-message"
          role="status"
          aria-live="polite"
          data-kind={status.kind === "error" ? "error" : status.kind === "saved" ? "saved" : undefined}
        >
          {status.kind === "saving" && "Saving…"}
          {status.kind === "saved" && "Saved"}
          {status.kind === "error" && (status.message ?? "Something went wrong.")}
        </p>
      </div>
      {pendingWeaken && "rules" in pendingWeaken ? (
        <WeakenConfirm
          onConfirm={() => {
            setPendingWeaken(null);
            void putRules(pendingWeaken);
          }}
          onCancel={() => setPendingWeaken(null)}
        />
      ) : null}
    </>
  );
}
