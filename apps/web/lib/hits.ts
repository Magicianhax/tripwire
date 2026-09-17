import { ruleSentence, usd, type RuleHit } from "@tripwire/core";

export type HitDto = {
  ruleId: string;
  action: "warn" | "block";
  text: string;
  signalId: string;
  op: RuleHit["rule"]["op"];
  threshold: number;
  label: string;
  value: number | null;
  evidence: { endpoint: string; field: string; value: string }[];
};

/** Trim RuleHit (full Rule + Signal) down to what the extension needs to render a hit. */
export function toHits(hits: RuleHit[]): HitDto[] {
  return hits.map((h) => ({
    ruleId: h.rule.id,
    action: h.rule.action,
    text: ruleSentence(h.rule, usd),
    signalId: h.signal.id,
    op: h.rule.op,
    threshold: h.rule.threshold,
    label: h.signal.label,
    value: h.signal.value,
    evidence: h.signal.evidence,
  }));
}
