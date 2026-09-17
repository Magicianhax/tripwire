import { ledgerSummary } from "@/lib/store";

export const dynamic = "force-dynamic";

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

export default function LedgerPage() {
  const s = ledgerSummary();

  return (
    <>
      <section className="tw-section">
        <h1 className="tw-display">Ledger</h1>
      </section>

      <section className="tw-section">
        <div className="tw-stat-row">
          <div className="tw-stat">
            <span className="tw-label tw-stat-label">Calls</span>
            <p className="tw-readout">
              {s.totalCalls} / {1000}
            </p>
          </div>
          <div className="tw-stat">
            <span className="tw-label tw-stat-label">Successful calls</span>
            <span className="tw-data tw-stat-value">{s.successfulCalls}</span>
          </div>
          <div className="tw-stat">
            <span className="tw-label tw-stat-label">Credits today</span>
            <span className="tw-data tw-stat-value">{s.creditsToday}</span>
          </div>
          <div className="tw-stat">
            <span className="tw-label tw-stat-label">Credits total</span>
            <span className="tw-data tw-stat-value">{s.creditsTotal}</span>
          </div>
        </div>
      </section>

      <div className="tw-ledger-grid">
        <section className="tw-section">
          <h2 className="tw-h2">By endpoint</h2>
          {s.byEndpoint.length === 0 ? (
            <p className="tw-empty">No calls yet.</p>
          ) : (
            <div className="tw-table-wrap">
              <table className="tw-table">
                <thead>
                  <tr>
                    <th scope="col">Endpoint</th>
                    <th scope="col" className="tw-num">
                      Calls
                    </th>
                    <th scope="col" className="tw-num">
                      Credits
                    </th>
                    <th scope="col" className="tw-num">
                      Avg ms
                    </th>
                    <th scope="col" className="tw-num">
                      Errors
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {s.byEndpoint.map((e) => (
                    <tr key={e.endpoint}>
                      <td>{e.endpoint}</td>
                      <td className="tw-num">{e.calls}</td>
                      <td className="tw-num">{e.credits}</td>
                      <td className="tw-num">{e.avgMs}</td>
                      <td className="tw-num">{e.errors}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="tw-section">
          <h2 className="tw-h2">Recent calls</h2>
          {s.recent.length === 0 ? (
            <p className="tw-empty">No calls yet.</p>
          ) : (
            <div className="tw-table-wrap">
              <table className="tw-table">
                <thead>
                  <tr>
                    <th scope="col">Time</th>
                    <th scope="col">Endpoint</th>
                    <th scope="col" className="tw-num">
                      Status
                    </th>
                    <th scope="col" className="tw-num">
                      Credits
                    </th>
                    <th scope="col" className="tw-num">
                      ms
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {s.recent.map((r, i) => (
                    <tr key={i}>
                      <td className="tw-data">{fmtTime(r.ts)}</td>
                      <td>{r.endpoint}</td>
                      <td className="tw-num">{r.status}</td>
                      <td className="tw-num">{r.credits ?? "—"}</td>
                      <td className="tw-num">{r.latency_ms}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
