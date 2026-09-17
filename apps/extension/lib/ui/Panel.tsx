import type { ReactNode } from "react";
import type { GuardResponse, PerpPanel, PersonIntelResponse, PostIntelResponse, PredictionPanel, SpotPanel } from "../api-types";
import { usd } from "./format";
import { HitList, PanelFooter } from "./panel-parts";
import { PerpBody } from "./PerpBody";
import { PredictionBody } from "./PredictionBody";
import { SpotBody } from "./SpotBody";

export type PanelProps = {
  data: GuardResponse | PostIntelResponse;
  title: string;
  onClose: () => void;
  replay?: boolean;
  /** Optional Nansen person-intel match for the post's author, rendered as a small line at
   * the top of the panel when an entity matched. */
  person?: PersonIntelResponse | null;
};

/** "Nansen label: <entity> (tags) · holds $X of SYMBOL" — only rendered when an entity matched. */
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

/** Header (verdict + display-type title + close), hits list, then a kind-specific body:
 * spot for PostIntelResponse always, spot/perp/prediction for GuardResponse per target.kind. */
export function Panel({ data, title, onClose, replay, person }: PanelProps) {
  let body: ReactNode;
  if ("target" in data) {
    // GuardResponse: data.panel is a union, but target.kind tells us which member it actually is.
    if (data.target.kind === "spot") body = <SpotBody panel={data.panel as SpotPanel} />;
    else if (data.target.kind === "perp") body = <PerpBody panel={data.panel as PerpPanel} />;
    else body = <PredictionBody panel={data.panel as PredictionPanel} />;
  } else {
    body = <SpotBody panel={data.panel} />;
  }

  return (
    <section className="tw-panel" data-verdict={data.verdict} role="region" aria-label={title}>
      <header className="tw-panel-header">
        <span className="tw-panel-verdict tw-mono">{data.verdict}</span>
        <h2 className="tw-panel-title">{title}</h2>
        {replay ? <span className="tw-replay-badge">REPLAY</span> : null}
        <button type="button" className="tw-panel-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </header>

      {person ? <PersonLine person={person} /> : null}

      <HitList hits={data.hits} />

      <div className="tw-panel-body">{body}</div>

      <PanelFooter endpointCount={endpointCount(data)} errors={data.panel.errors} />
    </section>
  );
}
