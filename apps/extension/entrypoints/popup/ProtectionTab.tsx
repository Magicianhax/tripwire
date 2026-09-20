import { Globe, Locate } from "lucide-react";
import { BUILDATHON_CALL_CAP, VENUE_LOGOS, type VenueId } from "@tripwire/core";
import { Icon } from "../../lib/ui/icons";
import { BrandMark } from "../../lib/ui/Logo";
import { HERE_TEXT, type Here } from "./here";

export const PRESETS = ["degen", "balanced", "paranoid"] as const;
export type Preset = (typeof PRESETS)[number];
export const PRESET_LABELS: Record<Preset, string> = { degen: "Degen", balanced: "Balanced", paranoid: "Paranoid" };

/** What the local ledger measured, or `null` while it is in flight or the backend is not there.
 * A figure nobody read prints as a dash: the popup never invents a count. */
export type Counters = { callsToday: number; creditsToday: number; totalCalls: number } | null;

/** The built-in hosts whose venue mark the "on this tab" row can show. Everything else is a
 * globe, because Tripwire ships no mark it does not own the rights to bundle. */
const VENUE_BY_HOST: Record<string, VenueId> = {
  "jup.ag": "jupiter",
  "pump.fun": "pumpfun",
  "app.uniswap.org": "uniswap",
  "jumper.exchange": "jumper",
  "jumper.xyz": "jumper",
  "app.hyperliquid.xyz": "hyperliquid",
  "polymarket.com": "polymarket",
  "raydium.io": "raydium",
  "aerodrome.finance": "aerodrome",
  "pancakeswap.finance": "pancakeswap",
  "app.1inch.io": "1inch",
  "1inch.com": "1inch",
  "matcha.xyz": "matcha",
  "swap.cow.fi": "cow",
  "axiom.trade": "axiom",
  "photon-sol.tinyastro.io": "photon",
  "gmgn.ai": "gmgn",
  "neo.bullx.io": "bullx",
  "dexscreener.com": "dexscreener",
  "birdeye.so": "birdeye",
};

const n = (value: number) => value.toLocaleString("en-US");

export function ProtectionTab({
  preset,
  pending,
  busy,
  error,
  onChoose,
  onConfirm,
  onCancel,
  here,
  locateNote,
  onLocate,
  counters,
}: {
  preset: Preset | "custom" | null;
  pending: Preset | null;
  busy: boolean;
  error: string;
  onChoose: (preset: Preset) => void;
  onConfirm: () => void;
  onCancel: () => void;
  here: Here;
  locateNote: string;
  onLocate: () => void;
  counters: Counters;
}) {
  const venue = here.host ? VENUE_BY_HOST[here.host] : undefined;
  const tiles = [
    { label: "Calls today", value: counters ? n(counters.callsToday) : "—" },
    { label: "Credits today", value: counters ? n(counters.creditsToday) : "—" },
    { label: "Calls used", value: counters ? `${n(counters.totalCalls)} / ${n(BUILDATHON_CALL_CAP)}` : "—" },
  ];

  return (
    <>
      <section className="tw-block" aria-labelledby="tw-preset-label">
        <h2 className="tw-block-label" id="tw-preset-label">
          Rules preset
        </h2>
        <div className="tw-segmented" role="group" aria-labelledby="tw-preset-label" aria-busy={preset === null || busy}>
          {PRESETS.map((p) => (
            <button key={p} type="button" aria-pressed={preset === p} disabled={preset === null || busy} onClick={() => onChoose(p)}>
              {PRESET_LABELS[p]}
            </button>
          ))}
        </div>
        {pending ? (
          <div className="tw-confirm-row" role="alert">
            <p className="tw-confirm-text">Switch to {PRESET_LABELS[pending]}? This lowers or removes blocks.</p>
            <div className="tw-confirm-actions">
              <button type="button" className="tw-button-danger" onClick={onConfirm}>
                Confirm
              </button>
              <button type="button" className="tw-button-quiet" onClick={onCancel}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
        {error ? (
          <p className="tw-hint" role="status">
            {error}
          </p>
        ) : null}
      </section>

      <section className="tw-block" aria-labelledby="tw-here-label">
        <h2 className="tw-block-label" id="tw-here-label">
          On this tab
        </h2>
        <div className="tw-here" data-state={here.state}>
          {venue ? <BrandMark logo={VENUE_LOGOS[venue]} size={20} /> : <Icon icon={Globe} size={20} />}
          <span className="tw-here-id">
            <span className="tw-here-host">{here.host ?? "No page"}</span>
            <span className="tw-here-state">{HERE_TEXT[here.state]}</span>
          </span>
          <button type="button" className="tw-button-quiet tw-locate" onClick={onLocate}>
            <Icon icon={Locate} size={14} />
            Show me where it is
          </button>
        </div>
        {locateNote ? (
          <p className="tw-locate-note" data-state={locateNote.startsWith("Highlighted") ? "found" : "missing"} role="status" aria-live="polite">
            {locateNote}
          </p>
        ) : null}
      </section>

      <section className="tw-block" aria-labelledby="tw-today-label">
        <h2 className="tw-block-label" id="tw-today-label">
          Nansen usage
        </h2>
        <ul className="tw-tiles">
          {tiles.map((tile) => (
            <li key={tile.label} className="tw-tile">
              <span className="tw-tile-label">{tile.label}</span>
              <span className="tw-tile-value">{tile.value}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
