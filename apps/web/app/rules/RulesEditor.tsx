"use client";

import { useState } from "react";
import { Check, CircleAlert, LoaderCircle, TriangleAlert } from "lucide-react";
import { usd, type PresetName, type Rule, type TargetKind } from "@tripwire/core";
import type { RulesState } from "@/lib/store";
import { displayValue, formatThresholdInput, parseThresholdInput, splitSentence, storedThreshold } from "./rule-text";
import { describeRule, isWeakerPreset, weakensRules } from "@tripwire/core";

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
      <TriangleAlert className="tw-confirm-icon" size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
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

/** Threshold field: grouped digits ("100,000") at rest, the raw number while editing. Text input
 * with a numeric keyboard, since a number input can't show grouping. */
function ThresholdInput({ id, value, label, onChange }: { id: string; value: number; label: string; onChange: (n: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      id={id}
      className="tw-input-number"
      type="text"
      inputMode="numeric"
      autoComplete="off"
      spellCheck={false}
      value={draft ?? formatThresholdInput(value)}
      onFocus={() => setDraft(String(value))}
      onBlur={() => setDraft(null)}
      onChange={(e) => {
        setDraft(e.target.value);
        const parsed = parseThresholdInput(e.target.value);
        if (parsed !== null) onChange(parsed);
      }}
      aria-label={label}
    />
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
            <div className="tw-rule-rows">
              {groupRules.map((rule) => {
                const { before, after, isUsd } = splitSentence(rule.text);
                const shownValue = displayValue(rule);
                const inputId = `rule-${rule.id}`;
                const described = describeRule(rule, usd);
                return (
                  <div className="tw-rule-row" key={rule.id} data-enabled={rule.enabled}>
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
                      <select
                        className="tw-rule-select"
                        value={rule.action}
                        onChange={(e) => updateRule(rule.id, { action: e.target.value as Rule["action"] })}
                        aria-label={`Action for: ${described}`}
                      >
                        <option value="block">Block</option>
                        <option value="warn">Warn</option>
                      </select>{" "}
                      when {before}
                      {isUsd && "$"}
                      <ThresholdInput
                        id={inputId}
                        value={shownValue}
                        label={`Threshold for: ${described}`}
                        onChange={(n) => updateRule(rule.id, { threshold: storedThreshold(rule.signal, n) })}
                      />
                      {after}
                    </span>
                  </div>
                );
              })}
            </div>
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
          {status.kind === "saving" && (
            <>
              <LoaderCircle className="tw-spin" size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
              Saving…
            </>
          )}
          {status.kind === "saved" && (
            <>
              <Check size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
              Saved
            </>
          )}
          {status.kind === "error" && (
            <>
              <CircleAlert size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
              {status.message ?? "Something went wrong."}
            </>
          )}
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
