import { recentChecks, recentOverrides } from "@/lib/store";
import { VerdictChip } from "../_components/VerdictChip";
import { targetLabelFromJson } from "../_lib/target-label";

export const dynamic = "force-dynamic";

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

function ruleIdList(raw: string): string {
  try {
    const ids = JSON.parse(raw) as string[];
    return ids.length ? ids.join(", ") : "—";
  } catch {
    return "—";
  }
}

export default function HistoryPage() {
  const overrides = recentOverrides(50);
  const checks = recentChecks(50);

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
                  <th scope="col">Rule ids</th>
                </tr>
              </thead>
              <tbody>
                {overrides.map((o, i) => (
                  <tr key={i}>
                    <td className="tw-data">{fmtTime(o.ts)}</td>
                    <td>{o.venue}</td>
                    <td>{targetLabelFromJson(o.target)}</td>
                    <td>
                      <VerdictChip verdict={o.verdict} />
                    </td>
                    <td className="tw-data">{ruleIdList(o.rule_ids)}</td>
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
                    <td className="tw-data">{fmtTime(c.ts)}</td>
                    <td>{c.venue}</td>
                    <td>{targetLabelFromJson(c.target)}</td>
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
