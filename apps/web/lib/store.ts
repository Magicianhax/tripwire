import { z } from "zod";
import { PRESETS, RuleSchema, stripRuleVerb, type PresetName, type Rule, type Signal, type Target, type Verdict } from "@tripwire/core";
import { getDb } from "./db";

export type RulesState = { preset: PresetName | "custom"; rules: Rule[] };

const StoredRulesSchema = z.object({
  preset: z.enum(["degen", "balanced", "paranoid", "custom"]),
  rules: z.array(RuleSchema),
});

const DEFAULT_RULES = (): RulesState => ({ preset: "balanced", rules: PRESETS.balanced });

/** The saved rules, validated: a corrupt or hand-edited row falls back to the balanced preset
 * rather than feeding malformed rules into evaluate(). */
export function getRules(): RulesState {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = 'rules'").get() as { value: string } | undefined;
  if (!row) return DEFAULT_RULES();
  let raw: unknown;
  try {
    raw = JSON.parse(row.value);
  } catch {
    return DEFAULT_RULES();
  }
  const parsed = StoredRulesSchema.safeParse(raw);
  if (!parsed.success) return DEFAULT_RULES();
  // Rules saved before the verb moved to `action` still start with "Block when"/"Warn when".
  return { ...parsed.data, rules: parsed.data.rules.map((r) => ({ ...r, text: stripRuleVerb(r.text) })) };
}

export function setRules(state: RulesState) {
  getDb().prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('rules', ?)").run(JSON.stringify(state));
}

export function recordCheck(venue: string, target: Target, verdict: Verdict, signals: Signal[]) {
  const compact = signals.map((s) => ({ id: s.id, value: s.value }));
  getDb()
    .prepare("INSERT INTO checks (ts, venue, target, verdict, signals) VALUES (?, ?, ?, ?, ?)")
    .run(Date.now(), venue, JSON.stringify(target), verdict, JSON.stringify(compact));
}

export function recordOverride(venue: string, target: Target, verdict: Verdict, ruleIds: string[]) {
  getDb()
    .prepare("INSERT INTO overrides (ts, venue, target, verdict, rule_ids) VALUES (?, ?, ?, ?, ?)")
    .run(Date.now(), venue, JSON.stringify(target), verdict, JSON.stringify(ruleIds));
}

/** A rules change that lowered protection (weaker preset, or a block rule disabled, downgraded
 * or loosened). Logged next to overrides so /history shows every way a block was removed. */
export function recordSettingsChange(fromPreset: RulesState["preset"], toPreset: RulesState["preset"], ruleIds: string[]) {
  getDb()
    .prepare("INSERT INTO settings_changes (ts, from_preset, to_preset, rule_ids) VALUES (?, ?, ?, ?)")
    .run(Date.now(), fromPreset, toPreset, JSON.stringify(ruleIds));
}

export function recentSettingsChanges(limit = 50) {
  return getDb().prepare("SELECT ts, from_preset, to_preset, rule_ids FROM settings_changes ORDER BY id DESC LIMIT ?").all(limit) as {
    ts: number;
    from_preset: RulesState["preset"];
    to_preset: RulesState["preset"];
    rule_ids: string;
  }[];
}

export type LedgerSummary = {
  totalCalls: number;
  successfulCalls: number;
  creditsTotal: number;
  creditsToday: number;
  callsToday: number;
  byEndpoint: { endpoint: string; calls: number; credits: number; avgMs: number; errors: number }[];
  recent: { ts: number; endpoint: string; status: number; credits: number | null; latency_ms: number }[];
};

export function ledgerSummary(): LedgerSummary {
  const db = getDb();
  const d = new Date();
  const today = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const totals = db
    .prepare(
      `SELECT COUNT(*) AS calls, SUM(CASE WHEN status BETWEEN 200 AND 299 THEN 1 ELSE 0 END) AS ok,
              COALESCE(SUM(credits),0) AS credits,
              COALESCE(SUM(CASE WHEN ts >= ? THEN credits END),0) AS creditsToday,
              SUM(CASE WHEN ts >= ? THEN 1 ELSE 0 END) AS callsToday
       FROM ledger`,
    )
    .get(today, today) as { calls: number; ok: number | null; credits: number; creditsToday: number; callsToday: number | null };
  const byEndpoint = db
    .prepare(
      `SELECT endpoint, COUNT(*) AS calls, COALESCE(SUM(credits),0) AS credits, CAST(AVG(latency_ms) AS INTEGER) AS avgMs,
              SUM(CASE WHEN status >= 400 THEN 1 ELSE 0 END) AS errors
       FROM ledger GROUP BY endpoint ORDER BY calls DESC`,
    )
    .all() as LedgerSummary["byEndpoint"];
  const recent = db.prepare("SELECT ts, endpoint, status, credits, latency_ms FROM ledger ORDER BY id DESC LIMIT 25").all() as LedgerSummary["recent"];
  return {
    totalCalls: totals.calls,
    successfulCalls: totals.ok ?? 0,
    creditsTotal: totals.credits,
    creditsToday: totals.creditsToday,
    callsToday: totals.callsToday ?? 0,
    byEndpoint,
    recent,
  };
}

export function recentChecks(limit = 50) {
  return getDb().prepare("SELECT ts, venue, target, verdict, signals FROM checks ORDER BY id DESC LIMIT ?").all(limit) as {
    ts: number;
    venue: string;
    target: string;
    verdict: Verdict;
    signals: string;
  }[];
}

export function recentOverrides(limit = 50) {
  return getDb().prepare("SELECT ts, venue, target, verdict, rule_ids FROM overrides ORDER BY id DESC LIMIT ?").all(limit) as {
    ts: number;
    venue: string;
    target: string;
    verdict: Verdict;
    rule_ids: string;
  }[];
}
