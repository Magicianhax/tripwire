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

export function ruleSentence(rule: Rule, formatUsd: (n: number) => string): string {
  const n = rule.text.includes("${n}") ? formatUsd(Math.abs(rule.threshold)) : String(rule.threshold);
  return rule.text.replace("${n}", n).replace("{n}", n);
}
