import { useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { nansenTokenUrl, sameTarget, VERDICT_TIMEFRAME, type DepthSection, type Target, type Verdict, type ViewTimeframe } from "@tripwire/core";
import type { DepthResponse, GuardResponse, Market, PerpPanel, PersonIntelResponse, PostIntelResponse, PredictionPanel, SpotPanel } from "../api-types";
import { BadgeCheck } from "lucide-react";
import { CardSizeContext } from "./card-size";
import { CountInText } from "./CountIn";
import { usd } from "./format";
import { Icon } from "./icons";
import { CardHeader, hitFinding, PanelFooter } from "./panel-parts";
import { EMPTY_DEPTH, PerpBody, type DepthState } from "./PerpBody";
import { PopoverContext } from "./Popover";
import { PredictionBody } from "./PredictionBody";
import { LoadingAnnouncement, SkeletonSection } from "./Skeleton";
import { SpotBody, type TimeframeState } from "./SpotBody";
import { MarketsView, MarketEvidence } from "./MarketsView";

/** Loads one or more depth sections. Injected rather than imported so the card stays testable
 * without a background bridge. */
export type DepthLoader = (sections: DepthSection[]) => Promise<{ ok: true; data: DepthResponse } | { ok: false; error: string }>;

export type PanelProps = {
  enableMarkets?: boolean;
  navigation?: ReactNode;
  /**
   * The evidence, once it arrives. `null` is the card's first frame: the header is drawn from
   * what the click already knew and every section shows a skeleton. It is never a failure state
   * — that is `error`.
   */
  data: GuardResponse | PostIntelResponse | null;
  /** The card couldn't be checked at all: the reason, in place of the body. */
  error?: string | null;
  title: string;
  /** Used when the card is rendered outside a Popover; inside one, close goes through it. */
  onClose: () => void;
  replay?: boolean;
  /** Optional Nansen person-intel match for the post's author: an advisory line under the
   * finding when an entity matched. */
  person?: PersonIntelResponse | null;
  /** The one-line finding when no rule fired (e.g. the backend's reason it couldn't check). */
  headline?: string;
  /** The post's time, shown as its age in the header (X). */
  postTimeIso?: string | null;
  /** When the evidence was fetched, shown as "checked 20s ago" (venues). */
  checkedAtIso?: string | null;
  /** Which evidence tab opens first (e.g. "wallets" from the block screen's "See who's selling"). */
  initialTab?: string;
  /** The spot token's chain when `data` carries no target (X post intel). */
  chain?: string | null;
  /** The spot token's contract address when `data` carries no target (X post intel). */
  address?: string | null;
  /** What the card is about, for the depth calls. Taken from `data.target` when it has one. */
  target?: Target | null;
  /** Fetches a lazy section. Omitted on surfaces with no path to the backend. */
  onDepth?: DepthLoader;
  /**
   * Refetches the spot panel for another window, for the card's timeframe control. Returning
   * null leaves the current window on screen. Omitted on surfaces with no refetch path, where
   * the control is simply not rendered.
   */
  onTimeframe?: (timeframe: ViewTimeframe) => Promise<SpotPanel | null>;
  /** The post author's own block under the finding (X): the Nansen label line's companion, with
   * the "Link wallet" action for Hyperliquid and Polymarket. */
  author?: ReactNode;
};

/** "Nansen label: <entity> (tags), holds $X of SYMBOL", only rendered when an entity matched. */
function PersonLine({ person }: { person: PersonIntelResponse }) {
  if (!person.entity) return null;
  return (
    <p className="tw-person">
      <Icon icon={BadgeCheck} size={16} />
      <span>
        Nansen label: <b>{person.entity}</b>
        {person.tags.length > 0 ? ` (${person.tags.join(", ")})` : ""}
        {person.holding ? (
          <>
            , holds{" "}
            <b className="tw-fig">
              {usd(person.holding.valueUsd, true)} of {person.holding.symbol ?? "—"}
            </b>
          </>
        ) : null}
      </span>
    </p>
  );
}

/** Unique Nansen endpoints backing the signals (falls back to hit evidence if signals are
 * empty), used for the footer's endpoint count. */
function endpointCount(data: GuardResponse | PostIntelResponse): number {
  const set = new Set<string>();
  for (const s of data.signals) for (const e of s.evidence) set.add(e.endpoint);
  if (set.size === 0) {
    for (const h of data.hits) for (const e of h.evidence) set.add(e.endpoint);
  }
  return set.size;
}

/** A prediction card is about a market, not a token; a perp card is about a coin's market too. */
const SUBJECT: Record<string, string> = { spot: "token", perp: "market", prediction: "market" };

function defaultFinding(verdict: Verdict, kind: string): string {
  const subject = SUBJECT[kind] ?? "token";
  switch (verdict) {
    case "CLEAR":
      return `None of your rules fired on this ${subject}.`;
    case "UNCHECKED":
      return `Tripwire couldn't check this ${subject}.`;
    default:
      return `A rule fired on this ${subject}.`;
  }
}

/**
 * The card's first frame. It is drawn from what the click already knew — which token, which
 * chain, which coin — so the card is on screen before any request has answered, and every block
 * reserves the height its real content will take.
 *
 * The shapes differ by kind because the sections do: a spot card leads with gauges and a chart,
 * a perp card with a positioning bar and a venue table.
 */
function LoadingBody({ kind }: { kind: Target["kind"] | "spot" }) {
  if (kind === "perp") {
    return (
      <div className="tw-card-loading" data-kind="perp">
        <SkeletonSection title="Smart Money long vs short" shape="gauge" rows={1} layoutSlot="primary" />
        {/* Eight figure tiles, four across, which is what "The market right now" renders. */}
        <SkeletonSection title="The market right now" shape="tile" rows={8} layoutSlot="secondary" />
        <SkeletonSection title="Funding &amp; OI across venues" shape="table" rows={5} layoutSlot="tertiary" />
      </div>
    );
  }
  if (kind === "prediction") {
    return (
      <div className="tw-card-loading" data-kind="prediction">
        <SkeletonSection title="Proven winners by side" shape="gauge" rows={1} layoutSlot="primary" />
        <SkeletonSection title="Top holders" shape="table" rows={6} layoutSlot="secondary" />
      </div>
    );
  }
  return (
    <div className="tw-card-loading" data-kind="spot">
      <SkeletonSection title="Net flow by wallet type" shape="gauge" rows={6} layoutSlot="primary" />
      <SkeletonSection title="Price" shape="chart" rows={1} layoutSlot="secondary" />
      <SkeletonSection title="Smart Money netflow" shape="tile" rows={4} layoutSlot="tertiary" />
    </div>
  );
}

/**
 * Accumulates the lazy sections as their tabs ask for them.
 *
 * Two rules: a section is never requested twice (already loaded, or already in flight, is
 * enough), and a response only ever adds — a later call for the Traders tab must not wipe the
 * market data the Positioning tab already put on screen.
 */
function useDepth(onDepth: DepthLoader | undefined): [DepthState, (sections: DepthSection[]) => void] {
  const [state, setState] = useState<DepthState>(EMPTY_DEPTH);
  // Every section ever asked for, so a re-render that re-fires `onSelect` costs nothing.
  const asked = useRef(new Set<DepthSection>());
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const request = useCallback(
    (sections: DepthSection[]) => {
      if (!onDepth) return;
      const wanted = sections.filter((s) => !asked.current.has(s));
      if (wanted.length === 0) return;
      for (const s of wanted) asked.current.add(s);
      setState((prev) => ({ ...prev, loading: [...prev.loading, ...wanted] }));
      void onDepth(wanted).then((result) => {
        if (!alive.current) return;
        setState((prev) => {
          const loading = prev.loading.filter((s) => !wanted.includes(s));
          if (!result.ok) {
            const failed = { ...prev.failed };
            for (const s of wanted) failed[s] = result.error;
            return { ...prev, loading, failed };
          }
          // A section the backend refused for this target is a failure of that section only.
          const failed = { ...prev.failed };
          for (const s of result.data.skipped ?? []) if (wanted.includes(s)) failed[s] = "not available for this target";
          return { data: { ...(prev.data ?? { credits: 0, skipped: [] }), ...result.data }, loading, failed };
        });
      });
    },
    [onDepth],
  );

  return [state, request];
}

/** The evidence card: header row (token logo, title, chain, age, verdict pill, expand, close),
 * the one-line finding, the author's Nansen label, evidence tabs by target kind, and the source
 * line. Mounts with skeletons and fills in; never waits for data to exist. */
export function Panel({
  data: answered,
  error,
  title,
  onClose,
  replay,
  person,
  headline,
  postTimeIso,
  checkedAtIso,
  initialTab,
  chain,
  address,
  target,
  onDepth,
  author,
  onTimeframe,
  enableMarkets = false,
  navigation,
}: PanelProps) {
  /**
   * The evidence, but only if it is this card's.
   *
   * A guard response carries the target it was computed for. When the page moves on — the Buy
   * token changes on a swap form, the coin changes on a perp venue — the card is re-pointed at
   * the new target before its answer lands, and an answer for the old one must not be painted
   * under the new one's header. It is treated exactly like an answer that has not arrived yet:
   * skeletons, `aria-busy`, no numbers. (Reported live on Uniswap: "$SPCX Space Exploration
   * Technologies" over the next token's address, with the previous token's flow rows.)
   */
  const data = answered !== null && "target" in answered && target && !sameTarget(answered.target, target) ? null : answered;
  const [marketChoice, setMarketChoice] = useState<Market | null>(null);
  const [marketHome, setMarketHome] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pop = useContext(PopoverContext);
  const size = pop?.size ?? "compact";
  const [depth, requestSections] = useDepth(onDepth);

  // The view window lives here so switching it never remounts the card: the verdict, the
  // finding, the tabs and the scroll position all stay while one section reloads.
  const spotPanel = data === null ? null : "target" in data ? (data.target.kind === "spot" ? (data.panel as SpotPanel) : null) : data.panel;
  const [view, setView] = useState<{ timeframe: ViewTimeframe; panel: SpotPanel } | null>(null);
  const [pending, setPending] = useState<ViewTimeframe | null>(null);
  const requestRef = useRef(0);

  const changeTimeframe = useCallback(
    (next: ViewTimeframe) => {
      if (!onTimeframe) return;
      const request = ++requestRef.current;
      setPending(next);
      void onTimeframe(next).then(
        (panel) => {
          // A slower earlier request must never overwrite a newer window.
          if (request !== requestRef.current) return;
          if (panel) setView({ timeframe: next, panel });
          setPending(null);
        },
        () => {
          if (request === requestRef.current) setPending(null);
        },
      );
    },
    [onTimeframe],
  );

  // Scroll edge: while content continues below the fold, the footer casts a shadow up over it.
  useEffect(() => {
    const card = cardRef.current;
    const scroller = scrollRef.current;
    if (!card || !scroller) return;
    const update = () => {
      const more = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop > 2;
      if (more) card.dataset.more = "";
      else delete card.dataset.more;
    };
    update();
    scroller.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(scroller);
    if (scroller.firstElementChild) observer?.observe(scroller.firstElementChild);
    for (const child of scroller.children) observer?.observe(child);
    return () => {
      scroller.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, [data, size]);

  const cardTarget = target ?? (data !== null && "target" in data ? data.target : null);
  const kind = cardTarget?.kind ?? "spot";
  const spot = kind === "spot";
  // The card's own live panel: whichever window the user last landed on, else what arrived.
  const shownSpot = view?.panel ?? spotPanel;
  const timeframe: TimeframeState | undefined = onTimeframe
    ? { value: view?.timeframe ?? shownSpot?.viewTimeframe ?? VERDICT_TIMEFRAME, onChange: changeTimeframe, pending }
    : undefined;
  const marketSymbol = (cardTarget?.kind === "spot" ? cardTarget.symbol : undefined) ?? shownSpot?.token?.symbol ?? title.replace(/^\$/, "");
  const query = marketSymbol.replace(/^\$/, "").trim();
  const hasMarkets = enableMarkets && spot && /^[A-Za-z0-9][A-Za-z0-9.-]{0,39}$/.test(query);
  const markets = hasMarkets ? (active: boolean) => <MarketsView symbol={query} active={active}
    selectedId={cardTarget?.kind === "spot" ? `${cardTarget.chain}:${cardTarget.chain === "solana" ? cardTarget.tokenAddress : cardTarget.tokenAddress.toLowerCase()}` : undefined}
    onExplore={setMarketChoice}/> : undefined;

  let body: ReactNode;
  if (error) body = <p className="tw-card-message tw-dock-error">{error}</p>;
  else if (data === null) body = <LoadingBody kind={kind} />;
  else if ("target" in data && data.target.kind === "perp")
    body = <PerpBody panel={data.panel as PerpPanel} hits={data.hits} initialTab={initialTab} depth={depth} onNeedSections={requestSections} />;
  else if ("target" in data && data.target.kind === "prediction")
    body = <PredictionBody panel={data.panel as PredictionPanel} hits={data.hits} initialTab={initialTab} depth={depth} onNeedSections={requestSections} />;
  else
    body = <SpotBody panel={shownSpot!} hits={data.hits} signals={data.signals} initialTab={marketHome ? "markets" : initialTab} timeframe={timeframe} depth={depth} onNeedSections={requestSections} markets={markets} />;

  const top = data?.hits[0];
  const finding = data === null ? null : top ? hitFinding(top) : headline || defaultFinding(data.verdict, kind);
  const cardChain = cardTarget?.kind === "spot" ? cardTarget.chain : (chain ?? null);
  const cardAddress = cardTarget?.kind === "spot" ? cardTarget.tokenAddress : (address ?? null);
  const token = spot ? (shownSpot?.token ?? null) : null;
  const logoUrl = spot ? (token?.logoUrl ?? shownSpot?.logoUrl ?? null) : null;
  /**
   * A prediction market is named by its question, not by its slug.
   *
   * The slug is what the click knew — it is in the URL — so it is what the first frame shows,
   * and it is replaced by "Will United Russia (ER) gain the most seats…" the moment the market
   * answers. The question is a sentence, so the heading wraps over two lines and keeps the
   * whole of it in its title attribute rather than ending at an ellipsis with nothing behind it.
   */
  const question = kind === "prediction" && data !== null ? ((data.panel as PredictionPanel).market?.question ?? null) : null;
  const groupItemTitle = kind === "prediction" && data !== null ? ((data.panel as PredictionPanel).market?.groupItemTitle ?? null) : null;
  // Nansen's own name for the token wins over the cashtag the post happened to use.
  const headerTitle = token?.symbol ? `$${token.symbol}` : (question ?? title);
  const since = postTimeIso ? { iso: postTimeIso } : checkedAtIso ? { iso: checkedAtIso, prefix: "checked" } : null;
  const nansenUrl = spot && cardChain && cardAddress ? nansenTokenUrl(cardChain, cardAddress) : null;
  const verdict: Verdict | "LOADING" = error ? "UNCHECKED" : (data?.verdict ?? "LOADING");

  if (marketChoice) return <MarketEvidence key={marketChoice.id} market={marketChoice} onClose={onClose} replay={replay} onBack={()=>{setMarketHome(true);setMarketChoice(null);}}/>;

  return (
    <CardSizeContext.Provider value={size}>
      <section className="tw-card" data-verdict={data?.verdict} data-size={size} ref={cardRef} aria-busy={data === null && !error ? "true" : undefined}>
        <CardHeader
          verdict={verdict}
          title={headerTitle}
          fullTitle={question}
          clamp={question !== null}
          caption={groupItemTitle}
          name={token?.name ?? null}
          address={spot ? cardAddress : null}
          since={since}
          replay={replay}
          onClose={onClose}
          chain={cardChain}
          logoUrl={logoUrl}
          showToken={spot}
        />
        <div className="tw-card-scroll" ref={scrollRef}>
          {navigation}
          {enableMarkets && cardChain ? <p className="tw-market-scope">Spot · {cardChain} · Evidence for the selected contract</p> : null}
          {finding === null ? (
            // The finding's own line, reserved so the body below it never shifts down when the
            // sentence lands.
            error ? null : (
              <>
                <p className="tw-card-finding tw-card-finding-pending" aria-hidden="true" />
                <LoadingAnnouncement what={spot ? "token evidence" : `${kind} evidence`} />
              </>
            )
          ) : (
            <p className="tw-card-finding">
              <CountInText text={finding} />
            </p>
          )}
          {person ? <PersonLine person={person} /> : null}
          {author}
          {body}
        </div>
        <PanelFooter
          // No count while there is nothing to count: "0 endpoints" is noise, not information.
          endpointCount={data === null ? null : endpointCount(data)}
          errors={data?.panel.errors ?? []}
          nansenUrl={nansenUrl}
        />
      </section>
    </CardSizeContext.Provider>
  );
}
