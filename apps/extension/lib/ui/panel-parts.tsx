import { useContext, useEffect, useId, useState, type ReactNode } from "react";
import { Check, CircleAlert, Copy, ExternalLink, OctagonX, TriangleAlert, type LucideIcon } from "lucide-react";
import { formatSignalValue, NANSEN_LOGO, ruleClause, type Verdict } from "@tripwire/core";
import type { HitDto } from "../api-types";
import { shortAddr, timeAgo, usd } from "./format";
import { CloseIcon, Icon } from "./icons";
import { BrandMark, ChainLogo, TokenLogo } from "./Logo";
import { Plate } from "./Plate";
import { PopoverContext } from "./Popover";
import { ReplayBadge } from "./ReplayBadge";
import { decadeTicks, symlogFraction } from "./scales";

/** Center-zero split bar on a shared symmetric-log scale with decade ticks: selling extends left
 * of zero in red, buying right in mint, so direction carries the sign. A row whose rule fired
 * is lit in that rule's colour (CSS, via the row's data-lit); a rule's threshold is its own tick. */
export function CenterZeroBar({ value, max, threshold = null }: { value: number | null; max: number; threshold?: number | null }) {
  const f = symlogFraction(value, max);
  const x = (v: number) => 50 + symlogFraction(v, max) * 50;
  return (
    <div className="tw-gauge" aria-hidden="true">
      <svg className="tw-gauge-scale" viewBox="0 0 100 10" preserveAspectRatio="none" focusable="false">
        {decadeTicks(max)
          .flatMap((d) => [x(-d), x(d)])
          .map((tx, i) => (
            <line key={i} x1={tx} x2={tx} y1={2} y2={8} vectorEffect="non-scaling-stroke" />
          ))}
      </svg>
      <i className="tw-gauge-track" />
      <i className="tw-gauge-fill" data-sign={f < 0 ? "neg" : "pos"} style={{ width: `${Math.abs(f) * 50}%` }} />
      <i className="tw-gauge-zero" />
      {threshold !== null ? <i className="tw-gauge-threshold" style={{ left: `${x(threshold)}%` }} /> : null}
    </div>
  );
}

/** A table row like Nansen's: icon and label, split bar, signed value in red or mint. `lit`
 * marks a row that fed a rule which fired; `rule` marks the row that is itself the rule's
 * measured value. */
export function SegmentRow({
  label,
  value,
  max,
  icon,
  lit = null,
  rule = false,
  threshold = null,
}: {
  label: string;
  value: number | null;
  max: number;
  icon?: LucideIcon;
  /** The colour of the fired rule this row fed ("warning" for block rules, "caution" for warn). */
  lit?: "warning" | "caution" | null;
  rule?: boolean;
  threshold?: number | null;
}) {
  const sign = value === null || value === 0 ? "zero" : value < 0 ? "neg" : "pos";
  return (
    <div className="tw-seg" data-lit={lit ?? undefined} data-rule={rule ? "" : undefined}>
      <span className="tw-seg-label">
        {lit ? <Icon icon={lit === "warning" ? OctagonX : TriangleAlert} size={14} /> : icon ? <Icon icon={icon} size={14} /> : null}
        {label}
      </span>
      <CenterZeroBar value={value} max={max} threshold={threshold} />
      <span className="tw-seg-value tw-fig" data-sign={sign}>
        {usd(value, true)}
        {lit ? <span className="tw-sr-only"> (rule fired)</span> : null}
      </span>
    </div>
  );
}

/** "rule: > $100K": the word and the comparison, figures in tabular numerals. Text content unchanged. */
export function RuleClause({ text, className }: { text: string; className: string }) {
  const m = /^(rule:)\s(.*)$/.exec(text);
  if (!m) return <span className={className}>{text}</span>;
  return (
    <span className={className}>
      <span className="tw-rule-word">{m[1]}</span> <span className="tw-fig">{m[2]}</span>
    </span>
  );
}

/** A titled block inside a tab panel. */
export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="tw-section" aria-label={title}>
      <h3 className="tw-section-title">
        <span>{title}</span>
        {aside ? <span className="tw-section-aside">{aside}</span> : null}
      </h3>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="tw-empty">{children}</p>;
}

/** "rule: > $100K" for a hit that carries its rule's comparison, else null. */
export function hitRuleClause(hit: HitDto): string | null {
  return hit.op !== undefined && typeof hit.threshold === "number" ? ruleClause({ signalId: hit.signalId, op: hit.op, threshold: hit.threshold }) : null;
}

/** The finding as a sentence: the signal's label ("Fresh wallets are 82% of buying"), falling
 * back to the rule text plus the formatted value when a label is missing. */
export function hitFinding(hit: HitDto): string {
  if (hit.label) return hit.label;
  return hit.value !== null ? `${hit.text} ${formatSignalValue(hit.signalId, hit.value)}` : hit.text;
}

/** The rules that fired: a red octagon for block rules or an amber triangle for warn rules, the
 * finding as the sentence, and the rule's threshold as a secondary clause. Shared by the
 * evidence card (all hits) and BlockScreen (max 3 + "+N more"). */
export function HitList({ hits, max, className = "tw-hits", id }: { hits: HitDto[]; max?: number; className?: string; id?: string }) {
  if (hits.length === 0) return null;
  const shown = typeof max === "number" ? hits.slice(0, max) : hits;
  const extra = hits.length - shown.length;
  return (
    <ul className={className} id={id}>
      {shown.map((h, i) => (
        <li key={`${h.ruleId}-${i}`} className="tw-hit" data-action={h.action}>
          <Icon icon={h.action === "warn" ? TriangleAlert : OctagonX} size={16} className="tw-hit-mark" />
          <span className="tw-hit-text">
            <span className="tw-hit-finding">{hitFinding(h)}</span>
            {hitRuleClause(h) ? <RuleClause className="tw-hit-rule" text={hitRuleClause(h)!} /> : null}
          </span>
        </li>
      ))}
      {extra > 0 ? <li className="tw-hit-more">+{extra} more</li> : null}
    </ul>
  );
}

/** The copyable short address, the one place the raw contract still belongs now that the header
 * names the token. Copy falls back silently: a clipboard the browser refuses is not an error
 * worth a message, and the address stays selectable. */
export function AddressChip({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1_400);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <span className="tw-addr">
      {/* The short form truncates further on a tight header, so the full address stays available. */}
      <span className="tw-addr-text" title={address}>
        {shortAddr(address)}
      </span>
      <button
        type="button"
        className="tw-addr-copy"
        aria-label={copied ? "Address copied" : "Copy token address"}
        onClick={() => {
          void navigator.clipboard?.writeText(address).then(
            () => setCopied(true),
            () => {},
          );
        }}
      >
        <Icon icon={copied ? Check : Copy} size={14} />
      </button>
    </span>
  );
}

/** "View on Nansen": the same token, in the product this evidence came from. */
export function NansenLink({ href }: { href: string }) {
  return (
    <a className="tw-nansen-link" href={href} target="_blank" rel="noopener noreferrer">
      <BrandMark logo={NANSEN_LOGO} size={14} />
      View on Nansen
      <Icon icon={ExternalLink} size={14} />
    </a>
  );
}

/** "Powered by Nansen" credit with the endpoint count, plus "Unavailable: <message>" per
 * panel.errors entry. */
export function PanelFooter({ endpointCount, errors, nansenUrl }: { endpointCount: number; errors: string[]; nansenUrl?: string | null }) {
  return (
    <footer className="tw-card-footer">
      <div className="tw-card-credit">
        {nansenUrl ? <NansenLink href={nansenUrl} /> : null}
        <p className="tw-meta tw-powered">
          Powered by <BrandMark logo={NANSEN_LOGO} size={14} /> <span className="tw-powered-name">Nansen</span>
        </p>
        <p className="tw-meta">
          <span className="tw-fig">{endpointCount}</span> endpoint{endpointCount === 1 ? "" : "s"}
        </p>
      </div>
      {errors.length > 0 ? (
        <ul className="tw-errors">
          {errors.map((e, i) => (
            <li key={i}>
              <Icon icon={CircleAlert} size={14} />
              Unavailable: {e}
            </li>
          ))}
        </ul>
      ) : null}
    </footer>
  );
}

/** Relative age of `iso`, re-rendered every 15s so a card left open doesn't go stale. */
function Age({ iso, prefix }: { iso: string; prefix?: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(timer);
  }, []);
  return (
    <time className="tw-card-age tw-fig" dateTime={iso}>
      {prefix ? `${prefix} ${timeAgo(iso)}` : timeAgo(iso)}
    </time>
  );
}

/**
 * The card's header: the token's own identity first — logo, $SYMBOL, name, chain — with the
 * contract address demoted to a copyable mono line underneath, then the verdict pill, Replay
 * tag and close. Inside a Popover the close button closes through it.
 *
 * The title is the dialog's label and its first focus stop, so a screen reader hears
 * "$WIF dogwifhat" rather than a base58 string.
 */
export function CardHeader({
  verdict,
  title,
  name,
  address,
  since,
  replay,
  onClose,
  chain,
  logoUrl,
  showToken = true,
}: {
  verdict?: Verdict;
  /** The headline name: "$WIF" when the token resolved, else the short address. */
  title: string;
  /** The token's full name ("dogwifhat"), shown beside the symbol. */
  name?: string | null;
  /** The contract address, shown short and copyable under the name. */
  address?: string | null;
  /** The card's age: the post time on X, the check time on a venue ("checked 20s ago"). */
  since?: { iso: string; prefix?: string } | null;
  replay?: boolean;
  onClose?: () => void;
  /** The token's chain, shown as its logo after the title. */
  chain?: string | null;
  /** The token's logo from Nansen, else a monogram of the title. */
  logoUrl?: string | null;
  /** Spot tokens get a logo tile; perp markets and prediction questions don't. */
  showToken?: boolean;
}) {
  const pop = useContext(PopoverContext);
  const ownId = useId();
  const headingId = pop?.headingId ?? ownId;
  const close = pop ? () => pop.close("close-button") : onClose;
  return (
    <header className="tw-card-header">
      {showToken ? <TokenLogo url={logoUrl} symbol={title} /> : null}
      <div className="tw-card-heading">
        <h2 id={headingId} className="tw-card-title" tabIndex={-1}>
          <span className="tw-card-symbol">{title}</span>
          {name ? <span className="tw-card-name"> {name}</span> : null}
        </h2>
        <span className="tw-card-sub">
          <ChainLogo chain={chain} size={14} />
          {address ? <AddressChip address={address} /> : null}
          {since ? <Age iso={since.iso} prefix={since.prefix} /> : null}
        </span>
      </div>
      {verdict ? <Plate verdict={verdict} className="tw-card-plate" /> : null}
      <ReplayBadge replay={replay} />
      {close ? (
        <button type="button" className="tw-card-close" aria-label="Close" onClick={close}>
          <CloseIcon />
        </button>
      ) : null}
    </header>
  );
}

/** A card that only carries a status line (loading or a failed evidence fetch). */
export function CardMessage({
  title,
  message,
  kind = "loading",
  replay,
  checkedAtIso,
  chain,
}: {
  title: string;
  message: string;
  kind?: "loading" | "error";
  replay?: boolean;
  checkedAtIso?: string;
  chain?: string | null;
}) {
  return (
    <section className="tw-card">
      <CardHeader
        verdict={kind === "error" ? "UNCHECKED" : undefined}
        title={title}
        replay={replay}
        chain={chain}
        showToken={false}
        since={checkedAtIso ? { iso: checkedAtIso, prefix: "checked" } : null}
      />
      <p className={kind === "error" ? "tw-card-message tw-dock-error" : "tw-card-message tw-dock-loading"} role="status">
        {message}
      </p>
    </section>
  );
}
