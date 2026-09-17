import { getRules, recentChecks, recentOverrides, recentSettingsChanges } from "@/lib/store";
import { Time } from "../_components/Time";
import { VerdictChip } from "../_components/VerdictChip";
import { PRESET_LABEL, ruleDescriptions, rulesForPreset } from "../_lib/rule-names";
import { TargetLabel } from "../_components/TargetLabel";

export const dynamic = "force-dynamic";

function RuleLines({ lines }: { lines: string[] }) {
  if (lines.length === 0) return <>—</>;
  return (
    <ul className="tw-rule-lines">
      {lines.map((line, i) => (
        <li key={i}>{line}</li>
      ))}
    </ul>
  );
}

export default function HistoryPage() {
  const overrides = recentOverrides(50);
  const changes = recentSettingsChanges(50);
  const checks = recentChecks(50);
  const currentRules = getRules().rules;

  return (
    <>
      <section className="tw-section">
        <h1 className="tw-display">History</h1>
      </section>

      <section className="tw-section">
        <h2 className="tw-h2">Overrides</h2>
        {overrides.length === 0 ? (
          <p className="tw-empty">No overrides yet. When you type the override phrase on a block screen, it shows up here.</p>
        ) : (
          <div className="tw-table-wrap">
            <table className="tw-table">
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Venue</th>
                  <th scope="col">Target</th>
                  <th scope="col">Verdict</th>
                  <th scope="col">Rules overridden</th>
                </tr>
              </thead>
              <tbody>
                {overrides.map((o, i) => (
                  <tr key={i}>
                    <td>
                      <Time ts={o.ts} />
                    </td>
                    <td className="tw-nowrap">{o.venue}</td>
                    <td className="tw-nowrap"><TargetLabel json={o.target} /></td>
                    <td>
                      <VerdictChip verdict={o.verdict} />
                    </td>
                    <td>
                      <RuleLines lines={ruleDescriptions(o.rule_ids, currentRules)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="tw-section">
        <h2 className="tw-h2">Protection lowered</h2>
        {changes.length === 0 ? (
          <p className="tw-empty">No downgrades yet. Switching to a weaker preset, or disabling or loosening a block rule, shows up here.</p>
        ) : (
          <div className="tw-table-wrap">
            <table className="tw-table">
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Preset</th>
                  <th scope="col">Blocks weakened</th>
                </tr>
              </thead>
              <tbody>
                {changes.map((c, i) => (
                  <tr key={i}>
                    <td>
                      <Time ts={c.ts} />
                    </td>
                    <td className="tw-nowrap">
                      {PRESET_LABEL[c.from_preset] ?? c.from_preset} → {PRESET_LABEL[c.to_preset] ?? c.to_preset}
                    </td>
                    <td>
                      <RuleLines lines={ruleDescriptions(c.rule_ids, rulesForPreset(c.from_preset, currentRules))} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="tw-section">
        <h2 className="tw-h2">Recent checks</h2>
        {checks.length === 0 ? (
          <p className="tw-empty">No checks yet. Open a post on X with the extension loaded to run one.</p>
        ) : (
          <div className="tw-table-wrap">
            <table className="tw-table">
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Venue</th>
                  <th scope="col">Target</th>
                  <th scope="col">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {checks.map((c, i) => (
                  <tr key={i}>
                    <td>
                      <Time ts={c.ts} />
                    </td>
                    <td className="tw-nowrap">{c.venue}</td>
                    <td className="tw-nowrap"><TargetLabel json={c.target} /></td>
                    <td>
                      <VerdictChip verdict={c.verdict} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
