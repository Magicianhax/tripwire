"use client";

import { useState } from "react";
import type { PresetName, Rule, SignalId, TargetKind } from "@tripwire/core";
import type { RulesState } from "@/lib/store";

const PRESET_NAMES: PresetName[] = ["degen", "balanced", "paranoid"];
const PRESET_LABEL: Record<PresetName, string> = { degen: "Degen", balanced: "Balanced", paranoid: "Paranoid" };

const GROUPS: { kind: TargetKind; label: string }[] = [
  { kind: "spot", label: "Spot" },
  { kind: "perp", label: "Perps" },
  { kind: "prediction", label: "Prediction markets" },
];

// exit_pressure and sm_netflow_24h are always expressed as a negative threshold; the
// editor shows the magnitude and re-applies the sign on save.
const NEGATIVE_SIGNALS: SignalId[] = ["exit_pressure", "sm_netflow_24h"];
const isNegativeSignal = (signal: SignalId) => NEGATIVE_SIGNALS.includes(signal);

function splitSentence(text: string): { before: string; after: string; isUsd: boolean } {
  const isUsd = text.includes("${n}");
  const token = isUsd ? "${n}" : "{n}";
  const idx = text.indexOf(token);
  if (idx === -1) return { before: text, after: "", isUsd: false };
  return { before: text.slice(0, idx), after: text.slice(idx + token.length), isUsd };
}

type Status = { kind: "idle" | "saving" | "saved" | "error"; message?: string };

export function RulesEditor({ initial }: { initial: RulesState }) {
  const [rules, setRules] = useState<Rule[]>(initial.rules);
  const [preset, setPreset] = useState<RulesState["preset"]>(initial.preset);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function putRules(body: { preset: PresetName } | { rules: Rule[] }) {
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
              onClick={() => putRules({ preset: name })}
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
      </section>

      {GROUPS.map((g) => {
        const groupRules = rules.filter((r) => r.kind === g.kind);
        if (groupRules.length === 0) return null;
        return (
          <section className="tw-section tw-rule-group" key={g.kind}>
            <h2 className="tw-h2">{g.label}</h2>
            {groupRules.map((rule) => {
              const { before, after, isUsd } = splitSentence(rule.text);
              const negative = isNegativeSignal(rule.signal);
              const displayValue = negative ? Math.abs(rule.threshold) : rule.threshold;
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
                      value={displayValue}
                      onChange={(e) => {
                        const parsed = Number(e.target.value);
                        if (!Number.isFinite(parsed)) return;
                        updateRule(rule.id, { threshold: negative ? -Math.abs(parsed) : parsed });
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
        <button type="button" className="tw-button" onClick={() => putRules({ rules })} disabled={saving}>
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
    </>
  );
}
