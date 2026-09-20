import type { ReactNode } from "react";
import { accountLeverage, fundingFlow, maintenanceBufferPct, type FundingFlow } from "@tripwire/core";
import type { HyperliquidBadge, HyperliquidBadgePosition, PolymarketBadge } from "../api-types";
import { useIsExpanded } from "./card-size";
import { pct, timeAgo, usd } from "./format";
import { Empty, price, Problems, Readouts, Section, signOf as sign, Sources } from "./panel-parts";
import { usePagination } from "./DataCharts";

/** The venue blocks without their `link`: the wallet lens knows the address because the user
 * clicked it, the author badges because somebody linked it. The numbers are the same either way. */
type HyperliquidBody = Omit<HyperliquidBadge, "link">;
type PolymarketBody = Omit<PolymarketBadge, "link">;

/** A win rate arrives as a fraction and reads as a percentage. */
const rate = (v: number | null | undefined) => (v === null || v === undefined ? "—" : pct(v * 100));

/** Whether a position **on screen** has no liquidation price, which is the normal case for
 * cross margin. Read off the shown slice, not the whole account: a note explaining a dash the
 * reader cannot see is noise, and on the recorded wallet the null-liquidation legs sit below
 * the compact card's five rows. */
const crossWithoutLiquidation = (positions: HyperliquidBadgePosition[]) => positions.some((p) => p.liquidationPx === null);

/** Money out is red, money in is mint, nothing and unknown are neutral. */
const fundingSign = (flow: FundingFlow) => (flow.direction === "paid" ? "neg" : flow.direction === "received" ? "pos" : "zero");

/**
 * What a position has paid or been paid in funding, in words rather than in a minus sign.
 *
 * Hyperliquid signs `cumFunding` from the account's point of view — negative means the account
 * **paid** — and a bare "−$3.50M" under a "Funding" header is read both ways by different
 * people. Two lines: this position since it was opened, and Hyperliquid's all-time total for
 * this coin on this account, which is a longer history than the open position.
 */
function FundingCell({ sinceOpen, allTime }: { sinceOpen: number | null; allTime: number | null }) {
  const since = fundingFlow(sinceOpen);
  const total = fundingFlow(allTime);
  if (since.direction === "unknown" && total.direction === "unknown") return <span className="tw-fig">—</span>;
  return (
    <span className="tw-stack-cell">
      <span className="tw-fig" data-sign={fundingSign(since)}>
        {since.direction === "unknown" ? "—" : since.direction === "flat" ? "none" : `${usd(since.usd)} ${since.direction}`}
      </span>
      <span className="tw-meta tw-fig">{total.direction === "unknown" ? "—" : `${usd(total.usd)} ${total.direction} all time`}</span>
    </span>
  );
}

/**
 * One wallet's Hyperliquid account, rendered the same way wherever the address came from: an
 * author badge's explicit wallet link, or a wallet the user clicked on a page. `head` is what
 * differs — the badge card puts its "Linked by you / Unlink" row there, the wallet card nothing.
 */
export function HyperliquidBody({ badge, head }: { badge: HyperliquidBody; head?: ReactNode }) {
  const positions = badge.positions ?? [];
  const fills = badge.fills ?? [];
  const expanded = useIsExpanded();
  const shownPositions = positions.slice(0, expanded ? 10 : 5);
  // Notional over equity: how levered the account is, which is a different number from the
  // leverage a trader configured on any one position (both are on screen, labelled apart).
  const leverage = accountLeverage(badge.totalNotionalUsd, badge.accountValueUsd);
  const buffer = maintenanceBufferPct(badge.accountValueUsd, badge.maintenanceMarginUsd);
  return (
    <>
      {head}
      <Readouts
        items={[
          { label: "Account value", value: usd(badge.accountValueUsd) },
          { label: "Margin used", value: usd(badge.marginUsedUsd) },
          { label: "Withdrawable", value: usd(badge.withdrawableUsd) },
          { label: "Account leverage", value: leverage === null ? "—" : `${leverage.toFixed(1)}x` },
          // The two that only fit once the card has room for eight tiles.
          ...(expanded
            ? [
                { label: "Open notional", value: usd(badge.totalNotionalUsd) },
                { label: "Above maintenance", value: buffer === null ? "—" : `${buffer.toFixed(0)}%` },
              ]
            : []),
          // Nansen's perp PnL costs a credit, so the wallet lens does not ask for it. Two tiles
          // reading "—" would be a worse answer than no tiles.
          ...(badge.nansenPerp
            ? [
                { label: `Realized PnL ${badge.nansenPerp.windowDays}d`, value: usd(badge.nansenPerp.realizedPnlUsd, true), sign: sign(badge.nansenPerp.realizedPnlUsd) },
                { label: "Win rate", value: rate(badge.nansenPerp.winRate) },
              ]
            : []),
        ]}
      />
      <Section title="Open positions">
        {positions.length === 0 ? (
          <Empty>No open positions on Hyperliquid.</Empty>
        ) : (
          <>
            <table className="tw-table tw-hl-positions">
              <thead>
                <tr>
                  <th scope="col">Coin</th>
                  <th scope="col">Side</th>
                  <th scope="col" className="tw-num">
                    Entry / Mark
                  </th>
                  <th scope="col" className="tw-num">
                    Liq.
                  </th>
                  <th scope="col" className="tw-num">
                    uPnL
                  </th>
                  {/* One more column, not two: the return on equity rides under the uPnL it is
                      the percentage of, the way the spot card stacks a wallet's two sides.
                      Seven columns in the expanded card's right-hand track wrapped every cell. */}
                  {expanded ? (
                    <th scope="col" className="tw-num">
                      Funding
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {shownPositions.map((p) => (
                  <tr key={p.coin}>
                    <td>{p.coin}</td>
                    <td>
                      <span className="tw-side" data-side={p.side}>
                        {p.side === "short" ? "Short" : "Long"}
                        {p.leverage ? ` ${p.leverage}x` : ""}
                      </span>
                      {/* The trader's own setting against the venue's ceiling for this market:
                          two different numbers that both read as "leverage". Only worth a
                          column's width when they differ — "25x of 25x max" says nothing. */}
                      {expanded && p.maxLeverage && p.maxLeverage !== p.leverage ? <span className="tw-meta"> of {p.maxLeverage}x max</span> : null}
                    </td>
                    <td className="tw-fig tw-num">
                      {price(p.entryPx)} / {price(p.markPx)}
                    </td>
                    <td className="tw-fig tw-num">{price(p.liquidationPx)}</td>
                    <td className="tw-num">
                      <span className="tw-stack-cell">
                        <span className="tw-fig" data-sign={sign(p.unrealizedPnlUsd)}>
                          {usd(p.unrealizedPnlUsd, true)}
                        </span>
                        {/* Hyperliquid reports ROE as a fraction (−0.0299 is −2.99%). */}
                        {expanded ? (
                          <span className="tw-meta tw-fig" data-sign={sign(p.returnOnEquity)}>
                            {p.returnOnEquity === null ? "—" : `${p.returnOnEquity >= 0 ? "+" : "−"}${Math.abs(p.returnOnEquity * 100).toFixed(1)}% ROE`}
                          </span>
                        ) : null}
                      </span>
                    </td>
                    {expanded ? (
                      <td className="tw-num">
                        <FundingCell sinceOpen={p.cumFundingSinceOpenUsd} allTime={p.cumFundingAllTimeUsd} />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Each sentence appears only when the thing it explains is on screen. */}
            {crossWithoutLiquidation(shownPositions) || expanded ? (
              <p className="tw-note tw-meta">
                {crossWithoutLiquidation(shownPositions)
                  ? "A dash under Liq. is Hyperliquid reporting no liquidation price for a cross position — no single price liquidates it. "
                  : null}
                {expanded ? "“Above maintenance” is how much of the account’s value sits above the margin it has to keep, not a distance to a level." : null}
              </p>
            ) : null}
          </>
        )}
      </Section>
      <Section
        title="Recent fills"
        aside={badge.fillsWindow ? `${usd(badge.fillsRealizedPnlUsd, true)} over ${badge.fillsWindow.count} fills` : undefined}
      >
        {fills.length === 0 ? (
          <Empty>No fills in Hyperliquid's recent window.</Empty>
        ) : (
          <ul className="tw-trade-list" data-cols="3">
            {fills.map((f) => (
              <li key={`${f.time}-${f.coin}-${f.px}`}>
                <span>
                  {f.dir} {f.coin}
                </span>
                <span className="tw-fig" data-sign={sign(f.closedPnlUsd)}>
                  {usd(f.closedPnlUsd, true)}
                </span>
                <span className="tw-fig tw-meta">{timeAgo(new Date(f.time).toISOString())}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Problems errors={badge.errors} />
      <Sources>Hyperliquid API (public, backend only) · Nansen perp PnL</Sources>
    </>
  );
}

/** One wallet's Polymarket record, shared by the badge card and the wallet card. */
export function PolymarketBody({ badge, head }: { badge: PolymarketBody; head?: ReactNode }) {
  const open = badge.openPositions ?? [];
  const trades = badge.trades ?? [];
  const settled = badge.settled ?? [];
  const settledPages = usePagination(settled, 5);
  return (
    <>
      {head}
      <Readouts
        items={[
          { label: "Total PnL", value: usd(badge.totalPnlUsd, true), sign: sign(badge.totalPnlUsd) },
          { label: "Realized", value: usd(badge.realizedPnlUsd, true), sign: sign(badge.realizedPnlUsd) },
          { label: "Unrealized", value: usd(badge.unrealizedPnlUsd, true), sign: sign(badge.unrealizedPnlUsd) },
          { label: "Win rate", value: rate(badge.winRate) },
        ]}
      />
      {/* Round 1.5.4. `wallet_age_days` is days since Polymarket first saw this address, which
          is not the age of the wallet — the address existed before, possibly for years, and
          calling it wallet age would state something false about it. */}
      {badge.firstSeen ? (
        <p className="tw-meta">
          Trading on Polymarket since <span className="tw-fig">{badge.firstSeen}</span>
          {badge.polymarketDays === null || badge.polymarketDays === undefined ? null : (
            <>
              , <span className="tw-fig">{badge.polymarketDays.toLocaleString("en-US")}</span> days ago
            </>
          )}
          . That is the first Polymarket activity Nansen has for this address, not the age of the address.
        </p>
      ) : null}
      <Section
        title="Open positions"
        aside={badge.marketsTraded !== null ? `${badge.marketsWon ?? 0} won of ${badge.marketsTraded} markets` : undefined}
      >
        {open.length === 0 ? (
          <Empty>No open positions on Polymarket.</Empty>
        ) : (
          <ul className="tw-market-rows">
            {open.map((p) => (
              <li key={p.marketId}>
                <span className="tw-market-question">{p.question}</span>
                <span className="tw-market-figures">
                  <span className="tw-side" data-side={p.side.toLowerCase() === "yes" ? "long" : "short"}>
                    {p.side}
                  </span>
                  <span className="tw-fig tw-market-value">{usd(p.valueUsd)}</span>
                  <span className="tw-fig" data-sign={sign(p.pnlUsd)}>
                    {usd(p.pnlUsd, true)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      {/* Round 1.5.5. The 1-credit call already returns every market this wallet has touched
          — 574 rows on the recorded wallet, 494 of them settled — and the card drew five of
          the other 80. The settled ones are the record the tile above summarises. */}
      <Section
        title="Settled markets"
        aside={badge.settledCount ? `${settled.length} largest of ${badge.settledCount.toLocaleString("en-US")}` : undefined}
      >
        {settled.length === 0 ? (
          <Empty>No settled Polymarket markets returned for this wallet.</Empty>
        ) : (
          <>
            <ul className="tw-market-rows">
              {settledPages.rows.map((m) => (
                <li key={m.marketId}>
                  <span className="tw-market-question">{m.question}</span>
                  <span className="tw-market-figures">
                    <span className="tw-side" data-side={m.side.toLowerCase() === "yes" ? "long" : "short"}>
                      {m.side}
                    </span>
                    <span className="tw-fig tw-market-value">{usd(m.costUsd)} in</span>
                    <span className="tw-fig" data-sign={sign(m.pnlUsd)}>
                      {usd(m.pnlUsd, true)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            {settledPages.controls}
            <p className="tw-meta">
              Each result is Nansen's own per-market figure. Summed over every settled market it comes to{" "}
              <span className="tw-fig" data-sign={sign(badge.settledPnlUsd)}>
                {usd(badge.settledPnlUsd, true)}
              </span>
              , which is not the Realized tile above: Nansen computes that one differently, and redemptions and sale proceeds do not reconstruct it.
            </p>
          </>
        )}
      </Section>
      <Section title="Recent trades">
        {trades.length === 0 ? (
          <Empty>No recent Polymarket trades.</Empty>
        ) : (
          <ul className="tw-trade-list" data-cols="3">
            {trades.map((t, i) => (
              <li key={`${t.timestamp}-${i}`}>
                <span>
                  {t.action ?? "Trade"} {t.side ?? ""} at {t.price === null ? "—" : `$${t.price.toFixed(2)}`}
                </span>
                <span className="tw-fig">{usd(t.usdcValue)}</span>
                <span className="tw-fig tw-meta">{timeAgo(`${t.timestamp}${/[Zz]|[+-]\d\d:?\d\d$/.test(t.timestamp) ? "" : "Z"}`)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Problems errors={badge.errors} />
      <Sources>Nansen prediction market</Sources>
    </>
  );
}

