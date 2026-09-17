import type { Rule, SignalId } from "@tripwire/core";

// exit_pressure and sm_netflow_24h are outflow signals: their threshold is always
// non-positive (0 or negative) across every preset. The editor shows the magnitude and
// re-applies the sign on save, unconditionally — this does not depend on whether a given
// preset's threshold happens to be negative or zero (paranoid's sm_netflow_24h is 0).
const NEGATIVE_SIGNALS: SignalId[] = ["exit_pressure", "sm_netflow_24h"];

export function isNegativeSignal(signal: SignalId): boolean {
  return NEGATIVE_SIGNALS.includes(signal);
}

export type SentenceParts = { before: string; after: string; isUsd: boolean };

/** Splits a rule's sentence template around its "{n}" or "${n}" placeholder. */
export function splitSentence(text: string): SentenceParts {
  const isUsd = text.includes("${n}");
  const token = isUsd ? "${n}" : "{n}";
  const idx = text.indexOf(token);
  if (idx === -1) return { before: text, after: "", isUsd: false };
  return { before: text.slice(0, idx), after: text.slice(idx + token.length), isUsd };
}

/** The magnitude shown in the editor's number input, for a given rule's stored threshold. */
export function displayValue(rule: Pick<Rule, "signal" | "threshold">): number {
  return isNegativeSignal(rule.signal) ? Math.abs(rule.threshold) : rule.threshold;
}

/**
 * The threshold to store for a given signal id, from the magnitude typed into the editor.
 * Negative-threshold signals are normalized to -Math.abs(value); 0 stays 0, never -0.
 */
export function storedThreshold(signal: SignalId, typedValue: number): number {
  if (!isNegativeSignal(signal)) return typedValue;
  return -Math.abs(typedValue) || 0;
}
