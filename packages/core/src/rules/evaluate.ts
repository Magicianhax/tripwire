import type { Signal, SignalId, TargetKind, Verdict } from "../types";
import type { Rule } from "./presets";

export type RuleHit = { rule: Rule; signal: Signal };
export type Evaluation = { verdict: Verdict; hits: RuleHit[]; unavailable: SignalId[] };

const test = (v: number, op: Rule["op"], t: number) =>
  op === ">" ? v > t : op === "<" ? v < t : op === ">=" ? v >= t : v <= t;

export function evaluate(rules: Rule[], signals: Signal[], kind: TargetKind): Evaluation {
  const applicable = rules.filter((r) => r.enabled && r.kind === kind);
  const hits: RuleHit[] = [];
  const unavailable: SignalId[] = [];

  for (const rule of applicable) {
    const signal = signals.find((s) => s.id === rule.signal);
    if (!signal || signal.value === null) {
      if (!unavailable.includes(rule.signal)) unavailable.push(rule.signal);
      continue;
    }
    if (test(signal.value, rule.op, rule.threshold)) hits.push({ rule, signal });
  }

  hits.sort((a, b) => (a.rule.action === b.rule.action ? 0 : a.rule.action === "block" ? -1 : 1));

  const verdict: Verdict = hits.some((h) => h.rule.action === "block")
    ? "TRIPWIRE"
    : hits.length
      ? "CAUTION"
      : unavailable.length || applicable.length === 0
        ? "UNCHECKED"
        : "CLEAR";
  return { verdict, hits, unavailable };
}

const LEGACY_VERB = /^(block|warn) when\s+/i;

/** Drops a leading "Block when"/"Warn when" from a rule template saved before the verb moved
 * to the rule's action. */
export function stripRuleVerb(text: string): string {
  return text.replace(LEGACY_VERB, "");
}

/** The rule's condition with its threshold filled in, no verb: "fresh wallets are more than 70% of buying". */
export function ruleSentence(rule: Rule, formatUsd: (n: number) => string): string {
  const text = stripRuleVerb(rule.text);
  const n = text.includes("${n}") ? formatUsd(Math.abs(rule.threshold)) : String(rule.threshold);
  return text.replace("${n}", n).replace("{n}", n);
}

/** The full rule as a sentence: "Block when fresh wallets are more than 50% of buying". */
export function describeRule(rule: Rule, formatUsd: (n: number) => string): string {
  return `${rule.action === "block" ? "Block" : "Warn"} when ${ruleSentence(rule, formatUsd)}`;
}
