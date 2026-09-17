import { resolveApiKey, type KeySource } from "@/lib/nansen/key";
import { creditsToday, isReplay } from "@/lib/nansen/client";
import { ledgerSummary, recentChecks } from "@/lib/store";
import { Time } from "./_components/Time";
import { VerdictChip } from "./_components/VerdictChip";
import { targetLabelFromJson } from "./_lib/target-label";

export const dynamic = "force-dynamic";

const DAILY_CAP = Number(process.env.NANSEN_DAILY_CREDIT_CAP ?? 3000);
const BUILDATHON_GOAL = 1000;

const KEY_SOURCE_LABEL: Record<KeySource, string> = {
  env: "NANSEN_API_KEY",
  "nansen-cli": "Nansen CLI login",
  none: "Not configured",
};

export default function StatusPage() {
  const { source } = resolveApiKey();
  const replay = isReplay();
  const credits = creditsToday();
  const { totalCalls } = ledgerSummary();
  const checks = recentChecks(10);
  const goalPct = Math.min(100, Math.round((totalCalls / BUILDATHON_GOAL) * 100));

  return (
    <>
      <section className="tw-section">
        <h1 className="tw-display">Status</h1>
      </section>

      <section className="tw-section">
        <h2 className="tw-h2">Backend</h2>
        <div className="tw-stat-row">
          <div className="tw-stat">
            <span className="tw-label tw-stat-label">API key</span>
            <span className={`tw-data tw-stat-value${source === "none" ? " tw-chip-danger-text" : ""}`}>{KEY_SOURCE_LABEL[source]}</span>
          </div>
          <div className="tw-stat">
            <span className="tw-label tw-stat-label">Replay mode</span>
            <span className="tw-data tw-stat-value">{replay ? "On" : "Off"}</span>
          </div>
        </div>
      </section>

      <section className="tw-section">
        <h2 className="tw-h2">Credits &amp; calls</h2>
        <div className="tw-stat-row">
          <div className="tw-stat">
            <span className="tw-label tw-stat-label">Credits today</span>
            <span className="tw-data tw-stat-value">
              {credits} / {DAILY_CAP}
            </span>
          </div>
          <div className="tw-stat">
            <span className="tw-label tw-stat-label">Calls total</span>
            <span className="tw-data tw-stat-value">
              {totalCalls} / {BUILDATHON_GOAL}
            </span>
          </div>
        </div>
        <progress
          className="tw-meter-track"
          value={Math.min(totalCalls, BUILDATHON_GOAL)}
          max={BUILDATHON_GOAL}
          aria-label={`Calls toward the buildathon goal: ${totalCalls} of ${BUILDATHON_GOAL}, ${goalPct}%`}
        />
      </section>

      <section className="tw-section">
        <h2 className="tw-h2">Load the extension</h2>
        <ol className="tw-install-steps">
          <li>
            Build it: <code>pnpm -F extension build</code>
          </li>
          <li>
            Open <code>chrome://extensions</code> in Chrome.
          </li>
          <li>Turn on Developer mode (top right).</li>
          <li>
            Click &quot;Load unpacked&quot; and select <code>apps/extension/.output/chrome-mv3</code>.
          </li>
        </ol>
      </section>

      <section className="tw-section">
        <h2 className="tw-h2">Last 10 checks</h2>
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
                    <td className="tw-nowrap">{targetLabelFromJson(c.target)}</td>
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
