import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { nansenTokenUrl, VERDICT_TIMEFRAME, type Verdict, type ViewTimeframe } from "@tripwire/core";
import type { GuardResponse, PerpPanel, PersonIntelResponse, PostIntelResponse, PredictionPanel, SpotPanel } from "../api-types";
import { BadgeCheck } from "lucide-react";
import { CountInText } from "./CountIn";
import { usd } from "./format";
import { Icon } from "./icons";
import { CardHeader, hitFinding, PanelFooter } from "./panel-parts";
import { PerpBody } from "./PerpBody";
import { PredictionBody } from "./PredictionBody";
import { SpotBody, type TimeframeState } from "./SpotBody";

export type PanelProps = {
  data: GuardResponse | PostIntelResponse;
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
function endpointCount(data: PanelProps["data"]): number {
  const set = new Set<string>();
  for (const s of data.signals) for (const e of s.evidence) set.add(e.endpoint);
  if (set.size === 0) {
    for (const h of data.hits) for (const e of h.evidence) set.add(e.endpoint);
  }
  return set.size;
}

function defaultFinding(verdict: Verdict): string {
  switch (verdict) {
    case "CLEAR":
      return "None of your rules fired on this token.";
    case "UNCHECKED":
      return "Tripwire couldn't check this token.";
    default:
      return "A rule fired on this token.";
  }
}

/** The evidence card: header row (token logo, title, chain, age, verdict pill, close), the one-line
 * finding, the author's Nansen label, evidence tabs by target kind, and the source line. */
export function Panel({ data, title, onClose, replay, person, headline, postTimeIso, checkedAtIso, initialTab, chain, address, author, onTimeframe }: PanelProps) {
  const cardRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // The view window lives here so switching it never remounts the card: the verdict, the
  // finding, the tabs and the scroll position all stay while one section reloads.
  const spotPanel = "target" in data ? (data.target.kind === "spot" ? (data.panel as SpotPanel) : null) : data.panel;
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
  }, []);

  const spot = !("target" in data) || data.target.kind === "spot";
  // The card's own live panel: whichever window the user last landed on, else what arrived.
  const shownSpot = view?.panel ?? spotPanel;
  const timeframe: TimeframeState | undefined = onTimeframe
    ? { value: view?.timeframe ?? shownSpot?.viewTimeframe ?? VERDICT_TIMEFRAME, onChange: changeTimeframe, pending }
    : undefined;

  let body: ReactNode;
  if ("target" in data && data.target.kind === "perp") body = <PerpBody panel={data.panel as PerpPanel} hits={data.hits} initialTab={initialTab} />;
  else if ("target" in data && data.target.kind === "prediction") body = <PredictionBody panel={data.panel as PredictionPanel} hits={data.hits} initialTab={initialTab} />;
  else body = <SpotBody panel={shownSpot!} hits={data.hits} signals={data.signals} initialTab={initialTab} timeframe={timeframe} />;

  const top = data.hits[0];
  const finding = top ? hitFinding(top) : headline || defaultFinding(data.verdict);
  const cardChain = "target" in data ? (data.target.kind === "spot" ? data.target.chain : null) : (chain ?? null);
  const cardAddress = "target" in data ? (data.target.kind === "spot" ? data.target.tokenAddress : null) : (address ?? null);
  const token = spot ? (shownSpot?.token ?? null) : null;
  const logoUrl = spot ? (token?.logoUrl ?? shownSpot?.logoUrl ?? null) : null;
  // Nansen's own name for the token wins over the cashtag the post happened to use.
  const headerTitle = token?.symbol ? `$${token.symbol}` : title;
  const since = postTimeIso ? { iso: postTimeIso } : checkedAtIso ? { iso: checkedAtIso, prefix: "checked" } : null;
  const nansenUrl = spot && cardChain && cardAddress ? nansenTokenUrl(cardChain, cardAddress) : null;

  return (
    <section className="tw-card" data-verdict={data.verdict} ref={cardRef}>
      <CardHeader
        verdict={data.verdict}
        title={headerTitle}
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
        <p className="tw-card-finding">
          <CountInText text={finding} />
        </p>
        {person ? <PersonLine person={person} /> : null}
        {author}
        {body}
      </div>
      <PanelFooter endpointCount={endpointCount(data)} errors={data.panel.errors} nansenUrl={nansenUrl} />
    </section>
  );
}
