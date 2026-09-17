import { useEffect, useRef, type ReactNode } from "react";
import type { Verdict } from "@tripwire/core";
import type { GuardResponse, PerpPanel, PersonIntelResponse, PostIntelResponse, PredictionPanel, SpotPanel } from "../api-types";
import { usd } from "./format";
import { CardHeader, hitFinding, PanelFooter } from "./panel-parts";
import { PerpBody } from "./PerpBody";
import { PredictionBody } from "./PredictionBody";
import { SpotBody } from "./SpotBody";

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
};

/** "Nansen label: <entity> (tags) · holds $X of SYMBOL", only rendered when an entity matched. */
function PersonLine({ person }: { person: PersonIntelResponse }) {
  if (!person.entity) return null;
  return (
    <p className="tw-person">
      Nansen label: <b>{person.entity}</b>
      {person.tags.length > 0 ? ` (${person.tags.join(", ")})` : ""}
      {person.holding ? (
        <>
          {" "}
          · holds{" "}
          <b className="tw-mono">
            {usd(person.holding.valueUsd, true)} of {person.holding.symbol ?? "—"}
          </b>
        </>
      ) : null}
    </p>
  );
}

/** Unique Nansen endpoints backing the signals (falls back to hit evidence if signals are
 * empty), used for the footer's "Data: Nansen · N endpoints" line. */
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

/** The instrument card: header row (annunciator plate, title, age, close), the one-line
 * finding, the author's Nansen label, evidence tabs by target kind, and the source line. */
export function Panel({ data, title, onClose, replay, person, headline, postTimeIso, checkedAtIso, initialTab }: PanelProps) {
  const cardRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  let body: ReactNode;
  if ("target" in data) {
    // GuardResponse: data.panel is a union, but target.kind tells us which member it actually is.
    if (data.target.kind === "spot") body = <SpotBody panel={data.panel as SpotPanel} hits={data.hits} signals={data.signals} initialTab={initialTab} />;
    else if (data.target.kind === "perp") body = <PerpBody panel={data.panel as PerpPanel} hits={data.hits} initialTab={initialTab} />;
    else body = <PredictionBody panel={data.panel as PredictionPanel} hits={data.hits} initialTab={initialTab} />;
  } else {
    body = <SpotBody panel={data.panel} hits={data.hits} signals={data.signals} initialTab={initialTab} />;
  }

  const top = data.hits[0];
  const finding = top ? hitFinding(top) : headline || defaultFinding(data.verdict);
  const since = postTimeIso ? { iso: postTimeIso } : checkedAtIso ? { iso: checkedAtIso, prefix: "checked" } : null;

  return (
    <section className="tw-card" data-verdict={data.verdict} ref={cardRef}>
      <CardHeader verdict={data.verdict} title={title} since={since} replay={replay} onClose={onClose} />
      <div className="tw-card-scroll" ref={scrollRef}>
        <p className="tw-card-finding">{finding}</p>
        {person ? <PersonLine person={person} /> : null}
        {body}
      </div>
      <PanelFooter endpointCount={endpointCount(data)} errors={data.panel.errors} />
    </section>
  );
}
