import { isNegativeSignal, type Rule, type SignalId } from "@tripwire/core";

// The downward signals (labeled_exit_pct, distribution_pct, sm_netflow_pct, drawdown_pct) live
// in @tripwire/core, because rule sentences there print the same magnitudes this editor edits.
export { isNegativeSignal };

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

/** The threshold field's resting text: whole numbers with grouping ("100,000"). */
export function formatThresholdInput(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "";
}

/** Parses what was typed into the threshold field, tolerating grouping commas, spaces and "$".
 * Returns null for an empty or non-numeric draft (the stored value is left alone). */
export function parseThresholdInput(text: string): number | null {
  const cleaned = text.replace(/[,\s$_]/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
